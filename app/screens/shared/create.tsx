import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../contexts/AuthContext";
import { useOrganization } from "../../../contexts/OrganizationContext";
import { Action, Field, ui } from "../../../components/profile/ProfileUI";
import { Choice, SharedMessage, SharedPage, sharedStyles } from "../../../components/shared/SharedUI";
import { SharedTargetPicker } from "../../../components/shared/SharedTargetPicker";
import { SharedDateTime } from "../../../components/shared/SharedDateTime";
import { allowedTargetModes, canCreateSharedItem, canEditSharedItem } from "../../../utils/sharedPermissions";
import { buildSharedDraft, buildSharedTargets, sharedPreAlerts } from "../../../utils/sharedDraft";
import { sharedRepeats, repeatLabel } from "../../../utils/sharedRecurrence";
import * as calendar from "../../../shared/recurrence.cjs";
import { organizationApi, SharedApiError } from "../../../services/sharedApi";
import { readSharedCache } from "../../../services/sharedCache";
import { createSharedClient, currentSharedAccount, loadSharedDetail, mutateSharedClient, sharedErrorMessage } from "../../../services/sharedWorkspace";
import type { OrganizationEntry, OrganizationPerson, OrganizationTeam, SharedDraft, SharedEntry, SharedItem, SharedTarget, SharedRepeat } from "../../../types/shared";
export default function SharedCreateScreen() {
  const { session } = useAuth(), workspace = useOrganization();
  const { organizationId, id } = useLocalSearchParams<{ organizationId: string; id?: string }>();
  const org = workspace.organizations.find(row => row.organization.id === organizationId);
  return <SharedPage title={id ? "Edit shared item" : "Create shared item"} subtitle={org?.organization.name ?? "Organization unavailable"}>
    {session && org ? <SharedForm key={`${session.user.id}:${organizationId}:${id ?? "new"}`} account={session.user.id} org={org} id={id} /> : <SharedMessage message="Organization unavailable. Refresh the shared workspace." />}
  </SharedPage>;
}
function SharedForm({ account, org, id }: { account: string; org: OrganizationEntry; id?: string }) {
  const workspace = useOrganization(), [type, setType] = useState<SharedItem["type"]>("reminder"), [title, setTitle] = useState(""), [description, setDescription] = useState("");
  const [start, setStart] = useState(() => new Date(Date.now() + 3600000)), [end, setEnd] = useState(() => new Date(Date.now() + 7200000));
  const [completionMode, setCompletionMode] = useState<"individual" | "collective">("individual"), [mode, setMode] = useState<SharedTarget["targetType"] | "mixed">(allowedTargetModes(org)[0] ?? "user");
  const [targetsChanged, setTargetsChanged] = useState(false);
  const [teamIds, setTeamIds] = useState<string[]>([]), [userIds, setUserIds] = useState<string[]>([]), [preAlert, setPreAlert] = useState(0);
  const [teams, setTeams] = useState<OrganizationTeam[]>([]), [people, setPeople] = useState<OrganizationPerson[]>([]), [entry, setEntry] = useState<SharedEntry>();
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [busy, setBusy] = useState(false), [pending, setPending] = useState<SharedDraft>();
  const [verified, setVerified] = useState(false), [tick, setTick] = useState(0), lock = useRef(false);
  const [repeat, setRepeat] = useState<SharedRepeat>("none"), [weeklyDays, setWeeklyDays] = useState<number[]>([new Date(Date.now() + 3600000).getDay()]);
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const apply = useCallback((draft: Pick<SharedDraft, "type" | "title" | "description" | "schedule" | "completionMode" | "recurrence">) => {
    setType(draft.type); setTitle(draft.title); setDescription(draft.description); setStart(new Date(draft.schedule.startAt));
    setEnd(new Date(draft.schedule.endAt ?? Date.parse(draft.schedule.startAt) + 3600000)); setCompletionMode(draft.completionMode); setPreAlert(draft.schedule.alertBefore?.minutes ?? 0);
    setRepeat(draft.recurrence?.repeat ?? "none"); setTimeZone(draft.recurrence?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
    setWeeklyDays(draft.recurrence?.weeklyDays?.length ? draft.recurrence.weeklyDays : [new Date(draft.schedule.startAt).getDay()]);
  }, []);
  const applyEntry = useCallback((entry: SharedEntry) => {
    setEntry(entry); apply(entry.item); setTargetsChanged(false);
    if (Array.isArray(entry.targets)) {
      const teams = entry.targets.filter(row => row.targetType === "team").map(row => row.targetId!).filter(Boolean);
      const users = entry.targets.filter(row => row.targetType === "user").map(row => row.targetId!).filter(Boolean);
      setTeamIds(teams); setUserIds(users);
      setMode(entry.targets.some(row => row.targetType === "organization") ? "organization" : teams.length && users.length ? "mixed" : teams.length ? "team" : "user");
    }
  }, [apply]);
  useEffect(() => {
    let active = true; setLoading(true); setVerified(false);
    void (async () => {
      if (id) {
        const result = await loadSharedDetail(account, org.organization.id, id);
        if (active) { applyEntry(result.entry); setVerified(!result.cached); }
        const [people, teams] = await Promise.all([organizationApi.members(account, org.organization.id), org.membership.role === "member" ? Promise.resolve([]) : organizationApi.teams(account, org.organization.id)]);
        if (active) { setPeople(people); setTeams(teams.filter(row => !row.status || row.status === "active")); }
      } else {
        const [people, teams, cache] = await Promise.all([organizationApi.members(account, org.organization.id), org.membership.role === "member" ? Promise.resolve([]) : organizationApi.teams(account, org.organization.id), readSharedCache(account, org.organization.id)]);
        if (active) { setPeople(people); setTeams(teams); setVerified(true); if (cache.pendingCreate) { setPending(cache.pendingCreate.draft); apply(cache.pendingCreate.draft); } }
      }
    })().catch(error => { if (active) setError(sharedErrorMessage(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account, org.organization.id, org.membership.role, id, tick, apply, applyEntry]);
  const permitted = id ? !!entry && entry.item.status === "active" && canEditSharedItem(org, entry, account) : canCreateSharedItem(org);
  const frozen = busy || !!pending;
  const save = async () => {
    if (lock.current || !permitted || !verified || !workspace.fresh) return;
    lock.current = true; setBusy(true); setError("");
    try {
      let result: SharedEntry;
      if (id && entry) {
        if (!title.trim() || title.length > 200 || description.length > 10000) throw new Error("Check your title and description.");
        if (!Number.isFinite(start.getTime()) || (start.getTime() <= Date.now() && start.getTime() !== Date.parse(entry.item.schedule.startAt)) || (type === "event" && end < start)) throw new Error("Choose a future start and valid event end.");
        const scheduleChanged = start.getTime() !== Date.parse(entry.item.schedule.startAt) || preAlert !== (entry.item.schedule.alertBefore?.minutes ?? 0) || (type === "event" && end.getTime() !== Date.parse(entry.item.schedule.endAt ?? entry.item.schedule.startAt));
        const rule = calendar.normalizeRecurrence({ repeat, ...(repeat !== "none" ? { timeZone, ...(repeat === "weekly" ? { weeklyDays } : {}) } : {}) }, { startAt: start.toISOString() });
        const previousRule = calendar.normalizeRecurrence({ repeat: entry.item.recurrence?.repeat ?? "none", ...(entry.item.recurrence?.repeat && entry.item.recurrence.repeat !== "none" ? { timeZone: entry.item.recurrence.timeZone, ...(entry.item.recurrence.repeat === "weekly" ? { weeklyDays: entry.item.recurrence.weeklyDays } : {}) } : {}) }, entry.item.schedule);
        result = (await mutateSharedClient(account, org.organization.id, id, "edit", entry.item.serverRevision, { title: title.trim(), description: description.trim(), ...(scheduleChanged ? { schedule: {
          ...entry.item.schedule, startAt: start.toISOString(), ...(type === "event" ? { endAt: end.toISOString() } : {}), alertBefore: { label: preAlert ? `${preAlert} minutes before` : "None", minutes: preAlert },
        } } : {}), ...(targetsChanged ? { targets: buildSharedTargets(mode, teamIds, userIds, org.membership.role === "member" ? ["user"] : ["organization", "team", "user"]) } : {}), ...(JSON.stringify(rule) !== JSON.stringify(previousRule) ? { recurrence: rule } : {}) })).entry;
      } else result = await createSharedClient(account, org.organization.id, pending ?? buildSharedDraft({ type, title, description, start, end, completionMode, mode, teamIds, userIds, preAlert, repeat, timeZone, weeklyDays }, org));
      if (currentSharedAccount() === account) router.replace({ pathname: "/screens/shared/item", params: { organizationId: org.organization.id, id: result.item.id } });
    } catch (error) {
      setError(error instanceof SharedApiError ? sharedErrorMessage(error) : error instanceof Error ? error.message : "Could not save this item.");
      if (id && error instanceof SharedApiError && error.status === 409) {
        const current = await loadSharedDetail(account, org.organization.id, id); applyEntry(current.entry); setVerified(!current.cached);
      }
      if (!id) setPending((await readSharedCache(account, org.organization.id)).pendingCreate?.draft);
    } finally { lock.current = false; setBusy(false); }
  };
  if (loading) return <SharedMessage loading message="Loading shared form…" />;
  if (!permitted) return <SharedMessage message="You do not have permission to create or edit this shared item." retry={() => { void workspace.refresh(); setTick(value => value + 1); }} />;
  return <>
    {error && <SharedMessage message={error} retry={() => { setTick(value => value + 1); void workspace.refresh(); }} />}
    {id && (!verified || !workspace.fresh) && <SharedMessage message="You're offline. Connect to update recipients." />}
    {pending && <SharedMessage message="A creation request is waiting for confirmation. Retry the same item to avoid duplicates." />}
    <View style={ui.card}><Text style={ui.heading}>Shared item</Text>
      {!id && <View style={sharedStyles.row}>{(["reminder", "task", "event"] as const).map(value => <Choice key={value} label={value[0].toUpperCase() + value.slice(1)} selected={type === value} disabled={frozen} onPress={() => setType(value)} />)}</View>}
      <Field label="Title" value={title} onChangeText={setTitle} editable={!frozen} maxLength={200} /><Field label="Description" value={description} onChangeText={setDescription} editable={!frozen} multiline maxLength={10000} />
      <SharedDateTime label="Start" value={start} onChange={setStart} disabled={frozen} />{type === "event" && <SharedDateTime label="End" value={end} onChange={setEnd} disabled={frozen} />}
      <Text style={ui.label}>Repeat</Text><View style={sharedStyles.row}>{sharedRepeats.map(value => <Choice key={value} label={repeatLabel(value)} selected={repeat === value} disabled={frozen} onPress={() => setRepeat(value)} />)}</View>
      {repeat !== "none" && <Text style={ui.subtitle}>Series timezone: {timeZone}. Only the current occurrence is actionable.</Text>}
      {repeat === "weekly" && <View style={sharedStyles.row}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, day) => <Choice key={day} label={label} selected={weeklyDays.includes(day)} disabled={frozen} onPress={() => setWeeklyDays(values => values.includes(day) ? values.filter(value => value !== day) : [...values, day])} />)}</View>}
      <Text style={ui.label}>Pre-alert</Text><View style={sharedStyles.row}>{sharedPreAlerts.map(minutes => <Choice key={minutes} label={minutes === 0 ? "None" : minutes === 1440 ? "1 day before" : `${minutes} min before`} selected={preAlert === minutes} disabled={frozen} onPress={() => setPreAlert(minutes)} />)}</View>
    </View>
    {!id && type === "task" && <View style={ui.card}><Text style={ui.heading}>Task completion</Text>
      <Choice label="Individual" selected={completionMode === "individual"} disabled={frozen} onPress={() => setCompletionMode("individual")} /><Text style={ui.subtitle}>Each recipient completes this task separately.</Text>
      <Choice label="Complete for everyone" selected={completionMode === "collective"} disabled={frozen} onPress={() => setCompletionMode("collective")} /><Text style={ui.subtitle}>When any one recipient completes it, the task is completed for everyone.</Text>
    </View>}
    {id && <Text style={ui.subtitle}>Changing recipients affects future alerts.{repeat !== "none" ? " Recipient changes apply to the current eligible occurrence and future occurrences." : ""}</Text>}
    {!pending && <SharedTargetPicker modes={id ? org.membership.role === "member" ? ["user"] : ["organization", "team", "user"] : allowedTargetModes(org)} mode={mode} onMode={value => { setMode(value); setTargetsChanged(true); }} teams={teams} people={people} teamIds={teamIds} userIds={userIds} onTeams={values => { setTeamIds(values); setTargetsChanged(true); }} onUsers={values => { setUserIds(values); setTargetsChanged(true); }} disabled={frozen || !!id && (!verified || !workspace.fresh)} />}
    <Action label={id ? "Save changes" : pending ? "Retry shared creation" : "Create shared item"} onPress={() => { void save(); }} busy={busy} disabled={!verified || !workspace.fresh} />
  </>;
}

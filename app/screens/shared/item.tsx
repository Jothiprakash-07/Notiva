import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../contexts/AuthContext";
import { useOrganization } from "../../../contexts/OrganizationContext";
import { Action, ui } from "../../../components/profile/ProfileUI";
import { SharedPage, SharedMessage, scheduleLabel } from "../../../components/shared/SharedUI";
import { canEditSharedItem, canInspectRecipients, completionSummary, recipientActions, sharedDisplayStatus } from "../../../utils/sharedPermissions";
import { loadSharedDetail, mutateSharedClient, sharedErrorMessage, dismissSharedOccurrenceConflicts } from "../../../services/sharedWorkspace";
import { organizationApi, sharedApi } from "../../../services/sharedApi";
import type { OrganizationPerson, OrganizationTeam, SharedEntry, SharedRecipient } from "../../../types/shared";
import { deriveSharedOccurrence, isSharedRecurring, repeatLabel, sharedRecentHistory } from "../../../utils/sharedRecurrence";
export default function SharedItemScreen() {
  const { session } = useAuth(), workspace = useOrganization();
  const params = useLocalSearchParams<{ id: string; organizationId: string; fromAlarm?: string }>();
  const org = workspace.organizations.find(row => row.organization.id === params.organizationId);
  return <SharedPage title="Shared item" subtitle={org?.organization.name ?? "Organization unavailable"}>
    {params.fromAlarm === "1" && <SharedMessage message="Your local alarm was dismissed. Confirm Complete or Acknowledge below to update your shared response." />}
    {session && org ? <SharedDetail key={`${session.user.id}:${params.organizationId}:${params.id}`} account={session.user.id} org={params.organizationId} id={params.id} /> :
      <SharedMessage message={workspace.loading ? "Loading organization…" : "Organization unavailable. Your membership may have changed."} retry={() => { void workspace.refresh(); }} />}
  </SharedPage>;
}
function SharedDetail({ account, org, id }: { account: string; org: string; id: string }) {
  const workspace = useOrganization(), membership = workspace.organizations.find(row => row.organization.id === org);
  const { refresh } = workspace;
  const [entry, setEntry] = useState<SharedEntry>(), [cached, setCached] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [people, setPeople] = useState<OrganizationPerson[]>([]), [recipients, setRecipients] = useState<SharedRecipient[]>([]), [tick, setTick] = useState(0);
  const [teams, setTeams] = useState<OrganizationTeam[]>([]), [confirming, setConfirming] = useState(false);
  useFocusEffect(useCallback(() => { setTick(value => value + 1); void refresh(); }, [refresh]));
  useEffect(() => {
    let active = true; setLoading(true);
    void loadSharedDetail(account, org, id).then(result => { if (active) { setEntry(result.entry); setCached(result.cached); } }).catch(error => { if (active) { setEntry(undefined); setError(sharedErrorMessage(error)); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account, org, id, tick, workspace.version]);
  useEffect(() => { let active = true; void organizationApi.members(account, org).then(rows => { if (active) setPeople(rows); }).catch(() => {}); return () => { active = false; }; }, [account, org]);
  useEffect(() => { let active = true; void organizationApi.teams(account, org).then(rows => { if (active) setTeams(rows); }).catch(() => {}); return () => { active = false; }; }, [account, org]);
  const inspect = !!entry && canInspectRecipients(membership, entry.item, account);
  useEffect(() => { let active = true; setRecipients([]); if (inspect && !cached) void sharedApi.recipients(account, org, id).then(rows => { if (active) setRecipients(rows); }).catch(() => {}); return () => { active = false; }; }, [account, org, id, inspect, cached, tick, workspace.version]);
  const run = async (action: "cancel" | "complete" | "acknowledge") => {
    if (!entry || busy || (cached && (!isSharedRecurring(entry) || action === "cancel")) || loading) return; setBusy(true); setError("");
    try { const current = deriveSharedOccurrence(entry, entry.pendingOccurrenceActions); const result = await mutateSharedClient(account, org, id, action, entry.item.serverRevision, undefined, action === "cancel" ? undefined : current.occurrence?.key); setEntry(result.entry); setCached(result.cached); }
    catch (error) { setError(sharedErrorMessage(error)); setTick(value => value + 1); }
    finally { setBusy(false); setConfirming(false); }
  };
  if (!entry) return <SharedMessage loading={loading} message={error || "Loading shared item…"} retry={() => setTick(value => value + 1)} />;
  const shown = deriveSharedOccurrence(entry, entry.pendingOccurrenceActions);
  const editable = canEditSharedItem(membership, entry, account), summary = completionSummary(shown);
  const name = (userId?: string) => people.find(row => row.userId === userId)?.profile?.fullName ?? "Organization member";
  return <>
    {error && <SharedMessage message={error} retry={() => setTick(value => value + 1)} />}
    {cached && <SharedMessage message={isSharedRecurring(entry) ? "Offline series snapshot. Recipient responses will remain pending until synced." : "Saved snapshot · read-only until the server can verify current access."} retry={() => setTick(value => value + 1)} />}
    {!!entry.pendingOccurrenceActions?.length && <SharedMessage message={entry.pendingOccurrenceActions.some(row => row.state === "conflict") ? "A response could not sync because the series or access changed. Review the latest occurrence; the old response was not applied to a new date." : "Response saved on this device · waiting to sync."} />}
    {entry.pendingOccurrenceActions?.some(row => row.state === "conflict") && <Action label="Dismiss conflicted responses" secondary onPress={() => { void dismissSharedOccurrenceConflicts(account, org, id).then(() => setTick(value => value + 1)); }} />}
    <View style={ui.card}><Text style={ui.subtitle}>SHARED {entry.item.type.toUpperCase()}</Text><Text style={ui.heading}>{entry.item.title}</Text><Text style={ui.rowTitle}>{scheduleLabel(shown)}</Text>
      {isSharedRecurring(entry) && <Text style={ui.subtitle}>{repeatLabel(entry.item.recurrence?.repeat)} · Series {entry.item.status} · {entry.item.recurrence?.timeZone}</Text>}
      {(shown.occurrence?.endAt ?? entry.item.schedule.endAt) && <Text style={ui.subtitle}>Ends {new Date(shown.occurrence?.endAt ?? entry.item.schedule.endAt!).toLocaleString()}</Text>}
      <Text style={ui.subtitle}>Created by {name(entry.item.createdByUserId)}</Text><Text style={ui.rowTitle}>{entry.item.description || "No description"}</Text>
      <Text style={sharedDisplayStatus(shown) === "completed" ? ui.success : ui.rowTitle}>Status: {sharedDisplayStatus(shown)}</Text>
      {shown.recipient && <Text style={ui.subtitle}>Your response: {shown.recipient.status}{shown.occurrence?.status === "completed" || entry.item.status === "completed" ? " · completed" : ""}</Text>}
      {entry.item.type === "task" && <Text style={ui.subtitle}>{entry.item.completionMode === "collective" ? "Any one recipient completes it for everyone." : "Each recipient completes separately."}</Text>}
      {(shown.occurrence?.completedByUserId ?? entry.item.completedByUserId) && <Text style={ui.success}>Completed by {name(shown.occurrence?.completedByUserId ?? entry.item.completedByUserId)}</Text>}
      {((!cached && workspace.fresh) || isSharedRecurring(entry)) && recipientActions(shown).map(action => <Action key={action} label={action === "complete" ? "Complete" : "Acknowledge"} busy={busy} disabled={loading} onPress={() => { void run(action); }} />)}
    </View>
    {inspect && <View style={ui.card}><Text style={ui.heading}>Recipients & targets</Text>
      {Array.isArray(entry.targets) && entry.targets.map((target, index) => <Text key={index} style={ui.subtitle}>{target.targetType === "organization" ? "Entire organization · snapshot" : target.targetType === "team" ? teams.find(team => team.id === target.targetId)?.name ?? "Selected team" : name(target.targetId ?? undefined)}</Text>)}
      {summary && <Text style={ui.rowTitle}>{entry.recipientCount ?? summary.total} recipients · {isSharedRecurring(entry) ? `${summary.total} eligible today · ` : ""}{summary.label}</Text>}
      {recipients.map(row => <View key={row.userId}><Text style={ui.rowTitle}>{row.profile?.fullName ?? "Organization member"}</Text><Text style={ui.subtitle}>{row.accessStatus === "revoked" ? "Access removed" : entry.item.status !== "active" ? entry.item.status : row.status}</Text></View>)}
    </View>}
    {isSharedRecurring(entry) && <View style={ui.card}><Text style={ui.heading}>Recent occurrence history</Text>{sharedRecentHistory(entry).map(row => <Text key={row.occurrenceKey} style={ui.subtitle}>{new Date(row.scheduledAt).toLocaleString()} · {row.status}</Text>)}</View>}
    {editable && !cached && workspace.fresh && <View style={ui.card}>
      {entry.item.status === "active" && <Action label="Edit shared item" secondary disabled={busy} onPress={() => router.push({ pathname: "/screens/shared/create", params: { organizationId: org, id } })} />}
      {entry.item.status !== "cancelled" && !confirming && <Action label="Cancel shared item" destructive disabled={busy || loading} onPress={() => setConfirming(true)} />}
      {confirming && <><Text style={ui.heading}>Cancel this shared item?</Text><Text style={ui.subtitle}>Recipients will no longer receive future alerts.</Text><Action label="Keep item" secondary disabled={busy} onPress={() => setConfirming(false)} /><Action label="Confirm cancellation" destructive busy={busy} onPress={() => { void run("cancel"); }} /></>}
    </View>}
  </>;
}

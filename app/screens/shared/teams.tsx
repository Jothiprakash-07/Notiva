import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../contexts/AuthContext";
import { OrganizationSwitcher } from "../../../components/shared/SharedUI";
import { Action, Field, ProfilePage, ui } from "../../../components/profile/ProfileUI";
import { organizationApi } from "../../../services/sharedApi";
import type { OrganizationEntry, OrganizationPerson, OrganizationTeam } from "../../../types/shared";

export default function TeamsScreen({ organizationId, workspaceRoot = false }: { organizationId?: string; workspaceRoot?: boolean } = {}) {
  const { session } = useAuth(), account = session?.user.id;
  const params = useLocalSearchParams<{ organizationId: string; userId?: string }>();
  const org = organizationId ?? (typeof params.organizationId === "string" ? params.organizationId : ""), user = typeof params.userId === "string" ? params.userId : "";
  const [entry, setEntry] = useState<OrganizationEntry>(), [teams, setTeams] = useState<OrganizationTeam[]>([]);
  const [people, setPeople] = useState<OrganizationPerson[]>([]), [assigned, setAssigned] = useState<string[]>([]);
  const [selected, setSelected] = useState<OrganizationTeam>(), [name, setName] = useState("");
  const [creating, setCreating] = useState(false), [editing, setEditing] = useState(false), [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const sequence = useRef(0), lock = useRef(false);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler?.addEventListener("hardwareBackPress", () => {
      if (editing || creating) { setEditing(false); setCreating(false); return true; }
      if (selected) { setSelected(undefined); setConfirmArchive(false); return true; }
      return false;
    });
    return () => subscription?.remove();
  }, [editing, creating, selected]));
  const can = (permission: string) => entry?.membership.role === "owner" || (entry?.membership.role === "admin" && entry.membership.permissions.includes(permission));
  useFocusEffect(useCallback(() => {
    void revision;
    const stamp = ++sequence.current;
    setLoading(true); setEntry(undefined); setTeams([]); setPeople([]); setAssigned([]); setError("");
    if (!account || !org) { setLoading(false); return; }
    void (async () => {
      try {
        const detail = await organizationApi.detail(account, org);
        const rows = user ? await organizationApi.memberTeams(account, org, user) : await organizationApi.teams(account, org);
        let directory: OrganizationPerson[] = [], links: { userId: string }[] = [];
        if (selected && !user) {
          links = await organizationApi.teamMembers(account, org, selected.id);
          if (detail.membership.role === "owner" || (detail.membership.role === "admin" && detail.membership.permissions.includes("assign_team_members"))) directory = await organizationApi.members(account, org);
        }
        if (stamp !== sequence.current) return;
        setEntry(detail); setTeams(rows); setPeople(directory); setAssigned(links.map(row => row.userId));
      } catch (failure) { if (stamp === sequence.current) setError(failure instanceof Error ? failure.message : "Could not load teams."); }
      finally { if (stamp === sequence.current) setLoading(false); }
    })();
    return () => { ++sequence.current; };
  }, [account, org, user, selected, revision]));
  const mutate = async (operation: () => Promise<unknown>, success: string, close = false) => {
    if (lock.current || loading) return;
    const stamp = sequence.current; lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await operation();
      if (stamp !== sequence.current) return;
      setMessage(success); setCreating(false); setEditing(false); setConfirmArchive(false);
      if (close) setSelected(undefined);
      setRevision(value => value + 1);
    } catch (failure) { if (stamp === sequence.current) setError(failure instanceof Error ? failure.message : "Could not update team."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <ProfilePage back={!workspaceRoot} title={user ? "Member teams" : "Teams"} subtitle={entry?.organization.name || "Organization teams"}>
    {workspaceRoot && <OrganizationSwitcher />}
    {loading && <ActivityIndicator />}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {!!message && <Text accessibilityRole="alert" style={ui.success}>{message}</Text>}
    {!selected && !creating && <>
      {!user && can("manage_teams") && <Action label="Create Team" disabled={busy || loading} onPress={() => { setName(""); setCreating(true); setMessage(""); }} />}
      {!loading && !teams.length && <Text style={ui.subtitle}>No active teams.</Text>}
      {teams.map(team => <Action key={team.id} label={team.name} secondary disabled={busy || loading || !!user} onPress={() => { setSelected(team); setMessage(""); }} />)}
    </>}
    {(creating || editing) && can("manage_teams") && <View style={ui.card}>
      <Field label="Team name" value={name} onChangeText={setName} maxLength={100} editable={!busy} />
      <Action label={creating ? "Save team" : "Save changes"} disabled={!name.trim() || busy || loading} onPress={() => void mutate(() => creating ? organizationApi.createTeam(account!, org, name) : organizationApi.editTeam(account!, org, selected!.id, name), creating ? "Team created." : "Team updated.", true)} />
      <Action label="Cancel" secondary disabled={busy} onPress={() => { setCreating(false); setEditing(false); }} />
    </View>}
    {selected && !editing && <>
      <Text style={ui.heading}>{teams.find(team => team.id === selected.id)?.name || selected.name}</Text>
      {can("manage_teams") && <Action label="Edit team" secondary disabled={busy || loading} onPress={() => { setName(selected.name); setEditing(true); }} />}
      <Text style={ui.heading}>Members / Assign Members</Text>
      {!loading && <Text style={ui.subtitle}>{assigned.length} active members</Text>}
      {can("assign_team_members") && people.map(person => <View key={person.userId} style={ui.card}>
        <Text style={ui.rowTitle}>{person.profile?.fullName || person.userId}</Text>
        <Text style={ui.subtitle}>{person.profile?.notivaId}</Text>
        <Action label={`${assigned.includes(person.userId) ? "Remove" : "Assign"}: ${person.profile?.notivaId || person.userId}`} secondary disabled={busy || loading} onPress={() => void mutate(() => assigned.includes(person.userId) ? organizationApi.removeTeamMember(account!, org, selected.id, person.userId) : organizationApi.assignTeam(account!, org, selected.id, person.userId), assigned.includes(person.userId) ? "Member removed from this team." : "Member assigned.")} />
      </View>)}
      {can("manage_teams") && <Action label={confirmArchive ? "Confirm archive" : "Archive team"} destructive disabled={busy || loading} onPress={() => confirmArchive ? void mutate(() => organizationApi.archiveTeam(account!, org, selected.id), "Team archived.", true) : setConfirmArchive(true)} />}
      <Action label="Back to teams" secondary disabled={busy} onPress={() => { setSelected(undefined); setConfirmArchive(false); }} />
    </>}
    <Action label="Refresh" secondary disabled={busy || loading} onPress={() => setRevision(value => value + 1)} />
  </ProfilePage>;
}

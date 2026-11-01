import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../contexts/AuthContext";
import { OrganizationSwitcher } from "../../../components/shared/SharedUI";
import { Action, Info, ProfilePage, ui } from "../../../components/profile/ProfileUI";
import { organizationApi } from "../../../services/sharedApi";
import type { OrganizationEntry, OrganizationJoinRequest, OrganizationPerson } from "../../../types/shared";

export default function OrganizationDetailsScreen({ organizationId, workspaceRoot = false }: { organizationId?: string; workspaceRoot?: boolean } = {}) {
  const { session } = useAuth(), account = session?.user.id;
  const params = useLocalSearchParams<{ organizationId: string }>();
  const org = organizationId ?? (typeof params.organizationId === "string" ? params.organizationId : "");
  const [entry, setEntry] = useState<OrganizationEntry>(), [view, setView] = useState<"details" | "requests" | "members">("details");
  const [requests, setRequests] = useState<OrganizationJoinRequest[]>([]), [members, setMembers] = useState<OrganizationPerson[]>([]);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const sequence = useRef(0), lock = useRef(false);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler?.addEventListener("hardwareBackPress", () => {
      if (view === "details") return false;
      setView("details"); return true;
    });
    return () => subscription?.remove();
  }, [view]));
  useFocusEffect(useCallback(() => {
    // A decision or manual refresh advances this revision to reload server state.
    void revision;
    const stamp = ++sequence.current;
    setEntry(undefined); setRequests([]); setMembers([]); setError(""); setLoading(true); setBusy(false);
    if (!account || !org) { setLoading(false); return; }
    void (async () => {
      try {
        const value = await organizationApi.detail(account, org);
        if (stamp !== sequence.current) return;
        setEntry(value);
        if (view === "requests") {
          const rows = await organizationApi.requests(account, org);
          if (stamp === sequence.current) setRequests(rows);
        } else if (view === "members") {
          const rows = await organizationApi.members(account, org);
          if (stamp === sequence.current) setMembers(rows);
        }
      } catch (failure) { if (stamp === sequence.current) setError(failure instanceof Error ? failure.message : "Could not load organization."); }
      finally { if (stamp === sequence.current) setLoading(false); }
    })();
    return () => { ++sequence.current; };
  }, [account, org, view, revision]));
  const decide = async (id: string, action: "approve" | "reject") => {
    if (!account || lock.current) return;
    const stamp = sequence.current; lock.current = true; setBusy(true); setError("");
    try {
      await organizationApi.decide(account, org, id, action);
      if (stamp === sequence.current) setRevision(value => value + 1);
    } catch (failure) { if (stamp === sequence.current) setError(failure instanceof Error ? failure.message : "Could not update join request."); }
    finally { lock.current = false; if (stamp === sequence.current) setBusy(false); }
  };
  const canApprove = entry?.membership.role === "owner" || (entry?.membership.role === "admin" && entry.membership.permissions.includes("approve_join_requests"));
  return <ProfilePage back={!workspaceRoot} title="Organization" subtitle={entry?.organization.name || "Organization details"}>
    {workspaceRoot && <OrganizationSwitcher />}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {loading && <ActivityIndicator />}
    {entry && <>
      <View style={ui.card}>
        <Info label="Organization" value={entry.organization.name} />
        <Info label="Your Role" value={entry.membership.role[0].toUpperCase() + entry.membership.role.slice(1)} />
        {!!entry.organization.joinCode && <Info label="Join Code" value={entry.organization.joinCode} />}
      </View>
      <Action label="Members" secondary disabled={busy} onPress={() => setView("members")} />
      <Action label="Teams" secondary onPress={() => router.push({ pathname: "/screens/shared/teams", params: { organizationId: org } })} />
      {canApprove && <Action label="Join Requests" secondary disabled={busy} onPress={() => setView("requests")} />}
    </>}
    {view === "requests" && canApprove && !loading && <>
      <Text style={ui.heading}>Join Requests / Approval History</Text>
      {!requests.length && <Text style={ui.subtitle}>No join requests.</Text>}
      {requests.map(request => <View key={request.id} style={ui.card}>
        <Text style={ui.heading}>{request.requester?.fullName || "Unavailable user"}</Text>
        <Info label="Notiva ID" value={request.requester?.notivaId} />
        <Info label="Status" value={request.status[0].toUpperCase() + request.status.slice(1)} />
        <Info label="Requested" value={new Date(request.requestedAt).toLocaleString()} />
        {request.actedAt && <><Info label="Acted by" value={request.actedBy?.fullName || "Unavailable user"} /><Info label="Acted at" value={new Date(request.actedAt).toLocaleString()} /></>}
        {request.status === "pending" && <><Action label="Approve" disabled={busy} onPress={() => void decide(request.id, "approve")} /><Action label="Reject" secondary disabled={busy} onPress={() => void decide(request.id, "reject")} /></>}
      </View>)}
    </>}
    {view === "members" && !loading && <>
      <Text style={ui.heading}>Members</Text>
      {members.map(member => <View key={member.userId} style={ui.card}>
        <Text style={ui.heading}>{member.profile?.fullName || "Unavailable user"}</Text>
        <Info label="Notiva ID" value={member.profile?.notivaId} />
        <Info label="Role" value={member.role[0].toUpperCase() + member.role.slice(1)} />
        <Action label={`View teams: ${member.profile?.fullName || member.userId}`} secondary onPress={() => router.push({ pathname: "/screens/shared/teams", params: { organizationId: org, userId: member.userId } })} />
        <Info label="Joined" value={member.joinedAt ? new Date(member.joinedAt).toLocaleString() : undefined} />
        {entry?.membership.role === "owner" && member.role !== "owner" && <Action label={`Manage member: ${member.profile?.fullName || member.userId}`} secondary onPress={() => router.push({ pathname: "/screens/shared/member-role", params: { organizationId: org, userId: member.userId } })} />}
      </View>)}
    </>}
    <Action label="Refresh" secondary disabled={loading || busy} onPress={() => setRevision(value => value + 1)} />
  </ProfilePage>;
}

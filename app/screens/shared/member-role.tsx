import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../contexts/AuthContext";
import { Action, Info, ProfilePage, ui } from "../../../components/profile/ProfileUI";
import { organizationApi } from "../../../services/sharedApi";
import type { OrganizationPerson } from "../../../types/shared";

export default function MemberRoleScreen() {
  const { session } = useAuth(), account = session?.user.id;
  const params = useLocalSearchParams<{ organizationId: string; userId: string }>();
  const org = typeof params.organizationId === "string" ? params.organizationId : "", user = typeof params.userId === "string" ? params.userId : "";
  const [member, setMember] = useState<OrganizationPerson>(), [owner, setOwner] = useState(false);
  const [options, setOptions] = useState<string[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [revision, setRevision] = useState(0);
  const sequence = useRef(0), lock = useRef(false);
  useFocusEffect(useCallback(() => {
    void revision;
    const stamp = ++sequence.current;
    setLoading(true); setMember(undefined); setOwner(false); setEditing(false);
    if (!account || !org || !user) { setLoading(false); return; }
    void (async () => {
      try {
        const entry = await organizationApi.detail(account, org);
        if (stamp !== sequence.current) return;
        if (entry.membership.role !== "owner") { setError("Only the Owner can manage Admin roles and permissions."); return; }
        const [people, canonical] = await Promise.all([organizationApi.members(account, org), organizationApi.permissionOptions(account)]);
        if (stamp !== sequence.current) return;
        const target = people.find(row => row.userId === user);
        if (!target || target.role === "owner") { setError("Select an active Member or Admin."); return; }
        setMember(target); setOwner(true); setOptions(canonical.permissions); setSelected(target.permissions || []); setError("");
      } catch (failure) { if (stamp === sequence.current) setError(failure instanceof Error ? failure.message : "Could not load member."); }
      finally { if (stamp === sequence.current) setLoading(false); }
    })();
    return () => { ++sequence.current; };
  }, [account, org, user, revision]));
  const save = async (action: "promote" | "permissions" | "demote") => {
    if (!account || !owner || !member || lock.current) return;
    const stamp = sequence.current; lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (action === "permissions") await organizationApi.setPermissions(account, org, user, selected);
      else await organizationApi.setRole(account, org, user, action === "promote" ? "admin" : "member", action === "promote" ? selected : []);
      if (stamp !== sequence.current) return;
      setMessage(action === "demote" ? "Demoted to Member. Admin permissions cleared." : action === "promote" ? "Promoted to Admin." : "Admin permissions updated.");
      setRevision(value => value + 1);
    } catch (failure) { if (stamp === sequence.current) setError(failure instanceof Error ? failure.message : "Could not update member."); }
    finally { lock.current = false; if (stamp === sequence.current) setBusy(false); }
  };
  return <ProfilePage title="Member role" subtitle="Owner controls for roles and explicit Admin permissions">
    {loading && <ActivityIndicator />}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {!!message && <Text accessibilityRole="alert" style={ui.success}>{message}</Text>}
    {owner && member && <>
      <View style={ui.card}>
        <Info label="Member" value={member.profile?.fullName} />
        <Info label="Notiva ID" value={member.profile?.notivaId} />
        <Info label="Current role" value={member.role === "admin" ? "Admin" : "Member"} />
        <Info label="Admin permissions" value={member.permissions?.join(", ") || "None"} />
      </View>
      {!editing ? <Action label={member.role === "member" ? "Promote to Admin" : "Edit Admin permissions"} disabled={busy} onPress={() => { setEditing(true); setMessage(""); }} /> : <View style={ui.card}>
        <Text style={ui.heading}>Select Admin permissions</Text>
        {options.map(permission => <Pressable key={permission} accessibilityRole="checkbox" accessibilityLabel={permission} accessibilityState={{ checked: selected.includes(permission), disabled: busy }} disabled={busy}
          onPress={() => setSelected(values => values.includes(permission) ? values.filter(value => value !== permission) : [...values, permission])} style={ui.row}>
          <Text style={ui.rowTitle}>{selected.includes(permission) ? "☑" : "☐"} {permission}</Text>
        </Pressable>)}
        <Action label={member.role === "member" ? "Confirm promotion" : "Save permissions"} busy={busy} onPress={() => void save(member.role === "member" ? "promote" : "permissions")} />
        <Action label="Cancel" secondary disabled={busy} onPress={() => { setEditing(false); setSelected(member.permissions || []); }} />
      </View>}
      {member.role === "admin" && !editing && <Action label="Demote to Member" destructive busy={busy} onPress={() => void save("demote")} />}
    </>}
  </ProfilePage>;
}

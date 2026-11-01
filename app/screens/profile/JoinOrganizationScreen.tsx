import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../../../contexts/AuthContext";
import { Action, Field, ProfilePage, ui } from "../../../components/profile/ProfileUI";
import { organizationApi } from "../../../services/sharedApi";
import type { OrganizationJoinRequest } from "../../../types/shared";

export default function JoinOrganizationScreen() {
  const { session } = useAuth(), account = session?.user.id;
  const [code, setCode] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [requests, setRequests] = useState<OrganizationJoinRequest[]>([]), [busy, setBusy] = useState(false);
  const lock = useRef(false), sequence = useRef(0);
  useFocusEffect(useCallback(() => {
    const stamp = ++sequence.current;
    if (account) void organizationApi.myRequests(account).then(rows => { if (stamp === sequence.current) setRequests(rows); })
      .catch(failure => { if (stamp === sequence.current) setError(failure.message); });
    return () => { ++sequence.current; };
  }, [account]));
  const join = async () => {
    if (!account || lock.current) return;
    const value = code.trim().toUpperCase();
    if (!/^ORG-[A-Z0-9]{6,32}$/.test(value)) { setError("Enter a valid organization join code."); return; }
    const stamp = sequence.current;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const result = await organizationApi.join(account, value);
      if (stamp !== sequence.current) return;
      setMessage(result.alreadyMember ? "You are already a member of this organization." : "Pending — your join request is awaiting approval.");
      if (result.request) {
        const request = result.request;
        setRequests(rows => [request, ...rows.filter(row => row.id !== request.id)]);
      }
      setCode("");
    } catch (failure) { if (stamp === sequence.current) setError(failure instanceof Error ? failure.message : "Could not submit join request."); }
    finally { lock.current = false; if (stamp === sequence.current) setBusy(false); }
  };
  return <ProfilePage title="Join Organization" subtitle="Request access using your organization's join code">
    <View style={ui.card}>
      <Field label="Join Code" value={code} onChangeText={value => { setCode(value); setError(""); setMessage(""); }} autoCapitalize="characters" autoCorrect={false} maxLength={36} editable={!busy} />
      <Text style={ui.subtitle}>An Owner or authorized Admin must approve your request before you become a Member.</Text>
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      {!!message && <Text accessibilityRole="alert" style={ui.success}>{message}</Text>}
      <Action label="Join" onPress={() => void join()} busy={busy} />
    </View>
    <Text style={ui.heading}>Your join requests</Text>
    {requests.map(request => <View key={request.id} style={ui.card}>
      <Text style={ui.rowTitle}>{request.organizationName || "Organization request"}</Text>
      <Text style={ui.rowTitle}>{request.status[0].toUpperCase() + request.status.slice(1)}</Text>
      <Text style={ui.subtitle}>Requested: {new Date(request.requestedAt).toLocaleString()}</Text>
    </View>)}
    {!requests.length && <Text style={ui.subtitle}>No join requests.</Text>}
  </ProfilePage>;
}

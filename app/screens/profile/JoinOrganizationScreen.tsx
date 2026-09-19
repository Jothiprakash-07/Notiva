import { useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useAuth } from "../../../contexts/AuthContext";
import { Action, Field, ProfilePage, ui } from "../../../components/profile/ProfileUI";
import { joinOrganization, ProfileError } from "../../../services/profileService";

export default function JoinOrganizationScreen() {
  const { session, updateUser } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const join = async () => {
    if (!session || lock.current) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const result = await joinOrganization(session.token, code.trim().toUpperCase());
      await updateUser(session.token, result.user);
      setMessage(`Connected to ${result.organization?.organizationName || result.user.organizationCode}.`);
      setCode("");
    } catch (error) { setError(error instanceof ProfileError ? error.errors.organizationCode || error.message : "Could not update organization."); }
    finally { lock.current = false; setBusy(false); }
  };
  const submit = () => {
    if (lock.current) return;
    if (!/^ORG-[A-Z0-9]{6}$/.test(code.trim().toUpperCase())) { setError("Enter the organization code, for example ORG-ABC123."); return; }
    if (session?.user.organizationCode) Alert.alert("Change organization?", "Your account will be linked to the new organization after its code is verified. Your current organization link will be replaced.", [{ text: "Cancel", style: "cancel" }, { text: "Verify & Change", onPress: () => void join() }]);
    else void join();
  };
  return <ProfilePage title={session?.user.organizationCode ? "Change Organization" : "Join Organization"} subtitle="Connect using a verified organization code">
    <View style={ui.card}><Text style={ui.subtitle}>Ask your organization for its code. We verify that the organization exists before updating your account.</Text>
      <Field label="Organization Code" value={code} onChangeText={value => { setCode(value); setError(""); setMessage(""); }} autoCapitalize="characters" autoCorrect={false} placeholder="ORG-XXXXXX" maxLength={20} editable={!busy} error={error} />
    </View>
    {message ? <Text accessibilityLiveRegion="polite" style={ui.success}>{message}</Text> : null}
    <Action label="Verify & Join" onPress={submit} busy={busy} />
  </ProfilePage>;
}

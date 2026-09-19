import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "../../../contexts/AuthContext";
import { Action, Field, ProfilePage, ui } from "../../../components/profile/ProfileUI";
import { changePassword, ProfileError } from "../../../services/profileService";

export default function ChangePasswordScreen() {
  const { session } = useAuth();
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const save = async () => {
    if (!session || lock.current) return;
    const next: Record<string, string> = {};
    if (!values.currentPassword) next.currentPassword = "Enter your current password.";
    if (values.newPassword.length < 6) next.newPassword = "Use at least 6 characters.";
    if (values.confirm !== values.newPassword) next.confirm = "Passwords do not match.";
    setErrors(next); setMessage("");
    if (Object.keys(next).length) return;
    lock.current = true; setBusy(true);
    try {
      await changePassword(session.token, values.currentPassword, values.newPassword);
      setValues({ currentPassword: "", newPassword: "", confirm: "" });
      setMessage("Password updated. You remain signed in.");
    } catch (error) { setErrors({ ...(error instanceof ProfileError ? error.errors : {}), form: error instanceof Error ? error.message : "Could not update password." }); }
    finally { lock.current = false; setBusy(false); }
  };
  return <ProfilePage title="Change Password" subtitle="Keep your account secure">
    <View style={ui.card}>
      <Text style={ui.subtitle}>Use at least 6 characters. Your existing session will remain active.</Text>
      {([ ["currentPassword", "Current Password"], ["newPassword", "New Password"], ["confirm", "Confirm New Password"] ] as const).map(([key, label]) => <Field key={key} label={label} password value={values[key]} error={errors[key]} editable={!busy} autoCorrect={false} autoComplete={key === "currentPassword" ? "current-password" : "new-password"} onChangeText={value => { setValues(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: "", form: "" })); setMessage(""); }} />)}
    </View>
    {errors.form ? <Text accessibilityRole="alert" style={ui.error}>{errors.form}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={ui.success}>{message}</Text> : null}
    <Action label="Update Password" busy={busy} onPress={() => void save()} />
  </ProfilePage>;
}

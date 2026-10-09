import IdentitySettings from "../../../components/profile/IdentitySettings";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "../../../contexts/AuthContext";
import { Action, Field, ProfilePage, ui } from "../../../components/profile/ProfileUI";
import { ProfileError, saveProfile } from "../../../services/profileService";

export default function EditProfileScreen() {
  const { session, updateUser } = useAuth();
  const [values, setValues] = useState({ fullName: session?.user.fullName || "", recoveryEmail: session?.user.recoveryEmail || session?.user.email || "", mobileNumber: session?.user.mobileNumber || "", department: session?.user.department || "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const initializedUser = useRef(session?.user.id);
  useEffect(() => {
    if (session && initializedUser.current !== session.user.id) {
      initializedUser.current = session.user.id;
      const { fullName, recoveryEmail, email, mobileNumber, department } = session.user;
      setValues({ fullName, recoveryEmail: recoveryEmail || email || "", mobileNumber, department });
    }
  }, [session]);
  const save = async () => {
    if (!session || lock.current) return;
    const next: Record<string, string> = {};
    if (!values.fullName.trim()) next.fullName = "Full name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.recoveryEmail.trim())) next.recoveryEmail = "Enter a valid email address.";
    if (!/^\+?[\d ()-]{7,25}$/.test(values.mobileNumber.trim()) || !/^[0-9]{7,15}$/.test(values.mobileNumber.replace(/\D/g, ""))) next.mobileNumber = "Enter a valid mobile number (7–15 digits).";
    setErrors(next); setMessage("");
    if (Object.keys(next).length) return;
    lock.current = true; setBusy(true);
    try {
      const result = await saveProfile(session.token, values);
      await updateUser(session.token, result.user);
      setValues({ fullName: result.user.fullName, recoveryEmail: result.user.recoveryEmail || result.user.email || "", mobileNumber: result.user.mobileNumber, department: result.user.department });
      setMessage("Your profile has been updated.");
    } catch (error) { setErrors({ ...(error instanceof ProfileError ? error.errors : {}), form: error instanceof Error ? error.message : "Could not save profile." }); }
    finally { lock.current = false; setBusy(false); }
  };
  return <ProfilePage title="Edit Profile" subtitle="Your personal information">
    <IdentitySettings />
    <View style={ui.card}>
      {([ ["fullName", "Full Name"], ["recoveryEmail", "Recovery Email"], ["mobileNumber", "Mobile Number"], ["department", "Department"] ] as const).map(([key, label]) => <Field key={key} label={label} value={values[key]} error={errors[key]} editable={!busy} maxLength={key === "recoveryEmail" ? 254 : key === "mobileNumber" ? 25 : 100} autoCapitalize={key === "recoveryEmail" ? "none" : "words"} keyboardType={key === "recoveryEmail" ? "email-address" : key === "mobileNumber" ? "phone-pad" : "default"} onChangeText={value => { setValues(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: "", form: "" })); setMessage(""); }} />)}
    </View>
    {errors.form ? <Text accessibilityRole="alert" style={ui.error}>{errors.form}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={ui.success}>{message}</Text> : null}
    <Action label="Save Changes" busy={busy} onPress={() => void save()} />
  </ProfilePage>;
}

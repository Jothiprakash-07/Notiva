import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Action, ProfilePage, Section, purple, ui } from "../../../components/profile/ProfileUI";
import { getAppSettings, saveAppSettings, useAppSettings, type AppSettings } from "../../../services/appSettings";

export default function AppSettingsScreen() {
  const settings = useAppSettings();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const load = () => { setLoading(true); void getAppSettings().then(() => setError("")).catch(() => setError("Could not load preferences. Try again.")).finally(() => setLoading(false)); };
  useEffect(load, []);
  const save = async (value: AppSettings) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try { await saveAppSettings(value); setMessage("Preference saved."); }
    catch { setError("Could not save this preference. Try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  const option = (label: string, selected: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: busy }} disabled={busy} onPress={onPress} style={({ pressed }) => [ui.row, pressed && ui.pressed]}><Text style={[ui.rowTitle, ui.flex]}>{label}</Text><Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={23} color={selected ? purple : "#AAA4B4"} /></Pressable>;
  return <ProfilePage title="App Settings" subtitle="Make Notiva work your way">
    {loading ? <ActivityIndicator /> : <>
      <Section title="Week Starts On"><Text style={ui.subtitle}>Sets the weekly boundaries and chart order in Analytics.</Text>{option("Monday", settings.weekStartsOn === 1, () => void save({ ...settings, weekStartsOn: 1 }))}{option("Sunday", settings.weekStartsOn === 0, () => void save({ ...settings, weekStartsOn: 0 }))}</Section>
    </>}
    {error ? <><Text accessibilityRole="alert" style={ui.error}>{error}</Text><Action label="Reload Preferences" onPress={load} disabled={busy} /></> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={ui.success}>{message}</Text> : null}
  </ProfilePage>;
}

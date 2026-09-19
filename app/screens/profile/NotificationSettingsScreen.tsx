import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text } from "react-native";
import { Action, MenuRow, ProfilePage, Section, SettingSwitch, ui } from "../../../components/profile/ProfileUI";
import { DEFAULT_NOTIFICATION_SETTINGS, getNotificationSettings, openNotificationSettings, saveNotificationSettings, scheduleTestNotification, type NotificationSettings } from "../../../services/notificationService";

export default function NotificationSettingsScreen() {
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => { let active = true; void getNotificationSettings().then(value => { if (active) setSettings(value); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const save = async (value: NotificationSettings) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try { await saveNotificationSettings(value); setSettings(value); setMessage("Saved for newly scheduled alerts. Existing alerts are unchanged."); }
    catch { setError("Could not save notification settings. Try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  const test = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const id = await scheduleTestNotification();
      if (!id) throw new Error("Test could not be scheduled. Check phone notification permissions.");
      setMessage(Platform.OS === "android" ? "Test reminder created. The alarm will ring in about 45 seconds." : "Test notification scheduled for about 10 seconds from now.");
    } catch (error) { setError(error instanceof Error ? error.message : "Test failed."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <ProfilePage title="Notification Settings" subtitle="Useful alerts, on your terms">
    {loading ? <ActivityIndicator /> : <>
      <Section title="Reminders"><SettingSwitch title="Pre-alert Notifications" description="Allow advance notifications for newly scheduled items. Exact-time alarms remain enabled." value={settings.preAlerts} onChange={value => void save({ ...settings, preAlerts: value })} disabled={busy} /><Text style={ui.subtitle}>Applies when Alert Before is greater than zero, including birthdays. Existing schedules are unchanged; edit and save an item to apply this setting.</Text></Section>
      <Section title="Alarm Behavior">
        {Platform.OS === "android" && <SettingSwitch title="Vibration" description="Vibrate for newly scheduled native reminder alarms." value={settings.vibration} onChange={value => void save({ ...settings, vibration: value })} disabled={busy} />}
        {Platform.OS !== "web" && <MenuRow purpleOutline icon="volume-high-outline" title="Open Phone Sound Settings" description="Manage Notiva notification sound in phone settings. Native alarms keep the phone’s alarm ringtone." onPress={() => void openNotificationSettings()} />}
        <Text style={ui.subtitle}>Exact-time reminder alarms stay enabled. Notification sounds and permissions are managed by your phone.</Text>
      </Section>
      {__DEV__ && Platform.OS !== "web" && <Section title="Test"><Text style={ui.subtitle}>{Platform.OS === "android" ? "Creates a test reminder using the existing native alarm flow." : "Schedules a test notification using the existing notification flow."}</Text><Action secondary label={Platform.OS === "android" ? "Test Reminder Alarm" : "Test Notification"} busy={busy} onPress={() => void test()} /></Section>}
    </>}
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={ui.success}>{message}</Text> : null}
  </ProfilePage>;
}

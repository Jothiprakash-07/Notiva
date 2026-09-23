import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Action, MenuRow, ProfilePage, Section, SettingSwitch, purple, ui } from "../../../components/profile/ProfileUI";
import { ALARM_SOUNDS, type AlarmSound } from "../../../services/alarmSounds";
import { nativeAlarm } from "../../../services/nativeAlarm";
import { DEFAULT_NOTIFICATION_SETTINGS, getNotificationSettings, openNotificationSettings, saveNotificationSettings, scheduleTestNotification, type NotificationSettings } from "../../../services/notificationService";

export default function NotificationSettingsScreen() {
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const [previewing, setPreviewing] = useState(false);
  const previewGeneration = useRef(0);
  const stopPreview = useCallback(() => {
    previewGeneration.current++;
    setPreviewing(false);
    if (Platform.OS === "android") {
      try { void nativeAlarm().stopPreview?.().catch(() => {}); } catch { /* Older builds have no preview. */ }
    }
  }, []);
  useFocusEffect(useCallback(() => {
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") stopPreview(); });
    return () => { subscription.remove(); stopPreview(); };
  }, [stopPreview]));
  const preview = async () => {
    if (previewing) { stopPreview(); return; }
    const generation = ++previewGeneration.current;
    setError(""); setPreviewing(true);
    try {
      const bridge = nativeAlarm();
      if (!bridge.previewSound) throw new Error("Install the new Android build to preview alarm sounds.");
      // Resolves when native playback completes, stops, or yields to a real alarm.
      await bridge.previewSound(settings.alarmSound);
    } catch (error) {
      if (generation === previewGeneration.current) setError(error instanceof Error ? error.message : "Could not preview this sound.");
    } finally {
      if (generation === previewGeneration.current) setPreviewing(false);
    }
  };
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
  const selectSound = (sound: AlarmSound) => {
    stopPreview();
    if (sound !== settings.alarmSound) void save({ ...settings, alarmSound: sound });
  };
  return <ProfilePage title="Notification Settings" subtitle="Useful alerts, on your terms">
    {loading ? <ActivityIndicator /> : <>
      {Platform.OS === "android" && <Section title="Alarm Sound">
        <Text style={ui.subtitle}>Choose the sound used for your main reminder alarm.</Text>
        <View style={styles.sounds}>
          {ALARM_SOUNDS.map(sound => {
            const selected = settings.alarmSound === sound.key;
            return <Pressable key={sound.key} accessibilityRole="radio" accessibilityLabel={sound.label} accessibilityState={{ checked: selected, disabled: busy }} disabled={busy} onPress={() => selectSound(sound.key)} style={({ pressed }) => [styles.soundRow, selected && styles.selected, pressed && ui.pressed, busy && ui.disabled]}>
              <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={22} color={purple} />
              <View style={ui.flex}>
                <Text style={[ui.rowTitle, selected && styles.purpleText]}>{sound.label}</Text>
                {sound.key === "system" && <Text style={ui.subtitle}>Use your phone&apos;s default alarm sound</Text>}
              </View>
            </Pressable>;
          })}
        </View>
        <Action secondary label={previewing ? "Stop Preview" : "Preview Selected Sound"} disabled={busy} onPress={() => void preview()} />
        <Text style={ui.subtitle}>Previews stop after 5 seconds. Saved automatically for newly scheduled alarms; edit and save an existing reminder to apply this sound.</Text>
      </Section>}
      <Section title="Reminders"><SettingSwitch title="Pre-alert Notifications" description="Allow advance notifications for newly scheduled items. Exact-time alarms remain enabled." value={settings.preAlerts} onChange={value => void save({ ...settings, preAlerts: value })} disabled={busy} /><Text style={ui.subtitle}>Applies when Alert Before is greater than zero, including birthdays. Existing schedules are unchanged; edit and save an item to apply this setting.</Text></Section>
      <Section title="Alarm Behavior">
        {Platform.OS === "android" && <SettingSwitch title="Vibration" description="Vibrate for newly scheduled native reminder alarms." value={settings.vibration} onChange={value => void save({ ...settings, vibration: value })} disabled={busy} />}
        {Platform.OS !== "web" && <MenuRow purpleOutline icon="volume-high-outline" title="Open Phone Sound Settings" description="Manage pre-alert notification sound and phone permissions." onPress={() => { stopPreview(); void openNotificationSettings(); }} />}
        <Text style={ui.subtitle}>Exact-time reminder alarms stay enabled. Notification sounds and permissions are managed by your phone.</Text>
      </Section>
      {__DEV__ && Platform.OS !== "web" && <Section title="Test"><Text style={ui.subtitle}>{Platform.OS === "android" ? "Creates a test reminder using the existing native alarm flow." : "Schedules a test notification using the existing notification flow."}</Text><Action secondary label={Platform.OS === "android" ? "Test Reminder Alarm" : "Test Notification"} busy={busy} onPress={() => void test()} /></Section>}
    </>}
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={[ui.subtitle, styles.purpleText]}>{message}</Text> : null}
  </ProfilePage>;
}

const styles = StyleSheet.create({
  sounds: { gap: 6 },
  soundRow: { minHeight: 52, padding: 12, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#E9E5F0", borderRadius: 14, backgroundColor: "#FFFFFF" },
  selected: { backgroundColor: "#F0EDFF", borderColor: purple },
  purpleText: { color: purple },
});

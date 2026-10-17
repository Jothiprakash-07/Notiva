import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "../../../contexts/AuthContext";
import { Action, ProfilePage, ui } from "../../../components/profile/ProfileUI";
import { authenticatedFetch } from "../../../services/sessionTransport";
import { API_BASE_URL } from "../../../services/apiConfig";

type Device = { sessionId: string; deviceName: string; platform: string; lastSeenAt: string; current: boolean; active: boolean };
export default function SessionsScreen() {
  const { session, signOut } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    setLoading(true); setError("");
    authenticatedFetch(`${API_BASE_URL}/api/auth/sessions`, { signal: controller.signal }, session.token)
      .then(async response => { if (!response.ok) throw Error(); return response.json(); })
      .then(data => { if (active) setDevices(data.sessions); })
      .catch(() => { if (active) setError("Unable to load devices. Check your connection and try again."); })
      .finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [session?.token, retry]);
  return <ProfilePage title="Devices / Sessions" subtitle="One active device at a time">
    {loading ? <Text style={ui.subtitle}>Loading devices…</Text> : null}
    {error ? <><Text style={ui.error}>{error}</Text><Action label="Try again" onPress={() => setRetry(value => value + 1)} /></> : null}
    {devices.map(device => <View key={device.sessionId} style={ui.card}>
      <Text style={ui.subtitle}>{device.current ? "Current device" : "Device"}</Text>
      <Text style={ui.subtitle}>{device.deviceName}</Text>
      <Text style={ui.success}>{device.active ? "Active now" : "Signed out"}</Text>
      <Text style={ui.subtitle}>{device.platform} · Last active: {new Date(device.lastSeenAt).toLocaleString()}</Text>
    </View>)}
    <Action label="Sign out" onPress={() => { void signOut(session?.sessionId); }} />
  </ProfilePage>;
}

import { useCallback, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Constants from "expo-constants";
import { useAuth } from "../../contexts/AuthContext";
import { Action, MenuRow, ProfilePage, Section, purple, ui } from "../../components/profile/ProfileUI";
import { getProfile, type OrganizationDetails } from "../../services/profileService";

export default function ProfileScreen() {
  const { session, signOut, updateUser } = useAuth();
  const [organization, setOrganization] = useState<OrganizationDetails | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutLock = useRef(false);
  const token = session?.token;
  const organizationCode = session?.user.organizationCode;
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!token) return;
    setOrganization(current => current?.organizationCode === organizationCode ? current : null);
    if (revision >= 0) setError("");
    void getProfile(token).then(async result => {
      if (!active) return;
      setOrganization(result.organization || null);
      await updateUser(token, result.user);
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [token, organizationCode, updateUser, revision]));
  const logout = () => {
    if (logoutLock.current) return;
    Alert.alert("Log out?", "You will need to sign in again to continue.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: async () => {
        if (logoutLock.current) return;
        logoutLock.current = true; setLoggingOut(true);
        try { await signOut(); router.replace("/"); }
        catch { Alert.alert("Could not log out", "Please try again."); }
        finally { logoutLock.current = false; setLoggingOut(false); }
      } },
    ]);
  };
  const user = session?.user;
  const initials = user?.fullName.trim().split(/\s+/).map(part => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "U";
  return <ProfilePage title="Profile" subtitle="Manage your account and preferences" back={false}>
    <View style={styles.hero}>
      <View style={styles.heroTop}><View style={styles.avatar}><Text style={styles.initials}>{initials}</Text></View><View style={ui.flex}><Text style={styles.name}>{user?.fullName}</Text><Text style={ui.subtitle}>{user?.email}</Text></View></View>
      <View style={styles.pills}><Text style={styles.pill}>{user?.role || "User"}</Text>{user?.organizationCode ? <Text style={styles.pill}>{organization?.organizationName || user.organizationCode}</Text> : null}</View>
      <Action label="Edit Profile" onPress={() => router.push("/screens/profile/EditProfileScreen")} />
    </View>
    {error ? <View style={ui.card}><Text accessibilityRole="alert" style={ui.error}>{error}</Text><Text style={ui.subtitle}>Showing your saved account details.</Text><Action label="Refresh Account" onPress={() => setRevision(value => value + 1)} /></View> : null}
    <Section title="Account">
      <MenuRow icon="person-outline" title="Personal Information" description="Name, contact details and department" onPress={() => router.push("/screens/profile/EditProfileScreen")} />
      <MenuRow icon="lock-closed-outline" title="Change Password" description="Update your account password" onPress={() => router.push("/screens/profile/ChangePasswordScreen")} />
      <MenuRow icon="shield-checkmark-outline" title="Account Session" description={error ? "Saved session · reconnect to verify" : "Signed in to Notiva"} />
    </Section>
    <Section title="Organization">
      {user?.organizationCode ? <>
        <Text style={ui.heading}>{organization?.organizationName || "Your organization"}</Text>
        <Text selectable style={ui.subtitle}>{user.organizationCode}{user.department ? ` · ${user.department}` : ""}</Text>
        <MenuRow icon="business-outline" title="View Organization" description="Organization details and your role" onPress={() => router.push("/screens/profile/OrganizationScreen")} />
        <MenuRow icon="swap-horizontal-outline" title="Change Organization" description="Connect using a new verified code" onPress={() => router.push("/screens/profile/JoinOrganizationScreen")} />
      </> : <MenuRow icon="business-outline" title="Join Organization" description="Not connected to an organization" onPress={() => router.push("/screens/profile/JoinOrganizationScreen")} />}
    </Section>
    <Section title="Preferences">
      <MenuRow icon="notifications-outline" title="Notification Settings" description="Pre-alerts, vibration and phone settings" onPress={() => router.push("/screens/profile/NotificationSettingsScreen")} />
      <MenuRow icon="options-outline" title="App Settings" description="Default alert and first day of the week" onPress={() => router.push("/screens/profile/AppSettingsScreen")} />
    </Section>
    <Action label="Log Out" destructive busy={loggingOut} onPress={logout} />
    <View style={styles.footer}><Text style={styles.brand}>Notiva</Text>{Constants.expoConfig?.version ? <Text style={ui.subtitle}>Version {Constants.expoConfig.version}</Text> : null}</View>
  </ProfilePage>;
}
const styles = StyleSheet.create({
  hero: { backgroundColor: "#EFEDFF", borderRadius: 24, padding: 20, gap: 18 },
  heroTop: { flexDirection: "row", gap: 16, alignItems: "center" },
  avatar: { width: 66, height: 66, backgroundColor: "#DFDAFF", borderRadius: 23, alignItems: "center", justifyContent: "center" },
  initials: { color: purple, fontSize: 24, fontWeight: "900" }, name: { color: "#211A3A", fontSize: 21, fontWeight: "800" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, pill: { color: purple, backgroundColor: "#FFFFFF", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 11, fontSize: 11, fontWeight: "700" },
  footer: { alignItems: "center", paddingVertical: 8 }, brand: { color: "#8B839B", fontSize: 15, fontWeight: "800", letterSpacing: 1 },
});

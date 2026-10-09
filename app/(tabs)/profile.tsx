import { useCallback, useMemo, useRef, useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../contexts/AuthContext";

import { purple } from "../../components/profile/ProfileUI";

import {
  getProfile,
  type OrganizationDetails,
} from "../../services/profileService";

// Keep this presentation local to the main Profile tab.
function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.sectionLabel}>{title}</Text>
    <View style={styles.sectionCard}>{children}</View>
  </View>;
}

function ProfileRow({ icon, title, subtitle, onPress, last = false }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; onPress: () => void; last?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.rowIcon}><Ionicons name={icon} size={20} color={purple} /></View>
    <View style={styles.rowBody}>
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text numberOfLines={2} style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </View>
    <Ionicons name="chevron-forward" size={17} color="#8C859D" />
    {!last && <View pointerEvents="none" style={styles.separator} />}
  </Pressable>;
}

export default function ProfileScreen() {
  const {
    session,
    isLoading,
    signOut,
    updateUser,
  } = useAuth();

  const [organization, setOrganization] =
    useState<OrganizationDetails | null>(null);

  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);

  const logoutLock = useRef(false);

  const token = session?.token;
  const user = session?.user;
  const organizationCode = user?.organizationCode;

  /*
   * Refresh account data whenever Profile becomes active.
   */
  useFocusEffect(
    useCallback(() => {
      let active = true;

      if (!token) {
        return;
      }

      setOrganization(current =>
        current?.organizationCode === organizationCode
          ? current
          : null,
      );

      setError("");

      const refreshProfile = async () => {
        try {
          const result = await getProfile(token);

          if (!active) {
            return;
          }

          setOrganization(result.organization || null);

          await updateUser(
            token,
            result.user,
          );
        } catch (profileError) {
          if (!active) {
            return;
          }

          setError(
            profileError instanceof Error
              ? profileError.message
              : "Could not refresh your account.",
          );
        }
      };

      void refreshProfile();

      return () => {
        active = false;
      };
    }, [
      token,
      organizationCode,
      updateUser,
      revision,
    ]),
  );

  /*
   * Generate profile initials.
   */
  const initials = useMemo(() => {
    const name = user?.fullName?.trim();

    if (!name) {
      return "U";
    }

    const parts = name
      .split(/\s+/)
      .filter(Boolean);

    if (parts.length === 1) {
      return parts[0]
        .slice(0, 2)
        .toUpperCase();
    }

    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }, [user?.fullName]);

  const organizationName =
    organization?.organizationName ||
    (organizationCode
      ? "Your organization"
      : "");

  const logout = () => {
    if (logoutLock.current) {
      return;
    }

    Alert.alert(
      "Log out?",
      "You will need to sign in again to continue.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Log Out",
          style: "destructive",

          onPress: async () => {
            if (logoutLock.current) {
              return;
            }

            logoutLock.current = true;
            setLoggingOut(true);

            try {
              await signOut();

              router.replace("/");
            } catch {
              Alert.alert(
                "Could not log out",
                "Please try again.",
              );
            } finally {
              logoutLock.current = false;
              setLoggingOut(false);
            }
          },
        },
      ],
    );
  };

  return <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
    <View style={styles.header}><Text accessibilityRole="header" style={styles.pageTitle}>Profile</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {isLoading ? <ActivityIndicator color={purple} /> : session ? <>
        <View style={styles.summary}>
          <View style={styles.avatar}><Text style={styles.initials}>{initials}</Text></View>
          <View style={styles.summaryBody}>
            <Text numberOfLines={2} style={styles.name}>{user?.fullName?.trim() || "Notiva User"}</Text>
            <View style={styles.identityRow}>
              <Text accessibilityLabel={`Notiva ID: ${user?.notivaId || "Not set"}`} numberOfLines={2} ellipsizeMode="tail" style={styles.identity}>
                {user?.notivaId ? `@${user.notivaId}` : "Notiva ID not set"}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Edit Notiva ID"
                style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
                onPress={() => router.push("/screens/profile/EditProfileScreen")}>
                <Ionicons name="pencil-outline" size={20} color={purple} />
              </Pressable>
            </View>
            <Text style={styles.emailLabel}>Recovery email</Text>
            <Text selectable numberOfLines={2} ellipsizeMode="middle" style={styles.email}>
              {user?.recoveryEmail || user?.email || "Not provided"}
            </Text>
            <View style={styles.verification}>
              <Ionicons name={user?.recoveryEmailVerified ? "checkmark-circle" : "ellipse-outline"}
                size={13} color={user?.recoveryEmailVerified ? "#21754A" : "#777184"} />
              <Text style={[styles.verificationText, user?.recoveryEmailVerified && styles.verified]}>
                {user?.recoveryEmailVerified ? "Verified" : "Not verified"}
              </Text>
            </View>
          </View>
        </View>

        {error ? <View style={styles.errorCard}>
          <Text accessibilityRole="alert" style={styles.rowTitle}>Could not refresh profile</Text>
          <Text style={styles.rowSubtitle}>Showing your saved account details.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh Account"
            onPress={() => setRevision(value => value + 1)} style={styles.refreshButton}>
            <Ionicons name="refresh-outline" size={16} color={purple} />
            <Text style={styles.refreshText}>Refresh Account</Text>
          </Pressable>
        </View> : null}

        <Section title="Account">
          <ProfileRow icon="person-outline" title="Personal Information"
            subtitle="Your identity and contact details" onPress={() => router.push("/screens/profile/EditProfileScreen")} />
          <ProfileRow icon="business-outline" title="Organization"
            subtitle={organizationCode ? organizationName : "Join your organization"}
            onPress={() => router.push("/screens/profile/OrganizationScreen")} />
          <ProfileRow icon="shield-checkmark-outline" title="Password & Security" last
            onPress={() => router.push("/screens/profile/ChangePasswordScreen")} />
        </Section>

        <Section title="Preferences">
          <ProfileRow icon="notifications-outline" title="Notification Settings"
            subtitle="Alarm sound, pre-alerts and vibration" onPress={() => router.push("/screens/profile/NotificationSettingsScreen")} />
          <ProfileRow icon="options-outline" title="App Settings" last
            subtitle="Week start preference" onPress={() => router.push("/screens/profile/AppSettingsScreen")} />
        </Section>

        <Pressable accessibilityRole="button" accessibilityLabel="Log Out"
          accessibilityState={{ disabled: loggingOut, busy: loggingOut }} disabled={loggingOut}
          style={({ pressed }) => [styles.logout, pressed && styles.pressed]} onPress={logout}>
          {loggingOut ? <ActivityIndicator color="#B43242" /> : <>
            <Ionicons name="log-out-outline" size={20} color="#B43242" />
            <Text style={styles.logoutText}>Log Out</Text>
          </>}
        </Pressable>
        <View style={styles.footer}><Text style={styles.brand}>NOTIVA</Text>
          {Constants.expoConfig?.version ? <Text style={styles.version}>Version {Constants.expoConfig.version}</Text> : null}
        </View>
      </> : <View style={styles.errorCard}>
        <Text style={styles.rowTitle}>Sign in to manage your profile</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Sign In" style={styles.refreshButton}
          onPress={() => router.replace("/screens/login/LoginScreen")}><Text style={styles.refreshText}>Sign In</Text></Pressable>
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F7FC" },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22 },
  pageTitle: { color: "#171329", fontSize: 24, fontWeight: "800", textAlign: "center" },
  content: { paddingHorizontal: 20, paddingBottom: 30, gap: 24, width: "100%", maxWidth: 680, alignSelf: "center" },
  summary: { backgroundColor: "white", borderRadius: 24, padding: 20, flexDirection: "row", alignItems: "flex-start", gap: 14 },
  avatar: { width: 48, height: 48, flexShrink: 0, borderRadius: 16, backgroundColor: "#EFEDFF", alignItems: "center", justifyContent: "center" },
  initials: { color: purple, fontSize: 18, fontWeight: "800" },
  summaryBody: { flex: 1, minWidth: 0 },
  name: { color: "#171329", fontSize: 18, lineHeight: 25, fontWeight: "800" },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  identity: { flex: 1, minWidth: 0, color: purple, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  editButton: { width: 44, height: 44, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  emailLabel: { color: "#777184", fontSize: 11, marginTop: 3 },
  email: { color: "#625B73", fontSize: 12, lineHeight: 18, marginTop: 3 },
  verification: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 7 },
  verificationText: { color: "#777184", fontSize: 11, lineHeight: 16 },
  verified: { color: "#21754A" },
  section: { gap: 9 },
  sectionLabel: { color: "#777184", fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase", marginLeft: 4 },
  sectionCard: { backgroundColor: "white", borderRadius: 20 },
  row: { minHeight: 68, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: { width: 34, height: 34, flexShrink: 0, borderRadius: 11, backgroundColor: "#F7F5FF", alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { color: "#171329", fontSize: 14, fontWeight: "600", lineHeight: 20 },
  rowSubtitle: { color: "#777184", fontSize: 12, lineHeight: 18, marginTop: 3 },
  separator: { position: "absolute", bottom: 0, left: 62, right: 16, height: StyleSheet.hairlineWidth, backgroundColor: "#EEEBF4" },
  logout: { minHeight: 52, borderRadius: 16, backgroundColor: "#FFF0F1", flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center" },
  logoutText: { color: "#B43242", fontSize: 14, fontWeight: "700" },
  errorCard: { padding: 18, borderRadius: 20, backgroundColor: "white" },
  refreshButton: { minHeight: 48, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 8 },
  refreshText: { color: purple, fontSize: 13, fontWeight: "700" },
  pressed: { opacity: 0.7 },
  footer: { alignItems: "center", gap: 4, paddingBottom: 4 },
  brand: { color: "#8C859D", fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  version: { color: "#8C859D", fontSize: 11 },
});

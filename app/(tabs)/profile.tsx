import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../contexts/AuthContext";

export default function ProfileScreen() {
  const { session, signOut, isLoading } = useAuth();

  const [loggingOut, setLoggingOut] = useState(false);

  const user = session?.user;

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

    return (
      parts[0][0] +
      parts[parts.length - 1][0]
    ).toUpperCase();
  }, [user?.fullName]);

  const logout = () => {
    if (loggingOut) {
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
            try {
              setLoggingOut(true);

              await signOut();

              // Return to the root auth flow.
              router.replace("/");
            } catch {
              Alert.alert(
                "Could not log out",
                "Please try again."
              );
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={[
          "top",
          "left",
          "right",
        ]}
      >
        <View style={styles.loadingState}>
          <View style={styles.loadingIcon}>
            <Ionicons
              name="person-outline"
              size={30}
              color="#4d3fe6"
            />
          </View>

          <Text style={styles.loadingText}>
            Loading profile...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={[
          "top",
          "left",
          "right",
        ]}
      >
        <View style={styles.loadingState}>
          <View style={styles.loadingIcon}>
            <Ionicons
              name="person-circle-outline"
              size={32}
              color="#4d3fe6"
            />
          </View>

          <Text style={styles.loadingTitle}>
            No profile found
          </Text>

          <Text style={styles.loadingText}>
            Sign in again to view your profile.
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.signInButton,

              pressed &&
                styles.buttonPressed,
            ]}
            onPress={() =>
              router.replace("/")
            }
          >
            <Text
              style={
                styles.signInButtonText
              }
            >
              Go to Login
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={[
        "top",
        "left",
        "right",
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text
            allowFontScaling={false}
            style={styles.title}
          >
            Profile
          </Text>

          <Text style={styles.subtitle}>
            Your account information
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons
            name="person-outline"
            size={21}
            color="#ffffff"
          />
        </View>
      </View>

      <View style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={
            styles.content
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          {/* Profile summary */}
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text
                style={styles.avatarText}
              >
                {initials}
              </Text>
            </View>

            <View style={styles.profileCopy}>
              <Text
                numberOfLines={2}
                style={styles.name}
              >
                {user.fullName}
              </Text>

              <Text
                numberOfLines={1}
                style={styles.email}
              >
                {user.email}
              </Text>

              <View
                style={styles.roleBadge}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={13}
                  color="#4d3fe6"
                />

                <Text
                  style={styles.roleText}
                >
                  {user.role}
                </Text>
              </View>
            </View>
          </View>

          {/* Personal information */}
          <View style={styles.sectionCard}>
            <View
              style={styles.sectionHeader}
            >
              <View
                style={styles.sectionIcon}
              >
                <Ionicons
                  name="person-circle-outline"
                  size={19}
                  color="#4d3fe6"
                />
              </View>

              <View style={styles.sectionCopy}>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Personal Information
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Your basic account details
                </Text>
              </View>
            </View>

            <ProfileRow
              icon="person-outline"
              label="Full Name"
              value={user.fullName}
            />

            <ProfileRow
              icon="mail-outline"
              label="Email"
              value={user.email}
            />

            <ProfileRow
              icon="call-outline"
              label="Mobile Number"
              value={
                user.mobileNumber ||
                "Not provided"
              }
            />
          </View>

          {/* Organization */}
          <View style={styles.sectionCard}>
            <View
              style={styles.sectionHeader}
            >
              <View
                style={styles.sectionIcon}
              >
                <Ionicons
                  name="business-outline"
                  size={19}
                  color="#4d3fe6"
                />
              </View>

              <View style={styles.sectionCopy}>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Organization
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Workspace and access information
                </Text>
              </View>
            </View>

            <ProfileRow
              icon="key-outline"
              label="Organization Code"
              value={
                user.organizationCode ||
                "Not assigned"
              }
            />

            <ProfileRow
              icon="briefcase-outline"
              label="Department"
              value={
                user.department ||
                "Not assigned"
              }
            />

            <ProfileRow
              icon="shield-outline"
              label="Role"
              value={
                user.role ||
                "User"
              }
              capitalize
            />
          </View>

          {/* Account */}
          <View style={styles.sectionCard}>
            <View
              style={styles.sectionHeader}
            >
              <View
                style={styles.sectionIcon}
              >
                <Ionicons
                  name="settings-outline"
                  size={19}
                  color="#4d3fe6"
                />
              </View>

              <View style={styles.sectionCopy}>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Account
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Session and account controls
                </Text>
              </View>
            </View>

            <View style={styles.accountRow}>
              <View
                style={styles.accountIcon}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color="#4d3fe6"
                />
              </View>

              <View
                style={styles.accountCopy}
              >
                <Text
                  style={
                    styles.accountTitle
                  }
                >
                  Secure Session
                </Text>

                <Text
                  style={
                    styles.accountDescription
                  }
                >
                  Your login session is stored
                  securely on this device.
                </Text>
              </View>
            </View>
          </View>

          {/* Logout */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log out"
            disabled={loggingOut}
            style={({ pressed }) => [
              styles.logoutButton,

              pressed &&
                !loggingOut &&
                styles.buttonPressed,

              loggingOut &&
                styles.buttonDisabled,
            ]}
            onPress={logout}
          >
            <Ionicons
              name="log-out-outline"
              size={20}
              color="#b91c1c"
            />

            <Text
              style={styles.logoutText}
            >
              {loggingOut
                ? "Logging out..."
                : "Log Out"}
            </Text>
          </Pressable>

          <Text style={styles.footerText}>
            Notiva
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  capitalize = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <View style={styles.profileRow}>
      <View style={styles.rowIcon}>
        <Ionicons
          name={icon}
          size={18}
          color="#4d3fe6"
        />
      </View>

      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>
          {label}
        </Text>

        <Text
          selectable
          style={[
            styles.rowValue,

            capitalize &&
              styles.capitalize,
          ]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#4d3fe6",
  },

  header: {
    minHeight: 105,

    backgroundColor: "#4d3fe6",

    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    gap: 14,
  },

  headerCopy: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    color: "#ffffff",

    fontSize: 25,
    lineHeight: 31,

    fontWeight: "900",
  },

  subtitle: {
    color: "#d8d5ff",

    fontSize: 12,
    lineHeight: 18,

    fontWeight: "600",

    marginTop: 3,
  },

  headerIcon: {
    width: 48,
    height: 48,

    borderRadius: 16,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor:
      "rgba(255,255,255,0.13)",
  },

  container: {
    flex: 1,

    backgroundColor: "#f7f7fc",

    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,

    overflow: "hidden",
  },

  scroll: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 110,
  },

  profileCard: {
    backgroundColor: "#ffffff",

    borderRadius: 20,

    padding: 18,

    flexDirection: "row",
    alignItems: "center",

    gap: 15,

    borderWidth: 1,
    borderColor: "#eceaf7",

    marginBottom: 14,

    shadowColor: "#171329",
    shadowOpacity: 0.04,
    shadowRadius: 8,

    shadowOffset: {
      width: 0,
      height: 3,
    },

    elevation: 1,
  },

  avatar: {
    width: 70,
    height: 70,

    borderRadius: 23,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#4d3fe6",

    shadowColor: "#4d3fe6",
    shadowOpacity: 0.2,
    shadowRadius: 8,

    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 3,
  },

  avatarText: {
    color: "#ffffff",

    fontSize: 23,
    lineHeight: 28,

    fontWeight: "900",
  },

  profileCopy: {
    flex: 1,
    minWidth: 0,
  },

  name: {
    color: "#171329",

    fontSize: 19,
    lineHeight: 24,

    fontWeight: "900",
  },

  email: {
    color: "#7c818d",

    fontSize: 12,
    lineHeight: 18,

    fontWeight: "600",

    marginTop: 3,
  },

  roleBadge: {
    alignSelf: "flex-start",

    flexDirection: "row",
    alignItems: "center",

    gap: 5,

    backgroundColor: "#efedff",

    borderRadius: 12,

    paddingHorizontal: 9,
    paddingVertical: 5,

    marginTop: 9,
  },

  roleText: {
    color: "#4d3fe6",

    fontSize: 10,
    lineHeight: 13,

    fontWeight: "900",

    textTransform: "capitalize",
  },

  sectionCard: {
    backgroundColor: "#ffffff",

    borderRadius: 18,

    paddingHorizontal: 17,
    paddingVertical: 17,

    borderWidth: 1,
    borderColor: "#eceaf7",

    marginBottom: 14,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",

    gap: 10,

    marginBottom: 14,
  },

  sectionIcon: {
    width: 36,
    height: 36,

    borderRadius: 11,

    backgroundColor: "#efedff",

    alignItems: "center",
    justifyContent: "center",
  },

  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },

  sectionTitle: {
    color: "#171329",

    fontSize: 16,
    lineHeight: 21,

    fontWeight: "900",
  },

  sectionSubtitle: {
    color: "#9ca3af",

    fontSize: 10,
    lineHeight: 15,

    fontWeight: "600",

    marginTop: 1,
  },

  profileRow: {
    flexDirection: "row",
    alignItems: "flex-start",

    paddingVertical: 12,

    borderTopWidth: 1,
    borderTopColor: "#f1f0f6",
  },

  rowIcon: {
    width: 36,
    height: 36,

    borderRadius: 11,

    backgroundColor: "#f6f4ff",

    alignItems: "center",
    justifyContent: "center",

    marginRight: 11,
  },

  rowCopy: {
    flex: 1,
    minWidth: 0,
  },

  rowLabel: {
    color: "#8a8f9d",

    fontSize: 10,
    lineHeight: 14,

    fontWeight: "700",

    marginBottom: 3,
  },

  rowValue: {
    color: "#111827",

    fontSize: 14,
    lineHeight: 20,

    fontWeight: "700",
  },

  capitalize: {
    textTransform: "capitalize",
  },

  accountRow: {
    flexDirection: "row",
    alignItems: "flex-start",

    paddingTop: 4,
  },

  accountIcon: {
    width: 38,
    height: 38,

    borderRadius: 12,

    backgroundColor: "#f6f4ff",

    alignItems: "center",
    justifyContent: "center",

    marginRight: 11,
  },

  accountCopy: {
    flex: 1,
  },

  accountTitle: {
    color: "#111827",

    fontSize: 13,
    lineHeight: 18,

    fontWeight: "800",
  },

  accountDescription: {
    color: "#8a8f9d",

    fontSize: 11,
    lineHeight: 17,

    fontWeight: "600",

    marginTop: 3,
  },

  logoutButton: {
    minHeight: 54,

    borderRadius: 14,

    backgroundColor: "#fff1f2",

    borderWidth: 1,
    borderColor: "#fecaca",

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 9,

    marginTop: 2,
  },

  logoutText: {
    color: "#b91c1c",

    fontSize: 14,

    fontWeight: "900",
  },

  buttonPressed: {
    opacity: 0.8,

    transform: [
      {
        scale: 0.99,
      },
    ],
  },

  buttonDisabled: {
    opacity: 0.55,
  },

  footerText: {
    color: "#b4b6c0",

    fontSize: 10,

    fontWeight: "700",

    textAlign: "center",

    marginTop: 20,
  },

  loadingState: {
    flex: 1,

    backgroundColor: "#f7f7fc",

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: 26,
  },

  loadingIcon: {
    width: 62,
    height: 62,

    borderRadius: 20,

    backgroundColor: "#efedff",

    alignItems: "center",
    justifyContent: "center",

    marginBottom: 14,
  },

  loadingTitle: {
    color: "#171329",

    fontSize: 17,

    fontWeight: "900",

    textAlign: "center",
  },

  loadingText: {
    color: "#7c818d",

    fontSize: 12,
    lineHeight: 19,

    fontWeight: "600",

    textAlign: "center",

    marginTop: 5,
  },

  signInButton: {
    minWidth: 140,
    minHeight: 46,

    borderRadius: 12,

    backgroundColor: "#4d3fe6",

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: 20,

    marginTop: 20,
  },

  signInButtonText: {
    color: "#ffffff",

    fontSize: 14,

    fontWeight: "800",
  },
});
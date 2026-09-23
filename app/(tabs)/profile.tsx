import { useCallback, useMemo, useRef, useState, type PropsWithChildren } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";

import { useAuth } from "../../contexts/AuthContext";

import {
  Action,
  MenuRow,
  ProfilePage,
  purple,
  ui,
} from "../../components/profile/ProfileUI";

import {
  getProfile,
  type OrganizationDetails,
} from "../../services/profileService";

// Dashboard styling stays local so other profile screens keep their layout.
function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={ui.sectionLabel}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export default function ProfileScreen() {
  const {
    session,
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

  return (
    <ProfilePage
      title="Profile"
      subtitle="Manage your account and preferences"
      back={false}
    >
      <View style={styles.dashboard}>
        {/* =========================
            PROFILE HERO
        ========================== */}

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.avatarOuter}>
              <View style={styles.avatar}>
                <Text style={styles.initials}>
                  {initials}
                </Text>
              </View>
            </View>

            <View style={styles.profileInfo}>
              <Text
                numberOfLines={2}
                style={styles.name}
              >
                {user?.fullName || "Notiva User"}
              </Text>

              <Text
                selectable
                style={styles.email}
              >
                {user?.email || ""}
              </Text>

              <View style={styles.pills}>
                <View style={styles.rolePill}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={12}
                    color={purple}
                  />

                  <Text style={styles.pillText}>
                    {user?.role || "User"}
                  </Text>
                </View>

                {organizationCode ? (
                  <View style={styles.organizationPill}>
                    <Ionicons
                      name="business-outline"
                      size={12}
                      color={purple}
                    />

                    <Text
                      numberOfLines={1}
                      style={styles.organizationPillText}
                    >
                      {organizationName}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

        </View>

        {/* =========================
            PROFILE REFRESH ERROR
        ========================== */}

        {error ? (
          <View style={styles.errorCard}>
            <View style={styles.errorTop}>
              <Ionicons
                name="cloud-offline-outline"
                size={19}
                color={purple}
              />

              <View style={ui.flex}>
                <Text
                  accessibilityRole="alert"
                  style={styles.errorTitle}
                >
                  Could not refresh profile
                </Text>

                <Text style={styles.errorDescription}>
                  Showing your saved account details.
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setRevision(value => value + 1)
              }
              style={({ pressed }) => [
                styles.refreshButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="refresh-outline"
                size={16}
                color={purple}
              />

              <Text style={styles.refreshText}>
                Refresh Account
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* =========================
            ACCOUNT
        ========================== */}

        <Section title="Account">
          <MenuRow
            icon="person-outline"
            title="Personal Information"
            description="Name, mobile number and department"
            onPress={() =>
              router.push(
                "/screens/profile/EditProfileScreen",
              )
            }
          />

          <MenuRow
            icon="lock-closed-outline"
            title="Change Password"
            description="Update your account password"
            onPress={() =>
              router.push(
                "/screens/profile/ChangePasswordScreen",
              )
            }
          />

          <MenuRow
            icon="shield-checkmark-outline"
            title="Account Session"
            description="Signed in securely to Notiva"
          />
        </Section>

        {/* =========================
            ORGANIZATION
        ========================== */}

        <Section title="Organization">
          {organizationCode ? (
            <>
              <View style={styles.organizationSummary}>
                <View style={styles.organizationIcon}>
                  <Ionicons
                    name="business-outline"
                    size={22}
                    color={purple}
                  />
                </View>

                <View style={ui.flex}>
                  <Text
                    numberOfLines={2}
                    style={styles.organizationName}
                  >
                    {organizationName}
                  </Text>

                  <Text
                    selectable
                    style={styles.organizationMeta}
                  >
                    Code · {organizationCode}
                  </Text>
                  <Text style={styles.organizationMeta}>
                    Department · {user?.department || "Not provided"}
                  </Text>
                </View>
              </View>

              <MenuRow
                icon="business-outline"
                title="View Organization"
                description="Organization details and your access"
                onPress={() =>
                  router.push(
                    "/screens/profile/OrganizationScreen",
                  )
                }
              />

              <MenuRow
                icon="swap-horizontal-outline"
                title="Change Organization"
                description="Connect using another verified organization code"
                onPress={() =>
                  router.push(
                    "/screens/profile/JoinOrganizationScreen",
                  )
                }
              />
            </>
          ) : (
            <>
              <View style={styles.noOrganization}>
                <View style={styles.noOrgIcon}>
                  <Ionicons
                    name="business-outline"
                    size={22}
                    color={purple}
                  />
                </View>

                <View style={ui.flex}>
                  <Text style={styles.noOrgTitle}>
                    No organization connected
                  </Text>

                  <Text style={styles.noOrgDescription}>
                    Join your workplace using a verified
                    organization code.
                  </Text>
                </View>
              </View>

              <MenuRow
                icon="add-circle-outline"
                title="Join Organization"
                description="Enter your office organization code"
                onPress={() =>
                  router.push(
                    "/screens/profile/JoinOrganizationScreen",
                  )
                }
              />
            </>
          )}
        </Section>

        {/* =========================
            PREFERENCES
        ========================== */}

        <Section title="Preferences">
          <MenuRow
            icon="notifications-outline"
            title="Notification Settings"
            description="Alarm sound, pre-alerts and vibration"
            onPress={() =>
              router.push(
                "/screens/profile/NotificationSettingsScreen",
              )
            }
          />

          <MenuRow
            icon="options-outline"
            title="App Settings"
            description="Choose the first day of the week"
            onPress={() =>
              router.push(
                "/screens/profile/AppSettingsScreen",
              )
            }
          />
        </Section>

        {/* =========================
            LOGOUT
        ========================== */}

        <Action
          label="Log Out"
          destructive
          busy={loggingOut}
          onPress={logout}
        />

        {/* =========================
            FOOTER
        ========================== */}

        <View style={styles.footer}>
          <Text style={styles.brand}>
            NOTIVA
          </Text>

          {Constants.expoConfig?.version ? (
            <Text style={styles.version}>
              Version {Constants.expoConfig.version}
            </Text>
          ) : null}
        </View>
      </View>
    </ProfilePage>
  );
}

const styles = StyleSheet.create({
  dashboard: { gap: 18 },
  section: { gap: 8 },
  sectionCard: {
    padding: 14,
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E9E5F0",
    backgroundColor: "#FFFFFF",
    elevation: 2,
    shadowColor: "#342965",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  hero: {
    backgroundColor: "#EFEDFF",
    borderRadius: 24,
    padding: 18,

    borderWidth: 1,
    borderColor: "#E4E0FF",

    shadowColor: "#30286A",
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.06,
    shadowRadius: 12,

    elevation: 2,
  },

  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },

  avatarOuter: {
    width: 70,
    height: 70,
    flexShrink: 0,
    borderRadius: 25,

    backgroundColor: "#FFFFFF",

    alignItems: "center",
    justifyContent: "center",

    shadowColor: purple,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.12,
    shadowRadius: 8,

    elevation: 3,
  },

  avatar: {
    width: 64,
    height: 64,

    borderRadius: 21,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#DFDAFF",
  },

  initials: {
    color: purple,

    fontSize: 23,
    lineHeight: 28,

    fontWeight: "900",
  },

  profileInfo: {
    flex: 1,
    minWidth: 0,
  },

  name: {
    color: "#211A3A",

    fontSize: 21,
    lineHeight: 27,

    fontWeight: "900",
  },

  email: {
    marginTop: 3,

    color: "#716B81",

    fontSize: 12,
    lineHeight: 18,

    fontWeight: "600",
  },

  pills: {
    flexDirection: "row",
    flexWrap: "wrap",

    gap: 7,

    marginTop: 10,
  },

  rolePill: {
    flexDirection: "row",
    alignItems: "center",

    gap: 4,

    backgroundColor: "#FFFFFF",

    borderRadius: 10,

    paddingVertical: 6,
    paddingHorizontal: 9,
  },

  organizationPill: {
    maxWidth: "100%",

    flexDirection: "row",
    alignItems: "center",

    gap: 4,

    backgroundColor: "#FFFFFF",

    borderRadius: 10,

    paddingVertical: 6,
    paddingHorizontal: 9,
  },

  pillText: {
    color: purple,

    fontSize: 10,
    fontWeight: "800",

    textTransform: "capitalize",
  },

  organizationPillText: {
    flexShrink: 1,

    color: purple,

    fontSize: 10,
    fontWeight: "800",
  },

  errorCard: {
    padding: 16,

    borderRadius: 18,

    backgroundColor: "#F8F7FF",

    borderWidth: 1,
    borderColor: "#E4E0FF",

    gap: 13,
  },

  errorTop: {
    flexDirection: "row",
    alignItems: "flex-start",

    gap: 9,
  },

  errorTitle: {
    color: "#302A40",

    fontSize: 12,
    fontWeight: "800",
  },

  errorDescription: {
    marginTop: 2,

    color: "#716B81",

    fontSize: 12,
    lineHeight: 18,

    fontWeight: "600",
  },

  refreshButton: {
    minHeight: 48,

    borderRadius: 12,

    borderWidth: 1,
    borderColor: "#DCD6FF",

    backgroundColor: "#FFFFFF",

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 7,
  },

  refreshText: {
    color: purple,

    fontSize: 11,
    fontWeight: "800",
  },

  pressed: {
    opacity: 0.75,

    transform: [
      {
        scale: 0.99,
      },
    ],
  },

  organizationSummary: {
    marginBottom: 5,

    padding: 13,

    flexDirection: "row",
    alignItems: "center",

    gap: 11,

    backgroundColor: "#F8F7FF",

    borderRadius: 15,
  },

  organizationIcon: {
    width: 42,
    height: 42,

    borderRadius: 13,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#ECE9FF",
  },

  organizationName: {
    color: "#211A3A",

    fontSize: 13,
    lineHeight: 18,

    fontWeight: "800",
  },

  organizationMeta: {
    marginTop: 3,

    color: "#777183",

    fontSize: 10,
    lineHeight: 15,

    fontWeight: "600",
  },

  noOrganization: {
    marginBottom: 6,

    padding: 13,

    flexDirection: "row",
    alignItems: "center",

    gap: 11,

    borderRadius: 15,

    backgroundColor: "#F8F7FF",
  },

  noOrgIcon: {
    width: 42,
    height: 42,

    borderRadius: 13,

    backgroundColor: "#ECE9FF",

    alignItems: "center",
    justifyContent: "center",
  },

  noOrgTitle: {
    color: "#211A3A",

    fontSize: 13,
    fontWeight: "800",
  },

  noOrgDescription: {
    marginTop: 3,

    color: "#827C8D",

    fontSize: 10,
    lineHeight: 15,

    fontWeight: "600",
  },

  footer: {
    alignItems: "center",

    paddingTop: 12,
    paddingBottom: 8,

    gap: 3,
  },

  brand: {
    color: "#8B839B",

    fontSize: 13,
    fontWeight: "900",

    letterSpacing: 1.4,
  },

  version: {
    color: "#B0ABB9",

    fontSize: 11,
    fontWeight: "600",
  },
});

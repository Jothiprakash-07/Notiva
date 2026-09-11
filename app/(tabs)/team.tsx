import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TeamScreen() {
  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top", "left", "right"]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text
            allowFontScaling={false}
            style={styles.title}
          >
            Team
          </Text>

          <Text style={styles.subtitle}>
            Manage people in your workspace
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons
            name="people-outline"
            size={22}
            color="#ffffff"
          />
        </View>
      </View>

      <View style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}>
              <Ionicons
                name="people-outline"
                size={24}
                color="#4d3fe6"
              />
            </View>

            <View style={styles.summaryCopy}>
              <Text style={styles.summaryTitle}>
                Your Team
              </Text>

              <Text style={styles.summaryText}>
                Team members will appear here once
                organization data is connected.
              </Text>
            </View>
          </View>

          {/* Section header */}
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                Team Members
              </Text>

              <Text style={styles.sectionSubtitle}>
                0 members
              </Text>
            </View>
          </View>

          {/* Empty state */}
          <View style={styles.emptyBox}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="person-add-outline"
                size={31}
                color="#4d3fe6"
              />
            </View>

            <Text style={styles.emptyTitle}>
              No team members yet
            </Text>

            <Text style={styles.emptyText}>
              Team members from your organization
              will be displayed here.
            </Text>

            <Pressable
              disabled
              style={styles.disabledButton}
            >
              <Ionicons
                name="add-outline"
                size={19}
                color="#9ca3af"
              />

              <Text style={styles.disabledButtonText}>
                Add Member
              </Text>
            </Pressable>

            <Text style={styles.helperText}>
              Team management will be enabled after
              the backend team API is connected.
            </Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
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

    backgroundColor:
      "rgba(255,255,255,0.13)",

    alignItems: "center",
    justifyContent: "center",
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

  summaryCard: {
    backgroundColor: "#ffffff",

    borderRadius: 18,

    borderWidth: 1,
    borderColor: "#eceaf7",

    padding: 16,

    flexDirection: "row",
    alignItems: "center",

    gap: 12,

    marginBottom: 20,
  },

  summaryIcon: {
    width: 48,
    height: 48,

    borderRadius: 15,

    backgroundColor: "#efedff",

    alignItems: "center",
    justifyContent: "center",
  },

  summaryCopy: {
    flex: 1,
    minWidth: 0,
  },

  summaryTitle: {
    color: "#171329",

    fontSize: 15,
    lineHeight: 20,

    fontWeight: "900",
  },

  summaryText: {
    color: "#8b8f9c",

    fontSize: 11,
    lineHeight: 17,

    fontWeight: "600",

    marginTop: 4,
  },

  sectionHeader: {
    marginBottom: 12,
  },

  sectionTitle: {
    color: "#171329",

    fontSize: 17,
    lineHeight: 22,

    fontWeight: "900",
  },

  sectionSubtitle: {
    color: "#9ca3af",

    fontSize: 11,
    lineHeight: 16,

    fontWeight: "600",

    marginTop: 2,
  },

  emptyBox: {
    backgroundColor: "#ffffff",

    borderRadius: 20,

    borderWidth: 1,
    borderColor: "#eceaf7",

    paddingHorizontal: 26,
    paddingVertical: 34,

    alignItems: "center",

    shadowColor: "#171329",
    shadowOpacity: 0.03,
    shadowRadius: 8,

    shadowOffset: {
      width: 0,
      height: 3,
    },

    elevation: 1,
  },

  emptyIcon: {
    width: 62,
    height: 62,

    borderRadius: 19,

    backgroundColor: "#efedff",

    alignItems: "center",
    justifyContent: "center",

    marginBottom: 16,
  },

  emptyTitle: {
    color: "#111827",

    fontSize: 17,
    lineHeight: 22,

    fontWeight: "900",

    textAlign: "center",
  },

  emptyText: {
    color: "#9ca3af",

    fontSize: 12,
    lineHeight: 19,

    fontWeight: "600",

    textAlign: "center",

    marginTop: 7,

    maxWidth: 260,
  },

  disabledButton: {
    minWidth: 150,
    minHeight: 46,

    borderRadius: 12,

    backgroundColor: "#f3f4f6",

    borderWidth: 1,
    borderColor: "#e5e7eb",

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 7,

    marginTop: 20,

    opacity: 0.8,
  },

  disabledButtonText: {
    color: "#9ca3af",

    fontSize: 13,

    fontWeight: "800",
  },

  helperText: {
    color: "#b0b3bd",

    fontSize: 10,
    lineHeight: 16,

    fontWeight: "600",

    textAlign: "center",

    maxWidth: 250,

    marginTop: 12,
  },
});
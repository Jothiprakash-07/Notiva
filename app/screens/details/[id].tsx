import CompletionNoteModal from "../../../components/common/CompletionNoteModal";
import { formatDate, formatTime } from "../../../utils/dateFormat";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  router,
  useLocalSearchParams,
  useFocusEffect,
} from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  deleteItem,
  getItemById,
  toggleComplete,
  updateItem,
} from "../../../services/itemStorage";

import { ReminderItem } from "../../../types/item";

import {
  getItemStatus,
  isItemReadOnly,
} from "../../../utils/itemStatus";

import {
  priorityColors,
  statusColors,
} from "../../../constants/itemColors";

export default function DetailsScreen() {
  const { id } = useLocalSearchParams<{
    id: string;
  }>();

  const [item, setItem] =
    useState<ReminderItem>();

  const [, setNow] =
    useState(Date.now());

  const [showCompletion, setShowCompletion] = useState(false);

  const [busy, setBusy] =
    useState(false);

  const [loadError, setLoadError] =
    useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const refresh = () =>
        getItemById(id)
          .then((next) => {
            if (active) {
              setItem(next);
              setLoadError(false);
            }
          })
          .catch(() => {
            if (active) {
              setLoadError(true);
            }
          });

      void refresh();

      const timer = setInterval(
        () => setNow(Date.now()),
        1000
      );

      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [id])
  );

  if (!item) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back"
            hitSlop={12}
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons
              name="arrow-back"
              size={23}
              color="#111827"
            />
          </Pressable>

          <Text style={styles.headerTitle}>
            Details
          </Text>

          <View style={styles.headerRightSpace} />
        </View>

        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons
              name={
                loadError
                  ? "alert-circle-outline"
                  : "document-text-outline"
              }
              size={30}
              color="#4d3fe6"
            />
          </View>

          <Text style={styles.emptyTitle}>
            {loadError
              ? "Could not load item"
              : "Item not found"}
          </Text>

          <Text style={styles.emptySubtext}>
            {loadError
              ? "Please go back and try again."
              : "This item may have been removed."}
          </Text>

          <Pressable
            style={styles.emptyBack}
            onPress={() => router.back()}
          >
            <Text style={styles.emptyBackText}>
              Go Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const status =
    getItemStatus(item);

  const needsReschedule =
    (item.type === "reminder" ||
      item.type === "task") &&
    (status === "Missed" ||
      status === "Overdue");

  const readOnly =
    isItemReadOnly(item);

  const name =
    item.type[0].toUpperCase() +
    item.type.slice(1);

  const perform = async (
    action: () => Promise<void>
  ) => {
    if (busy) return;

    setBusy(true);

    try {
      await action();
    } catch {
      Alert.alert(
        "Could not update item",
        "Please try again. Your item has not been removed."
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert(
      `Delete ${name}?`,
      `This ${item.type} will be permanently removed.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void perform(async () => {
              await deleteItem(item.id);

              router.replace("/(tabs)");
            });
          },
        },
      ]
    );

  const complete = (note?: string) =>
    perform(async () => {
      const next =
        await toggleComplete(
          item.id,
          note
        );

      if (!next?.completed) throw new Error("Item could not be completed.");
      setItem(next);
      setShowCompletion(false);
    });

  const cancel = () =>
    perform(async () => {
      setItem(
        await updateItem({
          ...item,
          status: "Cancelled",
          updatedAt:
            new Date().toISOString(),
        })
      );
    });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          hitSlop={12}
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons
            name="arrow-back"
            size={23}
            color="#111827"
          />
        </Pressable>

        <Text
          numberOfLines={1}
          style={styles.headerTitle}
        >
          {name} Details
        </Text>

        <View style={styles.headerRightSpace} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.typePill}>
              <Ionicons
                name={
                  item.type === "reminder"
                    ? "notifications-outline"
                    : item.type === "task"
                    ? "checkbox-outline"
                    : item.type === "event"
                    ? "calendar-outline"
                    : "gift-outline"
                }
                size={14}
                color="#ffffff"
              />

              <Text style={styles.type}>
                {item.type.toUpperCase()}
              </Text>
            </View>

            <Text
              style={[
                styles.badge,
                statusColors[status],
              ]}
            >
              {status}
            </Text>
          </View>

          <Text style={styles.title}>
            {item.title}
          </Text>

          {item.description ? (
            <Text
              style={styles.heroDescription}
            >
              {item.description}
            </Text>
          ) : null}
        </View>

        {/* Schedule */}
        <View style={styles.sectionCard}>
          <SectionHeader
            icon="calendar-outline"
            title="Schedule"
          />

          <InfoRow
            icon="calendar-outline"
            label="Date"
            value={formatDate(
              new Date(item.startAt)
            )}
          />

          <InfoRow
            icon="time-outline"
            label="Time"
            value={
              item.allDay
                ? "All day"
                : formatTime(
                    new Date(
                      item.startAt
                    )
                  )
            }
          />

          {item.endAt ? (
            <InfoRow
              icon="flag-outline"
              label="End"
              value={`${formatDate(
                new Date(item.endAt)
              )} • ${formatTime(
                new Date(item.endAt)
              )}`}
            />
          ) : null}

          <InfoRow
            icon="repeat-outline"
            label="Repeat"
            value={item.repeat}
            capitalize
          />

          <InfoRow
            icon="notifications-outline"
            label="Alert"
            value={
              item.alertBefore.label
            }
          />
        </View>

        {/* Details */}
        <View style={styles.sectionCard}>
          <SectionHeader
            icon="information-circle-outline"
            title="Details"
          />

          <InfoRow
            icon="folder-outline"
            label="Category"
            value={item.category}
          />

          {item.priority ? (
            <View style={styles.infoRow}>
              <View
                style={styles.infoIcon}
              >
                <Ionicons
                  name="flag-outline"
                  size={18}
                  color="#4d3fe6"
                />
              </View>

              <View style={styles.infoContent}>
                <Text style={styles.label}>
                  Priority
                </Text>

                <Text
                  style={[
                    styles.badge,
                    priorityColors[
                      item.priority
                    ],
                  ]}
                >
                  {item.priority}
                </Text>
              </View>
            </View>
          ) : null}

          {item.location ? (
            <InfoRow
              icon="location-outline"
              label="Location"
              value={item.location}
            />
          ) : null}

          {item.notes ? (
            <InfoRow
              icon="document-text-outline"
              label="Notes"
              value={item.notes}
            />
          ) : null}
        </View>

        {(status === "Done" || item.completed) && item.completionNote?.trim() ? (
          <View style={styles.sectionCard}>
            <SectionHeader icon="document-text-outline" title="Completion Note" />
            <Text style={styles.descriptionText}>{item.completionNote}</Text>
          </View>
        ) : null}

        {/* Description separate for readability */}
        {item.description ? (
          <View style={styles.sectionCard}>
            <SectionHeader
              icon="reader-outline"
              title="Description"
            />

            <Text
              style={
                styles.descriptionText
              }
            >
              {item.description}
            </Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>
            Actions
          </Text>

          {status === "Pending" &&
          (item.type === "reminder" ||
            item.type === "task") ? (
            <Pressable
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                styles.primary,

                pressed &&
                  !busy &&
                  styles.buttonPressed,

                busy &&
                  styles.buttonDisabled,
              ]}
              onPress={() => { if (!busy && !readOnly) setShowCompletion(true); }}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color="#ffffff"
              />

              <Text
                style={
                  styles.primaryText
                }
              >
                Mark as Done
              </Text>
            </Pressable>
          ) : null}

          {!readOnly &&
          item.type === "event" ? (
            <Pressable
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                styles.secondary,

                pressed &&
                  !busy &&
                  styles.buttonPressed,

                busy &&
                  styles.buttonDisabled,
              ]}
              onPress={cancel}
            >
              <Ionicons
                name="close-circle-outline"
                size={20}
                color="#4d3fe6"
              />

              <Text
                style={
                  styles.secondaryText
                }
              >
                Cancel Event
              </Text>
            </Pressable>
          ) : null}

          {!readOnly ? (
            <Pressable
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                styles.secondary,

                pressed &&
                  !busy &&
                  styles.buttonPressed,

                busy &&
                  styles.buttonDisabled,
              ]}
              onPress={() =>
                router.push({
                  pathname:
                    "/screens/create/[type]",

                  params: {
                    type: item.type,
                    id: item.id,

                    mode:
                      needsReschedule
                        ? "reschedule"
                        : "edit",
                  },
                })
              }
            >
              <Ionicons
                name={
                  needsReschedule
                    ? "calendar-outline"
                    : "create-outline"
                }
                size={20}
                color="#4d3fe6"
              />

              <Text
                style={
                  styles.secondaryText
                }
              >
                {needsReschedule
                  ? "Reschedule"
                  : "Edit"}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              styles.danger,

              pressed &&
                !busy &&
                styles.buttonPressed,

              busy &&
                styles.buttonDisabled,
            ]}
            onPress={remove}
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color="#B91C1C"
            />

            <Text
              style={
                styles.dangerText
              }
            >
              Delete {name}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      <CompletionNoteModal visible={showCompletion} itemTitle={item.title} saving={busy}
        onClose={() => { if (!busy) setShowCompletion(false); }} onConfirm={complete} />
    </SafeAreaView>
  );
}

function SectionHeader({
  icon,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons
          name={icon}
          size={19}
          color="#4d3fe6"
        />
      </View>

      <Text style={styles.sectionTitle}>
        {title}
      </Text>
    </View>
  );
}

function InfoRow({
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
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons
          name={icon}
          size={18}
          color="#4d3fe6"
        />
      </View>

      <View style={styles.infoContent}>
        <Text style={styles.label}>
          {label}
        </Text>

        <Text
          style={[
            styles.value,

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
  safe: {
    flex: 1,
    backgroundColor: "#f7f7fc",
  },

  header: {
    minHeight: 62,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#efedf7",
  },

  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "900",
    color: "#111827",
    paddingHorizontal: 8,
  },

  headerRightSpace: {
    width: 38,
    height: 38,
  },

  scroll: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 40,
    gap: 14,
  },

  hero: {
    backgroundColor: "#4d3fe6",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,

    shadowColor: "#4d3fe6",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 5,
    },

    elevation: 4,
  },

  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent:
      "space-between",
    gap: 12,
  },

  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor:
      "rgba(255,255,255,0.14)",
  },

  type: {
    color: "#e4e1ff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  title: {
    color: "#ffffff",
    fontSize: 25,
    lineHeight: 32,
    fontWeight: "900",
    marginTop: 18,
  },

  heroDescription: {
    marginTop: 9,
    color: "#e7e5ff",
    fontSize: 13,
    lineHeight: 20,
  },

  badge: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
  },

  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 17,
    borderWidth: 1,
    borderColor: "#efedf8",

    shadowColor: "#171329",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },

    elevation: 1,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },

  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#efedff",
  },

  sectionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: "#171329",
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: "#f2f1f7",
  },

  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f3ff",
    marginRight: 11,
  },

  infoContent: {
    flex: 1,
    minWidth: 0,
  },

  label: {
    color: "#8a8f9d",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    marginBottom: 4,
  },

  value: {
    color: "#111827",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },

  capitalize: {
    textTransform: "capitalize",
  },

  descriptionText: {
    color: "#4b5563",
    fontSize: 14,
    lineHeight: 22,
  },

  actionsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#efedf8",
  },

  actionsTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: "#171329",
    marginBottom: 14,
  },

  button: {
    width: "100%",
    minHeight: 52,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  buttonPressed: {
    opacity: 0.82,
  },

  buttonDisabled: {
    opacity: 0.55,
  },

  primary: {
    backgroundColor: "#4d3fe6",
  },

  primaryText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 14,
    textAlign: "center",
  },

  secondary: {
    backgroundColor: "#f5f3ff",
    borderWidth: 1,
    borderColor: "#ded8ff",
  },

  secondaryText: {
    color: "#4d3fe6",
    fontWeight: "900",
    fontSize: 14,
    textAlign: "center",
  },

  danger: {
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    marginBottom: 0,
  },

  dangerText: {
    color: "#B91C1C",
    fontWeight: "900",
    fontSize: 14,
    textAlign: "center",
  },

  emptyState: {
    flex: 1,
    paddingHorizontal: 26,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: "#efedff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  emptyTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },

  emptySubtext: {
    color: "#6b7280",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 20,
  },

  emptyBack: {
    minWidth: 130,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#4d3fe6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  emptyBackText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
});
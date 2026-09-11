import { formatDate, formatTime } from "../../utils/dateFormat";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import {
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ReminderCard from "../../components/home/ReminderCard";
import ActionRequiredStack from "../../components/home/ActionRequiredStack";
import { getItems } from "../../services/itemStorage";
import { ReminderItem } from "../../types/item";
import {
  getItemStatus,
  withCalculatedStatus,
} from "../../utils/itemStatus";
import {
  isActionRequired,
  sortItemsByStatus,
} from "../../utils/itemSorting";

function displayItem(item: ReminderItem) {
  const start = new Date(item.startAt);

  return {
    time: item.allDay
      ? "All day"
      : formatTime(start),

    date: formatDate(
      start,
      "shortYear"
    ),
  };
}

export default function NotificationsScreen() {
  const [stackId, setStackId] =
    useState<string | null>(null);

  const [items, setItems] =
    useState<ReminderItem[]>([]);

  const refresh =
    useCallback(async () => {
      const stored =
        await getItems();

      setItems(
        stored.map(
          (item) =>
            withCalculatedStatus(
              item
            )
        )
      );
    }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load =
        async () => {
          try {
            const stored =
              await getItems();

            if (active) {
              setItems(
                stored.map(
                  (item) =>
                    withCalculatedStatus(
                      item
                    )
                )
              );
            }
          } catch {
            if (active) {
              Alert.alert(
                "Could not load items",
                "Please reopen Notifications to try again."
              );
            }
          }
        };

      void load();

      const timer =
        setInterval(() => {
          if (active) {
            setItems(
              (current) =>
                current.map(
                  (item) =>
                    withCalculatedStatus(
                      item
                    )
                )
            );
          }
        }, 30_000);

      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [])
  );

  const actionItems =
    useMemo(
      () =>
        sortItemsByStatus(
          items.filter(
            (item) =>
              isActionRequired(
                item
              )
          )
        ),
      [items]
    );

  const openFirstItem = () => {
    if (
      actionItems.length > 0
    ) {
      setStackId(
        actionItems[0].id
      );
    }
  };

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
      <View
        style={styles.header}
      >
        <View style={styles.headerCopy}>
          <Text
            allowFontScaling={false}
            style={styles.title}
          >
            Action Required
          </Text>

          <Text
            style={styles.subtitle}
          >
            Missed reminders and overdue tasks
          </Text>
        </View>

        <View
          style={
            styles.headerCount
          }
        >
          <Text
            style={
              styles.headerCountNumber
            }
          >
            {actionItems.length}
          </Text>

          <Text
            style={
              styles.headerCountLabel
            }
          >
            unresolved
          </Text>
        </View>
      </View>

      <View
        style={
          styles.container
        }
      >
        {actionItems.length ? (
          <>
            {/* Summary */}
            <View
              style={
                styles.summaryCard
              }
            >
              <View
                style={
                  styles.summaryIcon
                }
              >
                <Ionicons
                  name="warning-outline"
                  size={22}
                  color="#4d3fe6"
                />
              </View>

              <View
                style={
                  styles.summaryCopy
                }
              >
                <Text
                  style={
                    styles.summaryTitle
                  }
                >
                  {actionItems.length}{" "}
                  {actionItems.length ===
                  1
                    ? "item needs"
                    : "items need"}{" "}
                  your attention
                </Text>

                <Text
                  style={
                    styles.summaryText
                  }
                >
                  Review each item and choose an action.
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open Action Required stack"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.reviewButton,
                  pressed &&
                    styles.pressed,
                ]}
                onPress={
                  openFirstItem
                }
              >
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color="#ffffff"
                />
              </Pressable>
            </View>

            <Text
              style={
                styles.listHeading
              }
            >
              Pending Action
            </Text>

            <Text
              style={styles.hint}
            >
              Tap any card to open it in the Action Required stack.
            </Text>
          </>
        ) : null}

        <ScrollView
          style={styles.list}
          contentContainerStyle={[
            styles.content,

            actionItems.length ===
              0 &&
              styles.emptyContent,
          ]}
          showsVerticalScrollIndicator={
            false
          }
        >
          {actionItems.length ? (
            actionItems.map(
              (item) => {
                const shown =
                  displayItem(
                    item
                  );

                return (
                  <View
                    key={item.id}
                    style={
                      styles.cardWrap
                    }
                  >
                    <ReminderCard
                      id={item.id}
                      title={
                        item.title
                      }
                      time={
                        shown.time
                      }
                      date={
                        shown.date
                      }
                      category={
                        item.category
                      }
                      priority={
                        item.priority
                      }
                      status={
                        getItemStatus(
                          item
                        )
                      }
                      type={
                        item.type
                      }
                      onPress={() =>
                        setStackId(
                          item.id
                        )
                      }
                    />
                  </View>
                );
              }
            )
          ) : (
            <View
              style={
                styles.emptyBox
              }
            >
              <View
                style={
                  styles.emptyIcon
                }
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={32}
                  color="#4d3fe6"
                />
              </View>

              <Text
                style={
                  styles.emptyTitle
                }
              >
                You’re all caught up
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Missed reminders and overdue tasks that need attention will appear here.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      {stackId !== null ? (
        <ActionRequiredStack
          items={items}
          initialId={stackId}
          onClose={() =>
            setStackId(null)
          }
          onChanged={refresh}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "#4d3fe6",
    },

    header: {
      minHeight: 106,
      backgroundColor:
        "#4d3fe6",
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 20,

      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
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

    headerCount: {
      minWidth: 68,
      minHeight: 58,
      paddingHorizontal: 10,

      borderRadius: 18,

      backgroundColor:
        "rgba(255,255,255,0.13)",

      alignItems: "center",
      justifyContent:
        "center",
    },

    headerCountNumber: {
      color: "#ffffff",
      fontSize: 19,
      lineHeight: 22,
      fontWeight: "900",
    },

    headerCountLabel: {
      color: "#d8d5ff",
      fontSize: 9,
      lineHeight: 13,
      fontWeight: "700",
      marginTop: 1,
    },

    container: {
      flex: 1,

      backgroundColor:
        "#f7f7fc",

      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,

      paddingTop: 18,

      overflow: "hidden",
    },

    summaryCard: {
      marginHorizontal: 18,

      backgroundColor:
        "#ffffff",

      borderRadius: 18,

      borderWidth: 1,
      borderColor:
        "#ece9fa",

      padding: 14,

      flexDirection: "row",
      alignItems: "center",

      gap: 11,

      marginBottom: 18,
    },

    summaryIcon: {
      width: 44,
      height: 44,

      borderRadius: 14,

      backgroundColor:
        "#efedff",

      alignItems: "center",
      justifyContent:
        "center",
    },

    summaryCopy: {
      flex: 1,
      minWidth: 0,
    },

    summaryTitle: {
      color: "#171329",
      fontSize: 14,
      lineHeight: 19,
      fontWeight: "900",
    },

    summaryText: {
      color: "#8b8f9c",
      fontSize: 11,
      lineHeight: 17,
      fontWeight: "600",
      marginTop: 3,
    },

    reviewButton: {
      width: 38,
      height: 38,

      borderRadius: 12,

      backgroundColor:
        "#4d3fe6",

      alignItems: "center",
      justifyContent:
        "center",
    },

    pressed: {
      opacity: 0.8,
    },

    listHeading: {
      color: "#171329",
      fontSize: 17,
      lineHeight: 22,
      fontWeight: "900",

      paddingHorizontal: 18,
    },

    hint: {
      color: "#8b8f9c",
      fontSize: 11,
      lineHeight: 17,
      fontWeight: "600",

      paddingHorizontal: 18,

      marginTop: 4,
      marginBottom: 12,
    },

    list: {
      flex: 1,
    },

    content: {
      paddingHorizontal: 18,
      paddingBottom: 110,
    },

    cardWrap: {
      marginBottom: 11,
    },

    emptyContent: {
      flexGrow: 1,
      justifyContent:
        "center",

      paddingBottom: 130,
    },

    emptyBox: {
      width: "100%",
      maxWidth: 360,

      alignSelf: "center",

      backgroundColor:
        "#ffffff",

      borderRadius: 20,

      paddingHorizontal: 28,
      paddingVertical: 36,

      alignItems: "center",

      borderWidth: 1,
      borderColor:
        "#eceaf7",

      shadowColor:
        "#171329",
      shadowOpacity: 0.035,
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

      backgroundColor:
        "#efedff",

      alignItems: "center",
      justifyContent:
        "center",

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
  });
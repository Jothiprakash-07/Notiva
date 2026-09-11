import { formatDate, formatTime } from "../../utils/dateFormat";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
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
import {
  getItems,
  toggleComplete,
} from "../../services/itemStorage";
import { ReminderItem } from "../../types/item";
import {
  getItemStatus,
  isCountedAsDone,
  isCountedAsOverdue,
  withCalculatedStatus,
} from "../../utils/itemStatus";
import { sortItemsByStatus } from "../../utils/itemSorting";

type ListFilter =
  | "all"
  | "done"
  | "overdue";

const filters: {
  label: string;
  value: ListFilter;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    label: "All",
    value: "all",
    icon: "list-outline",
  },
  {
    label: "Done",
    value: "done",
    icon: "checkmark-circle-outline",
  },
  {
    label: "Overdue",
    value: "overdue",
    icon: "alert-circle-outline",
  },
];

function normalizeFilter(
  value?: string | string[]
): ListFilter {
  const selected =
    Array.isArray(value)
      ? value[0]
      : value;

  return selected === "done" ||
    selected === "overdue"
    ? selected
    : "all";
}

function displayItem(
  item: ReminderItem
) {
  const start =
    new Date(item.startAt);

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

function filterTitle(
  filter: ListFilter
) {
  if (filter === "done") {
    return "Completed items";
  }

  if (filter === "overdue") {
    return "Needs attention";
  }

  return "All reminders";
}

function emptyContent(
  filter: ListFilter
) {
  if (filter === "done") {
    return {
      icon:
        "checkmark-done-circle-outline" as const,
      title: "No completed items",
      text:
        "Items you complete will appear here.",
    };
  }

  if (filter === "overdue") {
    return {
      icon:
        "time-outline" as const,
      title: "No overdue items",
      text:
        "Missed reminders and overdue tasks will appear here.",
    };
  }

  return {
    icon:
      "notifications-outline" as const,
    title: "No items yet",
    text:
      "Create a reminder, task, event, or birthday to get started.",
  };
}

export default function RemindersScreen() {
  const params =
    useLocalSearchParams<{
      filter?:
        | string
        | string[];
    }>();

  const selectedFilter =
    normalizeFilter(
      params.filter
    );

  const [items, setItems] =
    useState<ReminderItem[]>(
      []
    );

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
                "Please reopen Reminders to try again."
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

  const filteredItems =
    useMemo(() => {
      if (
        selectedFilter ===
        "done"
      ) {
        return sortItemsByStatus(
          items.filter(
            isCountedAsDone
          )
        );
      }

      if (
        selectedFilter ===
        "overdue"
      ) {
        return sortItemsByStatus(
          items.filter(
            isCountedAsOverdue
          )
        );
      }

      return sortItemsByStatus(
        items
      );
    }, [
      items,
      selectedFilter,
    ]);

  const handleToggle =
    async (id: string) => {
      try {
        await toggleComplete(
          id
        );

        await refresh();
      } catch {
        Alert.alert(
          "Could not complete item",
          "Please try again."
        );
      }
    };

  const empty =
    emptyContent(
      selectedFilter
    );

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
        <View>
          <Text
            allowFontScaling={
              false
            }
            style={styles.title}
          >
            Reminders
          </Text>

          <Text
            allowFontScaling={
              false
            }
            style={
              styles.subtitle
            }
          >
            Keep track of everything important
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
            {
              filteredItems.length
            }
          </Text>

          <Text
            style={
              styles.headerCountLabel
            }
          >
            {filteredItems.length ===
            1
              ? "item"
              : "items"}
          </Text>
        </View>
      </View>

      <View
        style={
          styles.container
        }
      >
        {/* Filter title */}
        <View
          style={
            styles.sectionTop
          }
        >
          <View>
            <Text
              style={
                styles.sectionTitle
              }
            >
              {filterTitle(
                selectedFilter
              )}
            </Text>

            <Text
              style={
                styles.sectionSubtitle
              }
            >
              {filteredItems.length}{" "}
              {filteredItems.length ===
              1
                ? "result"
                : "results"}
            </Text>
          </View>
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.filters
          }
          style={
            styles.filterScroll
          }
        >
          {filters.map(
            (filter) => {
              const selected =
                filter.value ===
                selectedFilter;

              return (
                <Pressable
                  key={
                    filter.value
                  }
                  accessibilityRole="button"
                  accessibilityState={{
                    selected,
                  }}
                  style={({
                    pressed,
                  }) => [
                    styles.filterChip,

                    selected &&
                      styles.selectedFilterChip,

                    pressed &&
                      styles.filterPressed,
                  ]}
                  onPress={() =>
                    router.setParams(
                      {
                        filter:
                          filter.value,
                      }
                    )
                  }
                >
                  <Ionicons
                    name={
                      filter.icon
                    }
                    size={17}
                    color={
                      selected
                        ? "#ffffff"
                        : "#4d3fe6"
                    }
                  />

                  <Text
                    style={[
                      styles.filterText,

                      selected &&
                        styles.selectedFilterText,
                    ]}
                  >
                    {
                      filter.label
                    }
                  </Text>
                </Pressable>
              );
            }
          )}
        </ScrollView>

        {/* List */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,

            filteredItems.length ===
              0 &&
              styles.emptyListContent,
          ]}
          showsVerticalScrollIndicator={
            false
          }
        >
          {filteredItems.length >
          0 ? (
            filteredItems.map(
              (item) => {
                const shown =
                  displayItem(
                    item
                  );

                const status =
                  getItemStatus(
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
                        status
                      }
                      type={
                        item.type
                      }
                      onPress={() =>
                        router.push(
                          `/screens/details/${item.id}` as any
                        )
                      }
                      onToggle={() =>
                        handleToggle(
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
                  name={
                    empty.icon
                  }
                  size={30}
                  color="#4d3fe6"
                />
              </View>

              <Text
                style={
                  styles.emptyTitle
                }
              >
                {empty.title}
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                {empty.text}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
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
      minHeight: 105,
      backgroundColor:
        "#4d3fe6",
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 20,

      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      gap: 15,
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
      minWidth: 58,
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

    sectionTop: {
      paddingHorizontal: 18,
      marginBottom: 14,
    },

    sectionTitle: {
      color: "#171329",
      fontSize: 18,
      lineHeight: 23,
      fontWeight: "900",
    },

    sectionSubtitle: {
      color: "#8b8f9c",
      fontSize: 11,
      lineHeight: 16,
      fontWeight: "600",
      marginTop: 3,
    },

    filterScroll: {
      flexGrow: 0,
      marginBottom: 14,
    },

    filters: {
      flexDirection: "row",
      gap: 9,
      paddingHorizontal: 18,
      paddingRight: 28,
    },

    filterChip: {
      minHeight: 40,
      minWidth: 86,
      borderRadius: 20,
      backgroundColor:
        "#ffffff",
      borderWidth: 1,
      borderColor:
        "#e7e5f3",

      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 7,

      paddingHorizontal: 15,
    },

    selectedFilterChip: {
      backgroundColor:
        "#4d3fe6",
      borderColor:
        "#4d3fe6",

      shadowColor:
        "#4d3fe6",
      shadowOpacity: 0.15,
      shadowRadius: 6,
      shadowOffset: {
        width: 0,
        height: 3,
      },

      elevation: 2,
    },

    filterPressed: {
      opacity: 0.8,
    },

    filterText: {
      color: "#4d3fe6",
      fontSize: 12,
      fontWeight: "800",
    },

    selectedFilterText: {
      color: "#ffffff",
    },

    list: {
      flex: 1,
    },

    listContent: {
      paddingHorizontal: 18,
      paddingBottom: 110,
    },

    cardWrap: {
      marginBottom: 11,
    },

    emptyListContent: {
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
      paddingHorizontal: 26,
      paddingVertical: 34,

      alignItems: "center",

      borderWidth: 1,
      borderColor:
        "#eceaf7",

      shadowColor:
        "#171329",
      shadowOpacity: 0.03,
      shadowRadius: 8,
      shadowOffset: {
        width: 0,
        height: 3,
      },

      elevation: 1,
    },

    emptyIcon: {
      width: 58,
      height: 58,
      borderRadius: 18,
      backgroundColor:
        "#efedff",
      alignItems: "center",
      justifyContent:
        "center",
      marginBottom: 15,
    },

    emptyTitle: {
      color: "#111827",
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "900",
      textAlign: "center",
    },

    emptyText: {
      color: "#9ca3af",
      fontSize: 12,
      lineHeight: 19,
      fontWeight: "600",
      textAlign: "center",
      marginTop: 6,
      maxWidth: 250,
    },
  });
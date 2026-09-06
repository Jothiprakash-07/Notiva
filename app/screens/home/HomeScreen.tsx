import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ReminderCard from "../../../components/home/ReminderCard";
import ActionRequiredCard from "../../../components/home/ActionRequiredCard";
import StatsCard from "../../../components/home/StatsCard";
import CreateTypeSheet from "../../../components/home/CreateTypeSheet";
import { useAuth } from "../../../contexts/AuthContext";

import {
  getItems,
  resolveItemAction,
  toggleComplete,
} from "../../../services/itemStorage";

import { ReminderItem } from "../../../types/item";

import {
  getItemStatus,
  isCountedAsDone,
  isCountedAsOverdue,
  withCalculatedStatus,
} from "../../../utils/itemStatus";
import { isActionRequired, sortItemsByStatus } from "../../../utils/itemSorting";

// Status card icons.
const totalIcon = require("../../../assets/icon/status/solar.png");
const doneIcon = require("../../../assets/icon/status/hugeicons.png");
const overdueIcon = require("../../../assets/icon/status/fluent_cursor.png");

function getGreeting(date: Date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night";
}

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

type DateFilter =
  | "Today"
  | "Tomorrow"
  | "This Week"
  | "This Month"
  | "Next Month";

const dateFilters: DateFilter[] = [
  "Today",
  "Tomorrow",
  "This Week",
  "This Month",
  "Next Month",
];

function displayItem(item: ReminderItem) {
  const start = new Date(item.startAt);

  return {
    time: item.allDay
      ? "All day"
      : start.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),

    date: start.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    }),
  };
}

function matchesDateFilter(
  startAt: string,
  filter: DateFilter,
  now: Date
): boolean {
  const timestamp = new Date(startAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );

  let start = new Date(todayStart);
  let end = new Date(todayStart);

  if (filter === "Today") {
    end.setDate(end.getDate() + 1);
  }

  if (filter === "Tomorrow") {
    start.setDate(start.getDate() + 1);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  }

  if (filter === "This Week") {
    const day = start.getDay();

    const daysUntilSunday =
      day === 0 ? 1 : 8 - day;

    end.setDate(end.getDate() + daysUntilSunday);
  }

  if (filter === "This Month") {
    end = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
      0,
      0,
      0,
      0
    );
  }

  if (filter === "Next Month") {
    start = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
      0,
      0,
      0,
      0
    );

    end = new Date(
      now.getFullYear(),
      now.getMonth() + 2,
      1,
      0,
      0,
      0,
      0
    );
  }

  return (
    timestamp >= start.getTime() &&
    timestamp < end.getTime()
  );
}

export default function HomeScreen() {
  const { session } = useAuth();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [searchText, setSearchText] =
    useState("");

  const [dateFilter, setDateFilter] =
    useState<DateFilter>("Today");

  const [items, setItems] =
    useState<ReminderItem[]>([]);

  const [showCreate, setShowCreate] =
    useState(false);

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentDate(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const fullName = session?.user.fullName.trim() || "User";
  const avatarInitials = getInitials(fullName);

  const loadItems = useCallback(async () => {
    const stored = await getItems();
    setItems(stored.map((item) => withCalculatedStatus(item)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const refresh = async () => {
        try {
          if (active) await loadItems();
        } catch {
          if (active) {
            Alert.alert(
              "Could not load reminders",
              "Please reopen Home to try again."
            );
          }
        }
      };

      void refresh();

      const timer = setInterval(() => {
        if (active) {
          setItems((current) =>
            current.map((item) =>
              withCalculatedStatus(item)
            )
          );
        }
      }, 1000);

      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [loadItems])
  );

  const filteredReminders =
    useMemo(() => {
      const search =
        searchText.trim().toLowerCase();

      const now = new Date();

      return sortItemsByStatus(items.filter((reminder) => {
        const dateMatches =
          matchesDateFilter(
            reminder.startAt,
            dateFilter,
            now
          );

        if (!dateMatches) {
          return false;
        }

        if (!search) {
          return true;
        }

        return (
          reminder.title
            .toLowerCase()
            .includes(search) ||
          reminder.category
            .toLowerCase()
            .includes(search) ||
          reminder.type
            .toLowerCase()
            .includes(search) ||
          getItemStatus(reminder, now)
            .toLowerCase()
            .includes(search)
        );
      }), now);
    }, [
      items,
      searchText,
      dateFilter,
    ]);

  const actionRequiredItems = useMemo(
    () => sortItemsByStatus(items.filter((item) => isActionRequired(item))),
    [items]
  );

  const totalCount =
    items.length;

  const doneCount =
    items.filter(
      isCountedAsDone
    ).length;

  const overdueCount =
    items.filter(
      isCountedAsOverdue
    ).length;

  const handleToggle =
    async (id: string) => {
      try {
        const updated = await toggleComplete(id);
        if (!updated?.completed) throw new Error("Item could not be completed.");

        const stored =
          await getItems();

        setItems(
          stored.map((item) =>
            withCalculatedStatus(item)
          )
        );
      } catch {
        Alert.alert(
          "Could not complete item",
          "Please try again."
        );
      }
    };

  const handleSkip = async (id: string) => {
    try {
      await resolveItemAction(id);
      await loadItems();
    } catch {
      Alert.alert("Could not skip item", "Please try again.");
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
      <StatusBar
        barStyle="light-content"
        backgroundColor="#4d3fe6"
      />

      <View style={styles.container}>
        {/* Fixed header */}
        <View style={styles.header}>
          <View>
            <Text
              allowFontScaling={false}
              style={styles.greeting}
            >
              {getGreeting(currentDate)},
            </Text>

            <Text
              allowFontScaling={false}
              style={styles.userName}
            >
              {fullName}
            </Text>

            <Text
              allowFontScaling={false}
              style={styles.dateText}
            >
              {currentDate.toLocaleDateString(
                undefined,
                {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }
              )}
            </Text>
          </View>

          <View style={styles.avatar}>
            <Text
              allowFontScaling={false}
              style={styles.avatarText}
            >
              {avatarInitials}
            </Text>
          </View>
        </View>

        <View style={styles.contentArea}>
          {/* Fixed stats */}
          <View style={styles.statsRow}>
            <StatsCard
              icon={totalIcon}
              count={totalCount}
              label="Total"
              variant="total"
              onPress={() =>
                router.push({ pathname: "/(tabs)/reminders", params: { filter: "all" } })
              }
            />

            <StatsCard
              icon={doneIcon}
              count={doneCount}
              label="Done"
              variant="done"
              onPress={() =>
                router.push({ pathname: "/(tabs)/reminders", params: { filter: "done" } })
              }
            />

            <StatsCard
              icon={overdueIcon}
              count={overdueCount}
              label="Overdue"
              variant="overdue"
              onPress={() =>
                router.push({ pathname: "/(tabs)/reminders", params: { filter: "overdue" } })
              }
            />
          </View>

          {/* Fixed search */}
          <View style={styles.searchBox}>
            <Ionicons
              name="search-outline"
              size={18}
              color="#6b7280"
              style={styles.searchIcon}
            />

            <TextInput
              style={styles.searchInput}
              placeholder="Search reminders......."
              placeholderTextColor="#9ca3af"
              value={searchText}
              onChangeText={setSearchText}
            />

            {searchText.length > 0 ? (
              <Pressable
                hitSlop={8}
                onPress={() =>
                  setSearchText("")
                }
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color="#9ca3af"
                />
              </Pressable>
            ) : null}
          </View>

          {/* Fixed section title */}
          <View style={styles.sectionHeader}>
            <Text
              allowFontScaling={false}
              style={styles.sectionTitle}
            >
              {dateFilter}
            </Text>

            <View style={styles.countBadge}>
              <Text
                allowFontScaling={false}
                style={
                  styles.countBadgeText
                }
              >
                {
                  filteredReminders.length
                }
              </Text>
            </View>
          </View>

          {/* Fixed horizontal filter */}
          <View style={styles.filterArea}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={
                false
              }
              style={styles.filterScroll}
              contentContainerStyle={
                styles.filterRow
              }
              keyboardShouldPersistTaps="handled"
            >
              {dateFilters.map(
                (filter) => {
                  const selected =
                    dateFilter === filter;

                  return (
                    <Pressable
                      key={filter}
                      style={[
                        styles.filterChip,
                        selected &&
                          styles.selectedFilterChip,
                      ]}
                      onPress={() =>
                        setDateFilter(
                          filter
                        )
                      }
                    >
                      <Text
                        allowFontScaling={
                          false
                        }
                        style={[
                          styles.filterText,
                          selected &&
                            styles.selectedFilterText,
                        ]}
                      >
                        {filter}
                      </Text>
                    </Pressable>
                  );
                }
              )}
            </ScrollView>
          </View>

          {/* Full remaining area scrolls */}
          <View style={styles.listArea}>
            <ScrollView
              style={styles.reminderScroll}
              contentContainerStyle={
                styles.reminderScrollContent
              }
              showsVerticalScrollIndicator={
                false
              }
              keyboardShouldPersistTaps="handled"
            >
              {actionRequiredItems.length > 0 ? (
                <View style={styles.actionSection}>
                  <Text style={styles.actionTitle}>Action Required</Text>
                  <Text style={styles.actionHint}>Swipe right to mark done or left for options.</Text>
                  {actionRequiredItems.map((item) => {
                    const shown = displayItem(item);
                    return (
                      <ActionRequiredCard
                        key={`action-${item.id}`}
                        id={item.id}
                        title={item.title}
                        time={shown.time}
                        date={shown.date}
                        category={item.category}
                        priority={item.priority}
                        status={getItemStatus(item)}
                        type={item.type}
                        onPress={() => router.push(`/screens/details/${item.id}` as any)}
                        onDone={() => handleToggle(item.id)}
                        onSkip={() => handleSkip(item.id)}
                        onReschedule={() => router.push({ pathname: "/screens/create/[type]", params: { type: item.type, id: item.id, mode: "reschedule" } })}
                      />
                    );
                  })}
                </View>
              ) : null}
              {filteredReminders.length >
              0 ? (
                filteredReminders.map(
                  (reminder) => {
                    const shown =
                      displayItem(
                        reminder
                      );

                    return (
                      <ReminderCard
                        key={reminder.id}
                        id={reminder.id}
                        title={
                          reminder.title
                        }
                        time={shown.time}
                        date={shown.date}
                        category={
                          reminder.category
                        }
                        priority={
                          reminder.priority
                        }
                        status={getItemStatus(
                          reminder
                        )}
                        type={
                          reminder.type
                        }
                        onPress={() =>
                          router.push(
                            `/screens/details/${reminder.id}` as any
                          )
                        }
                        onToggle={() =>
                          handleToggle(
                            reminder.id
                          )
                        }
                      />
                    );
                  }
                )
              ) : (
                <View
                  style={styles.emptyBox}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={26}
                    color="#8b83ff"
                  />

                  <Text
                    allowFontScaling={false}
                    style={
                      styles.emptyTitle
                    }
                  >
                    No items for{" "}
                    {dateFilter}
                  </Text>

                  <Text
                    allowFontScaling={false}
                    style={
                      styles.emptyText
                    }
                  >
                    Tap + to create a reminder,
                    task, event or birthday.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>

        {/* Fixed FAB */}
        <Pressable
          style={styles.floatingButton}
          onPress={() =>
            setShowCreate(true)
          }
        >
          <Text
            allowFontScaling={false}
            style={
              styles.floatingButtonText
            }
          >
            +
          </Text>
        </Pressable>
      </View>

      <CreateTypeSheet
        visible={showCreate}
        onClose={() =>
          setShowCreate(false)
        }
        onSelect={(type) => {
          setShowCreate(false);

          router.push(
            `/screens/create/${type}` as any
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#4d3fe6",
  },

  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },

  header: {
    minHeight: 116,
    backgroundColor: "#4d3fe6",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  greeting: {
    color: "#c8c3ff",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
  },

  userName: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 4,
  },

  dateText: {
    color: "#e3e0ff",
    fontSize: 11,
    fontWeight: "500",
  },

  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#9088ff",
    borderWidth: 2,
    borderColor: "#d8d5ff",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  contentArea: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 0,
  },

  statsRow: {
    flexDirection: "row",
    marginBottom: 12,
    columnGap: 8,
  },

  searchBox: {
    height: 44,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  searchIcon: {
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    height: "100%",
    color: "#111827",
    fontSize: 13,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },

  sectionTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
  },

  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#4d3fe6",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },

  countBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },

  filterArea: {
    width: "100%",
    marginBottom: 8,
  },

  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    width: "100%",
  },

  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 10,
    paddingVertical: 2,
    paddingRight: 100,
  },

  filterChip: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 21,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#eeeeee",
    justifyContent: "center",
    alignItems: "center",
  },

  selectedFilterChip: {
    backgroundColor: "#4d3fe6",
    borderColor: "#4d3fe6",
  },

  filterText: {
    color: "#4b5563",
    fontSize: 14,
    fontWeight: "800",
  },

  selectedFilterText: {
    color: "#ffffff",
  },

  /*
   * This wrapper receives all remaining vertical space.
   */
  listArea: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },

  /*
   * Only the card list scrolls vertically.
   */
  reminderScroll: {
    flex: 1,
    width: "100%",
  },

  reminderScrollContent: {
    flexGrow: 0,
    paddingTop: 2,
    paddingBottom: 110,
  },

  actionSection: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f3efff",
    borderWidth: 1,
    borderColor: "#ddd6fe",
  },

  actionTitle: {
    color: "#4d3fe6",
    fontSize: 16,
    fontWeight: "900",
  },

  actionHint: {
    color: "#6b7280",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
    marginBottom: 10,
  },

  emptyBox: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: "center",
    rowGap: 8,
  },

  emptyTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyText: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 17,
    textAlign: "center",
  },

  floatingButton: {
    position: "absolute",
    right: 20,
    bottom: 16,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#4d3fe6",
    justifyContent: "center",
    alignItems: "center",

    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 8,
  },

  floatingButtonText: {
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "400",
    marginTop: -2,
  },
});

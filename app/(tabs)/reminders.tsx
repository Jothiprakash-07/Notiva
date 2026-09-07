import { formatDate, formatTime } from "../../utils/dateFormat";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ReminderCard from "../../components/home/ReminderCard";
import { getItems, toggleComplete } from "../../services/itemStorage";
import { ReminderItem } from "../../types/item";
import {
  getItemStatus,
  isCountedAsDone,
  isCountedAsOverdue,
  withCalculatedStatus,
} from "../../utils/itemStatus";
import { sortItemsByStatus } from "../../utils/itemSorting";

type ListFilter = "all" | "done" | "overdue";

const filters: { label: string; value: ListFilter }[] = [
  { label: "All", value: "all" },
  { label: "Done", value: "done" },
  { label: "Overdue", value: "overdue" },
];

function normalizeFilter(value?: string | string[]): ListFilter {
  const selected = Array.isArray(value) ? value[0] : value;
  return selected === "done" || selected === "overdue" ? selected : "all";
}

function displayItem(item: ReminderItem) {
  const start = new Date(item.startAt);
  return {
    time: item.allDay
      ? "All day"
      : formatTime(start),
    date: formatDate(start, "shortYear"),
  };
}

export default function RemindersScreen() {
  const params = useLocalSearchParams<{ filter?: string | string[] }>();
  const selectedFilter = normalizeFilter(params.filter);
  const [items, setItems] = useState<ReminderItem[]>([]);

  const refresh = useCallback(async () => {
    const stored = await getItems();
    setItems(stored.map((item) => withCalculatedStatus(item)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        try {
          const stored = await getItems();
          if (active) setItems(stored.map((item) => withCalculatedStatus(item)));
        } catch {
          if (active) {
            Alert.alert("Could not load items", "Please reopen Reminders to try again.");
          }
        }
      };

      void load();

      const timer = setInterval(() => {
        if (active) {
          setItems((current) => current.map((item) => withCalculatedStatus(item)));
        }
      }, 30_000);

      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [])
  );

  const filteredItems = useMemo(() => {
    if (selectedFilter === "done") return sortItemsByStatus(items.filter(isCountedAsDone));
    if (selectedFilter === "overdue") return sortItemsByStatus(items.filter(isCountedAsOverdue));
    return sortItemsByStatus(items);
  }, [items, selectedFilter]);

  const handleToggle = async (id: string) => {
    try {
      await toggleComplete(id);
      await refresh();
    } catch {
      Alert.alert("Could not complete item", "Please try again.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={styles.title}>
          Reminders
        </Text>
        <Text allowFontScaling={false} style={styles.subtitle}>
          {filteredItems.length} {filteredItems.length === 1 ? "item" : "items"}
        </Text>
      </View>

      <View style={styles.container}>
        <View style={styles.filters}>
          {filters.map((filter) => {
            const selected = filter.value === selectedFilter;

            return (
              <Pressable
                key={filter.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.filterChip, selected && styles.selectedFilterChip]}
                onPress={() => router.setParams({ filter: filter.value })}
              >
                <Text style={[styles.filterText, selected && styles.selectedFilterText]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => {
              const shown = displayItem(item);
              const status = getItemStatus(item);

              return (
                <ReminderCard
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  time={shown.time}
                  date={shown.date}
                  category={item.category}
                  priority={item.priority}
                  status={status}
                  type={item.type}
                  onPress={() => router.push(`/screens/details/${item.id}` as any)}
                  onToggle={() => handleToggle(item.id)}
                />
              );
            })
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="file-tray-outline" size={30} color="#8b83ff" />
              <Text style={styles.emptyTitle}>No {selectedFilter} items</Text>
              <Text style={styles.emptyText}>Items matching this status will appear here.</Text>
            </View>
          )}
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
    minHeight: 92,
    backgroundColor: "#4d3fe6",
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: "center",
  },
  title: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
  },
  subtitle: {
    color: "#d8d5ff",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  filters: {
    flexDirection: "row",
    columnGap: 9,
    marginBottom: 12,
  },
  filterChip: {
    minWidth: 78,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  selectedFilterChip: {
    backgroundColor: "#4d3fe6",
  },
  filterText: {
    color: "#4b5563",
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
    paddingBottom: 110,
  },
  emptyBox: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 34,
    alignItems: "center",
    rowGap: 8,
  },
  emptyTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
});

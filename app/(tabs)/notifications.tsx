import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ActionRequiredCard from "../../components/home/ActionRequiredCard";
import { getItems, resolveItemAction, toggleComplete } from "../../services/itemStorage";
import { ReminderItem } from "../../types/item";
import { getItemStatus, withCalculatedStatus } from "../../utils/itemStatus";
import { isActionRequired, sortItemsByStatus } from "../../utils/itemSorting";

function displayItem(item: ReminderItem) {
  const start = new Date(item.startAt);
  return {
    time: item.allDay ? "All day" : start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    date: start.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
  };
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<ReminderItem[]>([]);
  const refresh = useCallback(async () => {
    const stored = await getItems();
    setItems(stored.map((item) => withCalculatedStatus(item)));
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      try {
        const stored = await getItems();
        if (active) setItems(stored.map((item) => withCalculatedStatus(item)));
      } catch {
        if (active) Alert.alert("Could not load items", "Please reopen Notifications to try again.");
      }
    };
    void load();
    const timer = setInterval(() => {
      if (active) setItems((current) => current.map((item) => withCalculatedStatus(item)));
    }, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, []));

  const actionItems = useMemo(() => sortItemsByStatus(items.filter((item) => isActionRequired(item))), [items]);
  const markDone = async (id: string) => {
    try {
      const updated = await toggleComplete(id);
      if (!updated?.completed) throw new Error("Item could not be completed.");
      await refresh();
    } catch {
      Alert.alert("Could not complete item", "Please try again.");
    }
  };
  const skip = async (id: string) => {
    try {
      await resolveItemAction(id);
      await refresh();
    } catch {
      Alert.alert("Could not skip item", "Please try again.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={styles.title}>Action Required</Text>
        <Text style={styles.subtitle}>{actionItems.length} unresolved {actionItems.length === 1 ? "item" : "items"}</Text>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {actionItems.length ? <>
          <Text style={styles.hint}>Swipe right to mark done or left to reschedule or skip.</Text>
          {actionItems.map((item) => {
            const shown = displayItem(item);
            return <ActionRequiredCard
              key={item.id} id={item.id} title={item.title} time={shown.time} date={shown.date}
              category={item.category} priority={item.priority} status={getItemStatus(item)} type={item.type}
              onPress={() => router.push(`/screens/details/${item.id}` as any)}
              onDone={() => markDone(item.id)} onSkip={() => skip(item.id)}
              onReschedule={() => router.push({ pathname: "/screens/create/[type]", params: { type: item.type, id: item.id, mode: "reschedule" } })}
            />;
          })}
        </> : <View style={styles.emptyBox}>
          <Ionicons name="checkmark-circle-outline" size={34} color="#8b83ff" />
          <Text style={styles.emptyTitle}>You’re all caught up</Text>
          <Text style={styles.emptyText}>Missed reminders and overdue tasks that need attention will appear here.</Text>
        </View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#4d3fe6",
  },
  header: { minHeight: 92, backgroundColor: "#4d3fe6", paddingHorizontal: 18, paddingVertical: 16, justifyContent: "center" },
  title: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
  },
  subtitle: { color: "#d8d5ff", fontSize: 12, fontWeight: "700", marginTop: 4 },
  list: { flex: 1, backgroundColor: "#f3f4f6" },
  content: { padding: 12, paddingBottom: 110 },
  hint: { color: "#6b7280", fontSize: 11, fontWeight: "600", marginBottom: 12 },
  emptyBox: { backgroundColor: "#ffffff", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 34, alignItems: "center", rowGap: 8 },
  emptyTitle: { color: "#111827", fontSize: 15, fontWeight: "900" },
  emptyText: { color: "#9ca3af", fontSize: 11, fontWeight: "600", lineHeight: 17, textAlign: "center" },
});

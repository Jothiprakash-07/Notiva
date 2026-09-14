import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ActionRequiredStack from "../../components/home/ActionRequiredStack";
import { useNotificationHistory } from "../../hooks/useNotificationHistory";
import { getItemById, getItems } from "../../services/itemStorage";
import { clearNotificationHistory, markNotificationRead, NotificationHistoryEntry } from "../../services/notificationHistory";
import { ItemType, ReminderItem } from "../../types/item";
import { formatDate, formatTime } from "../../utils/dateFormat";
import { isActionRequired } from "../../utils/itemSorting";

const types: Record<ItemType, { label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  reminder: { label: "Reminder", icon: "notifications-outline" },
  task: { label: "Task", icon: "checkbox-outline" },
  event: { label: "Event", icon: "calendar-outline" },
  birthday: { label: "Birthday", icon: "gift-outline" },
};

export default function NotificationsScreen() {
  const { entries, unreadCount, error, loading, refresh } = useNotificationHistory();
  const [stack, setStack] = useState<{ id: string; items: ReminderItem[] } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const tapping = useRef(false);
  useFocusEffect(useCallback(() => {
    refresh();
    return () => { setStack(null); };
  }, [refresh]));

  const sections = useMemo(() => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const grouped = new Map<string, { title: string; data: NotificationHistoryEntry[] }>();
    for (const entry of entries) {
      const date = new Date(entry.firedAt);
      const key = date.toDateString();
      if (!grouped.has(key)) grouped.set(key, {
        title: key === today.toDateString() ? "Today" : key === yesterday.toDateString() ? "Yesterday" : formatDate(date, "shortYear"),
        data: [],
      });
      grouped.get(key)!.data.push(entry);
    }
    return [...grouped.values()];
  }, [entries]);

  const openEntry = async (entry: NotificationHistoryEntry) => {
    if (tapping.current) return;
    tapping.current = true;
    setMessage(null);
    try {
      const item = await getItemById(entry.itemId);
      await markNotificationRead(entry.id);
      if (!item) {
        setMessage("This item is no longer available.");
      } else if (isActionRequired(item)) {
        const items = await getItems();
        setStack({ id: item.id, items });
      } else {
        router.push({ pathname: "/screens/details/[id]", params: { id: item.id } });
      }
    } catch {
      setMessage("Could not open this notification. Please try again.");
    } finally { tapping.current = false; }
  };

  const clear = async () => {
    setClearing(true);
    try {
      await clearNotificationHistory();
      setConfirmClear(false);
      setMessage(null);
    } catch {
      setConfirmClear(false);
      setMessage("Could not clear notification history. Please try again.");
    } finally { setClearing(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>Recent alerts and activity</Text>
          {unreadCount > 0 && <Text style={styles.subtitle}>{unreadCount} unread</Text>}
        </View>
        {entries.length > 0 && <Pressable accessibilityRole="button" onPress={() => setConfirmClear(true)} style={styles.clearButton}>
          <Text style={styles.clearLabel}>Clear All</Text>
        </Pressable>}
      </View>
      <View style={styles.container}>
        <Text style={styles.notice}>Alerts dismissed while the app is closed may not appear here.</Text>
        {message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
        {error ? <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Could not load notification history</Text>
          <Pressable accessibilityRole="button" onPress={refresh} style={styles.retry}><Text style={styles.link}>Try again</Text></Pressable>
        </View> : loading ? <ActivityIndicator style={styles.empty} color="#4d3fe6" /> :
          <SectionList
            sections={sections}
            keyExtractor={entry => entry.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={[styles.content, !entries.length && styles.emptyContent]}
            renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
            renderItem={({ item, section }) => {
              const type = types[item.itemType];
              const date = new Date(item.firedAt);
              const time = formatTime(date);
              return <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${type.label}, ${formatDate(date, "shortYear")}, ${time}, ${item.read ? "read" : "unread"}`} onPress={() => void openEntry(item)} style={({ pressed }) => [styles.card, !item.read && styles.unreadCard, pressed && styles.pressed]}>
                <View style={styles.icon}><Ionicons name={type.icon} size={23} color="#4d3fe6" /></View>
                <View style={styles.copy}>
                  <Text style={[styles.cardTitle, !item.read && styles.unreadTitle]}>{item.title}</Text>
                  <Text style={styles.meta}>{type.label} • {section.title === "Today" || section.title === "Yesterday" ? time : `${formatDate(date, "shortYear")} • ${time}`}</Text>
                  {!!item.body && <Text style={styles.body}>{item.body}</Text>}
                </View>
                {!item.read && <View style={styles.dot} />}
                <Ionicons name="chevron-forward" size={16} color="#9693aa" />
              </Pressable>;
            }}
            ListEmptyComponent={<View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="notifications-outline" size={32} color="#4d3fe6" /></View>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyText}>Your reminder, task, event and birthday alerts will appear here.</Text>
            </View>}
          />}
      </View>
      {stack && <ActionRequiredStack items={stack.items} initialId={stack.id} onClose={() => setStack(null)} onChanged={async () => {
        const items = await getItems();
        setStack(current => current ? { ...current, items } : null);
      }} />}
      <Modal transparent visible={confirmClear} animationType="fade" onRequestClose={() => { if (!clearing) setConfirmClear(false); }}>
        <View style={styles.overlay}><View accessibilityViewIsModal style={styles.dialog}>
          <Text style={styles.emptyTitle}>Clear notification history?</Text>
          <Text style={styles.dialogText}>This only removes notification history. It does not delete reminders, tasks, events, or birthdays.</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={clearing} onPress={() => setConfirmClear(false)} style={styles.retry}><Text style={styles.meta}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={clearing} onPress={() => void clear()} style={styles.retry}><Text style={styles.link}>{clearing ? "Clearing…" : "Clear"}</Text></Pressable>
          </View>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#4d3fe6" },
  header: { minHeight: 106, padding: 18, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 25, fontWeight: "900", color: "#ffffff" },
  subtitle: { fontSize: 12, lineHeight: 18, color: "#d8d5ff", marginTop: 3 },
  clearButton: { padding: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.13)" },
  clearLabel: { color: "#ffffff", fontWeight: "700", fontSize: 12 },
  container: { flex: 1, backgroundColor: "#f7f7fc", borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden" },
  notice: { color: "#757184", fontSize: 11, lineHeight: 17, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4 },
  message: { padding: 18, color: "#4d3fe6", fontSize: 13 },
  content: { paddingHorizontal: 18, paddingBottom: 24 },
  emptyContent: { flexGrow: 1, justifyContent: "center" },
  sectionTitle: { color: "#171329", fontSize: 16, fontWeight: "800", marginTop: 18, marginBottom: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 11, padding: 14, borderRadius: 17, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#eceaf7", marginBottom: 10 },
  unreadCard: { backgroundColor: "#f1efff", borderColor: "#e3dffc" },
  icon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#efedff", alignItems: "center", justifyContent: "center" },
  cardTitle: { color: "#393447", fontSize: 15, lineHeight: 21, fontWeight: "600" },
  unreadTitle: { color: "#171329", fontWeight: "800" },
  meta: { color: "#757184", fontSize: 12, lineHeight: 18, marginTop: 3 },
  body: { color: "#625e72", fontSize: 12, lineHeight: 18, marginTop: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4d3fe6" },
  pressed: { opacity: 0.7 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  emptyIcon: { padding: 17, borderRadius: 19, backgroundColor: "#efedff", marginBottom: 16 },
  emptyTitle: { color: "#171329", fontSize: 17, lineHeight: 24, fontWeight: "800" },
  emptyText: { color: "#757184", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 8, maxWidth: 290 },
  overlay: { flex: 1, backgroundColor: "rgba(23,19,41,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  dialog: { backgroundColor: "#ffffff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 400 },
  dialogText: { color: "#625e72", fontSize: 14, lineHeight: 22, marginTop: 12 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 16 },
  retry: { padding: 12 },
  link: { color: "#4d3fe6", fontWeight: "700", fontSize: 14 },
});

import { formatDate, formatTime } from "../../../utils/dateFormat";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteItem, getItemById, toggleComplete, updateItem } from "../../../services/itemStorage";
import { ReminderItem } from "../../../types/item";
import { getItemStatus, isItemReadOnly } from "../../../utils/itemStatus";
import { priorityColors, statusColors } from "../../../constants/itemColors";

export default function DetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<ReminderItem>();
  const [, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    const refresh = () => getItemById(id).then((next) => { if (active) setItem(next); }).catch(() => { if (active) setLoadError(true); });
    void refresh();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; clearInterval(timer); };
  }, [id]));
  if (!item) return <SafeAreaView style={styles.safe}><Pressable onPress={() => router.back()}><Text style={styles.empty}>Back</Text></Pressable><Text style={styles.empty}>{loadError ? "Could not load item." : "Item not found."}</Text></SafeAreaView>;
  const status = getItemStatus(item);
  const needsReschedule = (item.type === "reminder" || item.type === "task") && (status === "Missed" || status === "Overdue");
  const readOnly = isItemReadOnly(item);
  const name = item.type[0].toUpperCase() + item.type.slice(1);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); } catch { Alert.alert("Could not update item", "Please try again. Your item has not been removed."); }
    finally { setBusy(false); }
  };
  const remove = () => Alert.alert(`Delete ${name}?`, `This ${item.type} will be permanently removed.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: () => { void perform(async () => { await deleteItem(item.id); router.replace("/(tabs)"); }); } },
  ]);
  const complete = () => perform(async () => { const next = await toggleComplete(item.id); if (next) setItem(next); });
  const cancel = () => perform(async () => { setItem(await updateItem({ ...item, status: "Cancelled", updatedAt: new Date().toISOString() })); });
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" hitSlop={10} onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#111827" /></Pressable>
        <Text style={styles.headerTitle}>{name} Details</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false} alwaysBounceVertical={false}>
        <View style={styles.hero}>
          <Text style={styles.type}>{item.type.toUpperCase()}</Text>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={[styles.badge, statusColors[status]]}>{status}</Text>
        </View>
        <View style={styles.infoGroup}>
          {item.description ? <Info label="Description" value={item.description} /> : null}
          <Info label="Date" value={formatDate(new Date(item.startAt))} />
          <Info label="Time" value={item.allDay ? "All day" : formatTime(new Date(item.startAt))} />
          {item.endAt ? <Info label="End" value={`${formatDate(new Date(item.endAt))} • ${formatTime(new Date(item.endAt))}`} /> : null}
          <Info label="Category" value={item.category} />
          {item.priority ? <View style={styles.info}><Text style={styles.label}>Priority</Text><Text style={[styles.badge, priorityColors[item.priority]]}>{item.priority}</Text></View> : null}
          <Info label="Repeat" value={item.repeat} />
          <Info label="Alert" value={item.alertBefore.label} />
          {item.location ? <Info label="Location" value={item.location} /> : null}
          {item.notes ? <Info label="Notes" value={item.notes} /> : null}
        </View>
        <View style={styles.actions}>
          {status === "Pending" && (item.type === "reminder" || item.type === "task") ? <Pressable disabled={busy} style={[styles.button, styles.primary]} onPress={complete}><Text style={styles.primaryText}>Mark Done</Text></Pressable> : null}
          {!readOnly && item.type === "event" ? <Pressable disabled={busy} style={[styles.button, styles.secondary]} onPress={cancel}><Text style={styles.secondaryText}>Cancel Event</Text></Pressable> : null}
          {!readOnly ? <Pressable disabled={busy} style={[styles.button, styles.secondary]} onPress={() => router.push({ pathname: "/screens/create/[type]", params: { type: item.type, id: item.id, mode: needsReschedule ? "reschedule" : "edit" } })}><Text style={styles.secondaryText}>{needsReschedule ? "Reschedule" : "Edit"}</Text></Pressable> : null}
          <Pressable disabled={busy} style={[styles.button, styles.danger]} onPress={remove}><Text style={styles.dangerText}>Delete {name}</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.info}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f4f6" },
  header: { minHeight: 56, backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "900", color: "#111827" },
  scroll: { flex: 1 }, content: { padding: 12, gap: 12 },
  hero: { backgroundColor: "#4d3fe6", borderRadius: 16, padding: 16 },
  type: { color: "#d8d5ff", fontSize: 11, fontWeight: "800" },
  title: { color: "#fff", fontSize: 23, fontWeight: "900", marginVertical: 8 },
  badge: { alignSelf: "flex-start", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: "800", overflow: "hidden" },
  infoGroup: { backgroundColor: "#fff", borderRadius: 12, padding: 12, gap: 10 },
  info: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  label: { color: "#6b7280", fontSize: 12, fontWeight: "700", width: 82 },
  value: { flexGrow: 1, flexShrink: 1, flexBasis: 160, color: "#111827", fontSize: 14, fontWeight: "600" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: { flexGrow: 1, flexBasis: 145, borderRadius: 10, padding: 14, minHeight: 48, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: "#4d3fe6" }, primaryText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  secondary: { backgroundColor: "#fff" }, secondaryText: { color: "#4d3fe6", fontWeight: "900", textAlign: "center" },
  danger: { backgroundColor: "#FEE2E2" }, dangerText: { color: "#B91C1C", fontWeight: "900", textAlign: "center" },
  empty: { margin: 20, color: "#111827" },
});

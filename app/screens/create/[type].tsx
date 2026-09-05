import { priorityColors } from "../../../constants/itemColors";
import { getItemStatus, isItemReadOnly } from "../../../utils/itemStatus";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cancelNotifications, scheduleItemNotifications } from "../../../services/notificationService";
import { saveItem, updateItem, getItemById, rescheduleItem } from "../../../services/itemStorage";
import { AlertBefore, ItemType, Priority, ReminderItem, RepeatType } from "../../../types/item";

const categories = ["Work", "Health", "Finance", "Personal", "Home", "Meeting", "Other"];
const alerts: AlertBefore[] = [{ label: "At Time", minutes: 0 }, { label: "5 Minutes Before", minutes: 5 }, { label: "10 Minutes Before", minutes: 10 }, { label: "30 Minutes Before", minutes: 30 }, { label: "1 Hour Before", minutes: 60 }, { label: "1 Day Before", minutes: 1440 }];
const birthdayAlerts: AlertBefore[] = [{ label: "Same Day", minutes: 0 }, { label: "1 Day Before", minutes: 1440 }, { label: "2 Days Before", minutes: 2880 }, { label: "1 Week Before", minutes: 10080 }];
const repeatOptions: { label: string; value: RepeatType }[] = [{ label: "None", value: "none" }, { label: "Daily", value: "daily" }, { label: "Weekly", value: "weekly" }, { label: "Weekdays", value: "weekdays" }, { label: "Monthly", value: "monthly" }, { label: "Yearly", value: "yearly" }];

function combine(date: Date, time: Date) { const result = new Date(date); result.setHours(time.getHours(), time.getMinutes(), 0, 0); return result; }
function titleFor(type: ItemType) { return type === "reminder" ? "New Reminder" : type === "task" ? "New Task" : type === "event" ? "New Event" : "New Birthday"; }

export default function CreateItemScreen() {
  const params = useLocalSearchParams<{ type?: string; id?: string; mode?: string }>();
  const type = (params.type || "reminder") as ItemType;
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [category, setCategory] = useState("Personal"); const [priority, setPriority] = useState<Priority>("Medium");
  const [date, setDate] = useState(new Date()); const [time, setTime] = useState(new Date()); const [endDate, setEndDate] = useState(new Date()); const [endTime, setEndTime] = useState(new Date(Date.now() + 3600000));
  const [repeat, setRepeat] = useState<RepeatType>(type === "birthday" ? "yearly" : "none"); const [alertBefore, setAlertBefore] = useState<AlertBefore>((type === "birthday" ? birthdayAlerts : alerts)[1]); const [allDay, setAllDay] = useState(type === "birthday");
  const [location, setLocation] = useState(""); const [notes, setNotes] = useState(""); const [picker, setPicker] = useState<"date" | "time" | "endDate" | "endTime" | null>(null); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(params.id));
  const [rescheduling, setRescheduling] = useState(params.mode === "reschedule" && Boolean(params.id) && (type === "reminder" || type === "task"));
  const [locked, setLocked] = useState(false);
  useEffect(() => { if (!params.id) return; getItemById(params.id).then((item) => { if (!item || isItemReadOnly(item)) { setLocked(true); setLoading(false); return; } setRescheduling((item.type === "reminder" || item.type === "task") && (params.mode === "reschedule" || ["Missed", "Overdue"].includes(getItemStatus(item)))); const start = new Date(item.startAt); setTitle(item.title); setDescription(item.description); setCategory(item.category); if (item.priority) setPriority(item.priority); setDate(start); setTime(start); setRepeat(item.repeat); setAlertBefore(item.alertBefore); setAllDay(Boolean(item.allDay)); setLocation(item.location || ""); setNotes(item.notes || ""); if (item.endAt) { const end = new Date(item.endAt); setEndDate(end); setEndTime(end); } setLoading(false); }).catch(() => { setLocked(true); setLoading(false); }); }, [params.id, params.mode]);

  const onPickerChange = (_event: DateTimePickerEvent, selected?: Date) => { setPicker(null); if (!selected) return; if (picker === "date") setDate(selected); else if (picker === "time") setTime(selected); else if (picker === "endDate") setEndDate(selected); else setEndTime(selected); };
  const save = async () => {
    if (saving || loading || locked) return;
    const startAt = combine(date, time);
    if (allDay) startAt.setHours(0, 0, 0, 0);
    const endAt = type === "event" ? combine(endDate, endTime) : undefined;
    if (allDay && endAt) endAt.setHours(23, 59, 59, 999);
    if (!title.trim()) return setError(type === "birthday" ? "Person name is required." : "Title is required.");
    if (endAt && endAt < startAt) return setError("End time cannot be earlier than start time.");
    setSaving(true); setError("");
    let scheduledIds: string[] = [];
    try {
      const existing = params.id ? await getItemById(params.id) : undefined;
      if (params.id && (!existing || isItemReadOnly(existing))) { setLocked(true); return; }
      const item: ReminderItem = { id: existing?.id || Date.now() + "-" + Math.random().toString(36).slice(2), type, title: title.trim(), description: description.trim(), category: type === "birthday" ? "Birthday" : category, repeat: type === "birthday" ? "yearly" : repeat, priority: type === "birthday" || type === "event" ? undefined : priority, startAt: startAt.toISOString(), endAt: endAt?.toISOString(), allDay, location, notes, alertBefore, completed: false, notificationIds: [], createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      if (existing && (rescheduling || ((existing.type === "reminder" || existing.type === "task") && ["Missed", "Overdue"].includes(getItemStatus(existing))))) {
        setRescheduling(true);
        await rescheduleItem(item);
        router.replace("/(tabs)");
        return;
      }
      scheduledIds = await scheduleItemNotifications(item);
      item.notificationIds = scheduledIds;
      if (existing) {
        // Keep old IDs until cancellation succeeds so a retry can still clean them up.
        await updateItem({ ...item, notificationIds: [...existing.notificationIds, ...scheduledIds] });
        await cancelNotifications(existing.notificationIds);
        await updateItem(item);
      } else await saveItem(item);
      router.replace("/(tabs)");
    } catch (error) {
      await cancelNotifications(scheduledIds).catch(() => undefined);
      setError(error instanceof Error ? error.message : "Could not finish saving the item. Please try again.");
    } finally { setSaving(false); }
  };
  if (loading || locked) return <SafeAreaView style={styles.safe}><View style={styles.content}><Text style={styles.label}>{loading ? "Loading item..." : "This item cannot be edited."}</Text><Pressable style={styles.save} onPress={() => params.id ? router.replace({ pathname: "/screens/details/[id]", params: { id: params.id } }) : router.back()}><Text style={styles.saveText}>Back to details</Text></Pressable></View></SafeAreaView>;
  const shownAlerts = type === "birthday" ? birthdayAlerts : alerts;
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor="#fff" /><View style={styles.header}><Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#111827" /></Pressable><Text style={styles.headerTitle}>{params.id ? (rescheduling ? "Reschedule " : "Edit ") + type[0].toUpperCase() + type.slice(1) : titleFor(type)}</Text><View style={{ width: 24 }} /></View><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {error ? <Text style={styles.error}>{error}</Text> : null}<Text style={styles.label}>{type === "birthday" ? "Person Name" : type === "event" ? "Event Title" : "Title"}</Text><TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={type === "birthday" ? "Who has a birthday?" : "What do you need to remember?"} placeholderTextColor="#9ca3af" />
    <Text style={styles.label}>{type === "event" ? "Description" : type === "birthday" ? "Notes" : "Description"}</Text><TextInput style={[styles.input, styles.multiline]} value={type === "birthday" ? notes : description} onChangeText={type === "birthday" ? setNotes : setDescription} multiline placeholder="Add details..." placeholderTextColor="#9ca3af" />
    {type === "event" ? <View style={styles.switchRow}><Text style={styles.label}>All Day</Text><Switch value={allDay} onValueChange={setAllDay} trackColor={{ true: "#4d3fe6" }} /></View> : null}
    <Text style={styles.section}>When</Text><View style={styles.whenRow}><Pressable style={styles.when} onPress={() => setPicker("date")}><Ionicons name="calendar-outline" size={20} color="#4d3fe6" /><Text style={styles.whenText}>{date.toLocaleDateString()}</Text></Pressable><Pressable style={styles.when} onPress={() => setPicker("time")} disabled={allDay}><Ionicons name="time-outline" size={20} color={allDay ? "#c5c5cc" : "#4d3fe6"} /><Text style={styles.whenText}>{allDay ? "All day" : time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text></Pressable></View>
    {type === "event" ? <><Text style={styles.label}>End</Text><View style={styles.whenRow}><Pressable style={styles.when} onPress={() => setPicker("endDate")}><Ionicons name="calendar-outline" size={20} color="#4d3fe6" /><Text style={styles.whenText}>{endDate.toLocaleDateString()}</Text></Pressable><Pressable style={styles.when} onPress={() => setPicker("endTime")} disabled={allDay}><Ionicons name="time-outline" size={20} color={allDay ? "#c5c5cc" : "#4d3fe6"} /><Text style={styles.whenText}>{allDay ? "All day" : endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text></Pressable></View><TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="Location (optional)" placeholderTextColor="#9ca3af" /><TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Notes (optional)" placeholderTextColor="#9ca3af" /></> : null}
    {type !== "birthday" && type !== "event" ? <><Text style={styles.section}>Priority</Text><View style={styles.chips}>{(["High", "Medium", "Low"] as Priority[]).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: priority === value }} style={[styles.chip, { backgroundColor: priorityColors[value].backgroundColor, borderColor: priority === value ? priorityColors[value].color : "transparent", borderWidth: 2 }]} onPress={() => setPriority(value)}><Text style={[styles.chipText, { color: priorityColors[value].color }]}>{value}</Text></Pressable>)}</View></> : null}
    {type !== "birthday" ? <><Text style={styles.section}>Repeat</Text><View style={styles.chips}>{repeatOptions.map((value) => <Pressable key={value.value} style={[styles.chip, repeat === value.value && styles.active]} onPress={() => setRepeat(value.value)}><Text style={repeat === value.value ? styles.activeText : styles.chipText}>{value.label}</Text></Pressable>)}</View></> : <Text style={styles.helper}>Birthday repeats yearly automatically.</Text>}
    <Text style={styles.section}>Alert Before</Text><View style={styles.chips}>{shownAlerts.map((value) => <Pressable key={value.label} style={[styles.chip, alertBefore.label === value.label && styles.active]} onPress={() => setAlertBefore(value)}><Text style={alertBefore.label === value.label ? styles.activeText : styles.chipText}>{value.label}</Text></Pressable>)}</View>
    {type !== "birthday" ? <><Text style={styles.section}>Category</Text><View style={styles.chips}>{categories.map((value) => <Pressable key={value} style={[styles.chip, category === value && styles.active]} onPress={() => setCategory(value)}><Text style={category === value ? styles.activeText : styles.chipText}>{value}</Text></Pressable>)}</View></> : null}
    <Pressable style={styles.save} onPress={save} disabled={saving}><Text style={styles.saveText}>{saving ? "Saving..." : rescheduling ? "Save Reschedule" : `Save ${type === "reminder" ? "Reminder" : type === "task" ? "Task" : type === "event" ? "Event" : "Birthday"}`}</Text><Ionicons name="arrow-forward" size={20} color="#fff" /></Pressable>
  </ScrollView>{picker && <DateTimePicker value={picker === "date" ? date : picker === "time" ? time : picker === "endDate" ? endDate : endTime} mode={picker.toLowerCase().includes("time") ? "time" : "date"} display={Platform.OS === "ios" ? "spinner" : "default"} onChange={onPickerChange} />}</SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: "#fff" }, header: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 }, headerTitle: { fontSize: 21, fontWeight: "900", color: "#111827" }, content: { padding: 20, paddingBottom: 45 }, label: { color: "#111827", fontWeight: "700", fontSize: 14, marginBottom: 8, marginTop: 8 }, input: { borderWidth: 1, borderColor: "#deddf7", borderRadius: 12, minHeight: 50, paddingHorizontal: 14, color: "#111827", marginBottom: 14, backgroundColor: "#fafaff" }, multiline: { minHeight: 88, paddingTop: 13, textAlignVertical: "top" }, section: { fontSize: 16, fontWeight: "900", color: "#111827", marginTop: 13, marginBottom: 11 }, whenRow: { flexDirection: "row", gap: 10, marginBottom: 12 }, when: { flex: 1, minHeight: 58, borderWidth: 1, borderColor: "#deddf7", borderRadius: 13, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 }, whenText: { color: "#111827", fontWeight: "700", fontSize: 12 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { borderRadius: 18, borderWidth: 1, borderColor: "#8b83ff", paddingHorizontal: 13, height: 36, justifyContent: "center" }, active: { backgroundColor: "#4d3fe6", borderColor: "#4d3fe6" }, chipText: { color: "#4d3fe6", fontWeight: "700", fontSize: 11 }, activeText: { color: "#fff", fontWeight: "800", fontSize: 11 }, save: { height: 54, marginTop: 28, backgroundColor: "#4d3fe6", borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }, saveText: { color: "#fff", fontWeight: "900", fontSize: 15 }, error: { color: "#dc2626", fontWeight: "700", marginBottom: 5 }, helper: { color: "#6b7280", marginBottom: 10 }, switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } });

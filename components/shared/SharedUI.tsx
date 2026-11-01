import type { PropsWithChildren } from "react";
import { useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Action, purple, ui } from "../profile/ProfileUI";
import { useOrganization } from "../../contexts/OrganizationContext";
import type { OrganizationPerson, SharedEntry } from "../../types/shared";
import { completionSummary, sharedDisplayStatus } from "../../utils/sharedPermissions";
import { formatDate, formatTime } from "../../utils/dateFormat";
import { isSharedRecurring, repeatLabel } from "../../utils/sharedRecurrence";
export function SharedPage({ title, subtitle, back = true, refreshing = false, onRefresh, children }: PropsWithChildren<{
  title: string; subtitle: string; back?: boolean; refreshing?: boolean; onRefresh?: () => void }>) {
  return <SafeAreaView edges={["top", "left", "right", ...(back ? ["bottom" as const] : [])]} style={styles.safe}>
    <View style={styles.header}>{back && <Pressable accessibilityRole="button" accessibilityLabel="Back to shared workspace" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/team")}><Text style={styles.back}>‹</Text></Pressable>}
      <View style={ui.flex}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View></View>
    <KeyboardAvoidingView style={ui.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={purple} /> : undefined}>{children}</ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
export function Choice({ label, selected, onPress, disabled = false }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.choice, selected && styles.selected, disabled && ui.disabled]}><Text style={[ui.rowTitle, selected && { color: purple }]}>{label}</Text></Pressable>;
}
export function OrganizationSwitcher() {
  const { organizations, current, select } = useOrganization(), [open, setOpen] = useState(false);
  return <View style={ui.card}><Pressable accessibilityRole="button" accessibilityLabel="Switch organization" accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)}>
    <Text style={ui.subtitle}>ORGANIZATION</Text><Text style={ui.heading}>{current?.organization.name ?? "Choose organization"} ▾</Text><Text style={ui.subtitle}>{current?.membership.role}</Text>
  </Pressable>{open && organizations.map(row => <Choice key={row.organization.id} label={`${row.organization.name} · ${row.membership.role}`} selected={row.organization.id === current?.organization.id}
    onPress={() => { setOpen(false); void select(row.organization.id); }} />)}</View>;
}
export function SharedMessage({ message, retry, loading }: { message: string; retry?: () => void; loading?: boolean }) {
  return <View style={ui.card}>{loading && <ActivityIndicator color={purple} />}<Text accessibilityRole="alert" style={ui.subtitle}>{message}</Text>{retry && <Action label="Retry" secondary onPress={retry} />}</View>;
}
export function scheduleLabel(entry: SharedEntry) {
  if (isSharedRecurring(entry) && !entry.occurrence) return "No occurrence today";
  const start = new Date(entry.occurrence?.startAt ?? entry.item.schedule.startAt);
  return `${formatDate(start, "shortYear")} · ${entry.item.schedule.allDay ? "All day" : formatTime(start)}`;
}
export function SharedCard({ entry, people = [], onPress, management = false }: { entry: SharedEntry; people?: OrganizationPerson[]; onPress: () => void; management?: boolean }) {
  const summary = completionSummary(entry), status = management ? entry.item.status : sharedDisplayStatus(entry);
  const creator = people.find(row => row.userId === entry.item.createdByUserId)?.profile?.fullName;
  const completedBy = people.find(row => row.userId === entry.item.completedByUserId)?.profile?.fullName;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open shared ${entry.item.type}: ${entry.item.title}`} onPress={onPress} style={ui.card}>
    <View style={styles.row}><Text style={styles.badge}>SHARED {entry.item.type.toUpperCase()}</Text><Text style={[styles.status, status === "completed" && styles.complete, status === "cancelled" && styles.cancelled]}>{status}</Text></View>
    <Text style={ui.heading}>{entry.item.title}</Text>{!!entry.item.description && <Text numberOfLines={2} style={ui.subtitle}>{entry.item.description}</Text>}
    <Text style={ui.rowTitle}>{scheduleLabel(entry)}</Text>{creator && <Text style={ui.subtitle}>Created by {creator}</Text>}
    {isSharedRecurring(entry) && <Text style={ui.subtitle}>{repeatLabel(entry.item.recurrence?.repeat)} · Series {entry.item.status}{entry.pendingOccurrenceActions?.length ? " · Response pending sync" : ""}</Text>}
    {entry.item.type === "task" && <Text style={ui.subtitle}>{entry.item.completionMode === "collective" ? "Any one recipient · " : "Individual · "}{summary?.label ?? (entry.item.status === "completed" ? "Completed" : "Waiting")}</Text>}
    {summary && <Text style={ui.subtitle}>{summary.total} recipients</Text>}{completedBy && <Text style={ui.success}>Completed by {completedBy}</Text>}
  </Pressable>;
}
export const sharedStyles = StyleSheet.create({ row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" } });
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F7FC" }, header: { flexDirection: "row", gap: 14, padding: 22, backgroundColor: purple, alignItems: "center" },
  title: { fontSize: 25, color: "white", fontWeight: "800" }, subtitle: { fontSize: 12, lineHeight: 18, color: "#E4DFFF", marginTop: 4 },
  back: { fontSize: 38, color: "white", paddingRight: 10 }, content: { padding: 18, gap: 16, paddingBottom: 40, maxWidth: 720, width: "100%", alignSelf: "center" },
  choice: { padding: 13, borderRadius: 12, borderWidth: 1, borderColor: "#E7E2F3", backgroundColor: "#FBFAFE" }, selected: { backgroundColor: "#EFEDFF", borderColor: purple },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 10 }, badge: { fontSize: 10, fontWeight: "800", color: purple }, status: { fontSize: 12, fontWeight: "800", color: "#6F6582", textTransform: "capitalize" },
  complete: { color: "#21754A" }, cancelled: { color: "#B43242" },
});

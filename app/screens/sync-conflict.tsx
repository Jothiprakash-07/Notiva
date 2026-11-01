import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { getItemConflicts, resolveItemConflict, subscribeItemRestore } from "../../services/itemStorage";
import { conflictFields } from "../../utils/itemConflictComparison";

type Conflict = Awaited<ReturnType<typeof getItemConflicts>>[number];
export default function SyncConflictScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const owner = session?.user.id;
  const [record, setRecord] = useState<{ owner: string; row: Conflict }>();
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submitting = useRef(false);
  useEffect(() => {
    let active = true, sequence = 0;
    setRecord(undefined); setLoading(true); setError("");
    const refresh = () => {
      const request = ++sequence;
      if (!owner) { setLoading(false); return; }
      void getItemConflicts(owner).then(rows => {
        if (!active || sequence !== request) return;
        const row = rows.find(value => value.id === id);
        setRecord(row ? { owner, row } : undefined); setLoading(false);
      }).catch(() => { if (active) { setLoading(false); setError("Could not read this conflict. Please reopen it."); } });
    };
    refresh(); const stop = subscribeItemRestore(refresh);
    return () => { active = false; stop(); };
  }, [owner, id]);
  const row = record?.owner === owner && record?.row.id === id ? record.row : undefined;
  const local = row ? conflictFields(row.local) : {};
  const remote = row?.conflict.serverItem;
  const server = remote ? conflictFields(remote) : {};
  const keys = [...new Set([...Object.keys(local), ...Object.keys(server)])];
  const choose = async (choice: "mine" | "server") => {
    if (!row || !owner || submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try { await resolveItemConflict(owner, row.id, row.operationId, choice); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save your choice. Please try again."); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <>
    <Stack.Screen options={{ title: "Resolve sync conflict" }} />
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>Resolve sync conflict</Text>
      {loading ? <ActivityIndicator color="#4D3FE6" /> : row ? <>
        <Text style={styles.explanation}>{row.deleting ? "This item changed on another device before your deletion completed. Keep Mine will retry your deletion." : "This item was changed on another device after your local edit."}</Text>
        <Text style={styles.explanation}>{row.deleting ? "Use Server Version restores the item and cancels your pending deletion." : "Keep Mine retries your local changes. Use Server Version replaces them with the version shown below."}</Text>
        {([ ["LOCAL VERSION", local], ["SERVER VERSION", server] ] as const).map(([label, fields]) => <View key={label} style={styles.section}>
          <Text style={styles.heading}>{label}</Text>
          {label === "LOCAL VERSION" && row.deleting && <Text style={styles.explanation}>Pending deletion</Text>}
          {label === "SERVER VERSION" && !remote ? <Text>Server version unavailable. Sync and reopen this item.</Text> : keys.map(key =>
            <View key={key} style={[styles.field, local[key] !== server[key] && styles.changed]}>
              <Text style={styles.label}>{key}{local[key] !== server[key] ? " · Changed" : ""}</Text>
              <Text style={styles.value}>{fields[key] || "None"}</Text>
            </View>)}
        </View>)}
        <Pressable accessibilityRole="button" disabled={busy || !remote} onPress={() => { void choose("mine"); }} style={[styles.primary, (busy || !remote) && styles.disabled]}>
          <Text style={styles.primaryText}>{busy ? "Saving…" : "Keep Mine"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy || !remote} onPress={() => { void choose("server"); }} style={[styles.secondary, (busy || !remote) && styles.disabled]}>
          <Text style={styles.secondaryText}>Use Server Version</Text>
        </Pressable>
      </> : <Text style={styles.explanation}>This conflict is resolved or is no longer available for this account.</Text>}
      {!!error && <Text accessibilityRole="alert" style={styles.explanation}>{error}</Text>}
    </ScrollView>
  </>;
}
const styles = StyleSheet.create({
  page: { padding: 20, gap: 16, backgroundColor: "#FAF9FF", flexGrow: 1 },
  title: { color: "#171329", fontSize: 24, fontWeight: "700" },
  explanation: { color: "#514C65", fontSize: 15, lineHeight: 22 },
  section: { backgroundColor: "white", borderRadius: 12, padding: 16, gap: 8 },
  heading: { color: "#4D3FE6", fontWeight: "700", fontSize: 12, marginBottom: 6 },
  field: { padding: 8, borderRadius: 6 }, changed: { backgroundColor: "#F0EDFF" },
  label: { color: "#625B78", fontSize: 12, marginBottom: 4 }, value: { color: "#171329", fontSize: 15 },
  primary: { backgroundColor: "#4D3FE6", borderRadius: 10, padding: 16, alignItems: "center" },
  primaryText: { color: "white", fontWeight: "700" },
  secondary: { borderColor: "#4D3FE6", borderWidth: 1, borderRadius: 10, padding: 16, alignItems: "center" },
  secondaryText: { color: "#4D3FE6", fontWeight: "700" }, disabled: { opacity: 0.5 },
});

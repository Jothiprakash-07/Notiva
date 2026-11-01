import { useEffect, useState } from "react";
import { AppState, Pressable, Text } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { getItemConflicts, subscribeItemRestore } from "../../services/itemStorage";

export default function ItemConflictNotice() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [notice, setNotice] = useState<{ owner: string; id: string; count: number }>();
  useEffect(() => {
    let active = true, sequence = 0;
    const refresh = () => {
      const request = ++sequence;
      if (!userId) { setNotice(undefined); return; }
      void getItemConflicts(userId).then(rows => {
        if (active && request === sequence) setNotice(rows.length ? { owner: userId, id: rows[0].id, count: rows.length } : undefined);
      }).catch(() => {});
    };
    refresh();
    const stop = subscribeItemRestore(refresh);
    const app = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => { active = false; stop(); app.remove(); };
  }, [userId]);
  if (!notice || notice.owner !== userId) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Resolve sync conflict"
    onPress={() => router.push({ pathname: "/screens/sync-conflict", params: { id: notice.id } } as any)}
    style={{ backgroundColor: "#EDE9FE", padding: 12 }}>
    <Text style={{ color: "#4D3FE6", fontWeight: "700", textAlign: "center" }}>
      {notice.count === 1 ? "Sync conflict · Review item" : `${notice.count} sync conflicts · Review items`}
    </Text>
  </Pressable>;
}

import { AppState } from "react-native";
import { onItemQueueChanged } from "./itemSyncQueue";
import { syncItems, itemSyncAuthBlocked } from "./itemSyncService";

/** Foreground-only transport lifecycle; alarms have no dependency on this. */
export function startItemSyncRuntime() {
  let disposed = false, online = true, timer: ReturnType<typeof setTimeout> | undefined;
  const trigger = () => {
    if (disposed || !online || AppState.currentState !== "active" || itemSyncAuthBlocked()) return;
    void syncItems().catch(() => { /* Durable local data is kept on storage/network failure. */ });
  };
  const retry = () => {
    timer = setTimeout(() => { trigger(); if (!disposed) retry(); }, 30000);
  };
  let network: { remove(): void } | undefined;
  void import("expo-network").then(Network => {
    if (disposed) return;
    network = Network.addNetworkStateListener(state => {
      const previous = online;
      online = state.isConnected !== false && state.isInternetReachable !== false;
      if (!previous && online) trigger();
    });
    void Network.getNetworkStateAsync().then(state => {
      online = state.isConnected !== false && state.isInternetReachable !== false; trigger();
    }).catch(trigger);
  }).catch(() => { /* Native module absent: bounded HTTP retries still work. */ trigger(); });
  const app = AppState.addEventListener("change", state => { if (state === "active") trigger(); });
  onItemQueueChanged(trigger); retry();
  return () => { disposed = true; if (timer) clearTimeout(timer); network?.remove(); app.remove(); onItemQueueChanged(); };
}

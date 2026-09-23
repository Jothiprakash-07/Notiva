import { Platform } from "react-native";
import { useSyncExternalStore } from "react";

export type AppSettings = { weekStartsOn: 0 | 1 };
const defaults: AppSettings = { weekStartsOn: 1 };
const key = "notiva.app.settings.v1";
let snapshot = defaults;
let loaded = false;
let pending: Promise<AppSettings> | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const notify = () => listeners.forEach(listener => listener());
export function useAppSettings() { return useSyncExternalStore(subscribe, () => snapshot, () => defaults); }
export function getAppSettings(): Promise<AppSettings> {
  if (loaded) return Promise.resolve(snapshot);
  if (pending) return pending;
  pending = (async () => {
    let raw: string | null = null;
    if (Platform.OS === "web") raw = typeof localStorage === "undefined" ? null : localStorage.getItem(key);
    else {
      const { File, Paths } = await import("expo-file-system");
      const file = new File(Paths.document, `${key}.json`);
      raw = file.exists ? await file.text() : null;
    }
    let value: Partial<AppSettings> | null = defaults;
    try { value = raw ? JSON.parse(raw) : defaults; }
    catch { /* Invalid saved preferences fall back without blocking Analytics. */ }
    snapshot = {
      weekStartsOn: value?.weekStartsOn === 0 ? 0 : 1,
    };
    loaded = true; notify(); return snapshot;
  })().finally(() => { pending = undefined; });
  return pending;
}
export async function saveAppSettings(settings: AppSettings) {
  await getAppSettings();
  if (![0, 1].includes(settings.weekStartsOn)) throw new Error("Invalid settings.");
  const raw = JSON.stringify(settings);
  if (Platform.OS === "web") localStorage.setItem(key, raw);
  else {
    const { File, Paths } = await import("expo-file-system");
    new File(Paths.document, `${key}.json`).write(raw);
  }
  snapshot = { ...settings }; notify();
}

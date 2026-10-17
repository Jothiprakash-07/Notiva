import * as SecureStore from "expo-secure-store";
import { uuid } from "expo-modules-core";
import Constants from "expo-constants";
import { Platform } from "react-native";

const KEY = "notiva.installation.id.v1";
let pending: Promise<string> | undefined;
async function installationId() {
  const stored = Platform.OS === "web" ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
  if (stored && /^[a-f0-9-]{36}$/i.test(stored)) return stored;
  const id = uuid.v4();
  if (Platform.OS === "web") localStorage.setItem(KEY, id);
  else await SecureStore.setItemAsync(KEY, id);
  return id;
}
export async function getLoginDevice() {
  if (!pending) pending = installationId().catch(error => { pending = undefined; throw error; });
  return { deviceId: await pending, deviceName: Platform.OS === "android" ? "Android device" : Platform.OS === "ios" ? "iOS device" : "Web browser",
    platform: Platform.OS, appVersion: Constants.expoConfig?.version || "" };
}

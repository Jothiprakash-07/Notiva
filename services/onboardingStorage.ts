import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "notiva.onboarding.completed.v1";

export async function getOnboardingCompleted(): Promise<boolean> {
  if (Platform.OS === "web") {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "true";
  }
  return (await SecureStore.getItemAsync(KEY)) === "true";
}

export async function setOnboardingCompleted(): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") throw new Error("Onboarding storage unavailable.");
    localStorage.setItem(KEY, "true");
    return;
  }
  await SecureStore.setItemAsync(KEY, "true");
}

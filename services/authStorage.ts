import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { AuthSession } from "../types/auth";

const SESSION_KEY = "notiva.auth.session.v1";

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<AuthSession>;
  return (
    typeof candidate.token === "string" &&
    candidate.token.length > 0 &&
    Boolean(candidate.user) &&
    typeof candidate.user?.id === "string" &&
    typeof candidate.user?.fullName === "string"
  );
}

export async function readAuthSession(): Promise<AuthSession | null> {
  const raw =
    Platform.OS === "web"
      ? typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(SESSION_KEY)
      : await SecureStore.getItemAsync(SESSION_KEY);

  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isAuthSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeAuthSession(session: AuthSession): Promise<void> {
  const raw = JSON.stringify(session);

  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.setItem(SESSION_KEY, raw);
    return;
  }

  await SecureStore.setItemAsync(SESSION_KEY, raw);
}

export async function clearAuthSession(): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.removeItem(SESSION_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_KEY);
}

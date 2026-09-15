import "../services/notificationService";
import "react-native-reanimated";
import NativeAlarmCompletion from "../components/common/NativeAlarmCompletion";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";

import * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";
import { recordNotification } from "../services/notificationHistory";

import {
  router,
  Stack,
  useRootNavigationState,
} from "expo-router";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { StatusBar } from "expo-status-bar";

import { AuthProvider } from "@/contexts/AuthContext";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { consumeNotificationResponse, notificationResponseKey } from "../services/notificationResponse";

export default function RootLayout() {
  const colorScheme =
    useColorScheme();

  const navigation = useRootNavigationState();
  const [pending, setPending] = useState<{ itemId: string; responseKey: string }>();
  const responseSequence = useRef(0);
  const received = useRef(new Set<string>());

  useEffect(() => {
    if (Platform.OS === "web") return;
    const record = (notification: Notifications.Notification) => {
      void recordNotification(notification).catch(error => console.warn("Could not save notification history:", error));
    };
    const recoverPresented = () => {
      void Notifications.getPresentedNotificationsAsync().then(notifications => {
        notifications.forEach(record);
      }).catch(error => console.warn("Could not recover notification history:", error));
    };
    const receivedSubscription = Notifications.addNotificationReceivedListener(record);
    const appStateSubscription = AppState.addEventListener("change", state => {
      if (state === "active") recoverPresented();
    });
    recoverPresented();
    return () => { receivedSubscription.remove(); appStateSubscription.remove(); };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const handle = async (response: Notifications.NotificationResponse) => {
      const itemId = response.notification.request.content.data?.itemId;
      if (typeof itemId !== "string" || !itemId.trim()) return;
      const key = notificationResponseKey(response);
      if (received.current.has(key)) return;
      received.current.add(key);
      const sequence = ++responseSequence.current;
      const target = await consumeNotificationResponse(response);
      if (target && sequence === responseSequence.current) setPending(target);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      void handle(response);
    });
    const initialSequence = responseSequence.current;
    void Notifications.getLastNotificationResponseAsync().then(response => {
      if (response && responseSequence.current === initialSequence) void handle(response);
    }).catch(error => console.warn("Could not read last notification response:", error));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!navigation?.key || !pending) return;
    router.replace({
      pathname: "/(tabs)",
      params: {
        notificationItemId: pending.itemId,
        notificationResponseId: pending.responseKey,
      },
    });
    setPending(undefined);
  }, [navigation?.key, pending]);

  return (
    <AuthProvider>
      <ThemeProvider
        value={
          colorScheme ===
          "dark"
            ? DarkTheme
            : DefaultTheme
        }
      >
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              headerShown:
                false,
            }}
          />

          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown:
                false,
            }}
          />

          <Stack.Screen
            name="modal"
            options={{
              presentation:
                "modal",

              title:
                "Modal",
            }}
          />
        </Stack>

        <StatusBar
          style="auto"
        />
        <NativeAlarmCompletion />
      </ThemeProvider>
    </AuthProvider>
  );
}

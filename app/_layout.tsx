import "../services/notificationService";
import "react-native-reanimated";
import NativeAlarmCompletion from "../components/common/NativeAlarmCompletion";
import AppStatusBar from "../components/common/AppStatusBar";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";

import * as Notifications from "expo-notifications";
import { AppState, Platform, View } from "react-native";
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

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { getNotificationSettings } from "../services/notificationService";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { consumeNotificationResponse, notificationResponseKey } from "../services/notificationResponse";
import { startItemSyncRuntime } from "../services/itemSyncRuntime";

export default function RootLayout() {
  return <AuthProvider><View style={{ flex: 1 }}>
    <RootNavigation />
    <AppStatusBar />
  </View></AuthProvider>;
}

function RootNavigation() {
  const { session, isLoading } = useAuth();
  const itemUserId = session?.user.id;
  const itemToken = session?.token;
  useEffect(() => {
    if (isLoading || !itemUserId || !itemToken) return;
    return startItemSyncRuntime();
  }, [isLoading, itemToken, itemUserId]);
  const colorScheme =
    useColorScheme();

  const navigation = useRootNavigationState();
  const [pending, setPending] = useState<{ itemId: string; responseKey: string; userId: string }>();
  const responseSequence = useRef(0);
  const received = useRef(new Set<string>());

  useEffect(() => {
    void getNotificationSettings().catch(error => console.warn("Could not sync alarm sound:", error));
  }, []);

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
    if (Platform.OS === "web" || isLoading || !itemUserId) return;
    let active = true;
    const handle = async (response: Notifications.NotificationResponse) => {
      if (!active) return;
      const itemId = response.notification.request.content.data?.itemId;
      if (typeof itemId !== "string" || !itemId.trim()) return;
      const key = `${itemUserId}:${notificationResponseKey(response)}`;
      if (received.current.has(key)) return;
      received.current.add(key);
      const sequence = ++responseSequence.current;
      const target = await consumeNotificationResponse(response);
      if (active && target && sequence === responseSequence.current) setPending({ ...target, userId: itemUserId });
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      void handle(response);
    });
    const initialSequence = responseSequence.current;
    void Notifications.getLastNotificationResponseAsync().then(response => {
      if (active && response && responseSequence.current === initialSequence) void handle(response);
    }).catch(error => console.warn("Could not read last notification response:", error));
    return () => { active = false; subscription.remove(); };
  }, [isLoading, itemUserId]);

  useEffect(() => {
    if (pending && pending.userId !== itemUserId) { setPending(undefined); return; }
    if (!navigation?.key || !pending || !session || isLoading) return;
    router.replace({
      pathname: "/(tabs)",
      params: {
        notificationItemId: pending.itemId,
        notificationResponseId: pending.responseKey,
      },
    });
    setPending(undefined);
  }, [navigation?.key, pending, session, isLoading, itemUserId]);

  if (isLoading) return null;

  return (
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
            statusBarStyle: Platform.OS === "android" ? "light" : "auto",
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              headerShown:
                false,
            }}
          />

          <Stack.Protected guard={!!session}>
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown:
                false,
            }}
          />
          <Stack.Screen name="screens/home/HomeScreen" />
          <Stack.Screen name="screens/reminder/NewReminderScreen" />
          <Stack.Screen name="screens/details/[id]" />
          <Stack.Screen name="screens/create/[type]" />
          <Stack.Screen name="screens/profile/AppSettingsScreen" />
          <Stack.Screen name="screens/profile/ChangePasswordScreen" />
          <Stack.Screen name="screens/profile/SessionsScreen" />
          <Stack.Screen name="screens/profile/EditProfileScreen" />
          <Stack.Screen name="screens/profile/JoinOrganizationScreen" />
          <Stack.Screen name="screens/profile/NotificationSettingsScreen" />
          <Stack.Screen name="screens/profile/OrganizationScreen" />

          <Stack.Screen
            name="modal"
            options={{
              presentation:
                "modal",

              title:
                "Modal",
            }}
          />
          </Stack.Protected>
        </Stack>

        {session && <NativeAlarmCompletion key={itemUserId} />}
      </ThemeProvider>
  );
}

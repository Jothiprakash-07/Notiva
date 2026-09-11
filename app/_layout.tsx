import "../services/notificationService";
import "react-native-reanimated";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";

import * as Notifications from "expo-notifications";

import {
  router,
  Stack,
} from "expo-router";

import {
  useEffect,
  useRef,
} from "react";

import { StatusBar } from "expo-status-bar";

import { AuthProvider } from "@/contexts/AuthContext";
import { useColorScheme } from "@/hooks/use-color-scheme";

import {
  cancelNotifications,
} from "../services/notificationService";

import {
  getItemById,
} from "../services/itemStorage";

export default function RootLayout() {
  const colorScheme =
    useColorScheme();

  const handledResponseId =
    useRef<string | null>(
      null
    );

  useEffect(() => {
    const handleNotificationResponse =
      async (
        response: Notifications.NotificationResponse
      ) => {
        try {
          const notification =
            response.notification;

          const requestId =
            notification.request.identifier;

          /*
           * Avoid handling the same
           * notification response twice.
           */
          if (
            handledResponseId.current ===
            requestId
          ) {
            return;
          }

          handledResponseId.current =
            requestId;

          const data =
            notification.request.content
              .data;

          const itemId =
            typeof data?.itemId ===
            "string"
              ? data.itemId
              : undefined;

          if (!itemId) {
            router.replace(
              "/(tabs)"
            );

            return;
          }

          /*
           * Find the reminder/task
           * from local storage.
           */
          const item =
            await getItemById(
              itemId
            );

          /*
           * Cancel remaining repeated
           * notifications for this item.
           *
           * Example:
           * Alert 1 tapped
           * → Alert 2 + Alert 3 cancel.
           */
          if (
            item?.notificationIds
              ?.length
          ) {
            await cancelNotifications(
              item.notificationIds
            );
          }

          /*
           * Open the app.
           *
           * Home can later use itemId
           * to open Action Required stack.
           */
          router.replace({
            pathname:
              "/(tabs)",

            params: {
              notificationItemId:
                itemId,
            },
          });
        } catch (error) {
          console.warn(
            "Notification response handling failed:",
            error
          );

          router.replace(
            "/(tabs)"
          );
        }
      };

    /*
     * Handles notification taps
     * while app is running/background.
     */
    const subscription =
      Notifications.addNotificationResponseReceivedListener(
        (
          response
        ) => {
          void handleNotificationResponse(
            response
          );
        }
      );

    /*
     * Handles app launch from
     * a notification tap.
     */
    Notifications.getLastNotificationResponseAsync()
      .then(
        (
          response
        ) => {
          if (
            response
          ) {
            void handleNotificationResponse(
              response
            );
          }
        }
      )
      .catch(
        (
          error
        ) => {
          console.warn(
            "Could not read last notification response:",
            error
          );
        }
      );

    return () => {
      subscription.remove();
    };
  }, []);

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
      </ThemeProvider>
    </AuthProvider>
  );
}
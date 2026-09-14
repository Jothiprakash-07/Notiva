import { Tabs } from "expo-router";
import { useNotificationHistory } from "../../hooks/useNotificationHistory";
import {
  Image,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const homeIcon = require("../../assets/icon/Nav/home.png");
const fileIcon = require("../../assets/icon/Nav/file-text.png");
const bellIcon = require("../../assets/icon/Nav/bell.png");
const teamIcon = require("../../assets/icon/Nav/building-2.png");
const userIcon = require("../../assets/icon/Nav/user.png");

const ACTIVE_COLOR = "#4d3fe6";
const INACTIVE_COLOR = "#8b8f9c";

export default function TabLayout() {
  const { unreadCount } = useNotificationHistory();
  const insets = useSafeAreaInsets();
  // Reserve the system area once, with a small baseline on inset-free phones.
  // Keep the icon/label area constant even when Android reports a larger inset.
  const bottomPadding = Math.max(insets.bottom, 6);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor:
          ACTIVE_COLOR,

        tabBarInactiveTintColor:
          INACTIVE_COLOR,

        tabBarHideOnKeyboard: true,
        tabBarLabelPosition: "below-icon",

        tabBarStyle: {
          height: 54 + bottomPadding,

          paddingTop: 6,

          paddingBottom: bottomPadding,

          backgroundColor:
            "#ffffff",

          borderTopWidth: 1,

          borderTopColor:
            "#eceaf7",

          elevation: 8,

          shadowColor:
            "#171329",

          shadowOpacity: 0.08,

          shadowRadius: 10,

          shadowOffset: {
            width: 0,
            height: -3,
          },
        },

        tabBarLabelStyle: {
          fontSize: 10,
          lineHeight: 12,
          fontWeight: "700",
          marginTop: 2,
        },

        tabBarIconStyle: {
          width: 34,
          height: 30,
        },

        tabBarItemStyle: {
          paddingVertical: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",

          tabBarIcon: ({
            color,
            focused,
          }) => (
            <TabIcon
              source={homeIcon}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="reminders"
        options={{
          title: "Reminders",

          tabBarIcon: ({
            color,
            focused,
          }) => (
            <TabIcon
              source={fileIcon}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
          tabBarBadge: unreadCount || undefined,
          tabBarBadgeStyle: { backgroundColor: ACTIVE_COLOR, color: "#ffffff" },

          tabBarIcon: ({
            color,
            focused,
          }) => (
            <TabIcon
              source={bellIcon}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="team"
        options={{
          title: "Team",

          tabBarIcon: ({
            color,
            focused,
          }) => (
            <TabIcon
              source={teamIcon}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",

          tabBarIcon: ({
            color,
            focused,
          }) => (
            <TabIcon
              source={userIcon}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  source,
  color,
  focused,
}: {
  source: any;
  color: string;
  focused: boolean;
}) {
  return (
    <View
      style={[
        styles.iconWrap,

        focused &&
          styles.iconWrapActive,
      ]}
    >
      <Image
        source={source}
        style={[
          styles.icon,
          {
            tintColor: color,
          },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 34,
    height: 30,

    borderRadius: 10,

    alignItems: "center",
    justifyContent: "center",
  },

  iconWrapActive: {
    backgroundColor: "#efedff",
  },

  icon: {
    width: 21,
    height: 21,
  },
});

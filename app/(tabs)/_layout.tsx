import { Tabs } from "expo-router";
import {
  Image,
  Platform,
  StyleSheet,
  View,
} from "react-native";

const homeIcon = require("../../assets/icon/Nav/home.png");
const fileIcon = require("../../assets/icon/Nav/file-text.png");
const bellIcon = require("../../assets/icon/Nav/bell.png");
const teamIcon = require("../../assets/icon/Nav/building-2.png");
const userIcon = require("../../assets/icon/Nav/user.png");

const ACTIVE_COLOR = "#4d3fe6";
const INACTIVE_COLOR = "#8b8f9c";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor:
          ACTIVE_COLOR,

        tabBarInactiveTintColor:
          INACTIVE_COLOR,

        tabBarHideOnKeyboard: true,

        tabBarStyle: {
          height:
            Platform.OS === "ios"
              ? 84
              : 70,

          paddingTop: 8,

          paddingBottom:
            Platform.OS === "ios"
              ? 20
              : 8,

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
          fontWeight: "700",
          marginTop: 3,
        },

        tabBarItemStyle: {
          paddingVertical: 2,
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

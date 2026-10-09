import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Android edge-to-edge draws behind the system bar. Paint only that inset;
 * screen SafeAreaViews continue to own content spacing and navigation insets. */
export default function AppStatusBar() {
  const { top } = useSafeAreaInsets();
  return <>
    <StatusBar style={Platform.OS === "android" ? "light" : "auto"} />
    {Platform.OS === "android" && <View pointerEvents="none" accessible={false}
      importantForAccessibility="no-hide-descendants" style={[styles.backdrop, { height: top }]} />}
  </>;
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: "#4D3FE6",
  },
});

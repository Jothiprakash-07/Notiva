import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useRef, useState, type PropsWithChildren } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../contexts/AuthContext";

export const purple = "#4D3FE6";
export function ProfilePage({ title, subtitle, children, back = true }: PropsWithChildren<{ title: string; subtitle: string; back?: boolean }>) {
  const { session, isLoading } = useAuth();
  return <SafeAreaView edges={["top", "left", "right", "bottom"]} style={ui.safe}>
    <View style={ui.header}>
      {back && <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/profile")} style={ui.back}><Ionicons name="arrow-back" size={23} color={purple} /></Pressable>}
      <View style={ui.flex}><Text style={ui.title}>{title}</Text><Text style={ui.subtitle}>{subtitle}</Text></View>
    </View>
    <KeyboardAvoidingView style={ui.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={ui.content}>
        {isLoading ? <ActivityIndicator color={purple} /> : session ? children : <View style={ui.card}><Text style={ui.heading}>Sign in to manage your profile</Text><Action label="Sign In" onPress={() => router.replace("/screens/login/LoginScreen")} /></View>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
export function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return <View style={ui.section}><Text style={ui.sectionLabel}>{title}</Text><View style={ui.card}>{children}</View></View>;
}
export function MenuRow({ icon, title, description, onPress, disabled = false, purpleOutline = false }: { icon: keyof typeof Ionicons.glyphMap; title: string; description?: string; onPress?: () => void; disabled?: boolean; purpleOutline?: boolean }) {
  const content = <><View style={ui.icon}><Ionicons name={icon} size={21} color={purple} /></View><View style={ui.flex}><Text style={[ui.rowTitle, purpleOutline && { color: purple }]}>{title}</Text>{description ? <Text style={ui.subtitle}>{description}</Text> : null}</View>{onPress && <Ionicons name="chevron-forward" size={17} color={purpleOutline ? purple : "#928BA4"} />}</>;
  return onPress ? <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.row, purpleOutline && { outlineColor: purple, outlineWidth: 1 }, pressed && ui.pressed, disabled && ui.disabled]}>{content}</Pressable> : <View style={ui.row}>{content}</View>;
}
export function Action({ label, onPress, busy = false, disabled = false, destructive = false, secondary = false }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; destructive?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [ui.button, secondary && { backgroundColor: "#F0EDFF", outlineColor: purple, outlineWidth: 1 }, destructive && ui.destructive, pressed && ui.pressed, (disabled || busy) && ui.disabled]}>
    {busy ? <ActivityIndicator color={destructive ? "#B43242" : secondary ? purple : "white"} /> : <Text style={[ui.buttonText, secondary && { color: purple }, destructive && { color: "#B43242" }]}>{label}</Text>}
  </Pressable>;
}
export function Field({ label, error, password, ...props }: TextInputProps & { label: string; error?: string; password?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<TextInput>(null);
  return <View style={ui.field}>
    <Text style={ui.label}>{label}</Text>
    <View style={[ui.inputWrap, focused && ui.inputFocused, !!error && ui.inputError]}>
      <TextInput {...props} ref={ref} accessibilityLabel={label} style={ui.input} secureTextEntry={password && !visible} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} autoCapitalize={props.autoCapitalize || (password ? "none" : "sentences")} />
      {password && <Pressable accessibilityRole="button" accessibilityLabel={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} onPress={() => setVisible(value => !value)} style={ui.back}><Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={purple} /></Pressable>}
    </View>
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
  </View>;
}
export function SettingSwitch({ title, description, value, onChange, disabled }: { title: string; description: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <View style={ui.row}><View style={ui.flex}><Text style={ui.rowTitle}>{title}</Text><Text style={ui.subtitle}>{description}</Text></View><Switch accessibilityLabel={title} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: purple }} /></View>;
}
export function Info({ label, value }: { label: string; value?: string }) {
  return <View style={ui.field}><Text style={ui.subtitle}>{label}</Text><Text selectable style={ui.rowTitle}>{value || "Not provided"}</Text></View>;
}
export const ui = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F7FC" }, flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 20 },
  title: { fontSize: 24, fontWeight: "800", color: "#171329" }, subtitle: { color: "#777184", fontSize: 12, lineHeight: 18, marginTop: 3 },
  content: { padding: 20, paddingTop: 4, paddingBottom: 36, gap: 22, maxWidth: 680, width: "100%", alignSelf: "center" },
  section: { gap: 10 }, sectionLabel: { fontSize: 11, letterSpacing: 1.2, fontWeight: "800", color: "#898297", textTransform: "uppercase", marginLeft: 4 },
  card: { padding: 18, gap: 14, borderRadius: 22, backgroundColor: "white", elevation: 2, shadowColor: "#342965", shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  heading: { fontSize: 18, fontWeight: "800", color: "#171329" }, row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 58, paddingVertical: 6 },
  rowTitle: { fontSize: 14, fontWeight: "700", color: "#302A40" }, icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#F0EDFF", alignItems: "center", justifyContent: "center" },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] }, disabled: { opacity: 0.5 },
  button: { backgroundColor: purple, borderRadius: 14, minHeight: 48, alignItems: "center", justifyContent: "center", padding: 12 },
  buttonText: { color: "white", fontWeight: "800", fontSize: 13 }, destructive: { backgroundColor: "#FDEDEF" },
  field: { gap: 6 }, label: { fontSize: 12, fontWeight: "700", color: "#534C63" },
  inputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E9E5F0", backgroundColor: "#FBFAFE", borderRadius: 13 },
  inputFocused: { borderColor: purple }, inputError: { borderColor: "#C43848" }, input: { flex: 1, minWidth: 0, minHeight: 50, paddingHorizontal: 14, color: "#171329", fontSize: 14 },
  error: { color: "#B43242", fontSize: 12, lineHeight: 18 }, success: { color: "#21754A", fontSize: 13, lineHeight: 20 },
});

import { getLoginDevice } from "../../../services/deviceIdentity";
import Ionicons from "@expo/vector-icons/Ionicons";
import { API_BASE_URL } from "../../../services/apiConfig";
import { Redirect, router } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../../contexts/AuthContext";
import { AuthSession } from "../../../types/auth";

const popupLogo = require("../../../assets/images/Blue-logo.png");


const COLORS = {
  purple: "#4D3FE6", ink: "#171329", lavender: "#EFEDFF", wash: "#F7F5FF",
  white: "#FFFFFF", muted: "#706B82", placeholder: "#827C92", border: "#E7E3F0",
};

type LoginScreenProps = {
  onUserRegister?: () => void;
  onOrganizationRegister?: () => void;
};

export default function LoginScreen({
  onUserRegister,
  onOrganizationRegister,
}: LoginScreenProps) {
  const { signIn, session, isLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [conflict, setConflict] = useState<{ transferToken: string; userId: string; deviceId: string; deviceName: string; lastSeenAt?: string } | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const [
    showRegisterPopup,
    setShowRegisterPopup,
  ] = useState(false);

  const submittingRef = useRef(false);
  const passwordInput = useRef<TextInput>(null);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);

  const handleForgotPassword = () => {
    router.push("/screens/login/ForgotPasswordScreen");
  };

  const handleGoogleSignIn = () => {
    Alert.alert("Google Sign-In", "Google Sign-In will be available soon.");
  };

  const handleSignIn = async () => {
    if (submittingRef.current) return;
    const trimmedEmail = email.trim();

    setError("");

    if (!trimmedEmail || !password) {
      setError(
        "Please enter your Notiva ID and password."
      );

      return;
    }

    if (
      !/^[a-z0-9_.-]{4,30}$/i.test(trimmedEmail) && !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(trimmedEmail)
    ) {
      setError(
        "Enter a valid Notiva ID or your legacy email."
      );

      return;
    }

    if (password.length < 6) {
      setError(
        "Password must be at least 6 characters."
      );

      return;
    }

    submittingRef.current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      setSubmitting(true);

      const device = await getLoginDevice();
      const response = await fetch(
        API_BASE_URL + "/api/auth/login",
        {
          method: "POST", signal: controller.signal,

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            ...device,
            identifier: trimmedEmail.toLowerCase(),
            password,
          }),
        }
      );

      if (response.status === 409) {
        const data = await response.json();
        if (data.code === "ACTIVE_SESSION_EXISTS" && typeof data.transferToken === "string" && typeof data.userId === "string") {
          setConflict({ transferToken: data.transferToken, userId: data.userId, deviceId: device.deviceId,
            deviceName: typeof data.activeSession?.deviceName === "string" ? data.activeSession.deviceName.slice(0, 80) : "Another device",
            lastSeenAt: data.activeSession?.lastSeenAt });
          setPassword("");
          return;
        }
      }
      if (!response.ok) {
        // Use local messages; server bodies may contain internal diagnostics.
        setError(response.status === 401
          ? "Invalid Notiva ID or password."
          : "Unable to log in right now. Please try again.");
        return;
      }

      const data = await response.json();

      if (
        typeof data?.refreshToken !== "string" || !data.refreshToken || typeof data?.sessionId !== "string" || !data.sessionId ||
        typeof data?.token !== "string" || !data.token.trim() ||
        typeof data?.user?.id !== "string" || !data.user.id.trim() ||
        typeof data?.user?.fullName !== "string" || !data.user.fullName.trim()
      ) {
        throw new Error(
          "Login response is missing session information."
        );
      }

      await signIn({
        sessionId: data.sessionId, refreshToken: data.refreshToken, accessExpiresAt: data.accessExpiresAt,
        token: data.token,
        user: data.user,
      } as AuthSession);

      router.replace("/(tabs)");
    } catch (loginError) {
      setError(loginError instanceof TypeError
        ? "Unable to connect. Check your connection and try again."
        : "Unable to log in right now. Please try again.");
    } finally {
      clearTimeout(timer);
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleTransfer = async () => {
    if (!conflict || submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true); setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/replace-session`, { method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: conflict.userId,
          transferToken: conflict.transferToken, deviceId: conflict.deviceId }) });
      const data = await response.json();
      if (!response.ok || !data.token || !data.refreshToken || !data.sessionId || data.user?.id !== conflict.userId) {
        setConflict(null); setError("The session changed or the request expired. Please sign in again."); return;
      }
      await signIn({ token: data.token, refreshToken: data.refreshToken, sessionId: data.sessionId,
        accessExpiresAt: data.accessExpiresAt, user: data.user });
      setConflict(null); router.replace("/(tabs)");
    } catch { setConflict(null); setError("Unable to complete sign-in. Please sign in again."); }
    finally { clearTimeout(timer); submittingRef.current = false; setSubmitting(false); }
  };

  const handleUserRegister = () => {
    setShowRegisterPopup(false);

    onUserRegister?.();
  };

  const handleOrganizationRegister = () => {
    setShowRegisterPopup(false);

    onOrganizationRegister?.();
  };

  if (isLoading) return null;
  if (session) return <Redirect href="/(tabs)" />;
  if (!onUserRegister && !onOrganizationRegister) return <Redirect href="/" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : "height"
        }
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.heading}>
            <View pointerEvents="none" accessible={false} style={styles.brandAccent} />
            <View style={styles.brandRow} accessibilityLabel="Notiva">
              <View style={styles.brandMark}>
                <Image source={popupLogo} resizeMode="contain" style={styles.brandLogo} accessible={false} />
              </View>
              <Text style={styles.brandName}>Notiva</Text>
            </View>
            <Text accessibilityRole="header" style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.welcomeSubtext}>Sign in to continue to Notiva</Text>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.label}>Notiva ID</Text>
            <View style={[styles.inputBox, focusedField === "email" && styles.inputFocused]}>
              <Ionicons name="mail-outline" size={20} color={focusedField === "email" ? COLORS.purple : COLORS.muted} />
              <TextInput
                accessibilityLabel="Notiva ID"
                style={styles.input}
                placeholder="Enter your Notiva ID"
                placeholderTextColor={COLORS.placeholder}
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                selectionColor={COLORS.purple}
                editable={!submitting}
                value={email}
                onChangeText={text => { setEmail(text); setError(""); }}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordInput.current?.focus()}
              />
            </View>

            <Text style={styles.label}>Existing users can still use their old email.</Text>
            <Text style={styles.label}>Password</Text>
            <View style={[styles.inputBox, focusedField === "password" && styles.inputFocused]}>
              <Ionicons name="lock-closed-outline" size={20} color={focusedField === "password" ? COLORS.purple : COLORS.muted} />
              <TextInput
                ref={passwordInput}
                accessibilityLabel="Password"
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                selectionColor={COLORS.purple}
                editable={!submitting}
                value={password}
                onChangeText={text => { setPassword(text); setError(""); }}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                returnKeyType="go"
                onSubmitEditing={handleSignIn}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                accessibilityState={{ checked: showPassword }}
                style={styles.eyeButton}
                onPress={() => setShowPassword(previous => !previous)}
              >
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color={COLORS.muted} />
              </Pressable>
            </View>
            <View style={styles.forgotRow}>
              <Pressable accessibilityRole="button" onPress={handleForgotPassword} style={styles.forgotButton}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </Pressable>
            </View>

            {error ? <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle-outline" size={19} color="#B4233A" />
              <Text style={styles.errorText}>{error}</Text>
            </View> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={submitting ? "Logging in" : "Log In"}
              accessibilityState={{ disabled: submitting, busy: submitting }}
              disabled={submitting}
              style={({ pressed }) => [styles.signInButton, pressed && styles.buttonPressed, submitting && styles.buttonDisabled]}
              onPress={handleSignIn}
            >
              {submitting && <ActivityIndicator color="#FFFFFF" />}
              <Text style={styles.signInText}>{submitting ? "Logging inâ€¦" : "Log In"}</Text>
              {!submitting && <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />}
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>
            <Pressable accessibilityRole="button" disabled={submitting}
              accessibilityState={{ disabled: submitting }} onPress={handleGoogleSignIn}
              style={({ pressed }) => [styles.googleButton, pressed && styles.buttonPressed, submitting && styles.buttonDisabled]}>
              <Ionicons name="logo-google" size={21} color={COLORS.ink} />
              <Text style={styles.googleText}>Continue with Google</Text>
            </Pressable>
          </View>

          <View style={styles.registerRow}>
            <Text style={styles.accountText}>Don&apos;t have an account?</Text>
            <Pressable accessibilityRole="button" style={styles.registerButton} disabled={submitting}
              onPress={() => setShowRegisterPopup(true)}>
              <Text style={styles.registerText}>Create account</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={Boolean(conflict)} transparent animationType="fade" onRequestClose={() => { if (!submitting) setConflict(null); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: "85%" }]} accessibilityViewIsModal>
            <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Account already active</Text>
            <Text style={styles.modalQuestion}>This account is currently active on another device.</Text>
            <Text style={styles.modalOptionText}>Device: {conflict?.deviceName}</Text>
            {conflict?.lastSeenAt && Number.isFinite(Date.parse(conflict.lastSeenAt)) ? <Text style={styles.modalOptionText}>Last active: {new Date(conflict.lastSeenAt).toLocaleString()}</Text> : null}
            <Pressable accessibilityRole="button" disabled={submitting} style={styles.modalOption} onPress={() => void handleTransfer()}>
              <Text style={[styles.modalOptionTitle, { flexShrink: 1 }]}>{submitting ? "Signing in…" : "Sign out other device & continue"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={submitting} style={styles.modalOption} onPress={() => setConflict(null)}><Text style={styles.modalOptionTitle}>Cancel</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* Register selection modal */}
      <Modal
        visible={showRegisterPopup}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() =>
          setShowRegisterPopup(false)
        }
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() =>
            setShowRegisterPopup(false)
          }
        >
          <Pressable
            style={styles.modalBox}
            onPress={(event) =>
              event.stopPropagation()
            }
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close registration options"
              style={styles.closeButton}
              onPress={() =>
                setShowRegisterPopup(false)
              }
              hitSlop={10}
            >
              <Ionicons
                name="close"
                size={21}
                color="#4b5563"
              />
            </Pressable>

            <View style={styles.modalLogoWrap}>
              <Image
                source={popupLogo}
                resizeMode="contain"
                style={styles.modalLogo}
              />
            </View>

            <Text
              allowFontScaling={false}
              style={styles.modalTitle}
            >
              Create your account
            </Text>

            <Text
              allowFontScaling={false}
              style={styles.modalQuestion}
            >
              Choose how you want to register
            </Text>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.modalOption,

                pressed &&
                  styles.modalOptionPressed,
              ]}
              onPress={handleUserRegister}
            >
              <View style={styles.modalIcon}>
                <Ionicons
                  name="person-outline"
                  size={22}
                  color="#4d3fe6"
                />
              </View>

              <View style={styles.modalCopy}>
                <Text
                  style={
                    styles.modalOptionTitle
                  }
                >
                  User
                </Text>

                <Text
                  style={
                    styles.modalOptionText
                  }
                >
                  Join using an organization code
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={19}
                color="#9ca3af"
              />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.modalOption,

                pressed &&
                  styles.modalOptionPressed,
              ]}
              onPress={
                handleOrganizationRegister
              }
            >
              <View style={styles.modalIcon}>
                <Ionicons
                  name="business-outline"
                  size={22}
                  color="#4d3fe6"
                />
              </View>

              <View style={styles.modalCopy}>
                <Text
                  style={
                    styles.modalOptionTitle
                  }
                >
                  Organization
                </Text>

                <Text
                  style={
                    styles.modalOptionText
                  }
                >
                  Create a new organization account
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={19}
                color="#9ca3af"
              />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.white },
  screen: { flex: 1 },
  scrollContent: {
    flexGrow: 1, justifyContent: "center", width: "100%", maxWidth: 440,
    alignSelf: "center", paddingHorizontal: 28, paddingVertical: 28,
  },
  heading: { paddingTop: 12, paddingBottom: 30, position: "relative" },
  brandAccent: {
    position: "absolute", width: 116, height: 116, borderRadius: 58,
    right: -28, top: -28, backgroundColor: COLORS.wash,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 30 },
  brandMark: { width: 46, height: 46, borderRadius: 15, backgroundColor: COLORS.lavender, alignItems: "center", justifyContent: "center" },
  brandLogo: { width: 26, height: 31 },
  brandName: { color: COLORS.ink, fontSize: 23, fontWeight: "800", letterSpacing: -0.6 },
  welcomeText: { color: COLORS.ink, fontSize: 34, fontWeight: "700", letterSpacing: -1.1, lineHeight: 42 },
  welcomeSubtext: { color: COLORS.muted, fontSize: 15, lineHeight: 23, marginTop: 7 },
  formSection: { width: "100%" },
  label: { color: COLORS.ink, fontSize: 13, fontWeight: "600", marginBottom: 9 },
  inputBox: {
    flexDirection: "row", alignItems: "center", minHeight: 58, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.wash,
    paddingLeft: 16, paddingRight: 6, marginBottom: 20, gap: 12,
  },
  inputFocused: { borderColor: COLORS.purple, backgroundColor: COLORS.white },
  input: { flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 14, color: COLORS.ink, fontSize: 15 },
  eyeButton: { width: 44, minHeight: 48, alignItems: "center", justifyContent: "center" },
  forgotRow: { alignItems: "flex-end", marginTop: -17, marginBottom: 16 },
  forgotButton: { minHeight: 44, justifyContent: "center", paddingLeft: 12 },
  forgotText: { color: COLORS.purple, fontSize: 13, fontWeight: "600" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 13, borderRadius: 12, backgroundColor: "#FFF1F3", marginBottom: 16 },
  errorText: { flex: 1, color: "#B4233A", fontSize: 13, lineHeight: 20 },
  signInButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    minHeight: 56, paddingHorizontal: 20, paddingVertical: 15, borderRadius: 16, backgroundColor: COLORS.purple,
  },
  signInText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.65 },
  divider: { flexDirection: "row", alignItems: "center", gap: 14, marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.muted, fontSize: 12 },
  googleButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    minHeight: 56, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  googleText: { color: COLORS.ink, fontSize: 15, fontWeight: "600", flexShrink: 1 },
  registerRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", flexWrap: "wrap", columnGap: 5, marginTop: 26 },
  accountText: { color: COLORS.muted, fontSize: 13 },
  registerButton: { minHeight: 44, justifyContent: "center" },
  registerText: { color: COLORS.purple, fontSize: 13, fontWeight: "700" },

  modalOverlay: {
    flex: 1,

    backgroundColor:
      "rgba(20,16,48,0.58)",

    justifyContent: "center",
    alignItems: "center",

    paddingHorizontal: 20,
  },

  modalBox: {
    width: "100%",
    maxWidth: 370,

    backgroundColor: "#ffffff",

    borderRadius: 22,

    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 20,

    shadowColor: "#171329",
    shadowOpacity: 0.2,
    shadowRadius: 16,

    shadowOffset: {
      width: 0,
      height: 7,
    },

    elevation: 10,
  },

  closeButton: {
    position: "absolute",

    top: 14,
    right: 14,

    width: 36,
    height: 36,

    borderRadius: 12,

    backgroundColor: "#f3f4f6",

    alignItems: "center",
    justifyContent: "center",

    zIndex: 2,
  },

  modalLogoWrap: {
    alignItems: "center",

    marginBottom: 8,
  },

  modalLogo: {
    width: 72,
    height: 72,
  },

  modalTitle: {
    color: "#171329",

    fontSize: 21,
    lineHeight: 27,

    fontWeight: "900",

    textAlign: "center",

    marginTop: 5,
  },

  modalQuestion: {
    color: "#8b8f9c",

    fontSize: 12,
    lineHeight: 18,

    fontWeight: "600",

    textAlign: "center",

    marginTop: 5,
    marginBottom: 20,
  },

  modalOption: {
    width: "100%",
    minHeight: 74,

    borderRadius: 15,

    borderWidth: 1,
    borderColor: "#e7e4f7",

    backgroundColor: "#fafaff",

    flexDirection: "row",
    alignItems: "center",

    paddingHorizontal: 12,
    paddingVertical: 10,

    marginBottom: 10,
  },

  modalOptionPressed: {
    opacity: 0.82,
  },

  modalIcon: {
    width: 44,
    height: 44,

    borderRadius: 13,

    backgroundColor: "#efedff",

    alignItems: "center",
    justifyContent: "center",

    marginRight: 11,
  },

  modalCopy: {
    flex: 1,
    minWidth: 0,
  },

  modalOptionTitle: {
    color: "#171329",

    fontSize: 14,
    lineHeight: 19,

    fontWeight: "900",
  },

  modalOptionText: {
    color: "#8b8f9c",

    fontSize: 10,
    lineHeight: 16,

    fontWeight: "600",

    marginTop: 2,
  },
});

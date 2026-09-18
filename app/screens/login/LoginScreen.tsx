import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../../contexts/AuthContext";
import { AuthSession } from "../../../types/auth";

const headerLogo = require("../../../assets/images/notiva-logo.png");
const popupLogo = require("../../../assets/images/Blue-logo.png");

// Physical phone cannot use localhost.
// Update this IP when your PC network IP changes.
const API_BASE_URL = "http://192.168.1.239:5000";

type LoginScreenProps = {
  onUserRegister?: () => void;
  onOrganizationRegister?: () => void;
};

export default function LoginScreen({
  onUserRegister,
  onOrganizationRegister,
}: LoginScreenProps) {
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const [
    showRegisterPopup,
    setShowRegisterPopup,
  ] = useState(false);

  const handleSignIn = async () => {
    const trimmedEmail = email.trim();

    setError("");

    if (!trimmedEmail || !password) {
      setError(
        "Please enter email and password."
      );

      return;
    }

    if (
      !trimmedEmail.includes("@") ||
      !trimmedEmail.includes(".")
    ) {
      setError(
        "Please enter a valid email address."
      );

      return;
    }

    if (password.length < 6) {
      setError(
        "Password must be at least 6 characters."
      );

      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch(
        API_BASE_URL + "/api/auth/login",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            email: trimmedEmail,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || "Login failed."
        );
      }

      if (
        !data?.token ||
        !data?.user?.id ||
        !data?.user?.fullName
      ) {
        throw new Error(
          "Login response is missing session information."
        );
      }

      await signIn({
        token: data.token,
        user: data.user,
      } as AuthSession);

      router.replace("/(tabs)");
    } catch (loginError) {
      const message =
        loginError instanceof Error
          ? loginError.message
          : "Unable to login. Please try again.";

      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUserRegister = () => {
    setShowRegisterPopup(false);

    onUserRegister?.();
  };

  const handleOrganizationRegister = () => {
    setShowRegisterPopup(false);

    onOrganizationRegister?.();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#4d3fe6"
      />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : "height"
        }
        keyboardVerticalOffset={
          Platform.OS === "ios"
            ? 0
            : 20
        }
      >
        <ScrollView
          contentContainerStyle={
            styles.scrollContent
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Purple header */}
          <View style={styles.purpleSection}>
            <View style={styles.logoWrap}>
              <Image
                source={headerLogo}
                resizeMode="contain"
                style={styles.logo}
              />
            </View>

            <Text
              allowFontScaling={false}
              style={styles.welcomeText}
            >
              Welcome back
            </Text>

            <Text
              allowFontScaling={false}
              style={styles.welcomeSubtext}
            >
              Sign in and stay on top of what matters
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formSection}>
            <Text style={styles.formTitle}>
              Sign in
            </Text>

            <Text style={styles.helperText}>
              Enter your account details to continue
            </Text>

            {/* Email */}
            <Text
              allowFontScaling={false}
              style={styles.label}
            >
              Email Address
            </Text>

            <View style={styles.inputBox}>
              <View style={styles.inputIcon}>
                <Ionicons
                  name="mail-outline"
                  size={19}
                  color="#4d3fe6"
                />
              </View>

              <TextInput
                style={styles.input}
                placeholder="john.e01@gmail.com"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError("");
                }}
                returnKeyType="next"
              />
            </View>

            {/* Password */}
            <Text
              allowFontScaling={false}
              style={styles.label}
            >
              Password
            </Text>

            <View style={styles.inputBox}>
              <View style={styles.inputIcon}>
                <Ionicons
                  name="lock-closed-outline"
                  size={19}
                  color="#4d3fe6"
                />
              </View>

              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setError("");
                }}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
                hitSlop={8}
                style={styles.eyeButton}
                onPress={() =>
                  setShowPassword(
                    (previous) =>
                      !previous
                  )
                }
              >
                <Ionicons
                  name={
                    showPassword
                      ? "eye-off-outline"
                      : "eye-outline"
                  }
                  size={20}
                  color="#7c818d"
                />
              </Pressable>
            </View>

            {/* Error */}
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons
                  name="alert-circle-outline"
                  size={17}
                  color="#dc2626"
                />

                <Text style={styles.errorText}>
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Forgot password */}
            <View style={styles.forgotRow}>
              <Pressable
                style={styles.forgotButton}
              >
                <Text
                  allowFontScaling={false}
                  style={styles.forgotText}
                >
                  Forgot Password?
                </Text>
              </Pressable>
            </View>

            {/* Sign in */}
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              style={({ pressed }) => [
                styles.signInButton,

                pressed &&
                  !submitting &&
                  styles.buttonPressed,

                submitting &&
                  styles.signInButtonDisabled,
              ]}
              onPress={handleSignIn}
            >
              {submitting ? (
                <ActivityIndicator
                  color="#ffffff"
                />
              ) : (
                <>
                  <Text
                    allowFontScaling={false}
                    style={styles.signInText}
                  >
                    Sign in
                  </Text>

                  <Ionicons
                    name="arrow-forward"
                    size={19}
                    color="#ffffff"
                  />
                </>
              )}
            </Pressable>

            {/* Register */}
            <View style={styles.registerRow}>
              <Text
                allowFontScaling={false}
                style={styles.accountText}
              >
                Don&apos;t have an account?
              </Text>

              <Pressable
                hitSlop={8}
                onPress={() =>
                  setShowRegisterPopup(
                    true
                  )
                }
              >
                <Text
                  allowFontScaling={false}
                  style={styles.registerText}
                >
                  Register
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
  safeArea: {
    flex: 1,
    backgroundColor: "#4d3fe6",
  },

  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  scrollContent: {
    flexGrow: 1,
    backgroundColor: "#ffffff",
  },

  purpleSection: {
    minHeight: 250,

    backgroundColor: "#4d3fe6",

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 55,
  },

  logoWrap: {
    minWidth: 120,
    height: 64,

    alignItems: "center",
    justifyContent: "center",

    marginBottom: 20,
  },

  logo: {
    width: 150,
    height: 58,
  },

  welcomeText: {
    color: "#ffffff",

    fontSize: 29,
    lineHeight: 35,

    fontWeight: "900",

    textAlign: "center",
  },

  welcomeSubtext: {
    color: "#d8d5ff",

    fontSize: 12,
    lineHeight: 18,

    fontWeight: "600",

    textAlign: "center",

    marginTop: 7,

    maxWidth: 270,
  },

  formSection: {
    flexGrow: 1,

    marginTop: -28,

    backgroundColor: "#ffffff",

    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,

    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 32,
  },

  formTitle: {
    color: "#171329",

    fontSize: 22,
    lineHeight: 28,

    fontWeight: "900",
  },

  helperText: {
    color: "#8b8f9c",

    fontSize: 12,
    lineHeight: 18,

    fontWeight: "600",

    marginTop: 4,
    marginBottom: 24,
  },

  label: {
    color: "#374151",

    fontSize: 12,
    lineHeight: 17,

    fontWeight: "800",

    marginBottom: 7,
  },

  inputBox: {
    width: "100%",
    minHeight: 54,

    backgroundColor: "#fafaff",

    borderRadius: 14,

    borderWidth: 1,
    borderColor: "#deddf0",

    flexDirection: "row",
    alignItems: "center",

    paddingHorizontal: 11,

    marginBottom: 17,
  },

  inputIcon: {
    width: 34,
    height: 34,

    borderRadius: 10,

    backgroundColor: "#efedff",

    alignItems: "center",
    justifyContent: "center",

    marginRight: 8,
  },

  input: {
    flex: 1,

    minHeight: 52,

    color: "#111827",

    fontSize: 14,

    paddingVertical: 0,
  },

  eyeButton: {
    width: 36,
    height: 36,

    alignItems: "center",
    justifyContent: "center",

    marginLeft: 4,
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",

    gap: 7,

    backgroundColor: "#fef2f2",

    borderWidth: 1,
    borderColor: "#fecaca",

    borderRadius: 11,

    paddingHorizontal: 11,
    paddingVertical: 9,

    marginBottom: 12,
  },

  errorText: {
    flex: 1,

    color: "#dc2626",

    fontSize: 11,
    lineHeight: 17,

    fontWeight: "700",
  },

  forgotRow: {
    alignItems: "flex-end",

    marginTop: -3,
    marginBottom: 22,
  },

  forgotButton: {
    paddingVertical: 3,
  },

  forgotText: {
    color: "#4d3fe6",

    fontSize: 12,

    fontWeight: "800",
  },

  signInButton: {
    width: "100%",
    minHeight: 54,

    backgroundColor: "#4d3fe6",

    borderRadius: 14,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 8,

    shadowColor: "#4d3fe6",
    shadowOpacity: 0.2,
    shadowRadius: 8,

    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 3,

    marginBottom: 20,
  },

  buttonPressed: {
    opacity: 0.86,

    transform: [
      {
        scale: 0.99,
      },
    ],
  },

  signInButtonDisabled: {
    opacity: 0.65,
  },

  signInText: {
    color: "#ffffff",

    fontSize: 15,

    fontWeight: "900",
  },

  registerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    flexWrap: "wrap",

    gap: 5,
  },

  accountText: {
    color: "#6b7280",

    fontSize: 12,

    fontWeight: "600",
  },

  registerText: {
    color: "#4d3fe6",

    fontSize: 12,

    fontWeight: "900",
  },

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
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

// IMPORTANT:
// Expo mobile app cannot use localhost on a physical phone.
// Use your laptop LAN IP address.
const API_BASE_URL = "http://10.211.55.42:5000";

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
  const [showRegisterPopup, setShowRegisterPopup] = useState(false);

  const handleSignIn = async () => {
    const trimmedEmail = email.trim();

    setError("");

    if (!trimmedEmail || !password) {
      setError("Please enter email and password.");
      return;
    }

    if (!trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
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
            password: password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Login failed.");
      }

      if (!data?.token || !data?.user?.id || !data?.user?.fullName) {
        throw new Error("Login response is missing session information.");
      }

      await signIn({
        token: data.token,
        user: data.user,
      } as AuthSession);

      // Bottom navigation becomes active only after successful login.
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
        barStyle="dark-content"
        backgroundColor="#ffffff"
      />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
        >
          <View style={styles.card}>
            <View style={styles.purpleSection}>
              <Image
                source={headerLogo}
                resizeMode="contain"
                style={styles.logo}
              />

              <Text
                allowFontScaling={false}
                style={styles.welcomeText}
              >
                Welcome back
              </Text>
            </View>

            <View style={styles.formSection}>
              <Text
                allowFontScaling={false}
                style={styles.helperText}
              >
                Sign in to access your reminders
              </Text>

              <Text
                allowFontScaling={false}
                style={styles.label}
              >
                EMAIL ADDRESS
              </Text>

              <TextInput
                style={styles.input}
                placeholder="john.e01@gmail.com"
                placeholderTextColor="#9f9f9f"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError("");
                }}
                returnKeyType="next"
                blurOnSubmit={false}
              />

              <Text
                allowFontScaling={false}
                style={styles.label}
              >
                PASSWORD
              </Text>

              <View style={styles.passwordBox}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="********"
                  placeholderTextColor="#9f9f9f"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setError("");
                  }}
                  returnKeyType="done"
                  blurOnSubmit={false}
                  onSubmitEditing={handleSignIn}
                />

                <Pressable
                  onPress={() =>
                    setShowPassword((prev) => !prev)
                  }
                  hitSlop={10}
                >
                  <Text
                    allowFontScaling={false}
                    style={styles.eyeText}
                  >
                    👁
                  </Text>
                </Pressable>
              </View>

              {error ? (
                <Text
                  allowFontScaling={false}
                  style={styles.errorText}
                >
                  {error}
                </Text>
              ) : null}

              <Pressable style={styles.forgotButton}>
                <Text
                  allowFontScaling={false}
                  style={styles.forgotText}
                >
                  Forgot Password?
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.signInButton,
                  submitting && styles.signInButtonDisabled,
                ]}
                onPress={handleSignIn}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text
                    allowFontScaling={false}
                    style={styles.signInText}
                  >
                    Sign in
                  </Text>
                )}
              </Pressable>

              <View style={styles.registerRow}>
                <Text
                  allowFontScaling={false}
                  style={styles.accountText}
                >
                  Don&apos;t have an account?{" "}
                </Text>

                <Pressable
                  onPress={() => setShowRegisterPopup(true)}
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
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showRegisterPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRegisterPopup(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Pressable
              style={styles.closeButton}
              onPress={() => setShowRegisterPopup(false)}
              hitSlop={10}
            >
              <Text
                allowFontScaling={false}
                style={styles.closeText}
              >
                ×
              </Text>
            </Pressable>

            <Image
              source={popupLogo}
              resizeMode="contain"
              style={styles.modalLogo}
            />

            <Text
              allowFontScaling={false}
              style={styles.modalTitle}
            >
              Welcome back
            </Text>

            <Text
              allowFontScaling={false}
              style={styles.modalQuestion}
            >
              Are You Register
            </Text>

            <Pressable
              style={styles.modalActionButton}
              onPress={handleUserRegister}
            >
              <Text
                allowFontScaling={false}
                style={styles.modalActionText}
              >
                User
              </Text>
            </Pressable>

            <Pressable
              style={styles.modalActionButton}
              onPress={handleOrganizationRegister}
            >
              <Text
                allowFontScaling={false}
                style={styles.modalActionText}
              >
                Organization
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  scrollContent: {
    flexGrow: 1,
    backgroundColor: "#ffffff",
  },

  card: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#ffffff",
  },

  purpleSection: {
    width: "100%",
    flexBasis: "26%",
    minHeight: 220,
    backgroundColor: "#4d3fe6",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: "6%",
    paddingVertical: 42,
  },

  logo: {
    width: "5%",
    aspectRatio: 0.28,
    marginBottom: -40,
  },

  welcomeText: {
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "900",
  },

  formSection: {
    flex: 1,
    marginTop: -28,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: "8%",
    paddingTop: 40,
    paddingBottom: 24,
  },

  helperText: {
    color: "#9f9f9f",
    fontSize: 13,
    marginBottom: 20,
  },

  label: {
    color: "#222222",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },

  input: {
    width: "100%",
    height: 48,
    backgroundColor: "#f3f3f3",
    borderRadius: 5,
    paddingHorizontal: 14,
    fontSize: 14,
    color: "#111111",
    marginBottom: 18,
  },

  passwordBox: {
    width: "100%",
    height: 48,
    backgroundColor: "#f3f3f3",
    borderRadius: 5,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  passwordInput: {
    flex: 1,
    height: "100%",
    fontSize: 14,
    color: "#111111",
    paddingVertical: 0,
  },

  eyeText: {
    color: "#777777",
    fontSize: 14,
  },

  errorText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
  },

  forgotButton: {
    alignSelf: "flex-end",
    marginBottom: 22,
  },

  forgotText: {
    color: "#4d3fe6",
    fontSize: 13,
    fontWeight: "800",
  },

  signInButton: {
    width: "100%",
    height: 44,
    backgroundColor: "#4d3fe6",
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  signInButtonDisabled: {
    opacity: 0.75,
  },

  signInText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },

  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
  },

  accountText: {
    color: "#111111",
    fontSize: 13,
    fontWeight: "500",
  },

  registerText: {
    color: "#4d3fe6",
    fontSize: 13,
    fontWeight: "900",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: "8%",
  },

  modalBox: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingTop: 34,
    paddingHorizontal: "8%",
    paddingBottom: 40,
    alignItems: "center",
  },

  closeButton: {
    position: "absolute",
    top: 14,
    right: 18,
  },

  closeText: {
    color: "#111111",
    fontSize: 24,
    fontWeight: "500",
  },

  modalLogo: {
    width: 72,
    height: 72,
    marginBottom: 6,
  },

  modalTitle: {
    color: "#4d3fe6",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 26,
  },

  modalQuestion: {
    color: "#111111",
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 22,
  },

  modalActionButton: {
    width: "100%",
    height: 42,
    backgroundColor: "#4d3fe6",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },

  modalActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
});

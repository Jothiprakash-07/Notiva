import { useState } from "react";
import {
  KeyboardAvoidingView,
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

// IMPORTANT:
// Expo Go mobile app cannot use localhost.
// Use your laptop's local IP address when testing on a physical phone.
const API_BASE_URL = "http://192.168.1.239:5000";

type UserRegisterScreenProps = {
  onBack?: () => void;
};

type FieldErrors = {
  fullName?: string;
  email?: string;
  mobileNumber?: string;
  password?: string;
  confirmPassword?: string;
  api?: string;
};

export default function UserRegisterScreen({
  onBack,
}: UserRegisterScreenProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [organizationCode, setOrganizationCode] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Clear all fields after successful registration.
  const clearForm = () => {
    setFullName("");
    setEmail("");
    setMobileNumber("");
    setOrganizationCode("");
    setDepartment("");
    setPassword("");
    setConfirmPassword("");
  };

  // Validate form fields before sending data to backend.
  const validateForm = () => {
    const trimmedFullName = fullName.trim();
    const trimmedEmail = email.trim();
    const trimmedMobileNumber = mobileNumber.trim();

    const newErrors: FieldErrors = {};

    // Full Name validation.
    if (!trimmedFullName) {
      newErrors.fullName = "Full name is required.";
    }

    // Email validation.
    if (!trimmedEmail) {
      newErrors.email = "Email address is required.";
    } else if (
      !trimmedEmail.includes("@") ||
      !trimmedEmail.includes(".")
    ) {
      newErrors.email = "Please enter a valid email address.";
    }

    // Mobile Number validation.
    if (!trimmedMobileNumber) {
      newErrors.mobileNumber = "Mobile number is required.";
    }

    // Password validation.
    if (!password) {
      newErrors.password = "Password is required.";
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters.";
    }

    // Confirm Password validation.
    if (!confirmPassword) {
      newErrors.confirmPassword = "Confirm password is required.";
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword =
        "Password and confirm password do not match.";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  // Create a new user account.
  const handleCreateAccount = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      setErrors({});
      setSuccess("");

      // Backend expects "fullName".
      const registerData = {
        fullName: fullName.trim(),
        email: email.trim(),
        mobileNumber: mobileNumber.trim(),
        organizationCode: organizationCode.trim(),
        department: department.trim(),
        password: password,
      };

      console.log("User register request:", registerData);

      const response = await fetch(
        API_BASE_URL + "/api/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(registerData),
        }
      );

      const data = await response.json();

      console.log("User register status:", response.status);
      console.log("User register response:", data);

      if (!response.ok) {
        setErrors({
          api: data?.message || "User registration failed.",
        });
        return;
      }

      setSuccess(
        data?.message || "User registered successfully."
      );

      clearForm();

      // Return to LoginScreen after registration success.
      setTimeout(() => {
        onBack?.();
      }, 900);
    } catch (registerError) {
      const message =
        registerError instanceof Error
          ? registerError.message
          : "User registration failed.";

      console.log("User registration error:", registerError);

      setErrors({
        api: message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#ffffff"
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Pressable onPress={onBack} hitSlop={10}>
              <Text
                allowFontScaling={false}
                style={styles.backIcon}
              >
                ←
              </Text>
            </Pressable>

            <Text
              allowFontScaling={false}
              style={styles.headerTitle}
            >
              Create account
            </Text>
          </View>

          <View style={styles.form}>
            <Text
              allowFontScaling={false}
              style={styles.label}
            >
              Full Name*
            </Text>

            <TextInput
              style={[
                styles.input,
                errors.fullName && styles.inputError,
              ]}
              placeholder="Enter your full name"
              placeholderTextColor="#9f9f9f"
              autoCapitalize="words"
              value={fullName}
              onChangeText={(text) => {
                setFullName(text);

                setErrors((prev) => ({
                  ...prev,
                  fullName: undefined,
                  api: undefined,
                }));
              }}
            />

            {errors.fullName ? (
              <Text
                allowFontScaling={false}
                style={styles.fieldErrorText}
              >
                {errors.fullName}
              </Text>
            ) : null}

            <Text
              allowFontScaling={false}
              style={styles.label}
            >
              Email Address*
            </Text>

            <TextInput
              style={[
                styles.input,
                errors.email && styles.inputError,
              ]}
              placeholder="john.e07@gmail.com"
              placeholderTextColor="#9f9f9f"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(text) => {
                setEmail(text);

                setErrors((prev) => ({
                  ...prev,
                  email: undefined,
                  api: undefined,
                }));
              }}
            />

            {errors.email ? (
              <Text
                allowFontScaling={false}
                style={styles.fieldErrorText}
              >
                {errors.email}
              </Text>
            ) : null}

            <Text
              allowFontScaling={false}
              style={styles.label}
            >
              Mobile Number*
            </Text>

            <TextInput
              style={[
                styles.input,
                errors.mobileNumber && styles.inputError,
              ]}
              placeholder="Enter your mobile number"
              placeholderTextColor="#9f9f9f"
              keyboardType="phone-pad"
              value={mobileNumber}
              onChangeText={(text) => {
                setMobileNumber(text);

                setErrors((prev) => ({
                  ...prev,
                  mobileNumber: undefined,
                  api: undefined,
                }));
              }}
            />

            {errors.mobileNumber ? (
              <Text
                allowFontScaling={false}
                style={styles.fieldErrorText}
              >
                {errors.mobileNumber}
              </Text>
            ) : null}

            <Text
              allowFontScaling={false}
              style={styles.label}
            >
              Organization Code
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Enter your code"
              placeholderTextColor="#9f9f9f"
              autoCapitalize="characters"
              value={organizationCode}
              onChangeText={(text) => {
                setOrganizationCode(text);

                setErrors((prev) => ({
                  ...prev,
                  api: undefined,
                }));
              }}
            />

            <Text
              allowFontScaling={false}
              style={styles.label}
            >
              Department
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Enter your department"
              placeholderTextColor="#9f9f9f"
              value={department}
              onChangeText={(text) => {
                setDepartment(text);

                setErrors((prev) => ({
                  ...prev,
                  api: undefined,
                }));
              }}
            />

            <Text
              allowFontScaling={false}
              style={styles.label}
            >
              Password*
            </Text>

            <View
              style={[
                styles.passwordBox,
                errors.password && styles.inputError,
              ]}
            >
              <TextInput
                style={styles.passwordInput}
                placeholder="************"
                placeholderTextColor="#9f9f9f"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);

                  setErrors((prev) => ({
                    ...prev,
                    password: undefined,
                    api: undefined,
                  }));
                }}
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

            {errors.password ? (
              <Text
                allowFontScaling={false}
                style={styles.fieldErrorText}
              >
                {errors.password}
              </Text>
            ) : null}

            <Text
              allowFontScaling={false}
              style={styles.label}
            >
              Confirm Password*
            </Text>

            <View
              style={[
                styles.passwordBox,
                errors.confirmPassword &&
                  styles.inputError,
              ]}
            >
              <TextInput
                style={styles.passwordInput}
                placeholder="************"
                placeholderTextColor="#9f9f9f"
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);

                  setErrors((prev) => ({
                    ...prev,
                    confirmPassword: undefined,
                    api: undefined,
                  }));
                }}
              />

              <Pressable
                onPress={() =>
                  setShowConfirmPassword((prev) => !prev)
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

            {errors.confirmPassword ? (
              <Text
                allowFontScaling={false}
                style={styles.fieldErrorText}
              >
                {errors.confirmPassword}
              </Text>
            ) : null}

            {errors.api ? (
              <Text
                allowFontScaling={false}
                style={styles.apiErrorText}
              >
                {errors.api}
              </Text>
            ) : null}

            {success ? (
              <Text
                allowFontScaling={false}
                style={styles.successText}
              >
                {success}
              </Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.createButton,
                (pressed || submitting) &&
                  styles.createButtonPressed,
              ]}
              onPress={handleCreateAccount}
              disabled={submitting}
            >
              <Text
                allowFontScaling={false}
                style={styles.createButtonText}
              >
                {submitting
                  ? "Creating..."
                  : "Create account"}
              </Text>
            </Pressable>

            <Text
              allowFontScaling={false}
              style={styles.termsText}
            >
              By registering you agree to our{" "}
              <Text style={styles.termsLink}>
                Terms & Privacy Policy
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  keyboardView: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  scrollContent: {
    flexGrow: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 22,
    paddingTop: 32,
    paddingBottom: 120,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },

  backIcon: {
    color: "#111827",
    fontSize: 30,
    fontWeight: "400",
    marginRight: 14,
  },

  headerTitle: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "900",
  },

  form: {
    width: "100%",
  },

  label: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
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
    marginBottom: 6,
  },

  inputError: {
    borderWidth: 1,
    borderColor: "#dc2626",
  },

  fieldErrorText: {
    color: "#dc2626",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 12,
  },

  passwordBox: {
    width: "100%",
    height: 48,
    backgroundColor: "#f3f3f3",
    borderRadius: 5,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
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

  apiErrorText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
    marginBottom: 12,
    textAlign: "center",
  },

  successText: {
    color: "#16a34a",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
    marginBottom: 12,
    textAlign: "center",
  },

  createButton: {
    width: "72%",
    height: 50,
    backgroundColor: "#4d3fe6",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 18,
  },

  createButtonPressed: {
    opacity: 0.85,
  },

  createButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  termsText: {
    color: "#111827",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },

  termsLink: {
    color: "#4d3fe6",
    fontWeight: "900",
  },
});


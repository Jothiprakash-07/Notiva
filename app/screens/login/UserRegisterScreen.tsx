import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
  ActivityIndicator,
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

// Physical phone cannot use localhost.
// Update this IP when your PC network IP changes.
const API_BASE_URL = "http://192.168.1.239.42:5000";

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

  const clearForm = () => {
    setFullName("");
    setEmail("");
    setMobileNumber("");
    setOrganizationCode("");
    setDepartment("");
    setPassword("");
    setConfirmPassword("");
  };

  const clearFieldError = (
    field: keyof FieldErrors
  ) => {
    setErrors((previous) => ({
      ...previous,
      [field]: undefined,
      api: undefined,
    }));

    setSuccess("");
  };

  const validateForm = () => {
    const trimmedFullName = fullName.trim();
    const trimmedEmail = email.trim();
    const trimmedMobileNumber = mobileNumber.trim();

    const newErrors: FieldErrors = {};

    if (!trimmedFullName) {
      newErrors.fullName =
        "Full name is required.";
    }

    if (!trimmedEmail) {
      newErrors.email =
        "Email address is required.";
    } else if (
      !trimmedEmail.includes("@") ||
      !trimmedEmail.includes(".")
    ) {
      newErrors.email =
        "Please enter a valid email address.";
    }

    if (!trimmedMobileNumber) {
      newErrors.mobileNumber =
        "Mobile number is required.";
    }

    if (!password) {
      newErrors.password =
        "Password is required.";
    } else if (password.length < 6) {
      newErrors.password =
        "Password must be at least 6 characters.";
    }

    if (!confirmPassword) {
      newErrors.confirmPassword =
        "Confirm password is required.";
    } else if (
      password !== confirmPassword
    ) {
      newErrors.confirmPassword =
        "Password and confirm password do not match.";
    }

    setErrors(newErrors);

    return (
      Object.keys(newErrors).length === 0
    );
  };

  const handleCreateAccount = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      setErrors({});
      setSuccess("");

      const registerData = {
        fullName: fullName.trim(),
        email: email.trim(),
        mobileNumber: mobileNumber.trim(),
        organizationCode: organizationCode.trim(),
        department: department.trim(),
        password,
      };

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

      if (!response.ok) {
        setErrors({
          api:
            data?.message ||
            "User registration failed.",
        });

        return;
      }

      setSuccess(
        data?.message ||
          "User registered successfully."
      );

      clearForm();

      setTimeout(() => {
        onBack?.();
      }, 900);
    } catch (registerError) {
      const message =
        registerError instanceof Error
          ? registerError.message
          : "User registration failed.";

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
        {/* Fixed header */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            style={({ pressed }) => [
              styles.backButton,
              pressed &&
                styles.backButtonPressed,
            ]}
            onPress={onBack}
          >
            <Ionicons
              name="arrow-back"
              size={23}
              color="#111827"
            />
          </Pressable>

          <Text
            allowFontScaling={false}
            style={styles.headerTitle}
          >
            Create account
          </Text>

          <View
            style={styles.headerRightSpace}
          />
        </View>

        <ScrollView
          contentContainerStyle={
            styles.scrollContent
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Intro */}
          <View style={styles.intro}>
            <View style={styles.introIcon}>
              <Ionicons
                name="person-add-outline"
                size={24}
                color="#4d3fe6"
              />
            </View>

            <View style={styles.introCopy}>
              <Text style={styles.introTitle}>
                User Registration
              </Text>

              <Text style={styles.introText}>
                Create your account and join an
                organization if you have a code.
              </Text>
            </View>
          </View>

          {/* Personal details */}
          <View style={styles.sectionCard}>
            <SectionHeader
              icon="person-outline"
              title="Personal Details"
              subtitle="Your basic account information"
            />

            <FieldLabel
              label="Full Name"
              required
            />

            <InputBox
              icon="person-outline"
              error={Boolean(errors.fullName)}
            >
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                placeholderTextColor="#9ca3af"
                autoCapitalize="words"
                value={fullName}
                onChangeText={(text) => {
                  setFullName(text);
                  clearFieldError("fullName");
                }}
              />
            </InputBox>

            <FieldError
              message={errors.fullName}
            />

            <FieldLabel
              label="Email Address"
              required
            />

            <InputBox
              icon="mail-outline"
              error={Boolean(errors.email)}
            >
              <TextInput
                style={styles.input}
                placeholder="john.e07@gmail.com"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  clearFieldError("email");
                }}
              />
            </InputBox>

            <FieldError
              message={errors.email}
            />

            <FieldLabel
              label="Mobile Number"
              required
            />

            <InputBox
              icon="call-outline"
              error={Boolean(
                errors.mobileNumber
              )}
            >
              <TextInput
                style={styles.input}
                placeholder="Enter your mobile number"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
                value={mobileNumber}
                onChangeText={(text) => {
                  setMobileNumber(text);
                  clearFieldError(
                    "mobileNumber"
                  );
                }}
              />
            </InputBox>

            <FieldError
              message={
                errors.mobileNumber
              }
            />
          </View>

          {/* Organization */}
          <View style={styles.sectionCard}>
            <SectionHeader
              icon="business-outline"
              title="Organization"
              subtitle="Optional workspace information"
            />

            <FieldLabel
              label="Organization Code"
              optional
            />

            <InputBox icon="key-outline">
              <TextInput
                style={styles.input}
                placeholder="Enter your code"
                placeholderTextColor="#9ca3af"
                autoCapitalize="characters"
                value={organizationCode}
                onChangeText={(text) => {
                  setOrganizationCode(text);
                  clearFieldError("api");
                }}
              />
            </InputBox>

            <View style={styles.fieldGap} />

            <FieldLabel
              label="Department"
              optional
            />

            <InputBox icon="briefcase-outline">
              <TextInput
                style={styles.input}
                placeholder="Enter your department"
                placeholderTextColor="#9ca3af"
                value={department}
                onChangeText={(text) => {
                  setDepartment(text);
                  clearFieldError("api");
                }}
              />
            </InputBox>
          </View>

          {/* Security */}
          <View style={styles.sectionCard}>
            <SectionHeader
              icon="shield-checkmark-outline"
              title="Security"
              subtitle="Choose a secure password"
            />

            <FieldLabel
              label="Password"
              required
            />

            <InputBox
              icon="lock-closed-outline"
              error={Boolean(errors.password)}
            >
              <TextInput
                style={styles.input}
                placeholder="Enter password"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  clearFieldError("password");
                }}
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
            </InputBox>

            <FieldError
              message={errors.password}
            />

            <FieldLabel
              label="Confirm Password"
              required
            />

            <InputBox
              icon="lock-closed-outline"
              error={Boolean(
                errors.confirmPassword
              )}
            >
              <TextInput
                style={styles.input}
                placeholder="Re-enter password"
                placeholderTextColor="#9ca3af"
                secureTextEntry={
                  !showConfirmPassword
                }
                autoCapitalize="none"
                autoCorrect={false}
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  clearFieldError(
                    "confirmPassword"
                  );
                }}
                returnKeyType="done"
                onSubmitEditing={
                  handleCreateAccount
                }
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showConfirmPassword
                    ? "Hide confirm password"
                    : "Show confirm password"
                }
                hitSlop={8}
                style={styles.eyeButton}
                onPress={() =>
                  setShowConfirmPassword(
                    (previous) =>
                      !previous
                  )
                }
              >
                <Ionicons
                  name={
                    showConfirmPassword
                      ? "eye-off-outline"
                      : "eye-outline"
                  }
                  size={20}
                  color="#7c818d"
                />
              </Pressable>
            </InputBox>

            <FieldError
              message={
                errors.confirmPassword
              }
            />
          </View>

          {/* API error */}
          {errors.api ? (
            <View style={styles.apiErrorBox}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color="#dc2626"
              />

              <Text style={styles.apiErrorText}>
                {errors.api}
              </Text>
            </View>
          ) : null}

          {/* Success */}
          {success ? (
            <View style={styles.successBox}>
              <Ionicons
                name="checkmark-circle-outline"
                size={19}
                color="#16a34a"
              />

              <Text style={styles.successText}>
                {success}
              </Text>
            </View>
          ) : null}

          {/* Create */}
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            style={({ pressed }) => [
              styles.createButton,

              pressed &&
                !submitting &&
                styles.createButtonPressed,

              submitting &&
                styles.createButtonDisabled,
            ]}
            onPress={handleCreateAccount}
          >
            {submitting ? (
              <ActivityIndicator
                color="#ffffff"
              />
            ) : (
              <>
                <Text
                  allowFontScaling={false}
                  style={
                    styles.createButtonText
                  }
                >
                  Create account
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color="#ffffff"
                />
              </>
            )}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons
          name={icon}
          size={19}
          color="#4d3fe6"
        />
      </View>

      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>
          {title}
        </Text>

        <Text
          style={styles.sectionSubtitle}
        >
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function FieldLabel({
  label,
  required = false,
  optional = false,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={styles.label}>
        {label}
      </Text>

      {required ? (
        <Text style={styles.required}>
          *
        </Text>
      ) : null}

      {optional ? (
        <Text style={styles.optional}>
          Optional
        </Text>
      ) : null}
    </View>
  );
}

function InputBox({
  icon,
  error = false,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.inputBox,
        error && styles.inputError,
      ]}
    >
      <View style={styles.inputIcon}>
        <Ionicons
          name={icon}
          size={18}
          color={
            error
              ? "#dc2626"
              : "#4d3fe6"
          }
        />
      </View>

      {children}
    </View>
  );
}

function FieldError({
  message,
}: {
  message?: string;
}) {
  if (!message) {
    return (
      <View
        style={styles.errorSpacer}
      />
    );
  }

  return (
    <View style={styles.fieldErrorRow}>
      <Ionicons
        name="alert-circle-outline"
        size={14}
        color="#dc2626"
      />

      <Text
        style={styles.fieldErrorText}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  keyboardView: {
    flex: 1,
    backgroundColor: "#f7f7fc",
  },

  header: {
    minHeight: 62,

    backgroundColor: "#ffffff",

    paddingHorizontal: 18,

    flexDirection: "row",
    alignItems: "center",

    borderBottomWidth: 1,
    borderBottomColor: "#efedf7",
  },

  backButton: {
    width: 38,
    height: 38,

    borderRadius: 19,

    alignItems: "center",
    justifyContent: "center",
  },

  backButtonPressed: {
    backgroundColor: "#f3f4f6",
  },

  headerTitle: {
    flex: 1,

    textAlign: "center",

    color: "#111827",

    fontSize: 19,
    lineHeight: 24,

    fontWeight: "900",
  },

  headerRightSpace: {
    width: 38,
    height: 38,
  },

  scrollContent: {
    flexGrow: 1,

    backgroundColor: "#f7f7fc",

    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 44,
  },

  intro: {
    flexDirection: "row",
    alignItems: "center",

    gap: 12,

    marginBottom: 18,
  },

  introIcon: {
    width: 48,
    height: 48,

    borderRadius: 15,

    backgroundColor: "#efedff",

    alignItems: "center",
    justifyContent: "center",
  },

  introCopy: {
    flex: 1,
    minWidth: 0,
  },

  introTitle: {
    color: "#171329",

    fontSize: 19,
    lineHeight: 24,

    fontWeight: "900",
  },

  introText: {
    color: "#8b8f9c",

    fontSize: 11,
    lineHeight: 17,

    fontWeight: "600",

    marginTop: 3,
  },

  sectionCard: {
    width: "100%",

    backgroundColor: "#ffffff",

    borderRadius: 18,

    borderWidth: 1,
    borderColor: "#eceaf7",

    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,

    marginBottom: 14,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",

    gap: 10,

    marginBottom: 17,
  },

  sectionIcon: {
    width: 36,
    height: 36,

    borderRadius: 11,

    backgroundColor: "#efedff",

    alignItems: "center",
    justifyContent: "center",
  },

  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },

  sectionTitle: {
    color: "#171329",

    fontSize: 15,
    lineHeight: 20,

    fontWeight: "900",
  },

  sectionSubtitle: {
    color: "#9ca3af",

    fontSize: 10,
    lineHeight: 15,

    fontWeight: "600",

    marginTop: 1,
  },

  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",

    marginBottom: 7,
  },

  label: {
    color: "#374151",

    fontSize: 12,
    lineHeight: 17,

    fontWeight: "800",
  },

  required: {
    color: "#dc2626",

    fontSize: 13,

    fontWeight: "900",

    marginLeft: 2,
  },

  optional: {
    color: "#9ca3af",

    fontSize: 9,

    fontWeight: "700",

    marginLeft: 7,

    backgroundColor: "#f3f4f6",

    paddingHorizontal: 6,
    paddingVertical: 2,

    borderRadius: 7,

    overflow: "hidden",
  },

  inputBox: {
    width: "100%",

    minHeight: 54,

    backgroundColor: "#fafaff",

    borderWidth: 1,
    borderColor: "#deddf0",

    borderRadius: 14,

    paddingHorizontal: 10,

    flexDirection: "row",
    alignItems: "center",
  },

  inputError: {
    borderColor: "#dc2626",

    backgroundColor: "#fffafa",
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

  fieldErrorRow: {
    flexDirection: "row",
    alignItems: "center",

    gap: 5,

    minHeight: 29,

    paddingTop: 5,
  },

  fieldErrorText: {
    flex: 1,

    color: "#dc2626",

    fontSize: 10,
    lineHeight: 15,

    fontWeight: "600",
  },

  errorSpacer: {
    height: 13,
  },

  fieldGap: {
    height: 14,
  },

  apiErrorBox: {
    width: "100%",

    flexDirection: "row",
    alignItems: "flex-start",

    gap: 8,

    backgroundColor: "#fef2f2",

    borderWidth: 1,
    borderColor: "#fecaca",

    borderRadius: 13,

    paddingHorizontal: 12,
    paddingVertical: 10,

    marginBottom: 14,
  },

  apiErrorText: {
    flex: 1,

    color: "#dc2626",

    fontSize: 11,
    lineHeight: 17,

    fontWeight: "700",
  },

  successBox: {
    width: "100%",

    flexDirection: "row",
    alignItems: "flex-start",

    gap: 8,

    backgroundColor: "#f0fdf4",

    borderWidth: 1,
    borderColor: "#bbf7d0",

    borderRadius: 13,

    paddingHorizontal: 12,
    paddingVertical: 10,

    marginBottom: 14,
  },

  successText: {
    flex: 1,

    color: "#15803d",

    fontSize: 11,
    lineHeight: 17,

    fontWeight: "700",
  },

  createButton: {
    width: "100%",

    minHeight: 56,

    backgroundColor: "#4d3fe6",

    borderRadius: 14,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 9,

    shadowColor: "#4d3fe6",
    shadowOpacity: 0.18,
    shadowRadius: 8,

    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 3,

    marginTop: 2,
  },

  createButtonPressed: {
    opacity: 0.86,

    transform: [
      {
        scale: 0.99,
      },
    ],
  },

  createButtonDisabled: {
    opacity: 0.65,
  },

  createButtonText: {
    color: "#ffffff",

    fontSize: 15,

    fontWeight: "900",
  },

  termsText: {
    color: "#7c818d",

    fontSize: 10,
    lineHeight: 16,

    fontWeight: "600",

    textAlign: "center",

    marginTop: 15,

    paddingHorizontal: 20,
  },

  termsLink: {
    color: "#4d3fe6",

    fontWeight: "900",
  },
});
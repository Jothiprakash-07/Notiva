import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
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

const popupLogo = require("../../../assets/images/Blue-logo.png");

// Physical phone cannot use localhost.
// Update this IP when your PC network IP changes.
const API_BASE_URL = "http://192.168.1.239:5000";

type OrganizationRegisterScreenProps = {
  onBack?: () => void;
};

type FieldErrors = {
  organizationName?: string;
  email?: string;
  mobileNumber?: string;
  address?: string;
  api?: string;
};

export default function OrganizationRegisterScreen({
  onBack,
}: OrganizationRegisterScreenProps) {
  const [gstNumber, setGstNumber] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [address, setAddress] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const [organizationCode, setOrganizationCode] = useState("");
  const [showCodePopup, setShowCodePopup] = useState(false);
  const [copied, setCopied] = useState(false);

  const clearForm = () => {
    setGstNumber("");
    setOrganizationName("");
    setEmail("");
    setMobileNumber("");
    setAddress("");
  };

  const clearError = (
    field?: keyof FieldErrors
  ) => {
    setErrors((previous) => ({
      ...previous,
      ...(field
        ? {
            [field]: undefined,
          }
        : {}),
      api: undefined,
    }));
  };

  const validateForm = () => {
    const trimmedGstNumber = gstNumber.trim();
    const trimmedOrganizationName =
      organizationName.trim();
    const trimmedEmail = email.trim();
    const trimmedMobileNumber =
      mobileNumber.trim();
    const trimmedAddress = address.trim();

    const newErrors: FieldErrors = {};

    // If GST is provided, remaining fields are optional.
    if (trimmedGstNumber.length > 0) {
      setErrors({});
      return true;
    }

    // If GST is empty, below fields are required.
    if (!trimmedOrganizationName) {
      newErrors.organizationName =
        "Organization name is required.";
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

    if (!trimmedAddress) {
      newErrors.address =
        "Address is required.";
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

      const response = await fetch(
        `${API_BASE_URL}/api/auth/organization-register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            gstNumber: gstNumber.trim(),
            organizationName:
              organizationName.trim(),
            email: email.trim(),
            mobileNumber:
              mobileNumber.trim(),
            address: address.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setErrors({
          api:
            data?.message ||
            "Organization registration failed.",
        });

        return;
      }

      const code =
        data?.organization?.organizationCode;

      if (!code) {
        setErrors({
          api:
            "Organization code was not returned by the server.",
        });

        return;
      }

      setOrganizationCode(code);
      setCopied(false);
      setShowCodePopup(true);

      clearForm();
    } catch (registerError) {
      const message =
        registerError instanceof Error
          ? registerError.message
          : "Organization registration failed.";

      setErrors({
        api: message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCode = async () => {
    if (!organizationCode) {
      return;
    }

    await Clipboard.setStringAsync(
      organizationCode
    );

    setCopied(true);
  };

  const handleClosePopup = () => {
    setShowCodePopup(false);
    setCopied(false);

    onBack?.();
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
        {/* Header */}
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

          <View style={styles.headerRightSpace} />
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
                name="business-outline"
                size={24}
                color="#4d3fe6"
              />
            </View>

            <View style={styles.introCopy}>
              <Text style={styles.introTitle}>
                Organization Registration
              </Text>

              <Text style={styles.introText}>
                Register using GST, or provide your
                organization details manually.
              </Text>
            </View>
          </View>

          {/* GST */}
          <View style={styles.sectionCard}>
            <SectionHeader
              icon="document-text-outline"
              title="Register with GST"
              subtitle="Use GST number for a faster registration"
            />

            <FieldLabel
              label="GST Number"
              optional
            />

            <InputBox icon="receipt-outline">
              <TextInput
                style={styles.input}
                placeholder="Enter your GST number"
                placeholderTextColor="#9ca3af"
                autoCapitalize="characters"
                value={gstNumber}
                onChangeText={(text) => {
                  setGstNumber(text);

                  if (
                    text.trim().length > 0
                  ) {
                    setErrors({});
                  } else {
                    clearError();
                  }
                }}
              />
            </InputBox>

            <Text style={styles.gstHint}>
              If you enter a GST number, the fields
              below are optional.
            </Text>
          </View>

          {/* OR divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />

            <View style={styles.orBadge}>
              <Text style={styles.dividerText}>
                OR
              </Text>
            </View>

            <View style={styles.dividerLine} />
          </View>

          {/* Manual details */}
          <View style={styles.sectionCard}>
            <SectionHeader
              icon="create-outline"
              title="Organization Details"
              subtitle="Required only when GST is not provided"
            />

            <FieldLabel
              label="Organization Name"
              required={!gstNumber.trim()}
            />

            <InputBox
              icon="business-outline"
              error={Boolean(
                errors.organizationName
              )}
            >
              <TextInput
                style={styles.input}
                placeholder="Enter organization name"
                placeholderTextColor="#9ca3af"
                autoCapitalize="words"
                value={organizationName}
                onChangeText={(text) => {
                  setOrganizationName(text);
                  clearError(
                    "organizationName"
                  );
                }}
              />
            </InputBox>

            <FieldError
              message={
                errors.organizationName
              }
            />

            <FieldLabel
              label="Email Address"
              required={!gstNumber.trim()}
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
                  clearError("email");
                }}
              />
            </InputBox>

            <FieldError
              message={errors.email}
            />

            <FieldLabel
              label="Mobile Number"
              required={!gstNumber.trim()}
            />

            <InputBox
              icon="call-outline"
              error={Boolean(
                errors.mobileNumber
              )}
            >
              <TextInput
                style={styles.input}
                placeholder="+91 98567 41236"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
                value={mobileNumber}
                onChangeText={(text) => {
                  setMobileNumber(text);
                  clearError(
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

            <FieldLabel
              label="Address"
              required={!gstNumber.trim()}
            />

            <InputBox
              icon="location-outline"
              error={Boolean(errors.address)}
              multiline
            >
              <TextInput
                style={[
                  styles.input,
                  styles.addressInput,
                ]}
                placeholder="Enter your address"
                placeholderTextColor="#9ca3af"
                multiline
                textAlignVertical="top"
                value={address}
                onChangeText={(text) => {
                  setAddress(text);
                  clearError("address");
                }}
              />
            </InputBox>

            <FieldError
              message={errors.address}
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
                  Create organization
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

      {/* Organization code popup */}
      <Modal
        visible={showCodePopup}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={
          handleClosePopup
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close organization code"
              style={styles.closeButton}
              onPress={
                handleClosePopup
              }
              hitSlop={10}
            >
              <Ionicons
                name="close"
                size={21}
                color="#4b5563"
              />
            </Pressable>

            <View
              style={styles.modalLogoWrap}
            >
              <Image
                source={popupLogo}
                resizeMode="contain"
                style={styles.modalLogo}
              />
            </View>

            <View style={styles.successIcon}>
              <Ionicons
                name="checkmark"
                size={24}
                color="#16a34a"
              />
            </View>

            <Text
              allowFontScaling={false}
              style={styles.modalTitle}
            >
              Organization created
            </Text>

            <Text
              allowFontScaling={false}
              style={styles.modalDescription}
            >
              Save this code. Users can enter it
              when joining your organization.
            </Text>

            <Text
              allowFontScaling={false}
              style={styles.modalLabel}
            >
              Organization Code
            </Text>

            <View style={styles.codeBox}>
              <Ionicons
                name="key-outline"
                size={19}
                color="#4d3fe6"
              />

              <Text
                selectable
                allowFontScaling={false}
                style={styles.codeText}
              >
                {organizationCode}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.copyButton,

                pressed &&
                  styles.copyButtonPressed,
              ]}
              onPress={handleCopyCode}
            >
              <Ionicons
                name={
                  copied
                    ? "checkmark-outline"
                    : "copy-outline"
                }
                size={18}
                color="#ffffff"
              />

              <Text
                allowFontScaling={false}
                style={
                  styles.copyButtonText
                }
              >
                {copied
                  ? "Copied"
                  : "Copy Code"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.continueButton}
              onPress={handleClosePopup}
            >
              <Text
                style={
                  styles.continueButtonText
                }
              >
                Back to Login
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  multiline = false,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  error?: boolean;
  multiline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.inputBox,

        multiline &&
          styles.inputBoxMultiline,

        error &&
          styles.inputError,
      ]}
    >
      <View
        style={[
          styles.inputIcon,

          multiline &&
            styles.inputIconMultiline,
        ]}
      >
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

    color: "#111827",

    fontSize: 19,
    lineHeight: 24,

    fontWeight: "900",

    textAlign: "center",
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

  inputBoxMultiline: {
    minHeight: 100,

    alignItems: "flex-start",

    paddingTop: 10,
    paddingBottom: 10,
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

  inputIconMultiline: {
    marginTop: 1,
  },

  input: {
    flex: 1,

    minHeight: 52,

    color: "#111827",

    fontSize: 14,

    paddingVertical: 0,
  },

  addressInput: {
    minHeight: 78,

    paddingTop: 7,
    paddingBottom: 7,
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

  gstHint: {
    color: "#8b8f9c",

    fontSize: 10,
    lineHeight: 16,

    fontWeight: "600",

    marginTop: 8,
  },

  dividerRow: {
    width: "100%",

    flexDirection: "row",
    alignItems: "center",

    marginVertical: 2,
    marginBottom: 16,
  },

  dividerLine: {
    flex: 1,

    height: 1,

    backgroundColor: "#dedde8",
  },

  orBadge: {
    minWidth: 38,
    height: 26,

    borderRadius: 13,

    backgroundColor: "#efedff",

    alignItems: "center",
    justifyContent: "center",

    marginHorizontal: 10,
  },

  dividerText: {
    color: "#4d3fe6",

    fontSize: 10,

    fontWeight: "900",
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

    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,

    alignItems: "center",

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

    marginBottom: 4,
  },

  modalLogo: {
    width: 68,
    height: 68,
  },

  successIcon: {
    width: 46,
    height: 46,

    borderRadius: 23,

    backgroundColor: "#ecfdf3",

    alignItems: "center",
    justifyContent: "center",

    marginTop: 5,
    marginBottom: 11,
  },

  modalTitle: {
    color: "#171329",

    fontSize: 20,
    lineHeight: 26,

    fontWeight: "900",

    textAlign: "center",
  },

  modalDescription: {
    color: "#8b8f9c",

    fontSize: 11,
    lineHeight: 17,

    fontWeight: "600",

    textAlign: "center",

    maxWidth: 270,

    marginTop: 6,
    marginBottom: 20,
  },

  modalLabel: {
    alignSelf: "flex-start",

    color: "#374151",

    fontSize: 11,

    fontWeight: "800",

    marginBottom: 7,
  },

  codeBox: {
    width: "100%",
    minHeight: 54,

    backgroundColor: "#f7f6ff",

    borderWidth: 1,
    borderColor: "#ddd7ff",

    borderRadius: 14,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 8,

    paddingHorizontal: 14,

    marginBottom: 12,
  },

  codeText: {
    color: "#4d3fe6",

    fontSize: 17,

    fontWeight: "900",

    letterSpacing: 1.3,
  },

  copyButton: {
    width: "100%",
    minHeight: 50,

    backgroundColor: "#4d3fe6",

    borderRadius: 13,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 7,
  },

  copyButtonPressed: {
    opacity: 0.84,
  },

  copyButtonText: {
    color: "#ffffff",

    fontSize: 13,

    fontWeight: "900",
  },

  continueButton: {
    marginTop: 10,

    minHeight: 42,

    paddingHorizontal: 18,

    alignItems: "center",
    justifyContent: "center",
  },

  continueButtonText: {
    color: "#4d3fe6",

    fontSize: 12,

    fontWeight: "900",
  },
});
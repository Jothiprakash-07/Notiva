import { useState } from "react";
import * as Clipboard from "expo-clipboard";
import {
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
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

const popupLogo = require("../../../assets/images/Blue-logo.png");

// IMPORTANT:
// Expo mobile app-la localhost work aagathu.
// Phone browser-la backend open panna use panna same laptop IP-a inga podunga.
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

  const clearForm = () => {
    setGstNumber("");
    setOrganizationName("");
    setEmail("");
    setMobileNumber("");
    setAddress("");
  };

  const validateForm = () => {
    const trimmedGstNumber = gstNumber.trim();
    const trimmedOrganizationName = organizationName.trim();
    const trimmedEmail = email.trim();
    const trimmedMobileNumber = mobileNumber.trim();
    const trimmedAddress = address.trim();

    const newErrors: FieldErrors = {};

    // GST number irundha below fields required illa.
    if (trimmedGstNumber.length > 0) {
      setErrors({});
      return true;
    }

    // GST empty-na below fields compulsory.
    if (!trimmedOrganizationName) {
      newErrors.organizationName = "Organization name is required.";
    }

    if (!trimmedEmail) {
      newErrors.email = "Email address is required.";
    } else if (!trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
      newErrors.email = "Please enter a valid email address.";
    }

    if (!trimmedMobileNumber) {
      newErrors.mobileNumber = "Mobile number is required.";
    }

    if (!trimmedAddress) {
      newErrors.address = "Address is required.";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
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
            organizationName: organizationName.trim(),
            email: email.trim(),
            mobileNumber: mobileNumber.trim(),
            address: address.trim(),
          }),
        }
      );

      const data = await response.json();

      console.log("Organization register status:", response.status);
      console.log("Organization register response:", data);

      if (!response.ok) {
        setErrors({
          api: data?.message || "Organization registration failed.",
        });
        return;
      }

      const code = data?.organization?.organizationCode;

      if (!code) {
        setErrors({
          api: "Organization code was not returned by the server.",
        });
        return;
      }

      setOrganizationCode(code);
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

    await Clipboard.setStringAsync(organizationCode);
  };

  const handleClosePopup = () => {
    setShowCodePopup(false);
    onBack?.();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

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
              <Text allowFontScaling={false} style={styles.backIcon}>
                ←
              </Text>
            </Pressable>

            <Text allowFontScaling={false} style={styles.headerTitle}>
              Create account
            </Text>
          </View>

          <View style={styles.form}>
            <Text allowFontScaling={false} style={styles.label}>
              GST Number
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Enter your GST number"
              placeholderTextColor="#d6d6d6"
              autoCapitalize="characters"
              value={gstNumber}
              onChangeText={(text) => {
                setGstNumber(text);

                // GST type panna below field errors remove aagum.
                if (text.trim().length > 0) {
                  setErrors({});
                }
              }}
            />

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />

              <Text allowFontScaling={false} style={styles.dividerText}>
                or
              </Text>

              <View style={styles.dividerLine} />
            </View>

            <Text allowFontScaling={false} style={styles.label}>
              Organization Name
            </Text>

            <TextInput
              style={[
                styles.input,
                errors.organizationName && styles.inputError,
              ]}
              placeholder="Enter the Organization name"
              placeholderTextColor="#d6d6d6"
              autoCapitalize="words"
              value={organizationName}
              onChangeText={(text) => {
                setOrganizationName(text);
                setErrors((prev) => ({
                  ...prev,
                  organizationName: undefined,
                }));
              }}
            />

            {errors.organizationName ? (
              <Text allowFontScaling={false} style={styles.fieldErrorText}>
                {errors.organizationName}
              </Text>
            ) : null}

            <Text allowFontScaling={false} style={styles.label}>
              Email Address
            </Text>

            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              placeholder="john.e07@gmail.com"
              placeholderTextColor="#d6d6d6"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setErrors((prev) => ({
                  ...prev,
                  email: undefined,
                }));
              }}
            />

            {errors.email ? (
              <Text allowFontScaling={false} style={styles.fieldErrorText}>
                {errors.email}
              </Text>
            ) : null}

            <Text allowFontScaling={false} style={styles.label}>
              Mobile Number
            </Text>

            <TextInput
              style={[styles.input, errors.mobileNumber && styles.inputError]}
              placeholder="+91 98567 41236"
              placeholderTextColor="#d6d6d6"
              keyboardType="phone-pad"
              value={mobileNumber}
              onChangeText={(text) => {
                setMobileNumber(text);
                setErrors((prev) => ({
                  ...prev,
                  mobileNumber: undefined,
                }));
              }}
            />

            {errors.mobileNumber ? (
              <Text allowFontScaling={false} style={styles.fieldErrorText}>
                {errors.mobileNumber}
              </Text>
            ) : null}

            <Text allowFontScaling={false} style={styles.label}>
              Address
            </Text>

            <TextInput
              style={[styles.input, errors.address && styles.inputError]}
              placeholder="Enter your address"
              placeholderTextColor="#d6d6d6"
              multiline
              textAlignVertical="center"
              value={address}
              onChangeText={(text) => {
                setAddress(text);
                setErrors((prev) => ({
                  ...prev,
                  address: undefined,
                }));
              }}
            />

            {errors.address ? (
              <Text allowFontScaling={false} style={styles.fieldErrorText}>
                {errors.address}
              </Text>
            ) : null}

            {errors.api ? (
              <Text allowFontScaling={false} style={styles.apiErrorText}>
                {errors.api}
              </Text>
            ) : null}

            <View style={styles.bottomArea}>
              <Pressable
                style={({ pressed }) => [
                  styles.createButton,
                  (pressed || submitting) && styles.createButtonPressed,
                ]}
                onPress={handleCreateAccount}
                disabled={submitting}
              >
                <Text allowFontScaling={false} style={styles.createButtonText}>
                  {submitting ? "Creating..." : "Create account"}
                </Text>
              </Pressable>

              <Text allowFontScaling={false} style={styles.termsText}>
                By registering you agree to our{" "}
                <Text style={styles.termsLink}>Terms & Privacy Policy</Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showCodePopup}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleClosePopup}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Pressable
              style={styles.closeButton}
              onPress={handleClosePopup}
              hitSlop={10}
            >
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>

            <Image
              source={popupLogo}
              resizeMode="contain"
              style={styles.modalLogo}
            />

            <Text allowFontScaling={false} style={styles.modalTitle}>
              Welcome back
            </Text>

            <Text allowFontScaling={false} style={styles.modalLabel}>
              Your Organization Code
            </Text>

            <View style={styles.codeBox}>
              <Text allowFontScaling={false} style={styles.codeText}>
                {organizationCode}
              </Text>
            </View>

            <Pressable style={styles.copyButton} onPress={handleCopyCode}>
              <Text allowFontScaling={false} style={styles.copyButtonText}>
                COPY
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

  keyboardView: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  scrollContent: {
    flexGrow: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingTop: 36,
    paddingBottom: 34,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 26,
  },

  backIcon: {
    color: "#111827",
    fontSize: 30,
    fontWeight: "400",
    marginRight: 14,
  },

  headerTitle: {
    color: "#111827",
    fontSize: 21,
    fontWeight: "900",
  },

  form: {
    flex: 1,
    width: "100%",
  },

  label: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 10,
  },

  input: {
    width: "100%",
    minHeight: 39,
    backgroundColor: "#f3f3f3",
    borderRadius: 3,
    paddingHorizontal: 16,
    fontSize: 13,
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

  apiErrorText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
    marginBottom: 14,
    textAlign: "center",
  },

  dividerRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    marginTop: 8,
  },

  dividerLine: {
    width: 64,
    height: 1,
    backgroundColor: "#d8d8d8",
  },

  dividerText: {
    color: "#111827",
    fontSize: 13,
    marginHorizontal: 12,
  },

  bottomArea: {
    flex: 1,
    justifyContent: "flex-end",
    paddingTop: 70,
  },

  createButton: {
    width: "67%",
    height: 43,
    backgroundColor: "#4d3fe6",
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 30,
  },

  createButtonPressed: {
    opacity: 0.85,
  },

  createButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  termsText: {
    color: "#111827",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 17,
  },

  termsLink: {
    color: "#4d3fe6",
    fontWeight: "900",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  modalBox: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 26,
    alignItems: "center",
  },

  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 1,
  },

  modalLogo: {
    width: 74,
    height: 74,
    marginBottom: 10,
  },

  modalTitle: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 16,
  },

  modalLabel: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
  },

  codeBox: {
    width: "100%",
    minHeight: 48,
    backgroundColor: "#f8f8fb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 18,
  },

  codeText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  copyButton: {
    width: "100%",
    height: 42,
    backgroundColor: "#4d3fe6",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },

  copyButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
});
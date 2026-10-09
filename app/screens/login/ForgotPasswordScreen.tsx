import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Action, Field, ui } from "../../../components/profile/ProfileUI";
import { recoveryRequest } from "../../../services/recoveryService";
import { isValidNotivaId } from "../../../utils/notivaId";

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<"identify" | "verify" | "reset" | "success">("identify");
  const [notivaId, setNotivaId] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const resetToken = useRef("");
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (!countdown) return;
    const timer = setTimeout(() => setCountdown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);
  useEffect(() => () => { resetToken.current = ""; }, []);
  const run = async (action: "send" | "verify" | "reset") => {
    if (lock.current || (action === "send" && countdown > 0)) return;
    setError("");
    if (!isValidNotivaId(notivaId)) { setError("Enter your valid Notiva ID (4–30 letters, numbers, hyphens, underscores or periods)."); return; }
    if (action === "verify" && !/^\d{6}$/.test(otp)) { setError("Enter the 6-digit verification code."); return; }
    if (action === "reset" && (newPassword.length < 6 || newPassword !== confirmPassword)) { setError("Enter matching passwords with at least 6 characters."); return; }
    lock.current = true; setBusy(true);
    try {
      if (action === "send") {
        await recoveryRequest("forgot-password", { notivaId: notivaId.toLowerCase() });
        setCountdown(60); setOtp(""); setStep("verify");
      } else if (action === "verify") {
        const result = await recoveryRequest("verify-reset-otp", { notivaId: notivaId.toLowerCase(), otp });
        if (!result.resetToken) throw new Error("Unable to verify the code. Please try again.");
        resetToken.current = result.resetToken; setOtp(""); setStep("reset");
      } else {
        await recoveryRequest("reset-password", { resetToken: resetToken.current, newPassword, confirmPassword });
        resetToken.current = ""; setNewPassword(""); setConfirmPassword(""); setStep("success");
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to connect. Please try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <SafeAreaView style={ui.safe}>
    <KeyboardAvoidingView style={ui.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
        <Text accessibilityRole="header" style={ui.title}>{step === "identify" ? "Forgot Password" : step === "verify" ? "Verify Code" : step === "reset" ? "Create New Password" : "Password Reset Successful"}</Text>
        <View style={ui.card}>
          {step === "identify" && <><Field label="Notiva ID" placeholder="Enter your Notiva ID" value={notivaId} onChangeText={setNotivaId} autoCapitalize="none" autoCorrect={false} editable={!busy} maxLength={30} /><Text style={ui.subtitle}>Enter your Notiva ID to receive a code at your stored recovery/contact email. Existing users can still sign in with their old email to set up an ID. Separate email verification is optional.</Text><Action label="Continue" busy={busy} onPress={() => void run("send")} /></>}
          {step === "verify" && <><Text style={ui.subtitle}>If the account is eligible for recovery, a verification code has been sent. Enter the 6-digit code sent to your recovery/contact email.</Text><Field label="Verification Code" value={otp} onChangeText={setOtp} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} editable={!busy} /><Action label="Verify" busy={busy} onPress={() => void run("verify")} /><Action label={countdown ? `Resend Code (${countdown}s)` : "Resend Code"} secondary disabled={busy || countdown > 0} onPress={() => void run("send")} /></>}
          {step === "reset" && <><Field label="New Password" password value={newPassword} onChangeText={setNewPassword} editable={!busy} /><Field label="Confirm Password" password value={confirmPassword} onChangeText={setConfirmPassword} editable={!busy} /><Action label="Reset Password" busy={busy} onPress={() => void run("reset")} /></>}
          {step === "success" && <Text style={ui.success}>Your password has been reset. Sign in with your Notiva ID and new password.</Text>}
        </View>
        {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
        <Action label="Back to Login" secondary disabled={busy} onPress={() => router.replace("/")} />
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

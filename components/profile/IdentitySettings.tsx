import Ionicons from "@expo/vector-icons/Ionicons";
import { ID_FORMAT, ID_TAKEN, useNotivaIdAvailability } from "../../hooks/useNotivaIdAvailability";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { Action, Field, Info, purple, ui } from "./ProfileUI";
import { recoveryRequest } from "../../services/recoveryService";
import { isValidNotivaId } from "../../utils/notivaId";

export default function IdentitySettings() {
  const { session, updateUser } = useAuth();
  const [notivaId, setNotivaId] = useState("");
  const [isEditingNotivaId, setIsEditingNotivaId] = useState(false);
  const [success, setSuccess] = useState("");
  const availability = useNotivaIdAvailability(isEditingNotivaId ? notivaId : "", session?.token);
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [destination, setDestination] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => { setNotivaId(session?.user.notivaId || ""); setIsEditingNotivaId(false); }, [session?.user.notivaId, session?.user.id]);
  useEffect(() => { setSent(false); setOtp(""); setCountdown(0); setError(""); }, [session?.user.recoveryEmail, session?.user.id]);
  useEffect(() => {
    if (!countdown) return;
    const timer = setTimeout(() => setCountdown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);
  const run = async (path: string) => {
    if (!session || lock.current) return;
    if (path === "set-notiva-id") {
      if (!isEditingNotivaId || notivaId.trim() === (session.user.notivaId || "")) return;
      if (!isValidNotivaId(notivaId.trim())) { setError(ID_FORMAT); return; }
      if (availability === ID_TAKEN) { setError(ID_TAKEN); return; }
    }
    if (path === "verify-recovery-email" && !/^\d{6}$/.test(otp)) { setError("Enter the 6-digit verification code."); return; }
    lock.current = true; setBusy(true); setError(""); setSuccess("");
    try {
      const result = await recoveryRequest(path, path === "set-notiva-id" ? { notivaId: notivaId.trim() } : { otp }, session.token);
      if (result.user) {
        try { await updateUser(session.token, result.user); }
        catch { throw new Error("Your account was updated, but the session could not be saved. Return to Profile to refresh and sync your account."); }
      }
      if (path === "set-notiva-id" && result.user) { setIsEditingNotivaId(false); setSuccess("Notiva ID updated."); }
      if (path === "send-recovery-email-otp" && !result.user) { setSent(true); setCountdown(60); setDestination(result.maskedEmail || "your recovery email"); }
      if (path === "verify-recovery-email") { setSent(false); setOtp(""); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to complete this request. Please try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!session) return null;
  return <View style={ui.card}>
    {isEditingNotivaId ? <>
      <Field label="Notiva ID" value={notivaId} onChangeText={value => { setNotivaId(value); setError(""); }} autoFocus autoCapitalize="none" autoCorrect={false} editable={!busy} maxLength={30} />
      <Text accessibilityLiveRegion="polite" style={ui.subtitle}>{availability}</Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={ui.flex}><Action label="Cancel" secondary disabled={busy} onPress={() => {
          if (lock.current) return;
          setNotivaId(session.user.notivaId || ""); setIsEditingNotivaId(false); setError(""); setSuccess("");
        }} /></View>
        <View style={ui.flex}><Action label={session.user.notivaId ? "Save Notiva ID" : "Create Notiva ID"} busy={busy}
          disabled={notivaId.trim() === (session.user.notivaId || "") || availability === ID_TAKEN}
          onPress={() => void run("set-notiva-id")} /></View>
      </View>
    </> : <View style={styles.identityRow}>
      <View style={styles.identityValue}><Info label="Notiva ID" value={session.user.notivaId || "Not set"} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit Notiva ID" disabled={busy}
        accessibilityState={{ disabled: busy }} style={({ pressed }) => [styles.editButton, pressed && ui.pressed]} onPress={() => {
          if (lock.current) return;
          setNotivaId(session.user.notivaId || ""); setError(""); setSuccess(""); setIsEditingNotivaId(true);
        }}><Ionicons name="pencil-outline" size={20} color={purple} /></Pressable>
    </View>}
    <Text style={ui.subtitle}>Used to sign in to your Notiva account.</Text>
    {!!success && <Text accessibilityLiveRegion="polite" style={ui.success}>{success}</Text>}
    <Info label="Recovery Email" value={session.user.recoveryEmail || session.user.email} />
    <Info label="Verification Status" value={session.user.recoveryEmailVerified ? "Verified" : "Not Verified"} />
    {!session.user.recoveryEmailVerified && <><Text style={ui.subtitle}>Save any email changes below before verifying your recovery email.</Text><Action label={countdown ? `Resend Code (${countdown}s)` : sent ? "Resend Code" : "Verify Email"} disabled={busy || countdown > 0} onPress={() => void run("send-recovery-email-otp")} />{sent && <><Text style={ui.subtitle}>Enter the 6-digit code sent to {destination}.</Text><Field label="Email Verification Code" value={otp} onChangeText={setOtp} maxLength={6} keyboardType="number-pad" autoComplete="one-time-code" editable={!busy} /><Action label="Verify Code" busy={busy} onPress={() => void run("verify-recovery-email")} /></>}</>}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  identityRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  identityValue: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  editButton: {
    width: 44, height: 44, minWidth: 44, minHeight: 44, flexShrink: 0,
    alignItems: "center", justifyContent: "center", borderRadius: 12,
    backgroundColor: "#F0EDFF", borderWidth: 1, borderColor: "#DAD3FF",
  },
});

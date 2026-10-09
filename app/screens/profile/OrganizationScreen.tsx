import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../../contexts/AuthContext";
import { Action, Info, ProfilePage, ui } from "../../../components/profile/ProfileUI";
import { getProfile, leaveOrganization, ProfileError, type ProfileResult } from "../../../services/profileService";

const storageError = "Your organization details were updated from the server, but could not be saved on this device. Please refresh to sync your session.";

export default function OrganizationScreen() {
  const { session, updateUser } = useAuth();
  const [result, setResult] = useState<ProfileResult>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const sequence = useRef(0);
  const lock = useRef(false);
  const needsSync = useRef(false);
  const token = session?.token;
  const userId = session?.user.id;
  useFocusEffect(useCallback(() => {
    const request = ++sequence.current;
    setConfirming(false);
    setBusy(false);
    if (!token) { setResult(undefined); return; }
    setLoading(true);
    void (async () => {
      try {
        const value = await getProfile(token);
        if (request !== sequence.current) return;
        setResult(value); setError("");
        if (needsSync.current) {
          try {
            await updateUser(token, value.user);
            if (request !== sequence.current) return;
            needsSync.current = false;
            setActionError("");
          } catch {
            if (request === sequence.current) setActionError(storageError);
          }
        } else setActionError("");
      } catch {
        if (request === sequence.current) setError("Could not refresh your organization. Please try again.");
      } finally {
        if (request === sequence.current) setLoading(false);
      }
    })();
    return () => { ++sequence.current; };
  }, [token, userId, revision, updateUser]));

  const leave = async () => {
    if (!token || lock.current || !confirming) return;
    lock.current = true;
    const request = ++sequence.current;
    setBusy(true); setActionError(""); setMessage("");
    try {
      const value = await leaveOrganization(token);
      if (request !== sequence.current) return;
      needsSync.current = true;
      setResult({ ...value, organization: null });
      setLoading(false); setError(""); setConfirming(false);
      try {
        await updateUser(token, value.user);
        if (request !== sequence.current) return;
        needsSync.current = false;
        setMessage("You have left the organization.");
      } catch {
        if (request === sequence.current) setActionError(storageError);
      }
    } catch (failure) {
      if (request === sequence.current) {
        setConfirming(false);
        setActionError(failure instanceof ProfileError ? failure.message : "Unable to leave the organization right now. Please try again.");
      }
    } finally {
      lock.current = false;
      if (request === sequence.current) setBusy(false);
    }
  };
  const closeConfirmation = () => { if (!lock.current) setConfirming(false); };
  const linked = Boolean(result?.user.organizationCode);
  return <ProfilePage title="Organization" subtitle="Your verified organization details">
    {loading ? <ActivityIndicator /> : error ? <><Text style={ui.error}>{error}</Text><Action label="Try Again" onPress={() => setRevision(value => value + 1)} /></> : result?.organization ? <View style={ui.card}>
      <Info label="Organization" value={result.organization.organizationName} />
      <Info label="Organization Code" value={result.organization.organizationCode} />
      <Info label="Email" value={result.organization.email} />
      <Info label="Mobile Number" value={result.organization.mobileNumber} />
      <Info label="Address" value={result.organization.address} />
      <Info label="Your Department" value={result.user.department} />
      <Info label="Your Role" value={result.user.role} />
      <Text style={ui.subtitle}>Organization details are managed by your organization.</Text>
    </View> : <View style={ui.card}><Text style={ui.heading}>No verified organization found</Text><Text style={ui.subtitle}>Join with a valid code provided by your organization.</Text></View>}
    {!!message && <Text accessibilityLiveRegion="polite" style={ui.subtitle}>{message}</Text>}
    {!!actionError && <View style={ui.card}><Text accessibilityRole="alert" style={ui.error}>{actionError}</Text><Action label="Refresh Organization" disabled={busy || loading} onPress={() => setRevision(value => value + 1)} /></View>}
    {!loading && !error && <>
      <Action label={linked ? "Change Organization" : "Join Organization"} disabled={busy || needsSync.current} onPress={() => router.push("/screens/profile/JoinOrganizationScreen")} />
      {linked && <Action label="Leave Organization" destructive busy={busy} disabled={needsSync.current} onPress={() => { if (!lock.current) setConfirming(true); }} />}
    </>}
    <Modal visible={confirming} transparent animationType="fade" onRequestClose={closeConfirmation}>
      <View style={styles.overlay}>
        <View style={[ui.card, styles.modal]} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={ui.heading}>Leave Organization?</Text>
          <Text style={ui.subtitle}>You will lose access to this organization and its shared data.{"\n"}Your Notiva account, profile, and personal reminders will remain unchanged.</Text>
          <Action label="Cancel" secondary disabled={busy} onPress={closeConfirmation} />
          <Action label="Leave" destructive busy={busy} onPress={() => void leave()} />
        </View>
      </View>
    </Modal>
  </ProfilePage>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(23,19,41,0.55)", alignItems: "center", justifyContent: "center", padding: 22 },
  modal: { width: "100%", maxWidth: 420 },
});

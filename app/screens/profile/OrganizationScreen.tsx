import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../../contexts/AuthContext";
import { Action, Info, ProfilePage, ui } from "../../../components/profile/ProfileUI";
import { getProfile, type ProfileResult } from "../../../services/profileService";

export default function OrganizationScreen() {
  const { session } = useAuth();
  const [result, setResult] = useState<ProfileResult>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const token = session?.token;
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!token) return;
    if (revision >= 0) setLoading(true);
    void getProfile(token).then(value => { if (active) { setResult(value); setError(""); } }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, revision]));
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
    {!loading && !error && <Action label={result?.user.organizationCode ? "Change Organization" : "Join Organization"} onPress={() => router.push("/screens/profile/JoinOrganizationScreen")} />}
  </ProfilePage>;
}

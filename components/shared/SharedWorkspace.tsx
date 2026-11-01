import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useOrganization } from "../../contexts/OrganizationContext";
import { Action, ui } from "../profile/ProfileUI";
import { SharedPage, OrganizationSwitcher, SharedMessage, SharedCard, Choice, sharedStyles } from "./SharedUI";
import { canCreateSharedItem, hasOrganizationPermission, sharedDisplayStatus } from "../../utils/sharedPermissions";
import { loadSharedList, sharedErrorMessage } from "../../services/sharedWorkspace";
import { organizationApi } from "../../services/sharedApi";
import type { OrganizationPerson, SharedEntry, SharedView } from "../../types/shared";
import TeamsScreen from "../../app/screens/shared/teams";
import OrganizationDetailsScreen from "../../app/screens/shared/organization";
import { deriveSharedOccurrence, isSharedRecurring } from "../../utils/sharedRecurrence";
export default function SharedWorkspace({ section = "inbox" }: { section?: "inbox" | "created" | "teams" | "organization" }) {
  const { session } = useAuth(), workspace = useOrganization(), account = session?.user.id;
  const { refresh } = workspace;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  if (workspace.current && (section === "teams" || section === "organization")) {
    const Screen = section === "teams" ? TeamsScreen : OrganizationDetailsScreen;
    return <Screen key={account + ":" + workspace.current.organization.id} organizationId={workspace.current.organization.id} workspaceRoot />;
  }
  return <SharedPage title={section === "created" ? "Created" : section === "teams" ? "Teams" : section === "organization" ? "Organization" : "Team workspace"} subtitle="Shared plans, separate from your personal reminders" back={false} refreshing={workspace.loading} onRefresh={() => { void workspace.refresh(); }}>
    <Action label="Create Organization" onPress={() => router.push("/screens/shared/create-organization")} />
    <Action label="Join Organization" secondary onPress={() => router.push("/screens/profile/JoinOrganizationScreen")} />
    {workspace.error && <SharedMessage message={workspace.error} retry={() => { void workspace.refresh(); }} />}
    {workspace.organizations.length > 0 && <OrganizationSwitcher />}
    {workspace.current && <Action label="Open Organization" secondary onPress={() => router.push({ pathname: "/screens/shared/organization", params: { organizationId: workspace.current!.organization.id } })} />}
    {!workspace.current ? <SharedMessage loading={workspace.loading} message={workspace.loading ? "Loading organizations…" : "No active organizations. Join an organization and wait for approval to use this workspace."} retry={() => { void workspace.refresh(); }} /> :
      account && <WorkspaceLists key={`${account}:${workspace.current.organization.id}`} account={account} org={workspace.current.organization.id} initialView={section === "created" ? "created" : "inbox"} />}
  </SharedPage>;
}
function WorkspaceLists({ account, org, initialView }: { account: string; org: string; initialView: "inbox" | "created" }) {
  const workspace = useOrganization(), [view, setView] = useState<SharedView>(initialView), [filter, setFilter] = useState("active");
  const [entries, setEntries] = useState<SharedEntry[]>([]), [people, setPeople] = useState<OrganizationPerson[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [cached, setCached] = useState(false);
  const manage = hasOrganizationPermission(workspace.current, "edit_shared_items");
  useEffect(() => { if (view === "management" && !manage) { setView("inbox"); setEntries([]); } }, [view, manage]);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    void loadSharedList(account, org, view).then(result => { if (active) { setEntries(result.entries); setCached(result.cached); } }).catch(error => { if (active) setError(sharedErrorMessage(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account, org, view, workspace.version]);
  useEffect(() => { let active = true; void organizationApi.members(account, org).then(rows => { if (active) setPeople(rows); }).catch(() => {}); return () => { active = false; }; }, [account, org]);
  const values = entries.map(entry => deriveSharedOccurrence(entry, entry.pendingOccurrenceActions)).filter(entry => {
    if (view === "inbox" && isSharedRecurring(entry) && !entry.occurrence && entry.item.status === "active") return false;
    const status = view === "inbox" || isSharedRecurring(entry) ? sharedDisplayStatus(entry) : entry.item.status;
    return filter === "active" ? !["completed", "cancelled"].includes(status) : status === filter;
  });
  return <>
    {canCreateSharedItem(workspace.current) && <Action label="Create shared item" disabled={!workspace.fresh} onPress={() => router.push({ pathname: "/screens/shared/create", params: { organizationId: org } })} />}
    {!canCreateSharedItem(workspace.current) && <Text style={ui.subtitle}>Shared creation is not enabled for your role. You can still view received items.</Text>}
    <View style={sharedStyles.row}>{(["inbox", "created", ...(manage ? ["management"] : [])] as SharedView[]).map(value => <Choice key={value} label={value === "inbox" ? "Inbox" : value === "created" ? "Created by Me" : "Manage"} selected={view === value} onPress={() => value === "management" ? setView(value) : router.navigate(value === "created" ? "/(tabs)/created" : "/(tabs)/team")} />)}</View>
    <View style={sharedStyles.row}>{["active", "completed", "cancelled"].map(value => <Choice key={value} label={value[0].toUpperCase() + value.slice(1)} selected={filter === value} onPress={() => setFilter(value)} />)}</View>
    {cached && <Text style={ui.subtitle}>Saved snapshot · reconnect to refresh. Opened saved details are read-only.</Text>}
    {loading && !entries.length ? <SharedMessage message="Loading shared items…" loading /> : error ? <SharedMessage message={error} retry={() => { void workspace.refresh(); }} /> : values.length ? values.map(entry =>
      <SharedCard key={entry.item.id} entry={entry} people={people} management={view !== "inbox"} onPress={() => router.push({ pathname: "/screens/shared/item", params: { organizationId: org, id: entry.item.id } })} />) :
      <SharedMessage message={view === "created" ? "No created items in this filter." : "No shared items in this filter."} />}
    {entries.length >= (view === "inbox" ? 200 : 50) && <Text style={ui.subtitle}>Showing the {view === "inbox" ? 200 : 50} most recent items.</Text>}
  </>;
}

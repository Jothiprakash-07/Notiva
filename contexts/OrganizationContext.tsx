import { createContext, useContext, useEffect, useSyncExternalStore, type PropsWithChildren } from "react";
import { useAuth } from "./AuthContext";
import { getWorkspaceState, subscribeWorkspace, startSharedWorkspace, refreshSharedWorkspace, selectSharedOrganization, type WorkspaceState } from "../services/sharedWorkspace";
const empty: WorkspaceState = { organizations: [], loading: true, fresh: false, version: 0 };
const OrganizationContext = createContext<WorkspaceState>(empty);
export function OrganizationProvider({ children }: PropsWithChildren) {
  const { session, isLoading } = useAuth(), account = session?.user.id, sessionIdentity = session?.sessionId ?? session?.token;
  const snapshot = useSyncExternalStore(subscribeWorkspace, getWorkspaceState, () => empty);
  useEffect(() => { if (!isLoading && account) return startSharedWorkspace(account); }, [account, isLoading, sessionIdentity]);
  return <OrganizationContext.Provider value={snapshot.account === account ? snapshot : empty}>{children}</OrganizationContext.Provider>;
}
export function useOrganization() {
  const state = useContext(OrganizationContext);
  return { ...state, current: state.organizations.find(row => row.organization.id === state.selectedId),
    refresh: refreshSharedWorkspace, select: selectSharedOrganization };
}

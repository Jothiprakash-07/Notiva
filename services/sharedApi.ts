import { authenticatedFetch } from "./sessionTransport";
import { getItemSyncSession } from "./itemAccount";
import { API_BASE_URL } from "./apiConfig";
import type { OrganizationEntry, OrganizationJoinRequest, OrganizationPerson, OrganizationTeam, SharedDraft, SharedEntry, SharedRecipient, SharedView, SharedRecurrence } from "../types/shared";
export class SharedApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export async function sharedRequest<T>(account: string, path: string, method = "GET", body?: object): Promise<T> {
  const session = getItemSyncSession();
  if (!session || session.user.id !== account) throw new SharedApiError(401, "Your session has ended.");
  const response = await authenticatedFetch(`${API_BASE_URL}/api/organizations${path}`, { method,
    headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }, session.token);
  // An old response cannot mutate another account or a replacement session.
  const current = getItemSyncSession();
  if (!current || current.user.id !== account || current.sessionId !== session.sessionId) throw new SharedApiError(401, "Your session changed. Refresh to continue.");
  const data = await response.json();
  if (!response.ok) throw new SharedApiError(response.status, data.message || "Could not load the shared workspace.", data.code);
  return data as T;
}
export async function sharedPages<T>(account: string, path: string, key: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset <= 100000; offset += 100) {
    const result = await sharedRequest<Record<string, T[]>>(account, `${path}${path.includes("?") ? "&" : "?"}limit=100&offset=${offset}`);
    if (!Array.isArray(result[key])) throw new Error("Invalid workspace response.");
    rows.push(...result[key]);
    if (result[key].length < 100) return rows;
  }
  throw new Error("Workspace is too large to refresh completely. Please try again later.");
}
const orgPath = (org: string) => `/${encodeURIComponent(org)}`;
const itemPath = (org: string, id: string) => `${orgPath(org)}/shared-items/${encodeURIComponent(id)}`;
export const organizationApi = {
  createTeam: (account: string, org: string, name: string) => sharedRequest<{ team: OrganizationTeam }>(account, `${orgPath(org)}/teams`, "POST", { name }),
  editTeam: (account: string, org: string, team: string, name: string) => sharedRequest(account, `${orgPath(org)}/teams/${encodeURIComponent(team)}`, "PATCH", { name }),
  archiveTeam: (account: string, org: string, team: string) => sharedRequest(account, `${orgPath(org)}/teams/${encodeURIComponent(team)}`, "DELETE"),
  teamMembers: (account: string, org: string, team: string) => sharedPages<{ userId: string; fullName?: string; notivaId?: string }>(account, `${orgPath(org)}/teams/${encodeURIComponent(team)}/members`, "members"),
  assignTeam: (account: string, org: string, team: string, userId: string) => sharedRequest(account, `${orgPath(org)}/teams/${encodeURIComponent(team)}/members`, "POST", { userId }),
  removeTeamMember: (account: string, org: string, team: string, user: string) => sharedRequest(account, `${orgPath(org)}/teams/${encodeURIComponent(team)}/members/${encodeURIComponent(user)}`, "DELETE"),
  memberTeams: (account: string, org: string, user: string) => sharedPages<OrganizationTeam>(account, `${orgPath(org)}/members/${encodeURIComponent(user)}/teams`, "teams"),
  permissionOptions: (account: string) => sharedRequest<{ permissions: string[] }>(account, "/permission-options"),
  setRole: (account: string, org: string, user: string, role: "admin" | "member", permissions: string[]) => sharedRequest(account, `${orgPath(org)}/members/${encodeURIComponent(user)}/role`, "PATCH", { role, permissions }),
  setPermissions: (account: string, org: string, user: string, permissions: string[]) => sharedRequest(account, `${orgPath(org)}/members/${encodeURIComponent(user)}/permissions`, "PATCH", { permissions }),
  join: (account: string, joinCode: string) => sharedRequest<{ request?: OrganizationJoinRequest; alreadyMember?: boolean; organization?: OrganizationEntry["organization"] }>(account, "/join-request", "POST", { joinCode }),
  myRequests: (account: string) => sharedPages<OrganizationJoinRequest>(account, "/join-requests/mine", "requests"),
  requests: (account: string, org: string) => sharedPages<OrganizationJoinRequest>(account, `${orgPath(org)}/join-requests`, "requests"),
  decide: (account: string, org: string, request: string, action: "approve" | "reject") => sharedRequest(account, `${orgPath(org)}/join-requests/${encodeURIComponent(request)}/${action}`, "POST", {}),
  create: (account: string, details: { name: string; email: string; mobileNumber: string; address: string }) => sharedRequest<OrganizationEntry>(account, "", "POST", details),
  list: (account: string) => sharedPages<OrganizationEntry>(account, "", "organizations"),
  detail: (account: string, org: string) => sharedRequest<OrganizationEntry>(account, orgPath(org)),
  teams: (account: string, org: string) => sharedPages<OrganizationTeam>(account, `${orgPath(org)}/teams`, "teams"),
  members: (account: string, org: string) => sharedPages<OrganizationPerson>(account, `${orgPath(org)}/members`, "members"),
};
export const sharedApi = {
  list: (account: string, org: string, view: SharedView) => sharedPages<SharedEntry>(account,
    `${orgPath(org)}/shared-items${view === "inbox" ? "/inbox" : view === "created" ? "/created-by-me" : ""}`, "items"),
  detail: (account: string, org: string, id: string) => sharedRequest<SharedEntry>(account, itemPath(org, id)),
  recipients: (account: string, org: string, id: string) => sharedPages<SharedRecipient>(account, `${itemPath(org, id)}/recipients`, "recipients"),
  create: (account: string, org: string, draft: SharedDraft, clientRequestId: string) => sharedRequest<SharedEntry>(account, `${orgPath(org)}/shared-items`, "POST", { ...draft, clientRequestId }),
  edit: (account: string, org: string, id: string, draft: Partial<Pick<SharedDraft, "title" | "description" | "schedule" | "targets">> & { recurrence?: SharedRecurrence }, expectedRevision: number) =>
    sharedRequest<SharedEntry>(account, itemPath(org, id), "PATCH", { ...draft, expectedRevision }),
  action: (account: string, org: string, id: string, action: "acknowledge" | "complete" | "cancel", expectedRevision: number, occurrenceKey?: string) =>
    sharedRequest<SharedEntry>(account, `${itemPath(org, id)}/${action}`, "POST", { expectedRevision, ...(occurrenceKey ? { occurrenceKey } : {}) }),
};

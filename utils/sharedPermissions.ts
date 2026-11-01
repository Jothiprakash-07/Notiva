import type { OrganizationEntry, SharedEntry, SharedItem, SharedTarget } from "../types/shared";
export function hasOrganizationPermission(org: OrganizationEntry | undefined, permission: string) {
  return !!org && (org.membership.role === "owner" || (org.membership.role === "admin" && org.membership.permissions.includes(permission)));
}
export function canCreateSharedItem(org?: OrganizationEntry) {
  return !!org && (hasOrganizationPermission(org, "create_shared_items") || (org.membership.role === "member" && org.organization.employeeSharingEnabled));
}
export function allowedTargetModes(org?: OrganizationEntry): SharedTarget["targetType"][] {
  return !canCreateSharedItem(org) ? [] : org!.membership.role === "member" ? ["user"] : ["organization", "team", "user"];
}
export function canEditSharedItem(org: OrganizationEntry | undefined, entry: SharedEntry, userId: string) {
  if (!org) return false;
  if (hasOrganizationPermission(org, "edit_shared_items")) return true;
  return org.membership.role === "member" && org.organization.employeeSharingEnabled && entry.item.createdByUserId === userId &&
    Array.isArray(entry.targets) && entry.targets.length > 0 && entry.targets.every(target => target.targetType === "user");
}
export function canInspectRecipients(org: OrganizationEntry | undefined, item: SharedItem, userId: string) {
  return item.createdByUserId === userId || hasOrganizationPermission(org, "edit_shared_items");
}
export function recipientActions(entry: SharedEntry): ("acknowledge" | "complete")[] {
  if (entry.item.recurrence?.repeat && entry.item.recurrence.repeat !== "none" && (!entry.occurrence || entry.occurrence.status === "completed")) return [];
  if (entry.item.status !== "active" || !entry.recipient || entry.recipient.accessStatus !== "active" || ["completed", "cancelled"].includes(entry.recipient.status)) return [];
  if (entry.item.type === "task") return ["complete"];
  if (entry.item.type === "event") return entry.recipient.status === "acknowledged" ? [] : ["acknowledge"];
  return entry.recipient.status === "acknowledged" ? ["complete"] : ["acknowledge", "complete"];
}
export function sharedDisplayStatus(entry: SharedEntry): string {
  if (entry.item.recurrence?.repeat && entry.item.recurrence.repeat !== "none") return entry.effectiveStatus ?? "inactive";
  if (entry.item.status !== "active") return entry.item.status;
  return entry.recipient?.status ?? "active";
}
export function completionSummary(entry: SharedEntry) {
  const rows = entry.recipientSummary?.filter(row => row.accessStatus === "active");
  if (!rows) return undefined;
  const total = rows.reduce((sum, row) => sum + row.count, 0), done = rows.filter(row => row.status === "completed").reduce((sum, row) => sum + row.count, 0);
  if (entry.item.recurrence?.repeat && entry.item.recurrence.repeat !== "none" && !entry.occurrence) return { total, done: 0, label: "No occurrence today" };
  return { total, done, label: entry.item.completionMode === "collective" ? (entry.occurrence?.status ?? entry.item.status) === "completed" ? "Completed for everyone" : "Waiting for one recipient" : `${done} of ${total} completed` };
}
export function toggleTarget(values: string[], id: string) { return values.includes(id) ? values.filter(value => value !== id) : [...values, id]; }

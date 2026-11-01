export const ORGANIZATION_PERMISSIONS = Object.freeze([
  "view_members", "manage_members", "manage_teams", "assign_team_members",
  "create_shared_items", "edit_shared_items", "view_reports",
  "view_organization_settings", "view_join_code", "approve_join_requests",
]);

export class OrganizationError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function fail(status, code, message) { throw new OrganizationError(status, code, message); }
export function validatePermissions(value) {
  if (!Array.isArray(value) || value.some(p => !ORGANIZATION_PERMISSIONS.includes(p))) {
    fail(400, "INVALID_PERMISSIONS", "Permissions must be an array from the organization permission allowlist.");
  }
  return [...new Set(value)];
}
export function hasPermission(membership, permission) {
  return membership?.status === "active" && (membership.role === "owner" ||
    (membership.role === "admin" && membership.permissions.includes(permission)));
}

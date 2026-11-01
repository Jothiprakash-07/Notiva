import Organization from "../models/Organization.js";
import OrganizationMember from "../models/OrganizationMember.js";
import { fail, hasPermission } from "./organizationPermissions.js";

export async function getOrganizationMembership(organizationId, userId, session = null) {
  return OrganizationMember.findOne({ organizationId, userId, status: "active" }).session(session);
}
export async function requireOrganizationMembership(organizationId, userId, session = null) {
  const membership = await getOrganizationMembership(organizationId, userId, session);
  if (!membership) fail(403, "ORGANIZATION_ACCESS_DENIED", "Active organization membership required.");
  return membership;
}
export function requireOrganizationOwner(membership, organization) {
  if (membership.role !== "owner" || String(organization.ownerUserId) !== String(membership.userId)) {
    fail(403, "OWNER_REQUIRED", "Only the primary Owner may perform this action.");
  }
}
export function requireOrganizationPermission(membership, permission) {
  if (!hasPermission(membership, permission)) fail(403, "PERMISSION_REQUIRED", `Organization permission required: ${permission}.`);
}
// Every mutation locks the same organization document, then reads authorization
// inside that transaction. Revocation/transfer and in-flight writes serialize.
export async function organizationAccess(organizationId, userId, session = null, lock = false) {
  const query = { _id: organizationId, status: "active" };
  const organization = lock
    ? await Organization.findOneAndUpdate(query, { $inc: { revision: 1 } }, { session, returnDocument: "after" })
    : await Organization.findOne(query).session(session);
  if (!organization) fail(404, "ORGANIZATION_NOT_FOUND", "Active organization not found.");
  const membership = await requireOrganizationMembership(organizationId, userId, session);
  return { organization, membership };
}

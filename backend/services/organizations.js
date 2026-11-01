import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import Organization from "../models/Organization.js";
import Member from "../models/OrganizationMember.js";
import JoinRequest from "../models/OrganizationJoinRequest.js";
import Team from "../models/Team.js";
import { revokeTeamMemberships } from "./teamMemberships.js";
import { revokeSharedRecipients } from "./sharedItemLifecycle.js";
import { organizationAccess, getOrganizationMembership, requireOrganizationOwner, requireOrganizationPermission } from "./organizationAuthorization.js";
import { fail, hasPermission, validatePermissions } from "./organizationPermissions.js";

export const normalizeJoinCode = value => typeof value === "string" ? value.trim().toUpperCase() : "";
export const generateJoinCode = () => `ORG-${randomBytes(6).toString("hex").toUpperCase()}`;
export function validId(value) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) fail(400, "INVALID_ID", "Use a valid organization, request or user ID.");
  return value;
}
export function organizationSummary(org, membership) {
  const result = { id: String(org._id), name: org.name, status: org.status, ownerUserId: String(org.ownerUserId),
    createdAt: org.createdAt, updatedAt: org.updatedAt, employeeSharingEnabled: Boolean(org.employeeSharingEnabled) };
  if (hasPermission(membership, "view_join_code")) Object.assign(result, { joinCode: org.joinCode, joinCodeVersion: org.joinCodeVersion });
  return result;
}
export const memberSummary = member => ({ organizationId: String(member.organizationId), userId: String(member.userId),
  role: member.role, permissions: member.permissions, status: member.status, joinedAt: member.joinedAt });

// No nontransactional fallback: a standalone MongoDB must fail closed.
export async function organizationTransaction(work) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await mongoose.connection.transaction(work, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    } catch (error) {
      if (error.code === 11000 && attempt < 4) continue;
      throw error;
    }
  }
}
function actorAudit(userId) { return { roleChangedAt: new Date(), roleChangedByUserId: userId }; }
function note(value) {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > 500) fail(400, "INVALID_NOTE", "Use an action note of at most 500 characters.");
  return value.trim();
}

export async function createOrganization(userId, input) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 100) fail(400, "INVALID_NAME", "Use an organization name of 1–100 characters.");
  const contact = {};
  // Preserve name-only API callers; registration supplies all contact fields.
  if (["email", "mobileNumber", "address"].some(key => input[key] !== undefined)) {
    for (const [key, limit] of [["email", 254], ["mobileNumber", 30], ["address", 500]]) {
      if (typeof input[key] !== "string" || !input[key].trim() || input[key].trim().length > limit) fail(400, "INVALID_ORGANIZATION_DETAILS", "Provide a valid email, mobile number and address.");
      contact[key] = input[key].trim();
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) fail(400, "INVALID_ORGANIZATION_EMAIL", "Enter a valid email address.");
    contact.email = contact.email.toLowerCase();
  }
  return organizationTransaction(async session => {
    const joinCode = generateJoinCode();
    const [organization] = await Organization.create([{ name, ...contact, normalizedName: name.toLowerCase(), organizationName: name,
      joinCode, organizationCode: joinCode, ownerUserId: userId, createdByUserId: userId, status: "active" }], { session });
    const [membership] = await Member.create([{ organizationId: organization._id, userId, role: "owner", permissions: [],
      status: "active", joinedAt: new Date(), ...actorAudit(userId) }], { session });
    return { organization: organizationSummary(organization, membership), membership: memberSummary(membership) };
  });
}

export async function requestToJoin(userId, rawCode) {
  const joinCode = normalizeJoinCode(rawCode);
  if (!/^ORG-[A-Z0-9]{6,32}$/.test(joinCode)) fail(400, "INVALID_JOIN_CODE", "Enter a valid organization join code.");
  return organizationTransaction(async session => {
    // Code match and lock happen together; regeneration invalidates new attempts.
    const organization = await Organization.findOneAndUpdate({ joinCode, status: "active" }, { $inc: { revision: 1 } }, { session, returnDocument: "after" });
    if (!organization) fail(404, "INVALID_JOIN_CODE", "Organization join code was not found.");
    const membership = await getOrganizationMembership(organization._id, userId, session);
    if (membership) return { alreadyMember: true, organization: organizationSummary(organization, membership), membership: memberSummary(membership) };
    let request = await JoinRequest.findOne({ organizationId: organization._id, requesterUserId: userId, status: "pending" }).session(session);
    if (!request) [request] = await JoinRequest.create([{ organizationId: organization._id, requesterUserId: userId,
      status: "pending", requestedAt: new Date(), codeVersion: organization.joinCodeVersion }], { session });
    return { request: { id: String(request._id), organizationId: String(organization._id), status: request.status, requestedAt: request.requestedAt } };
  });
}

export async function mutateOrganization(organizationId, userId, action, input = {}) {
  validId(organizationId);
  return organizationTransaction(async session => {
    const { organization, membership } = await organizationAccess(organizationId, userId, session, true);
    const owner = () => requireOrganizationOwner(membership, organization);
    const permission = p => requireOrganizationPermission(membership, p);
    const targetMember = async targetUserId => {
      validId(targetUserId);
      const target = await getOrganizationMembership(organizationId, targetUserId, session);
      if (!target) fail(404, "MEMBER_NOT_FOUND", "Active organization member not found.");
      return target;
    };
    const save = row => row.save({ session });
    if (action === "approve" || action === "reject") {
      permission("approve_join_requests"); validId(input.requestId);
      const request = await JoinRequest.findOne({ _id: input.requestId, organizationId }).session(session);
      if (!request) fail(404, "REQUEST_NOT_FOUND", "Join request not found in this organization.");
      const status = action === "approve" ? "approved" : "rejected";
      if (request.status === status) return { request }; // Preserve the original actor on retry.
      if (request.status !== "pending") fail(409, "REQUEST_ALREADY_ACTED", "Join request has already been decided.");
      const actionNote = note(input.actionNote);
      if (action === "approve") {
        let target = await Member.findOne({ organizationId, userId: request.requesterUserId }).session(session);
        if (!target) [target] = await Member.create([{ organizationId, userId: request.requesterUserId, role: "member",
          permissions: [], status: "active", joinedAt: new Date(), ...actorAudit(userId) }], { session });
        else if (target.status !== "active") {
          Object.assign(target, { role: "member", permissions: [], status: "active", joinedAt: new Date(),
            leftAt: undefined, removedAt: undefined, removedByUserId: undefined, ...actorAudit(userId) });
          await save(target);
        }
      }
      Object.assign(request, { status, action: status, actedByUserId: userId, actedAt: new Date(), actionNote });
      await save(request);
      return { request };
    }
    if (action === "role" || action === "permissions") {
      owner(); const target = await targetMember(input.targetUserId);
      if (target.role === "owner") fail(400, "USE_OWNERSHIP_TRANSFER", "Use ownership transfer to change the Owner.");
      if (action === "permissions" && target.role !== "admin") fail(400, "ADMIN_REQUIRED", "Target must be an active Admin.");
      const role = action === "permissions" ? "admin" : input.role;
      if (!["admin", "member"].includes(role)) fail(400, "INVALID_ROLE", "Role must be admin or member.");
      const permissions = role === "admin" ? validatePermissions(input.permissions) : [];
      if (role === "member" && input.permissions !== undefined && validatePermissions(input.permissions).length) fail(400, "INVALID_PERMISSIONS", "Members cannot have Admin permissions.");
      Object.assign(target, { role, permissions, ...actorAudit(userId) }); await save(target);
      return { membership: memberSummary(target) };
    }
    if (action === "remove" || action === "leave") {
      if (action === "remove") permission("manage_members");
      const target = action === "leave" ? membership : await targetMember(input.targetUserId);
      if (target.role === "owner") fail(409, "OWNERSHIP_TRANSFER_REQUIRED", "Owner must transfer ownership or delete the organization first.");
      // Admin management is reserved to the Owner, including removing an Admin.
      if (action === "remove" && target.role === "admin") owner();
      Object.assign(target, { status: action === "leave" ? "left" : "removed", permissions: [],
        ...(action === "leave" ? { leftAt: new Date() } : { removedAt: new Date(), removedByUserId: userId }) });
      await save(target);
      await revokeTeamMemberships({ organizationId, userId: target.userId }, userId, session);
      await revokeSharedRecipients(organizationId, userId, session, target.userId);
      return { membership: memberSummary(target) };
    }
    if (action === "transfer") {
      owner(); const target = await targetMember(input.targetUserId);
      if (String(target.userId) === String(userId)) fail(400, "ALREADY_OWNER", "Select a different active member.");
      const role = input.previousOwnerRole ?? "member";
      if (!["admin", "member"].includes(role)) fail(400, "INVALID_ROLE", "Previous Owner role must be admin or member.");
      const permissions = role === "admin" ? validatePermissions(input.permissions) : [];
      if (role === "member" && input.permissions !== undefined && validatePermissions(input.permissions).length) fail(400, "INVALID_PERMISSIONS", "Members cannot have Admin permissions.");
      // Release the unique owner index before promoting the target, inside the transaction.
      Object.assign(membership, { role, permissions, ...actorAudit(userId) }); await save(membership);
      Object.assign(target, { role: "owner", permissions: [], ...actorAudit(userId) }); await save(target);
      Object.assign(organization, { ownerUserId: target.userId, ownershipTransferredAt: new Date(), ownershipTransferredByUserId: userId });
      await save(organization);
      return { organization: organizationSummary(organization, membership), membership: memberSummary(membership) };
    }
    if (action === "regenerate") {
      owner();
      let nextCode;
      do { nextCode = generateJoinCode(); } while (nextCode === organization.joinCode);
      organization.joinCode = nextCode; organization.organizationCode = nextCode;
      organization.joinCodeVersion += 1; organization.joinCodeRegeneratedAt = new Date(); await save(organization);
      return { organization: organizationSummary(organization, membership) };
    }
    if (action === "sharingPolicy") {
      owner();
      if (Object.keys(input).length !== 1 || typeof input.employeeSharingEnabled !== "boolean") fail(400, "INVALID_SHARING_POLICY", "Provide employeeSharingEnabled as a boolean.");
      organization.employeeSharingEnabled = input.employeeSharingEnabled; await save(organization);
      return { organization: organizationSummary(organization, membership) };
    }
    if (action === "delete") {
      owner(); organization.status = "deleted"; organization.deletedAt = new Date(); await save(organization);
      await Member.updateMany({ organizationId, status: "active" }, { $set: { status: "removed", permissions: [], removedAt: new Date(), removedByUserId: userId } }, { session });
      await JoinRequest.updateMany({ organizationId, status: "pending" }, { $set: { status: "cancelled", action: "cancelled", actedAt: new Date(), actedByUserId: userId } }, { session });
      await revokeTeamMemberships({ organizationId }, userId, session);
      await Team.updateMany({ organizationId, status: "active" }, { $set: { status: "archived", archivedAt: new Date(), archivedByUserId: userId } }, { session });
      await revokeSharedRecipients(organizationId, userId, session);
      return { success: true };
    }
    fail(400, "INVALID_ACTION", "Unknown organization action.");
  });
}

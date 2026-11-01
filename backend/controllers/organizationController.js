import Organization from "../models/Organization.js";
import Member from "../models/OrganizationMember.js";
import JoinRequest from "../models/OrganizationJoinRequest.js";
import { organizationAccess, requireOrganizationPermission } from "../services/organizationAuthorization.js";
import { hasPermission, fail, ORGANIZATION_PERMISSIONS } from "../services/organizationPermissions.js";
import { createOrganization, requestToJoin, mutateOrganization, validId, organizationSummary, memberSummary } from "../services/organizations.js";

export const organizationEndpoint = handler => async (req, res) => {
  try { await handler(req, res); }
  catch (error) {
    if (error.status) return res.status(error.status).json({ code: error.code, message: error.message });
    if (error.code === 11000) return res.status(409).json({ code: "ORGANIZATION_CONFLICT", message: "Organization changed. Retry the request." });
    res.status(503).json({ code: "ORGANIZATION_UNAVAILABLE", message: "Organization service unavailable. Retry later." });
  }
};
const page = req => {
  const limit = Number(req.query?.limit ?? 50), offset = Number(req.query?.offset ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) fail(400, "INVALID_PAGE", "Use limit 1–100 and offset 0–100000.");
  return { limit, offset };
};
export const create = organizationEndpoint(async (req, res) => res.status(201).json(await createOrganization(req.user._id, req.body || {})));
export const permissionOptions = organizationEndpoint(async (req, res) => res.json({ permissions: ORGANIZATION_PERMISSIONS }));
export const join = organizationEndpoint(async (req, res) => res.json(await requestToJoin(req.user._id, req.body?.joinCode ?? req.body?.organizationCode)));
export const myRequests = organizationEndpoint(async (req, res) => {
  const { limit, offset } = page(req);
  const rows = await JoinRequest.find({ requesterUserId: req.user._id }).sort({ requestedAt: -1, _id: -1 }).skip(offset).limit(limit)
    .populate("organizationId", "name status").lean();
  res.json({ requests: rows.filter(row => row.organizationId?.status === "active").map(row => ({
    id: String(row._id), organizationId: String(row.organizationId._id), organizationName: row.organizationId.name,
    status: row.status, requestedAt: row.requestedAt, actedAt: row.actedAt,
  })), limit, offset });
});
export const list = organizationEndpoint(async (req, res) => {
  const { limit, offset } = page(req);
  const memberships = await Member.find({ userId: req.user._id, status: "active" }).sort({ _id: 1 }).skip(offset).limit(limit);
  const organizations = await Organization.find({ _id: { $in: memberships.map(m => m.organizationId) }, status: "active" });
  res.json({ organizations: organizations.map(org => {
    const membership = memberships.find(m => String(m.organizationId) === String(org._id));
    return { organization: organizationSummary(org, membership), membership: memberSummary(membership) };
  }), limit, offset });
});
export const detail = organizationEndpoint(async (req, res) => {
  const { organization, membership } = await organizationAccess(validId(req.params.organizationId), req.user._id);
  res.json({ organization: organizationSummary(organization, membership), membership: memberSummary(membership) });
});
export const code = organizationEndpoint(async (req, res) => {
  const { organization, membership } = await organizationAccess(validId(req.params.organizationId), req.user._id);
  requireOrganizationPermission(membership, "view_join_code");
  res.json({ joinCode: organization.joinCode, joinCodeVersion: organization.joinCodeVersion });
});
export const members = organizationEndpoint(async (req, res) => {
  const { membership } = await organizationAccess(validId(req.params.organizationId), req.user._id);
  const { limit, offset } = page(req);
  const rows = await Member.find({ organizationId: req.params.organizationId, status: "active" }).sort({ _id: 1 }).skip(offset).limit(limit)
    .populate("userId", "fullName notivaId").lean();
  const management = membership.role === "owner" || hasPermission(membership, "manage_members");
  res.json({ members: rows.map(row => ({ userId: String(row.userId?._id ?? ""),
    profile: row.userId ? { fullName: row.userId.fullName, notivaId: row.userId.notivaId } : null,
    role: row.role, joinedAt: row.joinedAt, ...(management ? { permissions: row.permissions,
      roleChangedAt: row.roleChangedAt, roleChangedByUserId: row.roleChangedByUserId } : {}) })), limit, offset });
});
export const requests = organizationEndpoint(async (req, res) => {
  const { membership } = await organizationAccess(validId(req.params.organizationId), req.user._id);
  requireOrganizationPermission(membership, "approve_join_requests");
  const { limit, offset } = page(req);
  const status = req.query?.status;
  if (status !== undefined && !["pending", "approved", "rejected", "cancelled"].includes(status)) fail(400, "INVALID_STATUS", "Invalid join request status.");
  const rows = await JoinRequest.find({ organizationId: req.params.organizationId, ...(status ? { status } : {}) })
    .sort({ requestedAt: -1, _id: -1 }).skip(offset).limit(limit)
    .populate("requesterUserId", "fullName notivaId").populate("actedByUserId", "fullName notivaId").lean();
  res.json({ requests: rows.map(row => ({ id: String(row._id), organizationId: String(row.organizationId),
    requesterUserId: row.requesterUserId ? String(row.requesterUserId._id) : null,
    requester: row.requesterUserId, status: row.status, requestedAt: row.requestedAt,
    action: row.action, actedAt: row.actedAt, actedByUserId: row.actedByUserId ? String(row.actedByUserId._id) : null,
    actedBy: row.actedByUserId, actionNote: row.actionNote })), limit, offset });
});
export const mutation = action => organizationEndpoint(async (req, res) => res.json(await mutateOrganization(
  req.params.organizationId, req.user._id, action, { ...(req.body || {}),
    ...(req.params.userId ? { targetUserId: req.params.userId } : {}),
    ...(req.params.requestId ? { requestId: req.params.requestId } : {}) })));

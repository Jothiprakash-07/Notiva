import mongoose from "mongoose";
import Team from "../models/Team.js";
import TeamMember from "../models/TeamMember.js";
import User from "../models/user.js";
import { organizationEndpoint } from "./organizationController.js";
import { organizationAccess, getOrganizationMembership } from "../services/organizationAuthorization.js";
import { fail } from "../services/organizationPermissions.js";
import { validId } from "../services/organizations.js";
import { mutateTeam, findOrganizationTeam, teamSummary, activeTeamMemberPipeline, teamMemberCounts } from "../services/teams.js";

const page = req => {
  const limit = Number(req.query?.limit ?? 50), offset = Number(req.query?.offset ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) fail(400, "INVALID_PAGE", "Use limit 1–100 and offset 0–100000.");
  return { limit, offset };
};
const access = req => organizationAccess(validId(req.params.organizationId), req.user._id);
export const teamMutation = action => organizationEndpoint(async (req, res) => {
  const input = action === "remove" ? { userId: req.params.userId } : req.body || {};
  const result = await mutateTeam(req.params.organizationId, req.user._id, action, req.params.teamId, input);
  res.status(action === "create" ? 201 : 200).json(result);
});
export const listTeams = organizationEndpoint(async (req, res) => {
  await access(req);
  const { limit, offset } = page(req), status = req.query?.status ?? "active";
  if (!["active", "archived"].includes(status)) fail(400, "INVALID_TEAM_STATUS", "Status must be active or archived.");
  const rows = await Team.find({ organizationId: req.params.organizationId, status }).sort({ _id: 1 }).skip(offset).limit(limit);
  const counts = await teamMemberCounts(req.params.organizationId, rows.map(row => row._id));
  const byTeam = new Map(counts.map(row => [String(row._id), row.count]));
  res.json({ teams: rows.map(row => ({ ...teamSummary(row), memberCount: byTeam.get(String(row._id)) ?? 0 })), limit, offset });
});
export const teamDetail = organizationEndpoint(async (req, res) => {
  await access(req);
  const team = await findOrganizationTeam(req.params.organizationId, req.params.teamId);
  const counts = await teamMemberCounts(req.params.organizationId, [team._id]);
  res.json({ team: { ...teamSummary(team), memberCount: counts[0]?.count ?? 0 } });
});
export const listTeamMembers = organizationEndpoint(async (req, res) => {
  await access(req);
  const team = await findOrganizationTeam(req.params.organizationId, req.params.teamId);
  const { limit, offset } = page(req);
  const rows = team.status !== "active" ? [] : await TeamMember.aggregate([
    ...activeTeamMemberPipeline(req.params.organizationId, { teamId: team._id }),
    { $sort: { _id: 1 } }, { $skip: offset }, { $limit: limit },
    { $lookup: { from: User.collection.name, localField: "userId", foreignField: "_id",
      pipeline: [{ $project: { fullName: 1, notivaId: 1 } }], as: "profile" } },
    { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, userId: 1, fullName: "$profile.fullName", notivaId: "$profile.notivaId",
      role: "$organizationMembership.role", assignedAt: 1 } },
  ]);
  res.json({ members: rows, limit, offset });
});
export const memberTeams = organizationEndpoint(async (req, res) => {
  const { membership } = await access(req);
  const userId = validId(req.params.userId);
  if (String(req.user._id) !== userId.toLowerCase() && !["owner", "admin"].includes(membership.role)) {
    fail(403, "ORGANIZATION_ACCESS_DENIED", "Members may only view their own team list.");
  }
  if (!await getOrganizationMembership(req.params.organizationId, userId)) fail(404, "MEMBER_NOT_FOUND", "Active organization member not found.");
  const { limit, offset } = page(req);
  const rows = await TeamMember.aggregate([
    { $match: { organizationId: new mongoose.Types.ObjectId(req.params.organizationId), userId: new mongoose.Types.ObjectId(userId), status: "active" } },
    { $lookup: { from: Team.collection.name, localField: "teamId", foreignField: "_id", pipeline: [
      { $match: { organizationId: new mongoose.Types.ObjectId(req.params.organizationId), status: "active" } },
    ], as: "team" } }, { $unwind: "$team" },
    { $sort: { teamId: 1 } }, { $skip: offset }, { $limit: limit },
  ]);
  res.json({ teams: rows.map(row => teamSummary(row.team)), limit, offset });
});

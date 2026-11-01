import mongoose from "mongoose";
import Team from "../models/Team.js";
import TeamMember from "../models/TeamMember.js";
import OrganizationMember from "../models/OrganizationMember.js";
import { organizationAccess, requireOrganizationPermission } from "./organizationAuthorization.js";
import { fail } from "./organizationPermissions.js";
import { organizationTransaction, validId } from "./organizations.js";
import { revokeTeamMemberships } from "./teamMemberships.js";

export const teamSummary = team => ({ id: String(team._id), organizationId: String(team.organizationId),
  name: team.name, description: team.description, status: team.status,
  createdByUserId: String(team.createdByUserId), createdAt: team.createdAt, updatedAt: team.updatedAt });
export const teamMemberSummary = row => ({ id: String(row._id), organizationId: String(row.organizationId),
  teamId: String(row.teamId), userId: String(row.userId), status: row.status,
  assignedByUserId: String(row.assignedByUserId), assignedAt: row.assignedAt,
  ...(row.removedAt ? { removedAt: row.removedAt, removedByUserId: String(row.removedByUserId) } : {}) });

function fields(input, allowed) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) {
    fail(400, "INVALID_TEAM_FIELDS", `Allowed fields: ${allowed.join(", ")}.`);
  }
}
export function teamName(value) {
  if (typeof value !== "string") fail(400, "INVALID_TEAM_NAME", "Enter a team name of 1–100 visible characters.");
  const name = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!name || name.length > 100 || /\p{C}|\p{Default_Ignorable_Code_Point}|\u2800/u.test(name) || !/[\p{L}\p{N}\p{P}\p{S}]/u.test(name)) {
    fail(400, "INVALID_TEAM_NAME", "Enter a team name of 1–100 visible characters without invisible control characters.");
  }
  const normalizedName = name.toLowerCase();
  if (normalizedName.length > 100) fail(400, "INVALID_TEAM_NAME", "Team name is too long after normalization.");
  return { name, normalizedName };
}
function description(value) {
  if (typeof value !== "string" || value.length > 1000) fail(400, "INVALID_TEAM_DESCRIPTION", "Description must be a string of at most 1000 characters.");
  return value.trim();
}
export async function findOrganizationTeam(organizationId, teamId, session = null) {
  validId(teamId);
  const team = await Team.findOne({ _id: teamId, organizationId }).session(session);
  if (!team) fail(404, "TEAM_NOT_FOUND", "Team not found in this organization.");
  return team;
}

export async function mutateTeam(organizationId, actorUserId, action, teamId = null, input = {}) {
  validId(organizationId);
  return organizationTransaction(async session => {
    const { membership } = await organizationAccess(organizationId, actorUserId, session, true);
    requireOrganizationPermission(membership, ["create", "edit", "archive"].includes(action) ? "manage_teams" : "assign_team_members");
    if (action === "create") {
      fields(input, ["name", "description"]);
      const values = { ...teamName(input.name), description: input.description === undefined ? "" : description(input.description) };
      if (await Team.exists({ organizationId, normalizedName: values.normalizedName, status: "active" }).session(session)) {
        fail(409, "TEAM_NAME_TAKEN", "An active team already uses this name.");
      }
      const [team] = await Team.create([{ organizationId, ...values, status: "active", createdByUserId: actorUserId }], { session });
      return { team: teamSummary(team) };
    }
    const team = await findOrganizationTeam(organizationId, teamId, session);
    if (action === "archive") {
      if (team.status !== "archived") {
        Object.assign(team, { status: "archived", archivedAt: new Date(), archivedByUserId: actorUserId });
        await team.save({ session });
      }
      await revokeTeamMemberships({ organizationId, teamId }, actorUserId, session);
      return { team: teamSummary(team) };
    }
    if (action === "remove") {
      fields(input, ["userId"]); validId(input.userId);
      await revokeTeamMemberships({ organizationId, teamId, userId: input.userId }, actorUserId, session);
      return { success: true }; // Idempotent; original removal actor/time survives retries.
    }
    if (team.status !== "active") fail(409, "TEAM_ARCHIVED", "Archived teams cannot be edited or accept assignments.");
    if (action === "edit") {
      fields(input, ["name", "description"]);
      if (!Object.keys(input).length) fail(400, "INVALID_TEAM_FIELDS", "Provide a name or description to update.");
      if (input.name !== undefined) {
        const values = teamName(input.name);
        if (await Team.exists({ organizationId, _id: { $ne: team._id }, normalizedName: values.normalizedName, status: "active" }).session(session)) {
          fail(409, "TEAM_NAME_TAKEN", "An active team already uses this name.");
        }
        Object.assign(team, values);
      }
      if (input.description !== undefined) team.description = description(input.description);
      await team.save({ session }); return { team: teamSummary(team) };
    }
    if (action === "assign" || action === "bulk") {
      fields(input, action === "bulk" ? ["userIds"] : ["userId"]);
      const values = action === "bulk" ? input.userIds : [input.userId];
      if (!Array.isArray(values) || !values.length || values.length > 100) fail(400, "INVALID_TEAM_USERS", "Provide 1–100 user IDs.");
      const userIds = [...new Set(values.map(id => validId(id).toLowerCase()))];
      const targets = await OrganizationMember.find({ organizationId, userId: { $in: userIds }, status: "active" }).session(session);
      if (targets.length !== userIds.length) fail(400, "ACTIVE_ORGANIZATION_MEMBER_REQUIRED", "Every target must be an active member of this organization.");
      const results = [];
      for (const userId of userIds) {
        let row = await TeamMember.findOne({ organizationId, teamId, userId }).session(session);
        if (!row) [row] = await TeamMember.create([{ organizationId, teamId, userId, status: "active", assignedAt: new Date(), assignedByUserId: actorUserId }], { session });
        else if (row.status !== "active") {
          Object.assign(row, { status: "active", assignedAt: new Date(), assignedByUserId: actorUserId, removedAt: undefined, removedByUserId: undefined });
          await row.save({ session });
        }
        results.push(teamMemberSummary(row));
      }
      return action === "bulk" ? { memberships: results } : { membership: results[0] };
    }
    fail(400, "INVALID_TEAM_ACTION", "Unknown team action.");
  });
}

// Read-side prerequisite defense: directory/counts never include an inactive org
// member, even if an imported/legacy row missed a historical cleanup.
export function activeTeamMemberPipeline(organizationId, extra = {}) {
  const orgId = new mongoose.Types.ObjectId(organizationId);
  return [
    { $match: { ...extra, organizationId: orgId, status: "active" } },
    { $lookup: { from: OrganizationMember.collection.name, let: { userId: "$userId" }, pipeline: [
      { $match: { organizationId: orgId, status: "active", $expr: { $eq: ["$userId", "$$userId"] } } },
      { $project: { role: 1 } },
    ], as: "organizationMembership" } },
    { $unwind: "$organizationMembership" },
  ];
}
export async function teamMemberCounts(organizationId, teamIds) {
  return TeamMember.aggregate([...activeTeamMemberPipeline(organizationId, { teamId: { $in: teamIds } }),
    { $group: { _id: "$teamId", count: { $sum: 1 } } }]);
}

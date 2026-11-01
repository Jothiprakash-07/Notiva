import TeamMember from "../models/TeamMember.js";

// Caller holds the organization lock and supplies its transaction session.
// Used by team archive, organization leave/removal and organization deletion.
export async function revokeTeamMemberships(filter, actorUserId, session) {
  return TeamMember.updateMany({ ...filter, status: "active" }, { $set: {
    status: "removed", removedByUserId: actorUserId, removedAt: new Date(),
  } }, { session });
}

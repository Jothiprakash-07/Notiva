import Organization from "../models/Organization.js";
import Member from "../models/OrganizationMember.js";
import JoinRequest from "../models/OrganizationJoinRequest.js";
import Team from "../models/Team.js";
import TeamMember from "../models/TeamMember.js";
import SharedItem from "../models/OrganizationItem.js";
import SharedTarget from "../models/OrganizationItemTarget.js";
import SharedRecipient from "../models/OrganizationItemRecipient.js";
export async function prepareOrganizationIndexes() {
  for (const model of [Organization, Member, JoinRequest, Team, TeamMember, SharedItem, SharedTarget, SharedRecipient]) {
    for (const [keys, options] of model.schema.indexes()) await model.collection.createIndex(keys, options);
  }
}

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Team from "../models/Team.js";
import TeamMember from "../models/TeamMember.js";
import OrganizationMember from "../models/OrganizationMember.js";
import User from "../models/user.js";
import { teamFixture } from "./teamFixture.js";

test("team foundation against isolated MongoDB replica set", { timeout: 120000 }, async t => {
  const { api, raw, ids, a, b, base, join, permissions } = await teamFixture(t);
  const root = `${base}/${a.id}`, teams = `${root}/teams`;
  const assign = (actor, teamId, target, expected = 200) => api(actor, "POST", `${teams}/${teamId}/members`, { userId: ids[target] }, expected);
  const remove = (actor, teamId, target) => api(actor, "DELETE", `${teams}/${teamId}/members/${ids[target]}`);
  let sales, design, development, foreign;
  await t.test("team endpoints require authentication", async () => {
    await api(null, "GET", teams, undefined, 401);
    await api(null, "POST", teams, { name: "Sales" }, 401);
  });
  await t.test("Owner creates team with normalized name and creator audit", async () => {
    sales = (await api(0, "POST", teams, { name: " Sales ", description: "Sales staff" }, 201)).team;
    assert.equal(sales.name, "Sales"); assert.equal(sales.organizationId, a.id);
    assert.equal(sales.createdByUserId, ids[0]);
    assert.equal((await Team.findById(sales.id)).normalizedName, "sales");
  });
  await t.test("manage_teams Admin creates team", async () => {
    design = (await api(2, "POST", teams, { name: "Design" }, 201)).team;
    assert.equal(design.createdByUserId, ids[2]);
  });
  await t.test("Admin without manage_teams cannot create, edit or archive", async () => {
    await api(3, "POST", teams, { name: "No access" }, 403);
    await api(3, "PATCH", `${teams}/${sales.id}`, { name: "Blocked" }, 403);
    await api(3, "DELETE", `${teams}/${sales.id}`, undefined, 403);
  });
  await t.test("Member cannot create or edit teams", async () => {
    await api(4, "POST", teams, { name: "No access" }, 403);
    await api(4, "PATCH", `${teams}/${sales.id}`, { description: "Blocked" }, 403);
  });
  await t.test("duplicate active names trim/case/Unicode normalized and protected by unique index", async () => {
    for (const name of ["sales", " SALES ", "Ｓａｌｅｓ"]) {
      const result = await api(0, "POST", teams, { name }, 409); assert.equal(result.code, "TEAM_NAME_TAKEN");
    }
    await assert.rejects(Team.create({ organizationId: a.id, name: "Sales", normalizedName: "sales", createdByUserId: ids[0] }), e => e.code === 11000);
  });
  await t.test("same name allowed in another organization", async () => {
    foreign = (await api(5, "POST", `${base}/${b.id}/teams`, { name: "Sales" }, 201)).team;
  });
  await t.test("invalid invisible/empty/oversize names and descriptions rejected", async () => {
    for (const name of ["", " \t\n ", "\u200b", "\u3164", "\u2800", "\u0301", "a".repeat(101), 123]) {
      await api(0, "POST", teams, { name }, 400);
    }
    await api(0, "POST", teams, { name: "Valid", description: "x".repeat(1001) }, 400);
    await api(0, "POST", teams, { name: "Valid", organizationId: b.id }, 400);
  });
  await t.test("team list and detail scoped to org; safe counts and pagination", async () => {
    const listed = await api(4, "GET", teams);
    assert.deepEqual(new Set(listed.teams.map(row => row.id)), new Set([sales.id, design.id]));
    assert.ok(listed.teams.every(row => row.memberCount === 0 && row.normalizedName === undefined));
    const detail = (await api(4, "GET", `${teams}/${sales.id}`)).team;
    assert.equal(detail.memberCount, 0); assert.equal(detail.name, "Sales");
    assert.equal((await api(4, "GET", `${teams}?limit=1`)).teams.length, 1);
    await api(4, "GET", `${teams}?limit=101`, undefined, 400);
    await api(4, "GET", `${teams}/invalid`, undefined, 400);
  });
  await t.test("Owner edits team; organizationId immutable; duplicate rename rejected", async () => {
    const edited = await api(0, "PATCH", `${teams}/${sales.id}`, { description: " Updated " });
    assert.equal(edited.team.description, "Updated");
    await api(0, "PATCH", `${teams}/${sales.id}`, { organizationId: b.id }, 400);
    await api(0, "PATCH", `${teams}/${sales.id}`, { name: " DESIGN " }, 409);
    await api(0, "PATCH", `${teams}/${sales.id}`, {}, 400);
  });
  await t.test("manage_teams Admin edits; name normalization collapses internal whitespace", async () => {
    const edited = await api(2, "PATCH", `${teams}/${design.id}`, { name: " Product   Design " });
    assert.equal(edited.team.name, "Product Design");
    development = (await api(0, "POST", teams, { name: "Development" }, 201)).team;
  });
  await t.test("Owner assigns active organization member with assignment audit", async () => {
    const result = (await assign(0, sales.id, 4)).membership;
    assert.equal(result.organizationId, a.id); assert.equal(result.assignedByUserId, ids[0]); assert.ok(result.assignedAt);
    assert.equal(result.status, "active");
  });
  await t.test("assign_team_members Admin assigns; manage_teams alone cannot assign or remove", async () => {
    await assign(3, design.id, 4);
    await assign(2, development.id, 4, 403);
    await api(2, "DELETE", `${teams}/${design.id}/members/${ids[4]}`, undefined, 403);
    await assign(3, development.id, 4);
  });
  await t.test("Member cannot self-select a team or remove themselves", async () => {
    await assign(4, sales.id, 4, 403);
    await api(4, "DELETE", `${teams}/${sales.id}/members/${ids[4]}`, undefined, 403);
  });
  await t.test("left, removed, outsider and other-org-only targets cannot be assigned", async () => {
    for (const target of [7, 8, 9, 6]) await assign(0, sales.id, target, 400);
    await api(0, "POST", `${teams}/${sales.id}/members`, { userId: "invalid" }, 400);
  });
  await t.test("one employee belongs to Sales, Design and Development simultaneously", async () => {
    const result = await api(4, "GET", `${root}/members/${ids[4]}/teams`);
    assert.deepEqual(new Set(result.teams.map(team => team.id)), new Set([sales.id, design.id, development.id]));
  });
  await t.test("duplicate assignment is idempotent with original actor/time and one logical row", async () => {
    const first = await TeamMember.findOne({ teamId: sales.id, userId: ids[4] }).lean();
    await assign(3, sales.id, 4);
    const next = await TeamMember.findOne({ teamId: sales.id, userId: ids[4] }).lean();
    assert.equal(+next.assignedAt, +first.assignedAt); assert.equal(String(next.assignedByUserId), ids[0]);
    assert.equal(await TeamMember.countDocuments({ teamId: sales.id, userId: ids[4] }), 1);
    await assert.rejects(TeamMember.create({ organizationId: a.id, teamId: sales.id, userId: ids[4], status: "active", assignedByUserId: ids[0], assignedAt: new Date() }), e => e.code === 11000);
  });
  await t.test("team member directory returns safe profiles and current org role", async () => {
    const directory = await api(4, "GET", `${teams}/${sales.id}/members`);
    assert.equal(directory.members.length, 1); assert.equal(directory.members[0].userId, ids[4]);
    assert.equal(directory.members[0].role, "member"); assert.equal(directory.members[0].notivaId, "team_person_4");
    for (const field of ["recoveryEmail", "email", "mobileNumber", "password", "permissions"]) assert.equal(directory.members[0][field], undefined);
    assert.equal((await api(4, "GET", `${teams}/${sales.id}`)).team.memberCount, 1);
  });
  await t.test("member team list allowed for self, Owner and Admin; other members denied", async () => {
    for (const viewer of [0, 1, 2, 3, 4]) assert.equal((await api(viewer, "GET", `${root}/members/${ids[4]}/teams`)).teams.length, 3);
    await api(4, "GET", `${root}/members/${ids[1]}/teams`, undefined, 403);
  });
  await t.test("remove from Sales leaves Design/Development and organization membership active", async () => {
    await remove(3, sales.id, 4);
    const row = await TeamMember.findOne({ teamId: sales.id, userId: ids[4] }).lean();
    assert.equal(row.status, "removed"); assert.equal(String(row.removedByUserId), ids[3]); assert.ok(row.removedAt);
    await remove(0, sales.id, 4); assert.equal(+(await TeamMember.findById(row._id)).removedAt, +row.removedAt);
    assert.equal((await api(4, "GET", `${root}/members/${ids[4]}/teams`)).teams.length, 2);
    assert.equal((await OrganizationMember.findOne({ organizationId: a.id, userId: ids[4] })).status, "active");
    await assign(0, sales.id, 4);
    const restored = await TeamMember.findById(row._id);
    assert.equal(restored.status, "active"); assert.equal(restored.removedAt, undefined);
    assert.equal(String(restored.assignedByUserId), ids[0]);
  });
  await t.test("bulk assignment validates every target and applies atomically", async () => {
    await api(0, "POST", `${teams}/${sales.id}/members/bulk`, { userIds: [ids[1], ids[6]] }, 400);
    assert.equal(await TeamMember.countDocuments({ teamId: sales.id, userId: ids[1] }), 0);
    const result = await api(3, "POST", `${teams}/${sales.id}/members/bulk`, { userIds: [ids[1], ids[2], ids[1]] });
    assert.equal(result.memberships.length, 2);
    await api(2, "POST", `${teams}/${sales.id}/members/bulk`, { userIds: [ids[3]] }, 403);
    for (const userIds of [[], "invalid", Array(101).fill(ids[1])]) await api(0, "POST", `${teams}/${sales.id}/members/bulk`, { userIds }, 400);
  });
  await t.test("failed bulk write rolls back prior assignments", async () => {
    const original = TeamMember.create;
    TeamMember.create = async function(rows, options) {
      if (String(rows[0].userId) === ids[3]) throw new Error("injected second assignment failure");
      return original.call(this, rows, options);
    };
    try { await api(0, "POST", `${teams}/${development.id}/members/bulk`, { userIds: [ids[1], ids[3]] }, 503); }
    finally { TeamMember.create = original; }
    assert.equal(await TeamMember.countDocuments({ teamId: development.id, userId: { $in: [ids[1], ids[3]] } }), 0);
  });
  await t.test("cross-org access and mismatched team/organization IDs disclose no team details", async () => {
    await api(1, "GET", `${base}/${b.id}/teams`, undefined, 403);
    await api(1, "GET", `${base}/${b.id}/teams/${foreign.id}`, undefined, 403);
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const response = await api(0, method, `${base}/${b.id}/teams/${sales.id}`, method === "PATCH" ? { name: "Leak" } : undefined, method === "GET" ? 404 : 403);
      assert.equal(response.team, undefined);
    }
    await api(0, "GET", `${teams}/${foreign.id}`, undefined, 404);
    await api(0, "POST", `${teams}/${foreign.id}/members`, { userId: ids[4] }, 404);
    await api(0, "GET", `${teams}/${foreign.id}/members`, undefined, 404);
    await api(0, "GET", `${root}/members/${ids[6]}/teams`, undefined, 404);
  });
  await t.test("other-org target is assignable only after joining this organization", async () => {
    await assign(0, sales.id, 6, 400); await join(6); await assign(0, sales.id, 6);
    assert.equal(await TeamMember.countDocuments({ organizationId: a.id, teamId: sales.id, userId: ids[6], status: "active" }), 1);
  });
  await t.test("two authorized Admins assigning simultaneously produce one active row", async () => {
    await Promise.all([assign(1, development.id, 1), assign(3, development.id, 1)]);
    assert.equal(await TeamMember.countDocuments({ teamId: development.id, userId: ids[1], status: "active" }), 1);
  });
  await t.test("assign versus remove races serialize to a valid final state", async () => {
    await Promise.all([assign(1, design.id, 6), remove(3, design.id, 6)]);
    const rows = await TeamMember.find({ teamId: design.id, userId: ids[6] }).lean();
    assert.equal(rows.length, 1); assert.ok(["active", "removed"].includes(rows[0].status));
    if (rows[0].status === "removed") { assert.ok(rows[0].removedAt); assert.equal(String(rows[0].removedByUserId), ids[3]); }
    await remove(0, design.id, 6); assert.equal((await TeamMember.findById(rows[0]._id)).status, "removed");
  });
  await t.test("permission loss and demotion take effect with the same session token", async () => {
    await permissions(1, []);
    await api(1, "POST", teams, { name: "Blocked now" }, 403); await assign(1, sales.id, 3, 403);
    await permissions(1, ["manage_teams", "assign_team_members"]);
    await assign(1, sales.id, 3);
    await api(0, "PATCH", `${root}/members/${ids[1]}/role`, { role: "member" });
    await assign(1, sales.id, 3, 403);
    await permissions(1, ["manage_teams", "assign_team_members"]);
  });
  await t.test("archive deactivates team links and preserves organization members/history", async () => {
    const archived = await api(2, "DELETE", `${teams}/${design.id}`);
    assert.equal(archived.team.status, "archived");
    assert.equal(await TeamMember.countDocuments({ teamId: design.id, status: "active" }), 0);
    assert.ok(await TeamMember.countDocuments({ teamId: design.id, status: "removed" }));
    assert.equal((await OrganizationMember.findOne({ organizationId: a.id, userId: ids[4] })).status, "active");
    assert.ok(!(await api(4, "GET", teams)).teams.some(row => row.id === design.id));
    assert.equal((await api(4, "GET", `${teams}?status=archived`)).teams[0].id, design.id);
    assert.equal((await api(4, "GET", `${teams}/${design.id}/members`)).members.length, 0);
    assert.ok(!(await api(4, "GET", `${root}/members/${ids[4]}/teams`)).teams.some(row => row.id === design.id));
    await api(0, "DELETE", `${teams}/${design.id}`); // Retry safe.
  });
  await t.test("archived team rejects assignment, bulk assignment and edits; name can be reused", async () => {
    await assign(0, design.id, 4, 409);
    await api(0, "POST", `${teams}/${design.id}/members/bulk`, { userIds: [ids[4]] }, 409);
    await api(0, "PATCH", `${teams}/${design.id}`, { name: "Changed" }, 409);
    await api(0, "POST", teams, { name: "Product Design" }, 201);
  });
  await t.test("org member removal cleans all this-org team memberships, preserves other-org teams and personal data", async () => {
    await assign(0, development.id, 6);
    await api(5, "POST", `${base}/${b.id}/teams/${foreign.id}/members`, { userId: ids[6] });
    const before = await User.findById(ids[6]).lean();
    const items = mongoose.connection.collection("items"); await items.insertOne({ ownerUserId: new mongoose.Types.ObjectId(ids[6]), marker: "personal" });
    await api(0, "DELETE", `${root}/members/${ids[6]}`);
    assert.equal(await TeamMember.countDocuments({ organizationId: a.id, userId: ids[6], status: "active" }), 0);
    assert.equal(await TeamMember.countDocuments({ organizationId: b.id, userId: ids[6], status: "active" }), 1);
    assert.deepEqual(await User.findById(ids[6]).lean(), before);
    assert.equal(await items.countDocuments({ ownerUserId: new mongoose.Types.ObjectId(ids[6]) }), 1);
  });
  await t.test("rejoining organization never restores previous teams", async () => {
    await join(6); assert.equal((await api(6, "GET", `${root}/members/${ids[6]}/teams`)).teams.length, 0);
    await assign(0, sales.id, 6); assert.equal((await api(6, "GET", `${root}/members/${ids[6]}/teams`)).teams.length, 1);
  });
  await t.test("Member self-leave deactivates all team links with actor/time", async () => {
    await assign(0, development.id, 4);
    await api(4, "POST", `${root}/leave`, {});
    assert.equal(await TeamMember.countDocuments({ organizationId: a.id, userId: ids[4], status: "active" }), 0);
    const removed = await TeamMember.findOne({ organizationId: a.id, teamId: sales.id, userId: ids[4] });
    assert.equal(String(removed.removedByUserId), ids[4]); assert.ok(removed.removedAt);
    await api(4, "GET", teams, undefined, 403);
  });
  await t.test("Admin self-leave through legacy ID alias cleans team links", async () => {
    await assign(0, sales.id, 2);
    await api(2, "POST", "/api/auth/leave-organization", { organizationId: a.id });
    assert.equal(await TeamMember.countDocuments({ organizationId: a.id, userId: ids[2], status: "active" }), 0);
  });
  await t.test("team cleanup failure rolls back organization leave and archive", async () => {
    const original = TeamMember.updateMany;
    TeamMember.updateMany = async () => { throw new Error("injected cleanup failure"); };
    try {
      await api(1, "POST", `${root}/leave`, {}, 503);
      await api(0, "DELETE", `${teams}/${sales.id}`, undefined, 503);
    } finally { TeamMember.updateMany = original; }
    assert.equal((await OrganizationMember.findOne({ organizationId: a.id, userId: ids[1] })).status, "active");
    assert.equal((await Team.findById(sales.id)).status, "active");
    assert.ok(await TeamMember.countDocuments({ teamId: sales.id, status: "active" }));
  });
  await t.test("assignment versus organization removal cannot leave active dangling team links", async () => {
    const outcomes = await Promise.all([
      raw(1, "POST", `${teams}/${development.id}/members`, { userId: ids[6] }),
      raw(0, "DELETE", `${root}/members/${ids[6]}`),
    ]);
    assert.equal(outcomes[1].status, 200); assert.ok([200, 400].includes(outcomes[0].status));
    assert.equal(await TeamMember.countDocuments({ organizationId: a.id, userId: ids[6], status: "active" }), 0);
  });
  await t.test("ownership transfer preserves team links and changes authority immediately", async () => {
    await assign(0, sales.id, 0); await assign(0, sales.id, 1);
    const before = await TeamMember.find({ organizationId: a.id }).sort({ _id: 1 }).lean();
    await api(0, "POST", `${root}/transfer-ownership`, { targetUserId: ids[1] });
    assert.deepEqual(await TeamMember.find({ organizationId: a.id }).sort({ _id: 1 }).lean(), before);
    await api(0, "POST", teams, { name: "Old Owner blocked" }, 403);
    await api(1, "POST", teams, { name: "New Owner authority" }, 201);
    await assign(1, development.id, 0);
  });
  await t.test("organization deletion archives teams and revokes links without affecting other orgs", async () => {
    await api(1, "DELETE", root);
    assert.equal(await Team.countDocuments({ organizationId: a.id, status: "active" }), 0);
    assert.equal(await TeamMember.countDocuments({ organizationId: a.id, status: "active" }), 0);
    assert.equal((await Team.findById(foreign.id)).status, "active");
    assert.equal(await TeamMember.countDocuments({ organizationId: b.id, status: "active" }), 1);
  });
});

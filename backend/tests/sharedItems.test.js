import test from "node:test";
import assert from "node:assert/strict";
import SharedItem from "../models/OrganizationItem.js";
import Target from "../models/OrganizationItemTarget.js";
import Recipient from "../models/OrganizationItemRecipient.js";
import Item from "../models/Item.js";
import User from "../models/user.js";
import { teamFixture } from "./teamFixture.js";

test("shared organization items against isolated MongoDB replica set", { timeout: 120000 }, async t => {
  const { api, raw, ids, a, b, base, join, permissions } = await teamFixture(t);
  const root = `${base}/${a.id}`, shared = `${root}/shared-items`;
  const userTarget = user => ({ targetType: "user", targetId: ids[user] });
  const schedule = { startAt: "2030-11-01T09:00:00+05:30" };
  const content = { type: "reminder", title: "Shared planning", schedule, targets: [userTarget(4)] };
  const create = (actor, input = {}, status = 201) => api(actor, "POST", shared, { ...content, ...input }, status);
  const detail = (actor, item, status = 200) => api(actor, "GET", `${shared}/${item.id}`, undefined, status);
  const edit = (actor, item, input, status = 200) => api(actor, "PATCH", `${shared}/${item.id}`, input, status);
  const action = (actor, item, value, expectedRevision = 1, status = 200) => api(actor, "POST", `${shared}/${item.id}/${value}`, { expectedRevision }, status);
  const sales = (await api(0, "POST", `${root}/teams`, { name: "Sales" }, 201)).team;
  const design = (await api(0, "POST", `${root}/teams`, { name: "Design" }, 201)).team;
  const foreign = (await api(5, "POST", `${base}/${b.id}/teams`, { name: "Sales" }, 201)).team;
  for (const user of [3, 4]) await api(0, "POST", `${root}/teams/${sales.id}/members`, { userId: ids[user] });
  for (const user of [1, 4]) await api(0, "POST", `${root}/teams/${design.id}/members`, { userId: ids[user] });
  const personal = await Item.create({ ownerUserId: ids[4], clientItemId: "personal-kept-separate", type: "task", title: "Personal", description: "",
    repeat: "none", startAt: schedule.startAt, notificationIds: [], createdAt: "2026-10-22T09:00:00Z", updatedAt: "2026-10-22T09:00:00Z" });
  const personalBefore = JSON.stringify(await Item.findById(personal._id).lean()), userBefore = JSON.stringify(await User.findById(ids[4]).lean());
  let orgItem, teamItem, overlapItem, selectedItem, creatorItem, collectiveItem;

  await t.test("authentication required and unsupported Birthday/recurrence rejected", async () => {
    await create(null, {}, 401); await create(0, { type: "birthday" }, 400);
    const result = await create(0, { recurrence: { repeat: "daily" } }, 400);
    assert.equal(result.code, "INVALID_SHARED_RECURRENCE");
    await create(0, { completionMode: "collective" }, 400);
    await create(0, { type: "task", completionMode: "collective", collectiveRule: "all" }, 400);
  });
  await t.test("Owner creates organization-wide reminder with active membership snapshot", async () => {
    const result = await create(0, { targets: [{ targetType: "organization" }] }); orgItem = result.item;
    assert.equal(result.recipientCount, 5); assert.equal(orgItem.createdByUserId, ids[0]);
    assert.equal(orgItem.serverRevision, 1); assert.equal(orgItem.recurrence.repeat, "none");
    assert.deepEqual(new Set((await Recipient.find({ organizationItemId: orgItem.id })).map(r => String(r.userId))), new Set([0, 1, 2, 3, 4].map(i => ids[i])));
  });
  await t.test("Owner targets one team", async () => {
    const result = await create(0, { targets: [{ targetType: "team", targetId: sales.id }] }); teamItem = result.item;
    assert.equal(result.recipientCount, 2);
  });
  await t.test("multiple teams dedupe overlap and duplicate targets; snapshot source audit retained", async () => {
    const result = await create(0, { targets: [
      { targetType: "team", targetId: sales.id }, { targetType: "team", targetId: design.id },
      { targetType: "team", targetId: sales.id.toUpperCase() }, userTarget(4), userTarget(4),
    ] }); overlapItem = result.item;
    assert.equal(result.recipientCount, 3); assert.equal(result.targets.length, 3);
    assert.equal(await Recipient.countDocuments({ organizationItemId: overlapItem.id, userId: ids[4] }), 1);
    assert.equal((await Recipient.findOne({ organizationItemId: overlapItem.id, userId: ids[4] })).sourceTargetIds.length, 3);
  });
  await t.test("Owner targets selected employees", async () => {
    selectedItem = (await create(0, { targets: [userTarget(3), userTarget(4)] })).item;
    assert.equal(await Recipient.countDocuments({ organizationItemId: selectedItem.id }), 2);
  });
  await t.test("foreign teams/users, inactive users and mixed target arrays fail without partial writes", async () => {
    for (const targets of [[{ targetType: "team", targetId: foreign.id }], [userTarget(6)], [userTarget(7)], [userTarget(8)],
      [userTarget(4), { targetType: "team", targetId: foreign.id }]]) {
      const response = await create(0, { title: "Invalid cross-org", targets }, 400);
      assert.equal(response.code, "INVALID_SHARED_TARGETS");
    }
    assert.equal(await SharedItem.countDocuments({ title: "Invalid cross-org" }), 0);
    await create(0, { targets: [{ targetType: "organization", targetId: b.id }] }, 400);
  });
  await t.test("Admin requires create_shared_items; policy does not bypass missing Admin permissions", async () => {
    await create(1, {}, 403);
    await permissions(1, ["manage_teams", "assign_team_members", "create_shared_items"]);
    const item = (await create(1)).item;
    await edit(1, item, { title: "No edit permission", expectedRevision: 1 }, 403);
    await permissions(1, ["manage_teams", "assign_team_members", "create_shared_items", "edit_shared_items"]);
    assert.equal((await edit(1, item, { title: "Allowed", expectedRevision: 1 })).item.title, "Allowed");
    await create(2, {}, 403);
  });
  await t.test("member sharing defaults disabled; Owner explicitly enables selected-employee sharing", async () => {
    assert.equal((await create(4, {}, 403)).code, "EMPLOYEE_SHARING_DISABLED");
    await api(1, "PATCH", `${root}/sharing-policy`, { employeeSharingEnabled: true }, 403);
    await api(0, "PATCH", `${root}/sharing-policy`, { employeeSharingEnabled: "true" }, 400);
    await api(0, "PATCH", `${root}/sharing-policy`, { employeeSharingEnabled: true });
    creatorItem = (await create(4, { targets: [userTarget(3)] })).item;
    assert.equal(creatorItem.createdByUserId, ids[4]);
  });
  await t.test("member cannot target teams or entire organization even with sharing enabled", async () => {
    await create(4, { targets: [{ targetType: "team", targetId: sales.id }] }, 403);
    await create(4, { targets: [{ targetType: "organization" }] }, 403);
    await create(4, { targets: [userTarget(6)] }, 400);
    await create(2, {}, 403);
  });
  await t.test("new team/org member never receives historical snapshots", async () => {
    await join(6);
    await api(0, "POST", `${root}/teams/${sales.id}/members`, { userId: ids[6] });
    assert.equal(await Recipient.countDocuments({ organizationItemId: teamItem.id, userId: ids[6] }), 0);
    assert.equal(await Recipient.countDocuments({ organizationItemId: orgItem.id, userId: ids[6] }), 0);
    const next = await create(0, { targets: [{ targetType: "team", targetId: sales.id }] });
    assert.equal(next.recipientCount, 3);
  });
  await t.test("recipient inbox, created-by-me and organization management lists enforce independent scopes", async () => {
    const inbox = await api(4, "GET", `${shared}/inbox`);
    assert.ok(inbox.items.some(row => row.item.id === teamItem.id));
    assert.ok(inbox.items.every(row => row.recipient.userId === ids[4]));
    assert.ok((await api(4, "GET", `${shared}/created-by-me`)).items.every(row => row.item.createdByUserId === ids[4]));
    await api(4, "GET", shared, undefined, 403); await api(2, "GET", shared, undefined, 403);
    assert.ok((await api(1, "GET", shared)).items.length);
    assert.equal((await api(4, "GET", `${shared}/inbox?limit=1`)).items.length, 1);
    await api(4, "GET", `${shared}/inbox?status=invalid`, undefined, 400);
  });
  await t.test("detail allows creator, recipient, Owner and authorized Admin; denies unrelated members", async () => {
    for (const actor of [0, 1, 3, 4]) await detail(actor, creatorItem);
    await detail(2, creatorItem, 403); await detail(6, creatorItem, 403);
    const recipient = await detail(3, creatorItem);
    assert.equal(recipient.recipientSummary, undefined); assert.deepEqual(recipient.targets, { user: 1 });
    assert.equal(recipient.recipient.userId, ids[3]);
    const management = await detail(4, creatorItem); assert.ok(management.recipientSummary); assert.equal(management.targets.length, 1);
  });
  await t.test("per-recipient inspection restricted; safe profiles and audit available to creator/Owner/Admin", async () => {
    await api(3, "GET", `${shared}/${creatorItem.id}/recipients`, undefined, 403);
    for (const actor of [0, 1, 4]) {
      const rows = (await api(actor, "GET", `${shared}/${creatorItem.id}/recipients`)).recipients;
      assert.equal(rows[0].userId, ids[3]); assert.equal(rows[0].profile.notivaId, "team_person_3");
      for (const key of ["email", "mobileNumber", "recoveryEmail", "password"]) assert.equal(rows[0].profile[key], undefined);
    }
  });
  await t.test("recipient cannot edit content, target definitions, schedule or cancel item", async () => {
    await edit(3, creatorItem, { title: "Blocked", expectedRevision: 1 }, 403);
    await action(3, creatorItem, "cancel", 1, 403);
    await edit(0, creatorItem, { targets: [], expectedRevision: 1 }, 400);
    await edit(0, creatorItem, { type: "task", expectedRevision: 1 }, 400);
  });
  await t.test("creator edit and stale revision conflict; authorized Admin can edit another creator's item", async () => {
    const result = await edit(4, creatorItem, { title: "Creator update", expectedRevision: 1 });
    assert.equal(result.item.serverRevision, 2);
    await edit(4, creatorItem, { title: "Stale", expectedRevision: 1 }, 409);
    const next = await edit(1, creatorItem, { description: "Admin update", expectedRevision: 2 });
    assert.equal(next.item.serverRevision, 3);
    await edit(4, creatorItem, { title: "Missing revision" }, 400);
  });
  await t.test("policy disabled immediately stops Member creation/edit/cancel but preserves Owner management", async () => {
    await api(0, "PATCH", `${root}/sharing-policy`, { employeeSharingEnabled: false });
    await create(4, {}, 403); await edit(4, creatorItem, { title: "Blocked", expectedRevision: 3 }, 403);
    await action(4, creatorItem, "cancel", 3, 403);
    await detail(4, creatorItem);
    await edit(0, creatorItem, { title: "Owner retained authority", expectedRevision: 3 });
    await api(0, "PATCH", `${root}/sharing-policy`, { employeeSharingEnabled: true });
  });
  await t.test("two creator edits with same revision have one success and one conflict", async () => {
    const item = (await create(4)).item;
    const outcomes = await Promise.all(["A", "B"].map(title => raw(4, "PATCH", `${shared}/${item.id}`, { title, expectedRevision: 1 })));
    assert.deepEqual(outcomes.map(row => row.status).sort(), [200, 409]);
    assert.equal((await SharedItem.findById(item.id)).serverRevision, 2);
  });
  await t.test("schedule changes preserve canonical strings and change alarm key/revision for reconciliation", async () => {
    const item = (await create(0)).item, first = await detail(4, item);
    assert.equal(first.alarm.eligible, true);
    const nextSchedule = { startAt: "2030-11-02T10:00:00+05:30", endAt: "2030-11-02T11:00:00+05:30", allDay: false };
    const updated = await edit(0, item, { schedule: nextSchedule, expectedRevision: 1 });
    assert.equal(updated.item.schedule.startAt, nextSchedule.startAt); assert.equal(updated.item.scheduleRevision, 2);
    const next = await detail(4, item); assert.notEqual(next.alarm.key, first.alarm.key); assert.equal(next.alarm.eligible, true);
    await action(4, item, "acknowledge", 1, 409);
    assert.equal((await api(4, "GET", `${shared}/inbox`)).items.find(row => row.item.id === item.id).item.serverRevision, 2);
    await edit(0, item, { schedule: { startAt: "2030-01-01T09:00:00" }, expectedRevision: 2 }, 400);
    await edit(0, item, { schedule: { startAt: "2030-01-02T09:00:00Z", endAt: "2030-01-01T09:00:00Z" }, expectedRevision: 2 }, 400);
  });
  await t.test("cancel is revision guarded, auditable and idempotent; all recipient alarms become ineligible", async () => {
    const item = (await create(0, { targets: [userTarget(3), userTarget(4)] })).item;
    await action(0, item, "cancel", 2, 409);
    const first = await action(0, item, "cancel"), again = await action(0, item, "cancel");
    assert.equal(first.item.serverRevision, 2); assert.equal(again.item.serverRevision, 2);
    assert.equal(first.item.cancelledAt, again.item.cancelledAt); assert.equal(first.item.cancelledByUserId, ids[0]);
    for (const actor of [3, 4]) { const current = await detail(actor, item); assert.equal(current.recipient.status, "cancelled"); assert.equal(current.alarm.eligible, false); }
    assert.equal(await Recipient.countDocuments({ organizationItemId: item.id, status: "cancelled" }), 2);
    await action(4, item, "acknowledge", 2, 409);
    assert.ok((await api(4, "GET", `${shared}/inbox?status=cancelled`)).items.some(row => row.item.id === item.id));
  });
  await t.test("acknowledgement updates only own state, is monotonic/idempotent and suppresses reminder alarms", async () => {
    const item = (await create(0, { targets: [userTarget(3), userTarget(4)] })).item;
    const first = await action(4, item, "acknowledge"), second = await action(4, item, "acknowledge");
    assert.equal(first.recipient.acknowledgedAt, second.recipient.acknowledgedAt);
    assert.equal(first.recipient.recipientRevision, second.recipient.recipientRevision);
    assert.equal(first.alarm.eligible, false); assert.equal((await detail(3, item)).recipient.status, "pending");
    await action(6, item, "acknowledge", 1, 403);
    await api(4, "POST", `${shared}/${item.id}/acknowledge`, { expectedRevision: 1, userId: ids[3] }, 400);
  });
  await t.test("individual task completion leaves others active until all active recipients complete", async () => {
    const item = (await create(0, { type: "task", targets: [userTarget(3), userTarget(4)] })).item;
    const first = await action(4, item, "complete");
    assert.equal(first.item.status, "active"); assert.equal(first.alarm.eligible, false);
    const other = await detail(3, item); assert.equal(other.recipient.status, "pending"); assert.equal(other.alarm.eligible, true);
    const last = await action(3, item, "complete"); assert.equal(last.item.status, "completed"); assert.equal(last.item.serverRevision, 2);
    assert.equal(last.item.completedByUserId, ids[3]);
    const replay = await action(3, item, "complete"); assert.equal(replay.recipient.completedAt, last.recipient.completedAt);
    assert.equal((await action(4, item, "acknowledge")).recipient.status, "completed");
    assert.equal((await detail(4, item)).alarm.eligible, false);
  });
  await t.test("Reminder completion is individual without task aggregation; Event is acknowledgement-only", async () => {
    const reminder = (await create(0)).item;
    const done = await action(4, reminder, "complete"); assert.equal(done.item.status, "active"); assert.equal(done.recipient.status, "completed");
    const event = (await create(0, { type: "event" })).item;
    assert.equal((await action(4, event, "acknowledge")).recipient.status, "acknowledged");
    await action(4, event, "complete", 1, 400);
  });
  await t.test("collective ANY atomically completes globally; remaining recipient sees effective completion", async () => {
    collectiveItem = (await create(0, { type: "task", completionMode: "collective", targets: [userTarget(3), userTarget(4)] })).item;
    const done = await action(4, collectiveItem, "complete"); assert.equal(done.item.status, "completed");
    assert.equal(done.item.completedByUserId, ids[4]); assert.equal(done.item.completionReason, "collective_any");
    const other = await detail(3, collectiveItem); assert.equal(other.recipient.status, "pending"); assert.equal(other.effectiveStatus, "completed"); assert.equal(other.alarm.eligible, false);
    const replay = await action(3, collectiveItem, "complete"); assert.equal(replay.item.completedAt, done.item.completedAt);
  });
  await t.test("simultaneous collective completion performs exactly one global transition", async () => {
    const item = (await create(0, { type: "task", completionMode: "collective", collectiveRule: "any", targets: [userTarget(3), userTarget(6)] })).item;
    const responses = await Promise.all([action(3, item, "complete"), action(6, item, "complete")]);
    assert.equal(responses[0].item.completedAt, responses[1].item.completedAt);
    const stored = await SharedItem.findById(item.id); assert.equal(stored.serverRevision, 2);
    assert.ok([ids[3], ids[6]].includes(String(stored.completedByUserId)));
    assert.equal(await Recipient.countDocuments({ organizationItemId: item.id, status: "completed" }), 1);
  });
  await t.test("recipient/target database uniqueness plus clientRequestId provide safe creation retries", async () => {
    const input = { clientRequestId: "shared-retry-1", targets: [userTarget(4), userTarget(3)] };
    const [first, retry] = await Promise.all([create(0, input), create(0, { ...input, targets: [userTarget(3), userTarget(4), userTarget(4)] })]);
    assert.equal(first.item.id, retry.item.id);
    await create(0, { ...input, title: "Different request" }, 409);
    await assert.rejects(Recipient.create({ organizationId: a.id, organizationItemId: first.item.id, userId: ids[4] }), e => e.code === 11000);
    await assert.rejects(Target.create({ organizationId: a.id, organizationItemId: first.item.id, ...userTarget(4) }), e => e.code === 11000);
  });
  await t.test("recipient insertion failure rolls back item, targets and all recipients", async () => {
    const original = Recipient.insertMany;
    Recipient.insertMany = async () => { throw new Error("injected expansion failure"); };
    const before = await Target.countDocuments();
    try { await create(0, { title: "Rollback shared creation" }, 503); } finally { Recipient.insertMany = original; }
    assert.equal(await SharedItem.countDocuments({ title: "Rollback shared creation" }), 0); assert.equal(await Target.countDocuments(), before);
  });
  await t.test("team removal preserves snapshot visibility but suppresses team-only alarm eligibility", async () => {
    await api(0, "DELETE", `${root}/teams/${sales.id}/members/${ids[4]}`);
    const history = await detail(4, teamItem); assert.equal(history.recipient.status, "pending"); assert.equal(history.alarm.eligible, false);
    assert.equal((await detail(4, overlapItem)).alarm.eligible, true); // Direct user/design sources remain valid.
    const next = await create(0, { targets: [{ targetType: "team", targetId: sales.id }] });
    assert.equal(await Recipient.countDocuments({ organizationItemId: next.item.id, userId: ids[4] }), 0);
  });
  await t.test("cross-org item IDs and recipients cannot access foreign item content", async () => {
    const foreignItem = (await api(5, "POST", `${base}/${b.id}/shared-items`, { ...content, targets: [userTarget(6)] }, 201)).item;
    await detail(0, foreignItem, 404);
    await api(4, "GET", `${base}/${b.id}/shared-items/${foreignItem.id}`, undefined, 403);
    await api(0, "GET", `${base}/${b.id}/shared-items/${selectedItem.id}`, undefined, 404);
    await action(4, foreignItem, "complete", 1, 404);
  });
  await t.test("organization plus overlapping team/user targets still produce one recipient per user", async () => {
    const result = await create(0, { targets: [{ targetType: "organization" }, { targetType: "team", targetId: design.id }, userTarget(4)] });
    assert.equal(result.recipientCount, 6);
    assert.equal(await Recipient.countDocuments({ organizationItemId: result.item.id, userId: ids[4] }), 1);
  });
  await t.test("empty teams cannot create recipientless items and malformed schedules are rejected", async () => {
    const empty = (await api(0, "POST", `${root}/teams`, { name: "Empty targets" }, 201)).team;
    const result = await create(0, { targets: [{ targetType: "team", targetId: empty.id }] }, 400);
    assert.equal(result.code, "NO_SHARED_RECIPIENTS");
    for (const value of [{}, { startAt: "bad" }, { ...schedule, allDay: "false" }, { ...schedule, alertBefore: { minutes: -1, label: "bad" } }]) {
      await create(0, { schedule: value }, 400);
    }
  });
  await t.test("creation retry after team changes preserves original snapshot without re-expansion", async () => {
    const input = { clientRequestId: "snapshot-stable-retry", targets: [{ targetType: "team", targetId: design.id }] };
    const first = await create(0, input);
    await api(0, "POST", `${root}/teams/${design.id}/members`, { userId: ids[6] });
    const retry = await create(0, input);
    assert.equal(retry.item.id, first.item.id); assert.equal(retry.recipientCount, first.recipientCount);
    assert.equal(await Recipient.countDocuments({ organizationItemId: first.item.id, userId: ids[6] }), 0);
  });
  await t.test("unchanged schedule/content edits preserve alarm key; task acknowledgement keeps completion pending", async () => {
    const item = (await create(0, { type: "task" })).item;
    const first = await detail(4, item);
    const editResult = await edit(0, item, { schedule, title: "Renamed only", expectedRevision: 1 });
    assert.equal(editResult.item.scheduleRevision, 1); assert.equal((await detail(4, item)).alarm.key, first.alarm.key);
    const acknowledged = await action(4, item, "acknowledge", 2);
    assert.equal(acknowledged.item.status, "active"); assert.equal(acknowledged.alarm.eligible, true);
    await action(4, item, "complete", 2);
  });
  await t.test("simultaneous individual completions aggregate exactly once", async () => {
    const item = (await create(0, { type: "task", targets: [userTarget(3), userTarget(6)] })).item;
    await Promise.all([action(3, item, "complete"), action(6, item, "complete")]);
    assert.equal((await SharedItem.findById(item.id)).status, "completed");
    assert.equal((await SharedItem.findById(item.id)).serverRevision, 2);
    assert.equal(await Recipient.countDocuments({ organizationItemId: item.id, status: "completed" }), 2);
  });
  await t.test("recipient write failure rolls back collective global completion", async () => {
    const item = (await create(0, { type: "task", completionMode: "collective", targets: [userTarget(3)] })).item;
    const original = Recipient.prototype.save;
    Recipient.prototype.save = async () => { throw new Error("injected recipient completion failure"); };
    try { await action(3, item, "complete", 1, 503); } finally { Recipient.prototype.save = original; }
    assert.equal((await SharedItem.findById(item.id)).status, "active");
    assert.equal((await SharedItem.findById(item.id)).serverRevision, 1);
    assert.equal((await Recipient.findOne({ organizationItemId: item.id })).status, "pending");
  });
  await t.test("cancel failure preserves active item and recipient statuses", async () => {
    const item = (await create(0)).item, original = Recipient.updateMany;
    Recipient.updateMany = async () => { throw new Error("injected cancellation failure"); };
    try { await action(0, item, "cancel", 1, 503); } finally { Recipient.updateMany = original; }
    assert.equal((await SharedItem.findById(item.id)).status, "active");
    assert.equal((await Recipient.findOne({ organizationItemId: item.id })).status, "pending");
  });
  await t.test("team archive preserves history but stops alarms for its snapshot sources", async () => {
    await api(0, "DELETE", `${root}/teams/${sales.id}`);
    const historical = await detail(3, teamItem);
    assert.equal(historical.recipient.status, "pending"); assert.equal(historical.alarm.eligible, false);
  });
  await t.test("ownership transfer preserves shared records; previous Owner cannot edit broad-target items as Member", async () => {
    await api(0, "POST", `${root}/transfer-ownership`, { targetUserId: ids[1] });
    await edit(0, orgItem, { title: "Old Owner no scope authority", expectedRevision: 1 }, 403);
    await edit(1, orgItem, { title: "New Owner manages", expectedRevision: 1 });
    await api(1, "POST", `${root}/transfer-ownership`, { targetUserId: ids[0] });
    await permissions(1, ["manage_teams", "assign_team_members", "create_shared_items", "edit_shared_items"]);
  });
  await t.test("creation racing organization removal cannot retain live recipient access", async () => {
    const responses = await Promise.all([
      raw(1, "POST", shared, { ...content, title: "Creation-removal race", targets: [userTarget(6)] }),
      raw(0, "DELETE", `${root}/members/${ids[6]}`),
    ]);
    assert.ok([201, 400].includes(responses[0].status)); assert.equal(responses[1].status, 200);
    const item = await SharedItem.findOne({ title: "Creation-removal race" });
    if (item) assert.equal((await Recipient.findOne({ organizationItemId: item._id, userId: ids[6] })).accessStatus, "revoked");
    await join(6);
  });
  await t.test("Admin permission revocation applies to existing shared items with same token", async () => {
    await permissions(1, ["manage_teams", "assign_team_members"]);
    await create(1, {}, 403); await edit(1, creatorItem, { title: "Revoked", expectedRevision: 4 }, 403);
    await permissions(1, ["manage_teams", "assign_team_members", "create_shared_items", "edit_shared_items"]);
  });
  await t.test("Admin creator demoted to Member cannot manage historical team/org targeting", async () => {
    const item = (await create(1, { targets: [{ targetType: "organization" }] })).item;
    await api(0, "PATCH", `${root}/members/${ids[1]}/role`, { role: "member" });
    await edit(1, item, { title: "Blocked scope escalation", expectedRevision: 1 }, 403);
    await action(1, item, "cancel", 1, 403);
    await detail(1, item); // Historical creator visibility is preserved.
    await permissions(1, ["manage_teams", "assign_team_members", "create_shared_items", "edit_shared_items"]);
  });
  await t.test("creator leaves; personal data remains intact and Owner/Admin retain management", async () => {
    await api(4, "POST", `${root}/leave`, {});
    await detail(4, creatorItem, 403); await edit(4, creatorItem, { title: "No access", expectedRevision: 4 }, 403);
    await edit(0, creatorItem, { title: "Owner maintains item", expectedRevision: 4 });
    await edit(1, creatorItem, { title: "Admin maintains item", expectedRevision: 5 });
    assert.equal(JSON.stringify(await Item.findById(personal._id).lean()), personalBefore);
    assert.equal(JSON.stringify(await User.findById(ids[4]).lean()), userBefore);
  });
  await t.test("recipient removal revokes access/alarms permanently; org rejoin does not restore historical receipt", async () => {
    const item = (await create(0, { targets: [userTarget(6)] })).item;
    await api(0, "DELETE", `${root}/members/${ids[6]}`);
    await detail(6, item, 403); await action(6, item, "complete", 1, 403);
    assert.equal((await Recipient.findOne({ organizationItemId: item.id, userId: ids[6] })).accessStatus, "revoked");
    await join(6); await detail(6, item, 403); await action(6, item, "complete", 1, 403);
    assert.ok(!(await api(6, "GET", `${shared}/inbox`)).items.some(row => row.item.id === item.id));
  });
  await t.test("individual task recomputes completion after removal of final incomplete active recipient", async () => {
    const item = (await create(0, { type: "task", targets: [userTarget(3), userTarget(6)] })).item;
    await action(3, item, "complete"); await api(0, "DELETE", `${root}/members/${ids[6]}`);
    assert.equal((await SharedItem.findById(item.id)).status, "completed");
    assert.equal((await SharedItem.findById(item.id)).completedByUserId, undefined);
    await join(6);
  });
  await t.test("shared cleanup failure rolls back organization removal and prevents dangling access", async () => {
    const original = Recipient.updateMany; Recipient.updateMany = async () => { throw new Error("injected revoke failure"); };
    try { await api(0, "DELETE", `${root}/members/${ids[6]}`, undefined, 503); } finally { Recipient.updateMany = original; }
    await api(6, "GET", root);
  });
  await t.test("organization deletion cancels active shared items, revokes receipts and preserves history", async () => {
    await api(0, "DELETE", root);
    assert.equal(await SharedItem.countDocuments({ organizationId: a.id, status: "active" }), 0);
    assert.equal(await Recipient.countDocuments({ organizationId: a.id, accessStatus: "active" }), 0);
    assert.ok(await Target.countDocuments({ organizationId: a.id }));
    assert.equal((await SharedItem.findById(collectiveItem.id)).status, "completed");
    assert.equal(JSON.stringify(await Item.findById(personal._id).lean()), personalBefore);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import Item from "../models/OrganizationItem.js";
import Target from "../models/OrganizationItemTarget.js";
import Recipient from "../models/OrganizationItemRecipient.js";
import TeamMember from "../models/TeamMember.js";
import { sharedClock } from "../services/sharedRecurrence.js";
import { teamFixture } from "./teamFixture.js";

test("target editing: authorized atomic snapshot differences and occurrence eligibility", { timeout: 120000 }, async t => {
  const { api, raw, ids, a, b, base, permissions } = await teamFixture(t);
  let now = new Date("2030-01-01T08:00:00Z"); const oldClock = sharedClock.now;
  sharedClock.now = () => new Date(now); t.after(() => { sharedClock.now = oldClock; });
  const root = `${base}/${a.id}`, url = `${root}/shared-items`, user = index => ({ targetType: "user", targetId: ids[index] }), team = value => ({ targetType: "team", targetId: value.id });
  const make = async (extra = {}, actor = 0) => (await api(actor, "POST", url, { type: "task", title: "Audience", schedule: { startAt: "2030-01-01T09:00:00Z" }, targets: [user(3), user(4)], ...extra }, 201)).item;
  const edit = (item, targets, revision = 1, actor = 0, expected = 200) => api(actor, "PATCH", `${url}/${item.id}`, { expectedRevision: revision, targets }, expected);
  const detail = (item, actor = 0) => api(actor, "GET", `${url}/${item.id}`);
  const receipts = item => Recipient.find({ organizationItemId: item.id }).sort({ userId: 1 }).lean();
  const sales = (await api(0, "POST", `${root}/teams`, { name: "Target Sales" }, 201)).team;
  const design = (await api(0, "POST", `${root}/teams`, { name: "Target Design" }, 201)).team;
  for (const i of [3, 4]) await api(0, "POST", `${root}/teams/${sales.id}/members`, { userId: ids[i] });
  for (const i of [2, 3]) await api(0, "POST", `${root}/teams/${design.id}/members`, { userId: ids[i] });
  await permissions(1, ["edit_shared_items"]);
  await api(0, "PATCH", `${root}/sharing-policy`, { employeeSharingEnabled: true });
  await t.test("Owner adds team recipients, mixed overlaps deduplicate and revision advances exactly once", async () => {
    const item = await make({ targets: [team(sales)] });
    const result = await edit(item, [team(sales), team(design), user(3)]);
    assert.equal(result.item.serverRevision, 2); assert.equal(result.item.scheduleRevision, 1);
    assert.deepEqual(result.targetDiff, { added: 1, removed: 0, reactivated: 0, unchanged: 2 });
    assert.equal(await Recipient.countDocuments({ organizationItemId: item.id }), 3);
    const overlap = await Recipient.findOne({ organizationItemId: item.id, userId: ids[3] }); assert.equal(overlap.sourceTargetIds.length, 3);
  });
  await t.test("removing one team preserves users covered by another, completed state and original metadata", async () => {
    const item = await make({ targets: [team(sales), team(design)] });
    await api(3, "POST", `${url}/${item.id}/complete`, { expectedRevision: 1 });
    const before = await Recipient.findOne({ organizationItemId: item.id, userId: ids[3] }).lean();
    const result = await edit(item, [team(sales)]); assert.equal(result.targetDiff.removed, 1);
    const after = await Recipient.findOne({ _id: before._id }).lean();
    assert.equal(after.status, "completed"); assert.equal(+after.completedAt, +before.completedAt); assert.equal(+after.createdAt, +before.createdAt);
    assert.equal(after.accessStatus, "active"); assert.equal(after.sourceTargetIds.length, 1);
    const removed = await Recipient.findOne({ organizationItemId: item.id, userId: ids[2] });
    assert.equal(removed.accessStatus, "revoked"); assert.equal(removed.removalReason, "target_change");
    await api(2, "GET", `${url}/${item.id}`, undefined, 403);
    assert.equal((await detail(item)).targets.length, 1); assert.equal(await Target.countDocuments({ organizationItemId: item.id }), 2);
  });
  await t.test("re-add reactivates the same record and preserves completion evidence", async () => {
    const item = await make(); await api(3, "POST", `${url}/${item.id}/complete`, { expectedRevision: 1 });
    const before = await Recipient.findOne({ organizationItemId: item.id, userId: ids[3] }).lean();
    await edit(item, [user(4)]); const result = await edit(item, [user(3), user(4)], 2);
    const after = await Recipient.findOne({ _id: before._id }).lean();
    assert.equal(result.targetDiff.reactivated, 1); assert.equal(after.status, "completed"); assert.equal(after.accessStatus, "active"); assert.equal(after.removalReason, undefined);
    assert.equal(+after.completedAt, +before.completedAt); assert.equal(await Recipient.countDocuments({ organizationItemId: item.id }), 2);
  });
  await t.test("removing last pending non-recurring recipient completes remaining individual audience with one revision", async () => {
    const item = await make(); await api(3, "POST", `${url}/${item.id}/complete`, { expectedRevision: 1 });
    const changed = await edit(item, [user(3)]); assert.equal(changed.item.status, "completed"); assert.equal(changed.item.serverRevision, 2);
    await edit(item, [user(3), user(4)], 2, 0, 409);
  });
  await t.test("authorized Admin edits; unauthorized Admin and ordinary recipient cannot", async () => {
    const item = await make(); await edit(item, [user(4)], 1, 1);
    await edit(item, [user(3)], 2, 2, 403); await edit(item, [user(3)], 2, 3, 403);
  });
  await t.test("target edit ACK includes authoritative actor access/alarm after Owner removes self", async () => {
    const item = await make({ targets: [user(0), user(3)], recurrence: { repeat: "daily", timeZone: "UTC" } });
    const result = await edit(item, [user(3)]); assert.equal(result.recipient, null); assert.equal(result.alarm.eligible, false);
  });
  await t.test("Member creator can edit employees only while policy enabled", async () => {
    const item = await make({ targets: [user(3)] }, 4);
    await edit(item, [user(3), user(4)], 1, 4);
    await edit(item, [team(sales)], 2, 4, 403); await edit(item, [{ targetType: "organization" }], 2, 4, 403);
    await api(0, "PATCH", `${root}/sharing-policy`, { employeeSharingEnabled: false });
    await edit(item, [user(4)], 2, 4, 403);
    await api(0, "PATCH", `${root}/sharing-policy`, { employeeSharingEnabled: true });
  });
  await t.test("org-wide expansion includes active members only; later joiners stay outside snapshot", async () => {
    const item = await make(); await edit(item, [{ targetType: "organization" }]);
    const rows = await receipts(item); assert.ok(!rows.some(row => [ids[7], ids[8], ids[6]].includes(String(row.userId))));
    const count = rows.length;
    const joined = await api(7, "POST", `${base}/join-request`, { joinCode: a.joinCode });
    await api(0, "POST", `${root}/join-requests/${joined.request.id}/approve`, {});
    assert.equal(await Recipient.countDocuments({ organizationItemId: item.id }), count);
    await api(7, "POST", `${root}/leave`, {});
  });
  await t.test("archived teams and foreign/mixed/left/inactive target IDs fail atomically", async () => {
    const archived = (await api(0, "POST", `${root}/teams`, { name: "Archived target" }, 201)).team;
    await api(0, "DELETE", `${root}/teams/${archived.id}`);
    const foreign = (await api(5, "POST", `${base}/${b.id}/teams`, { name: "Foreign target" }, 201)).team;
    const item = await make(), before = JSON.stringify(await receipts(item));
    for (const targets of [[team(archived)], [team(foreign)], [user(6)], [user(7)], [user(8)], [user(3), team(foreign)]]) await edit(item, targets, 1, 0, 400);
    assert.equal(JSON.stringify(await receipts(item)), before); assert.equal((await detail(item)).item.serverRevision, 1);
    assert.equal(await Target.countDocuments({ organizationItemId: item.id }), 2);
  });
  await t.test("team expansion excludes an inactive organization member even with a stale active link", async () => {
    const stale = (await api(0, "POST", `${root}/teams`, { name: "Legacy link" }, 201)).team;
    await api(0, "POST", `${root}/teams/${stale.id}/members`, { userId: ids[3] });
    await TeamMember.create({ organizationId: a.id, teamId: stale.id, userId: ids[7], status: "active", assignedByUserId: ids[0], assignedAt: now });
    const item = await make(); await edit(item, [team(stale)]);
    assert.equal(await Recipient.countDocuments({ organizationItemId: item.id, accessStatus: "active" }), 1);
  });
  await t.test("stale target revision has exact conflict code and concurrent edits have one winner", async () => {
    const item = await make(); const [a, b] = await Promise.all([
      raw(0, "PATCH", `${url}/${item.id}`, { expectedRevision: 1, targets: [team(sales), team(design)] }),
      raw(0, "PATCH", `${url}/${item.id}`, { expectedRevision: 1, targets: [user(1)] }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]); const loser = a.status === 409 ? a : b;
    assert.equal(loser.body.code, "ITEM_REVISION_CONFLICT");
    const active = (await receipts(item)).filter(row => row.accessStatus === "active").map(row => String(row.userId)).sort();
    assert.deepEqual(active, (a.status === 200 ? [ids[2], ids[3], ids[4]] : [ids[1]]).sort());
    assert.equal((await detail(item)).item.serverRevision, 2);
  });
  await t.test("injected recipient write failure rolls back target definitions, content and all access changes", async () => {
    const item = await make(), before = JSON.stringify(await receipts(item));
    const original = Recipient.create; Recipient.create = async () => { throw Error("isolated target write failure"); };
    try { await api(0, "PATCH", `${url}/${item.id}`, { expectedRevision: 1, title: "Must roll back", targets: [user(1)] }, 503); } finally { Recipient.create = original; }
    assert.equal(JSON.stringify(await receipts(item)), before);
    const view = await detail(item); assert.equal(view.item.title, "Audience"); assert.equal(view.item.serverRevision, 1); assert.equal(view.targets.length, 2);
  });
  await t.test("cancelled and globally completed non-recurring items cannot change audience", async () => {
    const cancelled = await make(); await api(0, "POST", `${url}/${cancelled.id}/cancel`, { expectedRevision: 1 }); await edit(cancelled, [user(1)], 2, 0, 409);
    const completed = await make({ completionMode: "collective" }); await api(3, "POST", `${url}/${completed.id}/complete`, { expectedRevision: 1 });
    await edit(completed, [user(1)], 2, 0, 409); assert.equal((await detail(completed)).item.status, "completed");
  });
  const recurring = { recurrence: { repeat: "daily", timeZone: "UTC" }, targets: [user(3)] };
  await t.test("new recurring recipient before due starts current occurrence with empty history", async () => {
    now = new Date("2030-01-01T08:00:00Z"); const item = await make(recurring); await edit(item, [user(3), user(4)]);
    const view = await detail(item, 4); assert.equal(view.occurrence.key, "1|2030-01-01T09:00"); assert.equal(view.alarm.startAt, "2030-01-01T09:00:00.000Z"); assert.equal(view.recipient.occurrenceHistory.length, 0);
  });
  await t.test("recipient added after missed/task due begins next date without fabricated history or past actions", async () => {
    now = new Date("2030-01-01T10:00:00Z");
    for (const type of ["task", "reminder"]) {
      const item = await make({ ...recurring, type }); await edit(item, [user(3), user(4)]);
      const view = await detail(item, 4); assert.equal(view.occurrence, null); assert.equal(view.alarm.startAt, "2030-01-02T09:00:00.000Z"); assert.equal(view.recipient.occurrenceHistory.length, 0);
      if (type === "task") {
        const manager = await detail(item); assert.equal(manager.recipientCount, 2); assert.equal(manager.recipientSummary.reduce((sum, row) => sum + row.count, 0), 1);
        await api(3, "POST", `${url}/${item.id}/complete`, { expectedRevision: 2, occurrenceKey: "1|2030-01-01T09:00" });
        assert.equal((await Item.findById(item.id)).occurrenceHistory.length, 1);
      }
      await api(4, "POST", `${url}/${item.id}/complete`, { expectedRevision: 2, occurrenceKey: "1|2030-01-01T09:00" }, 409);
      now = new Date("2030-01-02T00:00:00Z"); assert.equal((await detail(item, 4)).occurrence.status, "pending"); now = new Date("2030-01-01T10:00:00Z");
    }
  });
  await t.test("ongoing recurring Event may be received, past Event begins next recurrence", async () => {
    now = new Date("2030-01-01T10:00:00Z"); const item = await make({ ...recurring, type: "event", schedule: { startAt: "2030-01-01T09:00:00Z", endAt: "2030-01-01T11:00:00Z" } });
    await edit(item, [user(3), user(4)]); assert.equal((await detail(item, 4)).occurrence.status, "ongoing");
    now = new Date("2030-01-01T12:00:00Z"); await edit(item, [user(3), user(4), user(2)], 2); assert.equal((await detail(item, 2)).occurrence, null);
  });
  await t.test("grant boundary does not postpone a future occurrence after recurrence time moves earlier", async () => {
    now = new Date("2030-01-01T10:00:00Z"); const item = await make(recurring); await edit(item, [user(3), user(4)]);
    await api(0, "PATCH", `${url}/${item.id}`, { expectedRevision: 2, schedule: { startAt: "2030-01-01T08:00:00Z" } });
    now = new Date("2030-01-02T00:00:00Z"); const view = await detail(item, 4);
    assert.equal(view.occurrence.key, "2|2030-01-02T08:00"); assert.equal(view.alarm.startAt, "2030-01-02T08:00:00.000Z");
  });
  await t.test("recurring collective completed current remains completed; new recipient starts next", async () => {
    now = new Date("2030-01-01T08:00:00Z"); const item = await make({ ...recurring, completionMode: "collective" });
    await api(3, "POST", `${url}/${item.id}/complete`, { expectedRevision: 1, occurrenceKey: "1|2030-01-01T09:00" });
    const history = (await Item.findById(item.id)).occurrenceHistory.toObject(); await edit(item, [user(3), user(4)]);
    assert.deepEqual((await Item.findById(item.id)).occurrenceHistory.toObject(), history); assert.equal((await detail(item, 3)).occurrence.status, "completed");
    assert.equal((await detail(item, 4)).occurrence, null); assert.equal((await detail(item)).item.status, "active");
  });
  await t.test("removed recurring recipient retains history; explicit re-add preserves row without backfill", async () => {
    now = new Date("2030-01-01T08:00:00Z"); const item = await make({ ...recurring, targets: [user(3), user(4)] });
    await api(3, "POST", `${url}/${item.id}/complete`, { expectedRevision: 1, occurrenceKey: "1|2030-01-01T09:00" });
    const before = await Recipient.findOne({ organizationItemId: item.id, userId: ids[3] }).lean(); await edit(item, [user(4)]);
    now = new Date("2030-01-03T10:00:00Z"); await edit(item, [user(3), user(4)], 2);
    const after = await Recipient.findOne({ _id: before._id }).lean(); assert.deepEqual(after.occurrenceHistory, before.occurrenceHistory);
    assert.equal(after.accessStatus, "active"); assert.equal((await detail(item, 3)).occurrence, null); assert.equal((await detail(item, 3)).alarm.startAt, "2030-01-04T09:00:00.000Z");
  });
  await t.test("foreign item scope rejected; creator leave leaves Owner/authorized Admin management intact", async () => {
    const item = await make({}, 4); await api(0, "PATCH", `${base}/${b.id}/shared-items/${item.id}`, { expectedRevision: 1, targets: [user(0)] }, 404);
    await api(4, "POST", `${root}/leave`, {}); await edit(item, [user(3)], 1, 1); await edit(item, [user(3), user(2)], 2);
  });
});

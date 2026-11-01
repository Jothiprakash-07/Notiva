import test from "node:test";
import assert from "node:assert/strict";
import Item from "../models/OrganizationItem.js";
import Recipient from "../models/OrganizationItemRecipient.js";
import Target from "../models/OrganizationItemTarget.js";
import { sharedClock } from "../services/sharedRecurrence.js";
import calendar from "../../shared/recurrence.cjs";
import { teamFixture } from "./teamFixture.js";

test("shared recurrence: real replica set, fixed clock and canonical calendar", { timeout: 120000 }, async t => {
  const { api, raw, ids, a, b, base, join } = await teamFixture(t);
  let now = new Date("2030-10-22T04:00:00Z");
  const original = sharedClock.now; sharedClock.now = () => new Date(now); t.after(() => { sharedClock.now = original; });
  const root = `${base}/${a.id}`, url = `${root}/shared-items`;
  const make = async (repeat = "daily", extra = {}) => (await api(0, "POST", url, { type: "task", title: `Recurring ${repeat}`, schedule: { startAt: "2030-10-22T12:00:00+05:30" },
    recurrence: { repeat, timeZone: "Asia/Kolkata" }, targets: [{ targetType: "user", targetId: ids[3] }, { targetType: "user", targetId: ids[4] }], ...extra }, 201)).item;
  const detail = (item, actor = 3) => api(actor, "GET", `${url}/${item.id}`);
  const act = (item, key, actor = 3, expected = 200, action = "complete", revision = 1) => api(actor, "POST", `${url}/${item.id}/${action}`, { occurrenceKey: key, expectedRevision: revision }, expected);
  let daily, collective;
  for (const repeat of ["daily", "weekly", "weekdays", "monthly", "yearly"]) await t.test(`create ${repeat}: one master, fixed targets/recipients, no future documents`, async () => {
    const before = await Item.countDocuments(), item = await make(repeat);
    assert.equal(await Item.countDocuments(), before + 1); assert.equal(await Recipient.countDocuments({ organizationItemId: item.id }), 2);
    assert.equal(await Target.countDocuments({ organizationItemId: item.id }), 2);
    assert.equal((await Recipient.findOne({ organizationItemId: item.id })).occurrenceHistory.length, 0);
    if (repeat === "daily") daily = item;
    assert.equal((await detail(item)).occurrence.key, "1|2030-10-22T12:00");
  });
  await t.test("deterministic timezone-safe current key and pre-midnight future rejection", async () => {
    const view = await detail(daily); assert.equal(view.occurrence.startAt, "2030-10-22T06:30:00.000Z");
    assert.equal(view.occurrence.status, "pending"); await act(daily, "1|2030-10-23T12:00", 3, 409);
    await api(3, "POST", `${url}/${daily.id}/complete`, { expectedRevision: 1 }, 400);
  });
  await t.test("individual completion scoped to current occurrence, never ends series", async () => {
    const key = (await detail(daily)).occurrence.key;
    const done = await act(daily, key); assert.equal(done.item.status, "active"); assert.equal(done.occurrence.status, "completed");
    assert.equal((await detail(daily, 4)).recipient.status, "pending");
    const again = await act(daily, key); assert.equal(again.recipient.recipientRevision, done.recipient.recipientRevision);
    assert.equal((await Recipient.findOne({ organizationItemId: daily.id, userId: ids[3] })).occurrenceHistory.length, 1);
  });
  await t.test("all individual recipients complete this occurrence; tomorrow alarm registered without tomorrow card", async () => {
    const done = await act(daily, "1|2030-10-22T12:00", 4);
    assert.equal(done.item.status, "active"); assert.equal(done.occurrence.status, "completed");
    assert.equal(done.alarm.startAt, "2030-10-23T06:30:00.000Z"); assert.equal(done.occurrence.date, "2030-10-22");
    assert.equal((await Item.findById(daily.id)).occurrenceHistory.length, 1);
  });
  await t.test("midnight activation resets per-recipient current state", async () => {
    now = new Date("2030-10-22T18:29:59.999Z"); assert.equal((await detail(daily)).occurrence.date, "2030-10-22");
    now = new Date("2030-10-22T18:30:00Z"); const current = await detail(daily);
    assert.equal(current.occurrence.date, "2030-10-23"); assert.equal(current.recipient.status, "pending");
    assert.equal(current.recipient.occurrenceHistory.length, 1);
  });
  await t.test("past offline completion replay cannot complete a newly activated occurrence", async () => {
    await act(daily, "1|2030-10-22T12:00"); assert.equal((await detail(daily)).recipient.status, "pending");
  });
  await t.test("collective ANY race completes one occurrence exactly once", async () => {
    collective = await make("daily", { completionMode: "collective", collectiveRule: "any" });
    const key = (await detail(collective)).occurrence.key;
    await Promise.all([act(collective, key, 3), act(collective, key, 4)]);
    const master = await Item.findById(collective.id); assert.equal(master.status, "active"); assert.equal(master.occurrenceHistory.length, 1);
    assert.ok([ids[3], ids[4]].includes(String(master.occurrenceHistory[0].completedByUserId)));
    const other = await detail(collective); assert.equal(other.occurrence.status, "completed"); assert.equal(other.alarm.occurrenceKey, "1|2030-10-24T12:00");
  });
  await t.test("collective tomorrow resets without generating item/recipient rows", async () => {
    const before = [await Item.countDocuments(), await Recipient.countDocuments(), await Target.countDocuments()];
    now = new Date("2030-10-23T18:30:00Z"); assert.equal((await detail(collective)).occurrence.status, "pending");
    assert.deepEqual([await Item.countDocuments(), await Recipient.countDocuments(), await Target.countDocuments()], before);
  });
  await t.test("recurring reminders acknowledge and complete independently of series lifecycle", async () => {
    const item = await make("daily", { type: "reminder" }), key = (await detail(item)).occurrence.key;
    const acknowledged = await act(item, key, 3, 200, "acknowledge"); assert.equal(acknowledged.recipient.status, "acknowledged"); assert.equal(acknowledged.item.status, "active");
    await act(item, key); now = new Date("2030-10-24T18:30:00Z"); assert.equal((await detail(item)).recipient.status, "pending");
  });
  await t.test("recurring Events use upcoming/ongoing/past and occurrence acknowledgement", async () => {
    const item = await make("daily", { type: "event", schedule: { startAt: "2030-10-25T12:00:00+05:30", endAt: "2030-10-25T13:00:00+05:30" } });
    assert.equal((await detail(item)).occurrence.status, "upcoming");
    now = new Date("2030-10-25T06:45:00Z"); assert.equal((await detail(item)).occurrence.status, "ongoing");
    await act(item, "1|2030-10-25T12:00", 3, 200, "acknowledge"); await act(item, "1|2030-10-25T12:00", 3, 400);
    now = new Date("2030-10-25T08:00:00Z"); assert.equal((await detail(item)).occurrence.status, "completed");
  });
  await t.test("unresolved Reminder and Task become Missed/Overdue, not completed", async () => {
    const reminder = await make("daily", { type: "reminder" }), task = await make("daily");
    assert.equal((await detail(reminder)).occurrence.status, "missed"); assert.equal((await detail(task)).occurrence.status, "overdue");
    assert.equal((await Item.findById(task.id)).status, "active");
  });
  await t.test("recurrence edit preserves history, changes occurrence generation and rejects stale edits", async () => {
    const history = (await Recipient.findOne({ organizationItemId: daily.id, userId: ids[3] })).occurrenceHistory.toObject();
    await api(0, "PATCH", `${url}/${daily.id}`, { expectedRevision: 1, recurrence: { repeat: "weekdays", timeZone: "Asia/Kolkata" }, schedule: { startAt: "2030-10-28T14:00:00+05:30" } });
    assert.deepEqual((await Recipient.findOne({ organizationItemId: daily.id, userId: ids[3] })).occurrenceHistory.toObject(), history);
    assert.equal((await Item.findById(daily.id)).scheduleRevision, 2);
    assert.equal((await detail(daily)).occurrence, null); await api(0, "PATCH", `${url}/${daily.id}`, { expectedRevision: 1, recurrence: { repeat: "daily", timeZone: "UTC" } }, 409);
    now = new Date("2030-10-28T00:00:00Z"); assert.equal((await detail(daily)).occurrence.key, "2|2030-10-28T14:00");
    await act(daily, "1|2030-10-28T12:00", 3, 409, "complete", 2);
  });
  await t.test("snapshot survives team removal; later team joiner not added", async () => {
    const team = (await api(0, "POST", `${root}/teams`, { name: "Recurring Sales" }, 201)).team;
    await api(0, "POST", `${root}/teams/${team.id}/members`, { userId: ids[3] });
    const item = await make("daily", { targets: [{ targetType: "team", targetId: team.id }] });
    await api(0, "DELETE", `${root}/teams/${team.id}/members/${ids[3]}`);
    assert.equal((await detail(item)).alarm.eligible, true);
    await api(0, "POST", `${root}/teams/${team.id}/members`, { userId: ids[4] });
    assert.equal(await Recipient.countDocuments({ organizationItemId: item.id }), 1);
  });
  await t.test("bounded history stores actions only and never pre-generates slots", async () => {
    const item = await make("daily");
    const recipient = await Recipient.findOne({ organizationItemId: item.id, userId: ids[3] });
    const compact = [];
    for (let i = 0; i < 400; i++) compact.push({ occurrenceKey: `old|${i}`, scheduledAt: new Date(Date.UTC(2028, 0, i + 1)).toISOString(), status: "completed" });
    recipient.occurrenceHistory = compact.slice(-366); await recipient.save();
    const result = await act(item, (await detail(item)).occurrence.key);
    assert.equal(result.recipient.occurrenceHistory.length, 366);
  });
  await t.test("cancellation is idempotent, stops every future slot and preserves occurrence history", async () => {
    const before = (await Item.findById(collective.id)).occurrenceHistory.toObject();
    await api(0, "POST", `${url}/${collective.id}/cancel`, { expectedRevision: 1 });
    const first = await Item.findById(collective.id); await api(0, "POST", `${url}/${collective.id}/cancel`, { expectedRevision: 1 });
    assert.equal((await Item.findById(collective.id)).serverRevision, first.serverRevision);
    assert.deepEqual(first.occurrenceHistory.toObject(), before); assert.equal((await detail(collective)).alarm.eligible, false);
    await api(0, "PATCH", `${url}/${collective.id}`, { expectedRevision: first.serverRevision, recurrence: { repeat: "daily", timeZone: "UTC" } }, 409);
  });
  await t.test("history endpoint protects recipient scope and exposes bounded manager completion history", async () => {
    const mine = await api(3, "GET", `${url}/${daily.id}/history`); assert.ok(mine.ownHistory.length);
    const manager = await api(0, "GET", `${url}/${collective.id}/history`); assert.ok(manager.history.length); assert.equal(manager.limit, 366);
    await api(2, "GET", `${url}/${daily.id}/history`, undefined, 403);
  });
  await t.test("cross-org series IDs cannot be read or acted on", async () => {
    await api(0, "GET", `${base}/${b.id}/shared-items/${daily.id}`, undefined, 404);
    await api(0, "POST", `${base}/${b.id}/shared-items/${daily.id}/complete`, { expectedRevision: 2, occurrenceKey: "2|2030-10-28T14:00" }, 404);
  });
  await t.test("recipient organization removal blocks future access; history retained after rejoin", async () => {
    const before = (await Recipient.findOne({ organizationItemId: daily.id, userId: ids[3] })).occurrenceHistory.length;
    await api(3, "POST", `${root}/leave`, {}); await api(3, "GET", `${url}/${daily.id}`, undefined, 403);
    await join(3); await api(3, "GET", `${url}/${daily.id}`, undefined, 403);
    assert.equal((await Recipient.findOne({ organizationItemId: daily.id, userId: ids[3] })).occurrenceHistory.length, before);
  });
});

test("canonical shared calendar: invalid dates, local activation and DST", () => {
  const master = (repeat, startAt, timeZone = "UTC") => ({ id: "master", type: "task", status: "active", scheduleRevision: 1, schedule: { startAt }, recurrence: { repeat, timeZone } });
  assert.equal(calendar.currentOccurrence(master("monthly", "2030-01-31T12:00:00Z"), new Date("2030-02-28T12:00:00Z")), null);
  assert.equal(calendar.nextOccurrence(master("monthly", "2030-01-31T12:00:00Z"), new Date("2030-02-01T00:00:00Z")).date, "2030-03-31");
  assert.equal(calendar.nextOccurrence(master("yearly", "2032-02-29T12:00:00Z"), new Date("2033-01-01T00:00:00Z")).date, "2036-02-29");
  assert.equal(calendar.nextOccurrence(master("daily", "2030-12-31T12:00:00Z"), new Date("2030-12-31T13:00:00Z")).date, "2031-01-01");
  assert.equal(calendar.currentOccurrence(master("weekdays", "2030-10-22T12:00:00Z"), new Date("2030-10-26T12:00:00Z")), null);
  const ny = master("daily", "2030-03-09T02:30:00-05:00", "America/New_York");
  assert.equal(calendar.dueOn(ny, "2030-03-10").startAt, "2030-03-10T07:30:00.000Z");
  const kolkata = master("daily", "2030-10-22T12:00:00+05:30", "Asia/Kolkata");
  assert.equal(calendar.currentOccurrence(kolkata, new Date("2030-10-22T18:29:59Z")).date, "2030-10-22");
  assert.equal(calendar.currentOccurrence(kolkata, new Date("2030-10-22T18:30:00Z")).date, "2030-10-23");
});

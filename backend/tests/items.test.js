import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Item from "../models/Item.js";
import DeletedItem from "../models/DeletedItem.js";
import User from "../models/user.js";
import routes, { itemRequestError } from "../routes/itemRoutes.js";
import { prepareItemIndexes } from "../services/itemIndexes.js";
import { leaveOrganization, changePassword } from "../controllers/profileController.js";
import { resetPassword } from "../controllers/recoveryController.js";

// Isolated repository doubles; real HTTP routing, auth, validators and schema.
// No production database or account is contacted.
const originals = Object.fromEntries(["create", "find", "findOne", "findOneAndUpdate"].map(key => [key, Item[key]]));
const originalUser = User.findById;
const originalUserUpdate = User.findOneAndUpdate;
const originalIndex = Item.collection.createIndex;
const originalSecret = process.env.JWT_SECRET;
const originalArchiveExists = DeletedItem.exists;
afterEach(() => {
  DeletedItem.exists = originalArchiveExists;
  Object.assign(Item, originals); User.findById = originalUser; User.findOneAndUpdate = originalUserUpdate; Item.collection.createIndex = originalIndex;
  if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
});
const users = [{ _id: "507f1f77bcf86cd799439011", tokenVersion: 0 }, { _id: "507f1f77bcf86cd799439012", tokenVersion: 0 }];
const date = "2026-10-07T09:30:00.000Z";
const payload = (type = "reminder", id = "local-123") => ({ id, type, title: "Local item", description: "Details",
  repeat: "none", startAt: date, notificationIds: [], createdAt: date, updatedAt: date });

async function fixture(t) {
  DeletedItem.exists = async () => null;
  process.env.JWT_SECRET = "item-tests-only";
  User.findById = async id => users.find(user => user._id === id);
  const rows = [];
  let clock = Date.parse(date);
  const matches = (row, query) => Object.entries(query).every(([key, value]) =>
    value === null ? row[key] == null : String(row[key]) === String(value));
  Item.create = async data => {
    if (rows.some(row => row.ownerUserId === data.ownerUserId && row.clientItemId === data.clientItemId)) throw { code: 11000 };
    const document = new Item(data); await document.validate();
    const row = { ...document.toObject(), _id: document._id.toString(), ownerUserId: data.ownerUserId,
      serverCreatedAt: new Date(++clock), serverUpdatedAt: new Date(clock) };
    rows.push(row); return structuredClone(row);
  };
  Item.find = async query => structuredClone(rows.filter(row => matches(row, query)));
  Item.findOne = async query => structuredClone(rows.find(row => matches(row, query)) ?? null);
  Item.findOneAndUpdate = async (query, update, options) => {
    assert.equal(options.runValidators, true);
    const row = rows.find(row => matches(row, query)); if (!row) return null;
    const next = { ...row, ...update.$set, revision: row.revision + update.$inc.revision, serverUpdatedAt: new Date(++clock) };
    for (const key of Object.keys(update.$unset ?? {})) delete next[key];
    await new Item(next).validate(); Object.assign(row, next);
    for (const key of Object.keys(update.$unset ?? {})) delete row[key];
    return structuredClone(row);
  };
  const app = express(); app.use(express.json()); app.use("/api/items", routes);
  app.use(itemRequestError);
  const server = await new Promise(resolve => { const value = app.listen(0, "127.0.0.1", () => resolve(value)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (method, path = "", body, user = 0) => {
    const token = user === null ? undefined : jwt.sign({ userId: users[user]._id, tokenVersion: 0 }, process.env.JWT_SECRET);
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/items${path}`, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { code: res.status, body: await res.json() };
  };
  return { request, rows };
}

for (const type of ["reminder", "task", "event", "birthday"]) {
  test(`authenticated ${type} create preserves frontend fields and hides internals`, async t => {
    const { request, rows } = await fixture(t);
    const data = { ...payload(type), category: "Personal", alertBefore: { label: "10 minutes", minutes: 10 },
      ...(type === "event" ? { endAt: "2026-10-07T10:30:00.000Z", allDay: false, location: "Office", notes: "Agenda", status: "Cancelled" } : {}),
      ...(type === "birthday" ? { repeat: "yearly", allDay: true } : { priority: "High" }) };
    const res = await request("POST", "", data); assert.equal(res.code, 201);
    for (const [key, value] of Object.entries(data)) assert.deepEqual(res.body.item[key], value);
    assert.equal(res.body.item.clientItemId, data.id); assert.equal(res.body.item.revision, 1);
    for (const key of ["ownerUserId", "_id", "__v", "password", "tokenVersion"]) assert.equal(res.body.item[key], undefined);
    assert.equal(rows[0].ownerUserId, users[0]._id);
  });
}

test("all endpoints require existing JWT auth", async t => {
  const { request } = await fixture(t);
  for (const [method, path, body] of [["POST", "", payload()], ["GET", ""], ["GET", "/x"], ["PATCH", "/x", { title: "x" }], ["DELETE", "/x"]]) {
    assert.equal((await request(method, path, body, null)).code, 401);
  }
});

test("owner isolation, same-ID different owners, duplicates and forgery", async t => {
  const { request, rows } = await fixture(t);
  assert.equal((await request("POST", "", payload())).code, 201);
  assert.equal((await request("POST", "", payload())).code, 409);
  assert.equal((await request("POST", "", payload(), 1)).code, 201);
  assert.equal((await request("POST", "", payload("task", "only-b"), 1)).code, 201);
  const all = await request("GET"); assert.equal(all.body.items.length, 1);
  assert.equal((await request("GET", "/local-123")).code, 200);
  for (const [method, body] of [["GET"], ["PATCH", { title: "Attack" }], ["DELETE"]]) {
    assert.equal((await request(method, "/only-b", body)).code, 404);
  }
  for (const field of ["ownerUserId", "userId"]) {
    assert.equal((await request("POST", "", { ...payload("task", "forged"), [field]: users[1]._id })).code, 400);
  }
  for (const [field, value] of [["ownerUserId", users[1]._id], ["userId", users[1]._id], ["clientItemId", "changed"], ["id", "changed"], ["revision", 100], ["deletedAt", date], ["createdAt", date], ["serverUpdatedAt", date], ["$set", { title: "Attack" }]]) {
    assert.equal((await request("PATCH", "/local-123", { [field]: value })).code, 400);
  }
  assert.equal(rows.length, 3); assert.equal(rows[0].revision, 1);
});

test("update increments revision atomically; delete retains an idempotent tombstone", async t => {
  const { request, rows } = await fixture(t);
  const first = await request("POST", "", payload());
  const next = await request("PATCH", "/local-123", { title: "Updated", updatedAt: "2026-10-08T09:30:00.000Z" });
  assert.equal(next.code, 200); assert.equal(next.body.item.title, "Updated"); assert.equal(next.body.item.revision, 2);
  assert.equal(next.body.item.createdAt, date); assert.equal(next.body.item.updatedAt, "2026-10-08T09:30:00.000Z");
  assert.equal(next.body.item.serverCreatedAt, first.body.item.serverCreatedAt);
  assert.ok(next.body.item.serverUpdatedAt > first.body.item.serverUpdatedAt);
  assert.equal((await request("DELETE", "/local-123")).code, 200);
  assert.ok(rows[0].deletedAt); assert.equal(rows[0].revision, 3); assert.equal(rows.length, 1);
  assert.equal((await request("DELETE", "/local-123")).code, 200); assert.equal(rows[0].revision, 3);
  assert.equal((await request("GET")).body.items.length, 0);
  assert.equal((await request("GET", "/local-123")).code, 404);
  assert.equal((await request("PATCH", "/local-123", { title: "Revive" })).code, 404);
  assert.equal((await request("POST", "", payload())).code, 409);
  assert.equal((await request("DELETE", "/absent")).code, 404);
});

test("archived deletion prevents stale POST resurrection and isolates owners", async t => {
  const { request, rows } = await fixture(t);
  DeletedItem.exists = async query => query.ownerUserId === users[0]._id ? { _id: "archive" } : null;
  assert.equal((await request("POST", "", payload())).code, 409);
  assert.equal((await request("POST", "", payload(), 1)).code, 201);
  assert.equal(rows.length, 1);
  assert.equal((await request("GET")).body.items.length, 0);
  assert.equal((await request("GET", "/local-123")).code, 404);
  assert.equal((await request("DELETE", "/local-123")).code, 404);
  DeletedItem.exists = async () => { throw new Error("private database error"); };
  assert.equal((await request("POST", "", payload())).code, 503);
});

test("archive created during POST retires the newly created row before returning", async t => {
  const { request, rows } = await fixture(t);
  let lookups = 0;
  DeletedItem.exists = async () => ++lookups === 1 ? null : { _id: "archive" };
  assert.equal((await request("POST", "", payload())).code, 409);
  assert.ok(rows[0].deletedAt);
  assert.equal((await request("GET")).body.items.length, 0);
});

for (const repeat of ["none", "daily", "weekly", "weekdays", "monthly", "yearly"]) {
  test(`${repeat} recurrence and completed occurrence history round-trip without generation`, async t => {
    const { request, rows } = await fixture(t);
    const data = { ...payload("task", `${repeat}:root:2026-10-07`), repeat, seriesId: "root", completed: true,
      completedAt: date, completionNote: "History note", status: "Done", actionResolved: true, dailyHidden: true,
      weeklyDays: [1, 3, 5], notificationIds: ["native-alarm:old-device"] };
    if (["daily", "weekly", "weekdays"].includes(repeat)) data.dailySeries = {
      repeat, active: true, firstAt: date, templateId: "root", dirty: true,
      template: { type: "task", title: "Series", description: "Template", startAt: date, weeklyDays: [1, 3, 5], priority: "Low", alertBefore: null },
      excludedDates: ["2026-10-07"], notificationIds: ["series-alarm"],
    };
    assert.equal((await request("POST", "", data)).code, 201);
    const saved = await request("GET", `/${encodeURIComponent(data.id)}`);
    for (const [key, value] of Object.entries(data)) assert.deepEqual(saved.body.item[key], value);
    assert.equal(rows.length, 1);
    const updated = await request("PATCH", `/${encodeURIComponent(data.id)}`, { completionNote: "Updated history" });
    assert.equal(updated.body.item.completionNote, "Updated history");
    assert.deepEqual(updated.body.item.dailySeries, data.dailySeries);
  });
}

test("validation rejects malformed data and leaves existing rows unchanged", async t => {
  const { request, rows } = await fixture(t);
  for (const data of [null, [], {}, { ...payload(), type: "unknown" }, { ...payload(), title: " " },
    { ...payload(), startAt: "invalid" }, { ...payload(), weeklyDays: [7] }, { ...payload(), completed: "true" },
    { ...payload(), alertBefore: { label: "bad", minutes: -1 } }, { ...payload(), id: "x", clientItemId: "y" },
    { ...payload(), dailySeries: { active: true } }, { ...payload(), dailySeries: { $where: "bad" } }]) {
    assert.equal((await request("POST", "", data)).code, 400);
  }
  await request("POST", "", payload());
  for (const data of [{}, { title: " " }, { repeat: "bad" }, { startAt: null }, { weeklyDays: ["1"] }]) {
    assert.equal((await request("PATCH", "/local-123", data)).code, 400);
  }
  assert.equal(rows.length, 1); assert.equal(rows[0].revision, 1);
});

test("PATCH can clear optional fields without changing nullable frontend values", async t => {
  const { request } = await fixture(t);
  await request("POST", "", { ...payload(), completionNote: "Old note", status: "Done", endAt: date, priority: "High" });
  const updated = await request("PATCH", "/local-123", { completionNote: null, status: null, endAt: null, priority: null });
  assert.equal(updated.code, 200);
  for (const key of ["completionNote", "status", "endAt"]) assert.equal(updated.body.item[key], undefined);
  assert.equal(updated.body.item.priority, null);
});

test("database failures and duplicate races expose stable safe responses", async t => {
  const { request } = await fixture(t);
  for (const [method, path, body, key] of [["POST", "", payload(), "create"], ["GET", "", undefined, "find"],
    ["GET", "/x", undefined, "findOne"], ["PATCH", "/x", { title: "x" }, "findOneAndUpdate"], ["DELETE", "/x", undefined, "findOneAndUpdate"]]) {
    Item[key] = async () => { throw new Error("private connection detail"); };
    const res = await request(method, path, body); assert.equal(res.code, 503);
    assert.ok(!JSON.stringify(res.body).includes("private"));
  }
  Item.create = async () => { throw { code: 11000 }; };
  assert.equal((await request("POST", "", payload())).code, 409);
});

test("explicit index startup preserves autoIndex=false and creates owner indexes", async () => {
  assert.equal(Item.schema.options.autoIndex, false); assert.equal(Item.collection.collectionName, "items");
  const indexes = []; Item.collection.createIndex = async (keys, options) => { indexes.push([keys, options]); };
  await prepareItemIndexes();
  assert.ok(indexes.some(([keys, options]) => keys.ownerUserId === 1 && keys.clientItemId === 1 && options.unique));
  assert.ok(indexes.some(([keys]) => keys.ownerUserId === 1 && keys.updatedAt === 1));
  assert.ok(indexes.some(([keys]) => keys.ownerUserId === 1 && keys.serverUpdatedAt === 1));
});

test("organization leave, password change and password reset retain personal items", async t => {
  const { request, rows } = await fixture(t);
  await request("POST", "", payload());
  const before = JSON.stringify(rows);
  const account = { ...users[0], organizationCode: "ORG-ABC123", password: await bcrypt.hash("old-password", 4) };
  User.findOneAndUpdate = async (_query, update) => {
    Object.assign(account, update.$set);
    if (update.$inc) account.tokenVersion += update.$inc.tokenVersion;
    return account;
  };
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const leave = response(); await leaveOrganization({ user: { ...account } }, leave);
  assert.equal(leave.code, 200); assert.equal(JSON.stringify(rows), before);
  const change = response(); await changePassword({ user: { ...account }, body: { currentPassword: "old-password", newPassword: "new-password" } }, change);
  assert.equal(change.code, 200); assert.ok(change.body.token); assert.equal(JSON.stringify(rows), before);
  const reset = response(); await resetPassword({ body: { resetToken: "a".repeat(64), newPassword: "reset-password", confirmPassword: "reset-password" } }, reset);
  assert.equal(reset.code, 200); assert.equal(account.tokenVersion, 2); assert.equal(JSON.stringify(rows), before);
});

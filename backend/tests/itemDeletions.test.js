import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import Item from "../models/Item.js";
import DeletedItem from "../models/DeletedItem.js";
import User from "../models/user.js";
import routes from "../routes/itemRoutes.js";
import { readItemDeletions } from "../services/itemDeletions.js";

const originals = { itemFind: Item.find, archiveFind: DeletedItem.find, userFind: User.findById, secret: process.env.JWT_SECRET };
afterEach(() => {
  Item.find = originals.itemFind; DeletedItem.find = originals.archiveFind; User.findById = originals.userFind;
  if (originals.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originals.secret;
});
const owner = "507f1f77bcf86cd799439011", other = "507f1f77bcf86cd799439012";
const at = new Date("2026-10-08T10:00:00Z");
const deleted = (id, user = owner, date = at) => ({ clientItemId: id, ownerUserId: user, deletedAt: date, revision: 3, title: "Private", description: "Private" });
function repository(rows, fields) {
  return query => ({ select(projection) {
    assert.equal(projection, fields);
    return { async lean() {
      return rows.filter(row => row.ownerUserId === query.ownerUserId && row.deletedAt instanceof Date &&
        (!query.deletedAt.$gt || row.deletedAt > query.deletedAt.$gt));
    } };
  } });
}
async function fixture(t) {
  const soft = [deleted("soft"), deleted("other", other), deleted("active", owner, null)];
  const archive = [deleted("old", owner, new Date("2026-09-01T00:00:00Z")), deleted("soft")];
  Item.find = repository(soft, "clientItemId deletedAt revision -_id");
  DeletedItem.find = repository(archive, "clientItemId deletedAt -_id");
  User.findById = async id => [owner, other].includes(id) ? { _id: id, tokenVersion: 0 } : null;
  process.env.JWT_SECRET = "deletion-feed-tests-only";
  const app = express(); app.use("/api/items", routes);
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { soft, archive, async get(query = "", user = owner) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/items/deletions${query}`, {
      headers: user ? { Authorization: `Bearer ${jwt.sign({ userId: user, tokenVersion: 0 }, process.env.JWT_SECRET)}` } : {},
    });
    return { status: response.status, body: await response.json() };
  } };
}
test("feed authenticates, scopes owner, omits active/private rows and deduplicates source/archive", async t => {
  const h = await fixture(t);
  assert.equal((await h.get("", null)).status, 401);
  const result = await h.get(`?userId=${other}`);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.deletions.map(row => row.clientItemId), ["old", "soft"]);
  for (const row of result.body.deletions) assert.deepEqual(Object.keys(row).sort(), ["clientItemId", "deletedAt", "revision"]);
  assert.deepEqual((await h.get("", other)).body.deletions.map(row => row.clientItemId), ["other"]);
});
test("since uses strict greater-than and returns server evidence cursor with boundary replay", async t => {
  const h = await fixture(t);
  const result = await h.get("?since=2026-09-01T00%3A00%3A00Z");
  assert.deepEqual(result.body.deletions.map(row => row.clientItemId), ["soft"]);
  assert.equal(result.body.cursor, new Date(at.getTime() - 1).toISOString());
  assert.equal((await h.get(`?since=${at.toISOString()}`)).body.deletions.length, 0);
});
test("malformed/array/object cursors are rejected before database access", async t => {
  const h = await fixture(t);
  for (const query of ["?since=bad", "?since=", "?since=2026-10-08", "?since=a&since=b"]) assert.equal((await h.get(query)).status, 400);
});
test("archived deletion remains available after original removal; no revision invented", async t => {
  const h = await fixture(t);
  h.soft.splice(0, 1); delete h.archive[1].revision;
  const result = await h.get();
  assert.ok(result.body.deletions.some(row => row.clientItemId === "soft"));
  assert.equal(result.body.deletions.find(row => row.clientItemId === "soft").revision, undefined);
});
test("collection movement during feed read cannot lose cleanup evidence", async () => {
  const record = deleted("moving");
  const archive = [];
  const result = await readItemDeletions(owner, undefined, {
    itemModel: { find: () => ({ select: () => ({ lean: async () => { archive.push(record); return []; } }) }) },
    archiveModel: { find: repository(archive, "clientItemId deletedAt -_id") },
  });
  assert.equal(result.deletions[0].clientItemId, "moving");
});
test("database errors expose generic response only", async t => {
  const h = await fixture(t);
  Item.find = () => { throw new Error("secret database details"); };
  const result = await h.get(); assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result.body).includes("secret"));
});

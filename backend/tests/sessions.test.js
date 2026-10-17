import test, { beforeEach, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Session from "../models/Session.js";
import { sessionDouble } from "./sessionDouble.js";
import { loginUser } from "../controllers/authController.js";
import { authenticate, changePassword } from "../controllers/profileController.js";
import { transfer, refresh, logout, logoutWithRefresh, listSessions } from "../controllers/sessionController.js";
import { deviceMetadata, digest, loginSession, prepareSessionIndexes, refreshSession, replaceSession, revokeSessions } from "../services/sessions.js";

describe("single-device sessions", () => {
const original = Object.fromEntries(["findById", "findOne", "findOneAndUpdate"].map(k => [k, User[k]]));
const oldSecret = process.env.JWT_SECRET;
let db, user;
const device = number => ({ deviceId: `${number}`.repeat(8) + `-1111-4111-8111-111111111111`, deviceName: `Device ${number}`, platform: "android", appVersion: "1.0" });
const res = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const call = async (fn, body, extra = {}) => { const response = res(); await fn({ body, ...extra }, response); return response; };
const auth = async token => { const response = res(), req = { headers: { authorization: `Bearer ${token}` } }; let passed = false; await authenticate(req, response, () => { passed = true; }); return { passed, response, req }; };
beforeEach(async () => {
  process.env.JWT_SECRET = "session-test-secret-not-production";
  db = sessionDouble();
  user = { _id: "507f1f77bcf86cd799439011", notivaId: "person_01", recoveryEmail: "test@example.com", fullName: "Test User", password: await bcrypt.hash("secret123", 4), tokenVersion: 0 };
  User.findById = async id => id === user._id ? { ...user } : null;
  User.findOne = async query => query.notivaId === user.notivaId ? { ...user } : null;
  User.findOneAndUpdate = async (query, change) => {
    if (query._id !== user._id || (query.password && query.password !== user.password) || (typeof query.tokenVersion === "number" && query.tokenVersion !== user.tokenVersion)) return null;
    Object.assign(user, change.$set); if (change.$inc?.tokenVersion) user.tokenVersion += change.$inc.tokenVersion;
    return { ...user };
  };
});
afterEach(() => { db.restore(); Object.assign(User, original); if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });

test("first login creates exactly one session with 15-minute JWT and hashed refresh secret", async () => {
  const result = await call(loginUser, { identifier: "person_01", password: "secret123", ...device(1) });
  assert.equal(result.code, 200); assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].refreshHash, digest(result.body.refreshToken));
  const token = jwt.verify(result.body.token, process.env.JWT_SECRET);
  assert.equal(token.exp - token.iat, 900); assert.equal(token.sessionId, db.rows[0].sessionId);
  assert.equal(result.body.user.password, undefined); assert.equal(result.body.user.sessionEnforced, undefined);
  assert.ok((await auth(result.body.token)).passed);
  const listed = await call(listSessions, {}, (await auth(result.body.token)).req);
  assert.equal(listed.body.sessions.length, 1); assert.equal(listed.body.sessions[0].current, true);
  assert.equal(listed.body.sessions[0].refreshHash, undefined); assert.equal(listed.body.sessions[0].deviceId, undefined);
});
test("wrong credentials reveal no device metadata and create no session", async () => {
  for (const identifier of ["person_01", "unknown"]) {
    const result = await call(loginUser, { identifier, password: "wrong", ...device(2) });
    assert.equal(result.code, 401); assert.deepEqual(Object.keys(result.body), ["message"]);
  }
  assert.equal(db.rows.length, 0);
});
test("second-device conflict leaves old session active until a scoped one-use transfer", async () => {
  const first = await loginSession(user, device(1));
  const conflict = await call(loginUser, { identifier: user.notivaId, password: "secret123", ...device(2) });
  assert.equal(conflict.code, 409); assert.equal(conflict.body.code, "ACTIVE_SESSION_EXISTS");
  assert.equal(conflict.body.token, undefined); assert.ok((await auth(first.token)).passed);
  assert.notEqual(db.rows[0].challenges[0].hash, conflict.body.transferToken);
  const request = { userId: user._id, transferToken: conflict.body.transferToken, deviceId: device(2).deviceId };
  assert.equal((await call(transfer, { ...request, deviceId: device(3).deviceId })).code, 401);
  assert.equal((await call(transfer, { ...request, userId: "507f1f77bcf86cd799439099" })).code, 401);
  const replaced = await call(transfer, request); assert.equal(replaced.code, 200);
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].deviceId, device(2).deviceId);
  assert.equal((await auth(first.token)).response.body.code, "SESSION_REVOKED");
  assert.equal(await refreshSession(user, first.sessionId, first.refreshToken), null);
  assert.ok((await auth(replaced.body.token)).passed);
  assert.equal((await call(transfer, request)).code, 401);
});
test("concurrent transfers have exactly one winner; simultaneous first login creates one slot", async () => {
  const first = await Promise.all([loginSession(user, device(1)), loginSession(user, device(2))]);
  assert.equal(first.filter(x => x.token).length, 1); assert.equal(db.rows.length, 1);
  const a = await loginSession(user, device(3)), b = await loginSession(user, device(4));
  const results = await Promise.all([replaceSession(user, a.transferToken, device(3).deviceId), replaceSession(user, b.transferToken, device(4).deviceId)]);
  assert.equal(results.filter(Boolean).length, 1); assert.equal(db.rows.length, 1);
});
test("challenge expiry and password version changes deny takeover", async () => {
  await loginSession(user, device(1)); const challenge = await loginSession(user, device(2));
  db.rows[0].challenges[0].expiresAt = new Date(Date.now() - 1);
  assert.equal(await replaceSession(user, challenge.transferToken, device(2).deviceId), null);
  const second = await loginSession(user, device(2)); user.tokenVersion++;
  assert.equal(await replaceSession(user, second.transferToken, device(2).deviceId), null);
});
test("rotation coalesces concurrent refresh retries, slides expiry, and denies stale/revoked/expired secrets", async () => {
  const first = await loginSession(user, device(1));
  db.rows[0].expiresAt = new Date(Date.now() + 60000);
  const results = await Promise.all([refreshSession(user, first.sessionId, first.refreshToken), refreshSession(user, first.sessionId, first.refreshToken)]);
  assert.ok(results.every(Boolean)); assert.equal(results[0].refreshToken, results[1].refreshToken);
  assert.notEqual(results[0].refreshToken, first.refreshToken);
  assert.ok(+db.rows[0].expiresAt > Date.now() + 29 * 86400000);
  db.rows[0].previousRefreshUntil = new Date(Date.now() - 1);
  assert.equal(await refreshSession(user, first.sessionId, first.refreshToken), null);
  db.rows[0].expiresAt = new Date(Date.now() - 1);
  assert.equal(await refreshSession(user, first.sessionId, results[0].refreshToken), null);
  const fresh = await loginSession(user, device(1)); await revokeSessions(user._id, "test");
  assert.equal(await refreshSession(user, fresh.sessionId, fresh.refreshToken), null);
});
test("logout revokes only own current session and accepts refresh proof after access expiry", async () => {
  const first = await loginSession(user, device(1)); const req = (await auth(first.token)).req;
  const forged = await call(logout, {}, { ...req, params: { sessionId: "another-users-session" } });
  assert.equal(forged.code, 404); assert.ok((await auth(first.token)).passed);
  let fallback = false;
  await logoutWithRefresh({ body: { userId: user._id, sessionId: first.sessionId, refreshToken: "0".repeat(64) } }, res(), () => { fallback = true; });
  assert.equal(fallback, true); assert.ok((await auth(first.token)).passed);
  const result = await call(logoutWithRefresh, { userId: user._id, sessionId: first.sessionId, refreshToken: first.refreshToken });
  assert.equal(result.code, 200); assert.ok(db.rows[0].revokedAt);
  assert.equal((await auth(first.token)).passed, false);
  const fresh = await loginSession(user, device(2)); assert.ok(fresh.token);
  assert.equal((await call(refresh, { userId: user._id, sessionId: first.sessionId, refreshToken: first.refreshToken })).code, 401);
});
test("password change invalidates tokens, refresh and pending transfers; legitimate new login works", async () => {
  const first = await loginSession(user, device(1)); const pending = await loginSession(user, device(2));
  const changed = await call(changePassword, { currentPassword: "secret123", newPassword: "new-password" }, { user: { ...user } });
  assert.equal(changed.code, 200); assert.equal(changed.body.requiresLogin, true); assert.equal(changed.body.token, undefined);
  assert.equal(user.tokenVersion, 1); assert.ok(db.rows[0].revokedAt);
  assert.equal((await auth(first.token)).passed, false);
  assert.equal(await refreshSession(user, first.sessionId, first.refreshToken), null);
  assert.equal(await replaceSession(user, pending.transferToken, device(2).deviceId), null);
  assert.ok((await loginSession(user, device(2))).token);
});
test("metadata sanitization, bounded challenges, legacy enforcement and lastSeen throttling", async () => {
  assert.equal(deviceMetadata({ deviceId: "IMEI" }), null);
  const clean = deviceMetadata({ ...device(1), deviceName: "\u0000\u202e" + "a".repeat(200), platform: "bad" });
  assert.equal(clean.deviceName, "a".repeat(80)); assert.equal(clean.platform, "unknown");
  const legacy = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
  assert.ok((await auth(legacy)).passed);
  const first = await loginSession(user, device(1)); assert.equal((await auth(legacy)).passed, false);
  const before = db.rows[0].lastSeenAt; await auth(first.token); assert.equal(+db.rows[0].lastSeenAt, +before);
  db.rows[0].lastSeenAt = new Date(Date.now() - 600000); await auth(first.token);
  assert.ok(+db.rows[0].lastSeenAt > Date.now() - 1000);
  for (let n = 0; n < 10; n++) await loginSession(user, device(2));
  assert.equal(db.rows[0].challenges.length, 5);
});
test("explicit unique slot/UUID and TTL indexes are initialized without autoIndex", async () => {
  const original = Session.collection.createIndex, calls = [];
  Session.collection.createIndex = async (...args) => calls.push(args);
  try { await prepareSessionIndexes(); await prepareSessionIndexes(); }
  finally { Session.collection.createIndex = original; }
  assert.equal(Session.schema.options.autoIndex, false);
  assert.ok(calls.some(([keys, options]) => keys.userId === 1 && options.unique));
  assert.ok(calls.some(([keys, options]) => keys.sessionId === 1 && options.unique));
  assert.ok(calls.some(([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0));
});

});

import { sessionDouble } from "./sessionDouble.js";
let sessionMock;
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Organization from "../models/Organization.js";
import { mailer } from "../services/mailer.js";
import { validNotivaId, NOTIVA_ID_COLLATION } from "../services/identity.js";
import { identityRandom, generateNotivaId, suggestNotivaId } from "../services/notivaIdentity.js";
import { registerUser, notivaIdSuggestion, loginUser, registerOrganization } from "../controllers/authController.js";
import { publicUser, updateProfile, authenticate } from "../controllers/profileController.js";
import { setNotivaId, notivaIdAvailability, sendRecoveryEmailOtp, verifyRecoveryEmail, forgotPassword, verifyResetOtp, resetPassword, recoveryMessage, recoveryRateLimit } from "../controllers/recoveryController.js";
import { prepareIdentityIndexes } from "../services/identityMigration.js";
import authRoutes from "../routes/authRoutes.js";

// Conditional model doubles test race filters; no database or SMTP connection is opened.
const methods = ["findOne", "findById", "findOneAndUpdate", "findByIdAndUpdate", "updateOne", "create"];
const originals = Object.fromEntries(methods.map(key => [key, User[key]]));
const orgOriginal = { findOne: Organization.findOne, create: Organization.create };
const sendOriginal = mailer.send, suffixOriginal = identityRandom.suffix, secretOriginal = process.env.JWT_SECRET;
let records, deliveries, account;
const copy = value => value ? structuredClone(value) : value;
const get = (object, key) => key.split(".").reduce((value, part) => value?.[part], object);
function put(object, path, value, remove = false) {
  const parts = path.split("."), last = parts.pop(); let parent = object;
  for (const part of parts) { if (!parent[part]) parent[part] = {}; parent = parent[part]; }
  if (remove) delete parent[last]; else parent[last] = value;
}
function matches(row, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === "$or") return expected.some(value => matches(row, value));
    if (key === "$expr") return expected.$and.every(value => get(row, value.$eq[0].slice(1)) === get(row, value.$eq[1].slice(1)));
    const actual = get(row, key);
    if (expected && typeof expected === "object" && !(expected instanceof Date)) return Object.entries(expected).every(([operator, value]) => {
      if (operator === "$in") return value.some(v => v === null ? actual == null : actual === v);
      if (operator === "$exists") return (actual !== undefined) === value;
      if (operator === "$lt") return actual < value;
      if (operator === "$lte") return actual <= value;
      if (operator === "$gt") return actual > value;
      if (operator === "$ne") return actual !== value;
      throw Error(`Unsupported filter ${operator}`);
    });
    return expected === null ? actual == null : actual === expected;
  });
}
function update(query, change) {
  const row = records.find(value => matches(value, query)); if (!row) return null;
  if (change.$set?.notivaId && records.some(other => other !== row && other.notivaId?.toLowerCase() === change.$set.notivaId.toLowerCase())) throw { code: 11000, keyPattern: { notivaId: 1 } };
  for (const [key, value] of Object.entries(change.$set || {})) put(row, key, value);
  for (const key of Object.keys(change.$unset || {})) put(row, key, undefined, true);
  for (const [key, value] of Object.entries(change.$inc || {})) put(row, key, (get(row, key) || 0) + value);
  return copy(row);
}
const response = () => ({ code: 200, body: undefined, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
async function call(controller, body = {}, user = account, query = {}) {
  const res = response(); if (controller === loginUser) body = { deviceId: "11111111-1111-4111-8111-111111111111", platform: "android", ...body }; await controller({ body, user: copy(user), query, headers: {} }, res); return res;
}
const lastOtp = () => deliveries.at(-1).text.match(/\b\d{6}\b/)[0];
const registration = () => ({ fullName: "New User", notivaId: generateNotivaId("New User"), recoveryEmail: " NEW@Example.com ", mobileNumber: "+919876543210", password: "secret123", confirmPassword: "secret123" });
beforeEach(async () => {
  sessionMock = sessionDouble();
  process.env.JWT_SECRET = "test-only-recovery-secret";
  account = { _id: "507f1f77bcf86cd799439011", fullName: "Existing Person", email: "legacy@example.com", notivaId: "person_01", recoveryEmail: "recover@example.com", recoveryEmailVerified: false, mobileNumber: "+919876543210", department: "Design", organizationCode: "ORG-ABC123", role: "user", createdAt: new Date("2025-01-01"), password: await bcrypt.hash("old-password", 4) };
  records = [account]; deliveries = [];
  User.findOne = async (query, projection, options) => {
    if (query.notivaId !== undefined) {
      assert.deepEqual(options.collation, NOTIVA_ID_COLLATION);
      return copy(records.find(row => row.notivaId?.toLowerCase() === query.notivaId && (!query._id?.$ne || row._id !== query._id.$ne)) || null);
    }
    return copy(records.find(row => matches(row, query)) || null);
  };
  User.findById = async id => copy(records.find(row => row._id === id) || null);
  User.findOneAndUpdate = async (query, change) => update(query, change);
  User.findByIdAndUpdate = async (id, change) => update({ _id: id }, change);
  User.updateOne = async (query, change) => ({ modifiedCount: update(query, change) ? 1 : 0 });
  User.create = async value => {
    if (records.some(row => row.notivaId?.toLowerCase() === value.notivaId.toLowerCase())) throw { code: 11000, keyPattern: { notivaId: 1 } };
    const saved = { ...value, _id: `507f1f77bcf86cd7994390${String(records.length + 11).padStart(2, "0")}` }; records.push(saved); return copy(saved);
  };
  Organization.findOne = async () => null;
  mailer.send = async message => { deliveries.push(message); };
});
afterEach(() => {
  sessionMock.restore();
  Object.assign(User, originals); Object.assign(Organization, orgOriginal); mailer.send = sendOriginal; identityRandom.suffix = suffixOriginal;
  if (secretOriginal === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secretOriginal;
});

test("format boundaries, separators, reserved names, display case and unique collation", async () => {
  for (const id of ["jothi-07", "jothi_07", "JP.2026", "ABCD", "a".repeat(30)]) assert.ok(validNotivaId(id));
  for (const id of ["", "abc", "a".repeat(31), "ADMIN", "Admin", "admin", "ROOT", "system", "notiva", "support", "a b c", "a@b.c", "abc!", "aaaa ", " aaaa", "\u{1f388}"]) assert.equal(validNotivaId(id), false, id);
  const doc = new User({ ...account, notivaId: "JOTHI-07" }); await doc.validate(); assert.equal(doc.notivaId, "JOTHI-07");
  assert.ok(User.schema.indexes().some(([key, options]) => key.notivaId === 1 && options.unique && options.sparse && options.collation.strength === 2));
});
test("registration saves final ID, creates no session or access token and hashes password", async () => {
  const body = registration(); const res = await call(registerUser, body); assert.equal(res.code, 201);
  assert.equal(res.body.user.notivaId, body.notivaId);
  assert.equal(res.body.token, undefined); assert.equal(sessionMock.rows.length, 0);
  assert.match(res.body.user.notivaId, /^new-user-[a-f0-9]{6}$/); assert.equal(records[1].notivaId, res.body.user.notivaId);
  assert.equal(res.body.user.recoveryEmail, "new@example.com"); assert.equal(res.body.user.recoveryEmailVerified, false);
  assert.equal(records[1].email, undefined); assert.equal(res.body.user.password, undefined); assert.ok(await bcrypt.compare("secret123", records[1].password));
  for (const patch of [{ notivaId: "" }, { notivaId: "ADMIN" }, { notivaId: "a b c" }, { fullName: " " }, { recoveryEmail: "bad" }, { mobileNumber: "abc" }, { password: "123" }, { password: "x".repeat(73), confirmPassword: "x".repeat(73) }, { confirmPassword: "different" }]) assert.equal((await call(registerUser, { ...registration(), ...patch })).code, 400);
});
test("same names get distinct IDs; unsupported and short name bases have safe bounded output", async () => {
  const first = await call(registerUser, registration()), second = await call(registerUser, registration());
  assert.equal(first.code, 201); assert.equal(second.code, 201); assert.notEqual(first.body.user.notivaId, second.body.user.notivaId);
  for (const name of ["Jothi Prakash", "J\u00f3thi ! Prakash", "\u{1f388}", "a", "x".repeat(100)]) assert.ok(validNotivaId(generateNotivaId(name)));
  assert.match(generateNotivaId("\u{1f388}"), /^user-/);
});
test("suggestions reuse bounded generation, check collisions and never save users", async () => {
  records.push({ _id: "other", notivaId: "NEW-USER-000001" });
  const values = ["000001", "000002"]; identityRandom.suffix = () => values.shift() || "000001";
  assert.equal(await suggestNotivaId("New User"), "new-user-000002");
  await assert.rejects(suggestNotivaId("New User"));
  identityRandom.suffix = suffixOriginal;
  const before = records.length;
  for (const name of ["Jothi Prakash", "", "\u{1f388}", "x".repeat(100)]) {
    const res = await call(notivaIdSuggestion, { fullName: name });
    assert.equal(res.code, 200); assert.ok(validNotivaId(res.body.suggestedNotivaId));
    assert.deepEqual(Object.keys(res.body), ["suggestedNotivaId"]);
  }
  assert.equal(records.length, before);
});
test("selected IDs preserve case; taken IDs and duplicate-key races return 409 without substitution", async () => {
  const body = { ...registration(), notivaId: "JOTHI-07" };
  const first = await call(registerUser, body); assert.equal(first.code, 201); assert.equal(first.body.user.notivaId, body.notivaId);
  const second = await call(registerUser, { ...body, notivaId: "jothi-07" }); assert.equal(second.code, 409); assert.equal(records.length, 2);
  let attempts = 0; User.create = async () => { attempts++; throw { code: 11000, keyPattern: { notivaId: 1 } }; };
  assert.equal((await call(registerUser, { ...body, notivaId: "Race-ID" })).code, 409); assert.equal(attempts, 1);
});
test("concurrent registration claims have one winner and a conflict loser", async () => {
  const body = { ...registration(), notivaId: "Concurrent-ID" };
  const results = await Promise.all([call(registerUser, body), call(registerUser, { ...body, notivaId: "CONCURRENT-ID" })]);
  assert.deepEqual(results.map(x => x.code).sort(), [201, 409]);
  assert.equal(records.filter(x => x.notivaId.toLowerCase() === "concurrent-id").length, 1);
});

test("public availability has no account information and uses case-insensitive lookup", async () => {
  account.notivaId = "JOTHI-07";
  assert.deepEqual((await call(notivaIdAvailability, {}, null, { value: "jothi-07" })).body, { available: false });
  assert.deepEqual((await call(notivaIdAvailability, {}, null, { value: "Available-ID" })).body, { available: true });
  assert.equal(authRoutes.stack.find(x => x.route?.path === "/registration/notiva-id/availability").route.stack[0].handle, recoveryRateLimit);
});

test("registration checks organization and organization registration remains separate", async () => {
  const body = { ...registration(), organizationCode: "ORG-ABC123" }; assert.equal((await call(registerUser, body)).code, 400);
  Organization.findOne = async () => ({ organizationCode: body.organizationCode }); assert.equal((await call(registerUser, body)).body.user.organizationCode, body.organizationCode);
  Organization.findOne = async () => null; Organization.create = async value => ({ ...value, _id: "org-1" });
  assert.equal((await call(registerOrganization, { organizationName: "Studio", email: "org@example.com", mobileNumber: "1234567890", address: "Office" })).code, 201);
});
test("mixed-case ID and legacy login work; tokens contain current version and errors stay generic", async () => {
  account.notivaId = "JOTHI-07"; account.tokenVersion = 7;
  for (const identifier of ["jothi-07", "JOTHI-07", "JoThI-07", "legacy@example.com"]) {
    const res = await call(loginUser, { identifier, password: "old-password" }); assert.equal(res.code, 200);
    assert.equal(jwt.verify(res.body.token, process.env.JWT_SECRET).tokenVersion, 7); assert.equal(res.body.user.tokenVersion, undefined);
  }
  assert.deepEqual((await call(loginUser, { identifier: "jothi-07", password: "wrong" })).body, (await call(loginUser, { identifier: "unknown", password: "wrong" })).body);
});
test("legacy email login fills only missing recovery email and retains the same account", async () => {
  delete account.notivaId; delete account.recoveryEmail; const before = copy(account);
  assert.equal((await call(loginUser, { email: "LEGACY@example.com", password: "old-password" })).code, 200);
  assert.deepEqual(account, { ...before, recoveryEmail: before.email, recoveryEmailVerified: false, sessionEnforced: true });
});
test("legacy reconciliation cannot authenticate a password changed after credential verification", async () => {
  delete account.recoveryEmail;
  const priorUpdate = User.findOneAndUpdate;
  User.findOneAndUpdate = async (query, change) => {
    if (change.$set?.recoveryEmail) account.password = await bcrypt.hash("changed-password", 4);
    return priorUpdate(query, change);
  };
  const result = await call(loginUser, { email: account.email, password: "old-password" });
  assert.equal(result.code, 401); assert.equal(sessionMock.rows.length, 0);
});

test("custom ID and same-user case changes preserve profile and existing JWT", async () => {
  const token = (await call(loginUser, { identifier: account.notivaId, password: "old-password" })).body.token;
  const before = copy(account);
  for (const id of [" Jothi-07 ", "JOTHI-07", "JP.2026"]) {
    const res = await call(setNotivaId, { notivaId: id, userId: "other" }); assert.equal(res.code, 200);
    assert.deepEqual(account, { ...before, notivaId: id.trim() }); assert.deepEqual(res.body.user, publicUser(account));
  }
  let accepted = false; await authenticate({ headers: { authorization: `Bearer ${token}` } }, response(), () => { accepted = true; }); assert.ok(accepted);
  assert.equal(authRoutes.stack.find(layer => layer.route?.path === "/set-notiva-id").route.stack[0].handle, authenticate);
});
test("taken custom ID and duplicate-key races return conflict; availability excludes own record", async () => {
  records.push({ _id: "other", notivaId: "JOTHI-07" }); const before = copy(account);
  const taken = await call(setNotivaId, { notivaId: "jothi-07" }); assert.equal(taken.code, 409); assert.deepEqual(account, before);
  assert.deepEqual((await call(notivaIdAvailability, {}, account, { value: "JoThI-07" })).body, { available: false });
  assert.deepEqual((await call(notivaIdAvailability, {}, account, { value: "PERSON_01" })).body, { available: true });
  User.findOneAndUpdate = async () => { throw { code: 11000 }; };
  assert.equal((await call(setNotivaId, { notivaId: "available" })).code, 409);
  assert.equal((await call(setNotivaId, { notivaId: "ADMIN" })).code, 400);
  assert.equal((await call(setNotivaId, { notivaId: "a b c" })).code, 400);
});
test("concurrent custom claims have one winner and never change unrelated accounts", async () => {
  const second = { ...copy(account), _id: "507f1f77bcf86cd799439012", notivaId: "second-id" };
  records.push(second);
  const results = await Promise.all([call(setNotivaId, { notivaId: "Race-ID" }), call(setNotivaId, { notivaId: "RACE-ID" }, second)]);
  assert.deepEqual(results.map(x => x.code).sort(), [200, 409]);
  assert.equal(records.filter(x => x.notivaId.toLowerCase() === "race-id").length, 1);
  assert.equal(second.organizationCode, "ORG-ABC123");
});

test("legacy missing-ID account can set an ID without overwriting other records", async () => {
  delete account.notivaId; assert.equal((await call(setNotivaId, { notivaId: "Legacy.ID" })).code, 200); assert.equal(account.notivaId, "Legacy.ID");
});
test("optional recovery email verification stays hashed, expiring, masked and single-use", async () => {
  const sent = await call(sendRecoveryEmailOtp); assert.equal(sent.code, 200); assert.equal(sent.body.maskedEmail, "re***@example.com"); assert.equal(deliveries[0].to, account.recoveryEmail);
  const otp = lastOtp(); assert.notEqual(account.recoveryEmailOtp.hash, otp);
  assert.ok(account.recoveryEmailOtp.expiresAt > new Date()); assert.ok(account.recoveryEmailOtp.expiresAt <= new Date(Date.now() + 600000));
  assert.equal((await call(sendRecoveryEmailOtp)).code, 429);
  assert.equal((await call(verifyRecoveryEmail, { otp })).code, 200); assert.equal(account.recoveryEmailVerified, true);
  assert.equal((await call(verifyRecoveryEmail, { otp })).code, 400);
});
test("verification expiry, attempts, resend replacement and stale verifier protection", async () => {
  await call(sendRecoveryEmailOtp); const old = lastOtp(), stale = copy(account);
  account.recoveryEmailOtp.expiresAt = new Date(Date.now() - 1); assert.equal((await call(verifyRecoveryEmail, { otp: old })).code, 400);
  account.recoveryEmailOtp.sentAt = new Date(Date.now() - 61000); await call(sendRecoveryEmailOtp); assert.notEqual(lastOtp(), old);
  assert.equal((await call(verifyRecoveryEmail, { otp: old }, stale)).code, 400);
  const wrong = lastOtp() === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) await call(verifyRecoveryEmail, { otp: wrong });
  assert.equal((await call(verifyRecoveryEmail, { otp: lastOtp() })).code, 400);
});
test("profile recovery-email change clears OTP/reset state and preserves identity", async () => {
  account.recoveryEmailVerified = true; account.passwordResetOtp = { hash: "secret" }; account.resetAuthorizationHash = "secret"; const before = copy(account);
  const res = await call(updateProfile, { fullName: account.fullName, mobileNumber: account.mobileNumber, department: account.department, recoveryEmail: " NEW@example.com " });
  assert.equal(res.code, 200); assert.equal(account.recoveryEmail, "new@example.com"); assert.equal(account.recoveryEmailVerified, false);
  assert.equal(account.passwordResetOtp, undefined); assert.equal(account.resetAuthorizationHash, undefined);
  for (const key of ["email", "notivaId", "password", "organizationCode", "role"]) assert.deepEqual(account[key], before[key]);
});
test("forgot-password is case-insensitive, sends only to stored email and hides eligibility", async () => {
  account.notivaId = "JOTHI-07";
  const known = await call(forgotPassword, { notivaId: "JoThI-07", recoveryEmail: "attacker@example.com" });
  const unknown = await call(forgotPassword, { notivaId: "unknown" }); assert.deepEqual(known.body, unknown.body);
  assert.equal(deliveries.length, 1); assert.equal(deliveries[0].to, account.recoveryEmail); assert.equal(known.body.maskedEmail, undefined);
  assert.notEqual(account.passwordResetOtp.hash, lastOtp());
});
test("recovery rejects email lookup and missing/invalid destinations with generic response", async () => {
  const generic = { success: true, message: recoveryMessage, retryAfter: 60 };
  for (const body of [{ email: account.email }, { recoveryEmail: account.recoveryEmail }, { notivaId: account.email }, { identifier: account.recoveryEmail }]) assert.deepEqual((await call(forgotPassword, body)).body, generic);
  delete account.email; delete account.recoveryEmail; assert.deepEqual((await call(forgotPassword, { notivaId: account.notivaId })).body, generic);
  account.recoveryEmail = "invalid"; assert.deepEqual((await call(forgotPassword, { notivaId: account.notivaId })).body, generic); assert.equal(deliveries.length, 0);
});
test("legacy recovery copies missing recovery email after ID lookup only", async () => {
  delete account.recoveryEmail; const before = copy(account); await call(forgotPassword, { notivaId: account.notivaId });
  assert.equal(deliveries[0].to, before.email); assert.deepEqual(account, { ...before, recoveryEmail: before.email, recoveryEmailVerified: false, passwordResetOtp: account.passwordResetOtp });
});
async function authorization(user = account) {
  await call(forgotPassword, { notivaId: user.notivaId }); return call(verifyResetOtp, { notivaId: user.notivaId, otp: lastOtp() });
}
const resetBody = token => ({ resetToken: token, newPassword: "new-password", confirmPassword: "new-password" });
test("new unverified generated account logs in and resets; old token/password are rejected", async () => {
  const registered = await call(registerUser, registration()); assert.equal(registered.code, 201); const created = records[1];
  const old = await call(loginUser, { identifier: created.notivaId.toUpperCase(), password: "secret123" }); assert.equal(old.code, 200);
  const auth = await authorization(created); assert.equal(auth.code, 200); const body = resetBody(auth.body.resetToken);
  assert.equal((await call(resetPassword, body)).code, 200); assert.equal(created.tokenVersion, 1); assert.ok(sessionMock.rows[0].revokedAt); assert.equal(sessionMock.rows[0].refreshHash, ""); assert.ok(await bcrypt.compare(body.newPassword, created.password));
  assert.equal((await call(loginUser, { identifier: created.notivaId, password: "secret123" })).code, 401);
  const res = response(); await authenticate({ headers: { authorization: `Bearer ${old.body.token}` } }, res, () => assert.fail("old token")); assert.equal(res.code, 401);
  const fresh = await call(loginUser, { identifier: created.notivaId, password: body.newPassword }); assert.equal(fresh.code, 200);
  let accepted = false; await authenticate({ headers: { authorization: `Bearer ${fresh.body.token}` } }, response(), () => { accepted = true; }); assert.ok(accepted);
  assert.equal((await call(resetPassword, body)).code, 400); assert.equal(created.tokenVersion, 1);
});
test("reset authorization is hashed, expiring, single-use and not an access JWT", async () => {
  const auth = await authorization(); assert.match(auth.body.resetToken, /^[a-f0-9]{64}$/); assert.notEqual(account.resetAuthorizationHash, auth.body.resetToken);
  const denied = response(); await authenticate({ headers: { authorization: `Bearer ${auth.body.resetToken}` } }, denied, () => assert.fail("reset token")); assert.equal(denied.code, 401);
  const body = resetBody(auth.body.resetToken), before = copy(account);
  assert.equal((await call(resetPassword, { ...body, confirmPassword: "different" })).code, 400); assert.equal(account.tokenVersion, before.tokenVersion);
  account.resetAuthorizationExpiresAt = new Date(Date.now() - 1); assert.equal((await call(resetPassword, body)).code, 400); assert.equal(account.tokenVersion, before.tokenVersion);
  account.resetAuthorizationExpiresAt = new Date(Date.now() + 600000); assert.equal((await call(resetPassword, body)).code, 200);
  for (const key of ["_id", "email", "notivaId", "recoveryEmail", "organizationCode", "fullName", "createdAt"]) assert.deepEqual(account[key], before[key]);
  for (const key of ["passwordResetOtp", "resetAuthorizationHash", "resetAuthorizationExpiresAt", "resetAuthorizationEmail", "resetAuthorizationPasswordHash"]) assert.equal(account[key], undefined);
  assert.equal((await call(resetPassword, body)).code, 400); assert.equal(account.tokenVersion, 1);
});
test("OTP expiry, cooldown, replacement, attempts and concurrent single consume", async () => {
  const body = { notivaId: account.notivaId }; await call(forgotPassword, body); const old = lastOtp();
  await call(forgotPassword, body); assert.equal(deliveries.length, 1);
  account.passwordResetOtp.expiresAt = new Date(Date.now() - 1); assert.equal((await call(verifyResetOtp, { ...body, otp: old })).code, 400);
  account.passwordResetOtp.sentAt = new Date(Date.now() - 61000); await call(forgotPassword, body); assert.notEqual(lastOtp(), old);
  assert.equal((await call(verifyResetOtp, { ...body, otp: old })).code, 400);
  const wrong = lastOtp() === "000000" ? "111111" : "000000"; for (let i = 0; i < 4; i++) await call(verifyResetOtp, { ...body, otp: wrong });
  assert.equal((await call(verifyResetOtp, { ...body, otp: lastOtp() })).code, 400);
  account.passwordResetOtp.sentAt = new Date(Date.now() - 61000); await call(forgotPassword, body);
  const results = await Promise.all([call(verifyResetOtp, { ...body, otp: lastOtp() }), call(verifyResetOtp, { ...body, otp: lastOtp() })]); assert.deepEqual(results.map(x => x.code).sort(), [200, 400]);
});
test("new OTP invalidates authorization and changed email/password prevents stale reset", async () => {
  const auth = await authorization(); await call(forgotPassword, { notivaId: account.notivaId });
  assert.equal((await call(resetPassword, resetBody(auth.body.resetToken))).code, 400);
  const fresh = await call(verifyResetOtp, { notivaId: account.notivaId, otp: lastOtp() }); account.recoveryEmail = "changed@example.com";
  assert.equal((await call(resetPassword, resetBody(fresh.body.resetToken))).code, 400); assert.equal(account.tokenVersion, undefined);
});
test("password change invalidates password-bound reset authorization without increment on failed reset", async () => {
  const auth = await authorization();
  account.password = "newer-password-hash";
  assert.equal((await call(resetPassword, resetBody(auth.body.resetToken))).code, 400);
  assert.equal(account.tokenVersion, undefined);
});

test("mailer/database failures stay generic and failed delivery invalidates OTP", async () => {
  mailer.send = async () => { throw Error("SMTP secret"); };
  assert.equal((await call(sendRecoveryEmailOtp)).code, 503);
  assert.equal((await call(forgotPassword, { notivaId: account.notivaId })).body.message, recoveryMessage);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(account.passwordResetOtp.hash, undefined);
  User.findOne = async () => { throw Error("internal secret"); };
  assert.equal((await call(forgotPassword, { notivaId: account.notivaId })).body.message, recoveryMessage);
  assert.equal((await call(loginUser, { identifier: account.notivaId, password: "old-password" })).code, 503);
});
test("public serializer omits all secrets and internal identity/version", async () => {
  await authorization(); account.tokenVersion = 7;
  assert.doesNotMatch(JSON.stringify(publicUser(account)), /password|Otp|Authorization|hash|tokenVersion|Normalized/);
});
test("per-IP rate limit still rejects excess recovery requests", () => {
  const req = { ip: "test-ip", path: "/verify-reset-otp" }; let count = 0;
  for (let i = 0; i < 10; i++) recoveryRateLimit(req, response(), () => count++);
  const res = response(); recoveryRateLimit(req, res, () => assert.fail("rate limit")); assert.equal(count, 10); assert.equal(res.code, 429);
});
test("index replacement is case-insensitive, repeatable and creates before dropping old identity index", async () => {
  const names = ["indexes", "createIndex", "dropIndex"], original = Object.fromEntries(names.map(key => [key, User.collection[key]]));
  let indexes = [{ name: "email_1", key: { email: 1 }, unique: true }, { name: "notivaId_1", key: { notivaId: 1 }, unique: true, sparse: true }], operations = [];
  User.collection.indexes = async () => copy(indexes);
  User.collection.createIndex = async (key, options) => { operations.push(`create:${options.name}`); indexes.push({ key, ...options }); };
  User.collection.dropIndex = async name => { operations.push(`drop:${name}`); indexes = indexes.filter(index => index.name !== name); };
  try {
    await prepareIdentityIndexes(); assert.deepEqual(operations, ["create:legacy_email_sparse", "drop:email_1", "create:notivaId_case_insensitive", "drop:notivaId_1"]);
    await prepareIdentityIndexes(); assert.equal(operations.length, 4);
    assert.deepEqual(indexes.find(x => x.key.notivaId).collation, NOTIVA_ID_COLLATION);
    indexes = [{ name: "legacy_email_sparse", key: { email: 1 }, sparse: true, unique: true }, { name: "notivaId_1", key: { notivaId: 1 }, unique: true, sparse: true }];
    User.collection.createIndex = async () => { throw Error("duplicate identities"); };
    await assert.rejects(prepareIdentityIndexes()); assert.ok(indexes.some(x => x.name === "notivaId_1"));
  } finally { Object.assign(User.collection, original); }
});

import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Organization from "../models/Organization.js";
import { authenticate, getProfile, updateProfile, changePassword, joinOrganization, leaveOrganization } from "../controllers/profileController.js";
import { registerUser } from "../controllers/authController.js";
import authRoutes from "../routes/authRoutes.js";

// Controller tests use isolated model doubles. No production database or account
// is contacted; password hashing and JWT verification use the actual libraries.
const originalUser = Object.fromEntries(["findOne", "findById", "findByIdAndUpdate", "findOneAndUpdate", "updateOne", "create"].map(key => [key, User[key]]));
const originalOrganization = Organization.findOne;
const secret = process.env.JWT_SECRET;
afterEach(() => {
  Object.assign(User, originalUser); Organization.findOne = originalOrganization;
  if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret;
});
const user = { _id: "507f1f77bcf86cd799439011", fullName: "Test User", email: "test@example.com", mobileNumber: "+919876543210", department: "Design", organizationCode: "", role: "user", password: "private-hash" };
const response = () => ({ code: 200, body: undefined, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const validFields = { fullName: "Updated Name", email: "UPDATED@example.com", mobileNumber: "+919876543210", department: "Product" };

test("unauthenticated and expired requests are rejected", async () => {
  process.env.JWT_SECRET = "test-only-secret";
  for (const authorization of [undefined, "Bearer garbage", `Bearer ${jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: -1 })}`]) {
    const res = response();
    await authenticate({ headers: { authorization } }, res, () => assert.fail("must not authenticate"));
    assert.equal(res.code, 401);
  }
});
test("valid JWT loads the account by ID", async () => {
  process.env.JWT_SECRET = "test-only-secret";
  User.findById = async id => { assert.equal(id, user._id); return user; };
  const req = { headers: { authorization: `Bearer ${jwt.sign({ userId: user._id }, process.env.JWT_SECRET)}` } };
  let passed = false;
  await authenticate(req, response(), () => { passed = true; });
  assert.equal(passed, true); assert.equal(req.user, user);
});
test("profile returns permitted user and organization fields only", async () => {
  Organization.findOne = async () => ({ organizationName: "Studio", organizationCode: "ORG-ABC123", gstNumber: "private", email: "office@example.com" });
  const res = response();
  await getProfile({ user: { ...user, organizationCode: "ORG-ABC123" } }, res);
  assert.equal(res.body.user.password, undefined);
  assert.equal(res.body.organization.gstNumber, undefined);
  assert.equal(res.body.organization.organizationName, "Studio");
});
test("profile edits normalize email and never expose a password", async () => {
  User.findOne = async query => { assert.equal(query.email, "updated@example.com"); return null; };
  User.findByIdAndUpdate = async (id, update) => ({ ...user, ...update.$set });
  const res = response(); await updateProfile({ user, body: validFields }, res);
  assert.equal(res.code, 200); assert.equal(res.body.user.email, "updated@example.com");
  assert.equal(res.body.user.password, undefined);
});
test("duplicate email and unique-index race return inline email errors", async () => {
  for (const race of [false, true]) {
    User.findOne = async () => race ? null : user;
    User.findByIdAndUpdate = async () => { throw { code: 11000 }; };
    const res = response(); await updateProfile({ user, body: validFields }, res);
    assert.equal(res.code, 409); assert.ok(res.body.errors.email);
  }
});
test("organization and role cannot be edited through profile", async () => {
  for (const field of ["organizationCode", "role", "password"]) {
    const res = response(); await updateProfile({ user, body: { ...validFields, [field]: "invalid" } }, res);
    assert.equal(res.code, 400);
  }
});
test("profile validation rejects invalid name, email and mobile", async () => {
  const res = response(); await updateProfile({ user, body: { fullName: " ", email: "bad", mobileNumber: "hello" } }, res);
  assert.equal(res.code, 400);
  for (const key of ["fullName", "email", "mobileNumber"]) assert.ok(res.body.errors[key]);
});
test("incorrect current password never updates account", async () => {
  const password = await bcrypt.hash("correct-password", 4);
  User.findOneAndUpdate = async () => assert.fail("must not update");
  const res = response(); await changePassword({ user: { ...user, password }, body: { currentPassword: "wrong", newPassword: "new-password" } }, res);
  assert.equal(res.code, 400); assert.ok(res.body.errors.currentPassword);
});
test("password change atomically increments version and replaces the current token", async () => {
  process.env.JWT_SECRET = "test-only-secret";
  const password = await bcrypt.hash("old-password", 4);
  const current = { ...user, password };
  const oldToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
  User.findOneAndUpdate = async (query, update) => {
    assert.equal(query.password, password);
    assert.deepEqual(update.$inc, { tokenVersion: 1 });
    Object.assign(current, update.$set, { tokenVersion: 1 });
    return current;
  };
  const res = response(); await changePassword({ user: { ...current }, body: { currentPassword: "old-password", newPassword: "new-password" } }, res);
  assert.equal(res.code, 200); assert.ok(await bcrypt.compare("new-password", current.password));
  assert.equal(res.body.password, undefined); assert.equal(res.body.user.tokenVersion, undefined);
  assert.equal(jwt.verify(res.body.token, process.env.JWT_SECRET).tokenVersion, 1);
  User.findById = async () => current;
  const rejected = response();
  await authenticate({ headers: { authorization: `Bearer ${oldToken}` } }, rejected, () => assert.fail("old token must be revoked"));
  assert.equal(rejected.code, 401);
  let accepted = false;
  await authenticate({ headers: { authorization: `Bearer ${res.body.token}` } }, response(), () => { accepted = true; });
  assert.ok(accepted);
});

test("password change conflict does not issue a replacement token", async () => {
  const current = { ...user, password: await bcrypt.hash("old-password", 4), tokenVersion: 3 };
  User.findOneAndUpdate = async () => null;
  const res = response();
  await changePassword({ user: current, body: { currentPassword: "old-password", newPassword: "new-password" } }, res);
  assert.equal(res.code, 409); assert.equal(current.tokenVersion, 3); assert.equal(res.body.token, undefined);
});

test("JWT versions reject stale, malformed and missing claims after revocation", async () => {
  process.env.JWT_SECRET = "test-only-secret";
  User.findById = async () => ({ ...user, tokenVersion: 2 });
  for (const version of [undefined, 0, 1, -1, "2", null, 2.5]) {
    const token = jwt.sign({ userId: user._id, ...(version === undefined ? {} : { tokenVersion: version }) }, process.env.JWT_SECRET);
    const res = response();
    await authenticate({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail("invalid version"));
    assert.equal(res.code, 401);
  }
});

test("organization join rejects unknown code without writing user", async () => {
  Organization.findOne = async () => null;
  User.findByIdAndUpdate = async () => assert.fail("must not update");
  const res = response(); await joinOrganization({ user, body: { organizationCode: "ORG-ABC123" } }, res);
  assert.equal(res.code, 404);
});
test("organization join updates only a verified organization code", async () => {
  Organization.findOne = async query => { assert.equal(query.organizationCode, "ORG-ABC123"); return { organizationName: "Studio", organizationCode: "ORG-ABC123" }; };
  User.findByIdAndUpdate = async (id, update) => { assert.deepEqual(update, { $set: { organizationCode: "ORG-ABC123" } }); return { ...user, ...update.$set }; };
  const res = response(); await joinOrganization({ user, body: { organizationCode: " org-abc123 " } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.user.organizationCode, "ORG-ABC123"); assert.equal(res.body.user.password, undefined);
});
test("registration cannot bypass organization verification", async () => {
  User.findOne = async () => null; Organization.findOne = async () => null;
  User.create = async () => assert.fail("must not register with unknown organization");
  const res = response(); await registerUser({ body: { ...validFields, notivaId: "test_user", recoveryEmail: "test@example.com", password: "test-password", confirmPassword: "test-password", organizationCode: "ORG-ABC123" } }, res);
  assert.equal(res.code, 400);
});

// Dispatch through the actual router, including authentication, without a network listener.
function leaveRequest(authorization, body = {}) {
  return new Promise((resolve, reject) => {
    const res = response();
    res.json = value => { res.body = value; resolve(res); return res; };
    authRoutes.handle({ method: "POST", url: "/leave-organization", headers: { authorization }, body }, res,
      error => reject(error || new Error("Leave route was not handled")));
  });
}

test("authenticated leave preserves personal data, other users and the existing session", async () => {
  process.env.JWT_SECRET = "test-only-secret";
  const before = { ...user, organizationCode: "ORG-ABC123", createdAt: new Date("2025-01-01"), personalField: "preserved" };
  const other = { ...user, _id: "507f1f77bcf86cd799439012", organizationCode: "ORG-ABC123" };
  const accounts = new Map([[before._id, { ...before }], [other._id, { ...other }]]);
  User.findById = async id => accounts.get(id);
  User.findOneAndUpdate = async (query, update, options) => {
    assert.deepEqual(query, { _id: before._id, organizationCode: before.organizationCode });
    assert.deepEqual(update, { $set: { organizationCode: "" } });
    assert.equal(options.returnDocument, "after");
    const current = accounts.get(query._id);
    if (current.organizationCode !== query.organizationCode) return null;
    const saved = { ...current, ...update.$set };
    accounts.set(query._id, saved);
    return saved;
  };
  Organization.findOne = async () => assert.fail("leave must not require an organization lookup");
  const token = jwt.sign({ userId: before._id, role: before.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
  const res = await leaveRequest(`Bearer ${token}`, { userId: other._id, organizationCode: "ORG-NEW123", role: "admin", password: "replacement" });
  assert.equal(res.code, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, "You have left the organization.");
  assert.equal(res.body.organization, null);
  assert.deepEqual(accounts.get(before._id), { ...before, organizationCode: "" });
  assert.deepEqual(accounts.get(other._id), other);
  assert.deepEqual(res.body.user, {
    id: before._id, fullName: before.fullName, email: before.email, mobileNumber: before.mobileNumber,
    department: before.department, organizationCode: "", role: before.role,
    notivaId: "", recoveryEmail: before.email, recoveryEmailVerified: false,
  });
  assert.equal(res.body.token, undefined);
  assert.equal(JSON.stringify(res.body).includes(before.password), false);
  let authenticated = false;
  await authenticate({ headers: { authorization: `Bearer ${token}` } }, response(), () => { authenticated = true; });
  assert.equal(authenticated, true, "the same token remains valid after leaving");
});

for (const kind of ["missing", "invalid", "expired"]) {
  test(`leave route rejects ${kind} token before accessing user data`, async () => {
    process.env.JWT_SECRET = "test-only-secret";
    User.findById = async () => assert.fail("must not read user");
    User.findOneAndUpdate = async () => assert.fail("must not write user");
    const authorization = kind === "missing" ? undefined : kind === "invalid" ? "Bearer garbage"
      : `Bearer ${jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: -1 })}`;
    const res = await leaveRequest(authorization);
    assert.equal(res.code, 401);
  });
}

test("already unlinked user can leave repeatedly", async () => {
  User.findOneAndUpdate = async (query, update) => {
    assert.deepEqual(query, { _id: user._id, organizationCode: "" });
    assert.deepEqual(update, { $set: { organizationCode: "" } });
    return { ...user };
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = response();
    await leaveOrganization({ user }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.organizationCode, "");
    assert.equal(res.body.organization, null);
  }
});

test("stale organization reference can be cleared without an organization record", async () => {
  let lookups = 0;
  Organization.findOne = async () => { lookups++; return null; };
  User.findOneAndUpdate = async () => ({ ...user });
  const res = response();
  await leaveOrganization({ user: { ...user, organizationCode: "ORG-GONE12" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.user.organizationCode, "");
  assert.equal(lookups, 0);
});

for (const observedCode of ["ORG-ABC123", ""]) {
  test(`concurrent organization change is preserved when observed code is '${observedCode}'`, async () => {
    const current = { ...user, organizationCode: "ORG-NEW123" };
    let writes = 0;
    User.findOneAndUpdate = async (query, update) => {
      writes++;
      assert.deepEqual(query, { _id: user._id, organizationCode: observedCode });
      if (query.organizationCode !== current.organizationCode) return null;
      Object.assign(current, update.$set);
      return current;
    };
    User.findById = async id => { assert.equal(id, user._id); return current; };
    const res = response();
    await leaveOrganization({ user: { ...user, organizationCode: observedCode } }, res);
    assert.equal(res.code, 409);
    assert.equal(current.organizationCode, "ORG-NEW123");
    assert.equal(writes, 1, "must not retry an unconditional update");
  });
}

test("concurrent leave returns success when another request already cleared the link", async () => {
  User.findOneAndUpdate = async () => null;
  User.findById = async () => ({ ...user });
  const res = response();
  await leaveOrganization({ user: { ...user, organizationCode: "ORG-ABC123" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.organization, null);
});

test("account removed during leave returns 404", async () => {
  User.findOneAndUpdate = async () => null;
  User.findById = async () => null;
  const res = response();
  await leaveOrganization({ user }, res);
  assert.equal(res.code, 404);
});

test("leave database failures return a safe response without internal details", async () => {
  for (const failRead of [false, true]) {
    User.findOneAndUpdate = async () => { if (failRead) return null; throw new Error("private database details"); };
    User.findById = async () => { throw new Error("private database details"); };
    const res = response();
    await leaveOrganization({ user }, res);
    assert.equal(res.code, 503);
    assert.deepEqual(res.body, { message: "Could not leave organization. Try again." });
  }
});

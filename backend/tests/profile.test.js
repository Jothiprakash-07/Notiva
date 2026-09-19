import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Organization from "../models/Organization.js";
import { authenticate, getProfile, updateProfile, changePassword, joinOrganization } from "../controllers/profileController.js";
import { registerUser } from "../controllers/authController.js";

// Controller tests use isolated model doubles. No production database or account
// is contacted; password hashing and JWT verification use the actual libraries.
const originalUser = Object.fromEntries(["findOne", "findById", "findByIdAndUpdate", "updateOne", "create"].map(key => [key, User[key]]));
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
  User.updateOne = async () => assert.fail("must not update");
  const res = response(); await changePassword({ user: { ...user, password }, body: { currentPassword: "wrong", newPassword: "new-password" } }, res);
  assert.equal(res.code, 400); assert.ok(res.body.errors.currentPassword);
});
test("password change stores bcrypt hash, returns no password and keeps session policy", async () => {
  const password = await bcrypt.hash("old-password", 4);
  let saved;
  User.updateOne = async (query, update) => { assert.equal(query.password, password); saved = update.$set.password; return { modifiedCount: 1 }; };
  const res = response(); await changePassword({ user: { ...user, password }, body: { currentPassword: "old-password", newPassword: "new-password" } }, res);
  assert.equal(res.code, 200); assert.ok(await bcrypt.compare("new-password", saved));
  assert.equal(res.body.password, undefined); assert.equal(res.body.token, undefined);
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
  const res = response(); await registerUser({ body: { ...validFields, password: "test-password", organizationCode: "ORG-ABC123" } }, res);
  assert.equal(res.code, 400);
});

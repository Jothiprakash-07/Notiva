import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Organization from "../models/Organization.js";
import Member from "../models/OrganizationMember.js";
import Request from "../models/OrganizationJoinRequest.js";
import routes from "../routes/organizationRoutes.js";
import authRoutes from "../routes/authRoutes.js";
import { prepareOrganizationIndexes } from "../services/organizationIndexes.js";
import { generateJoinCode } from "../services/organizations.js";
import { ORGANIZATION_PERMISSIONS } from "../services/organizationPermissions.js";

// Real isolated replica set + HTTP. Never reads .env or touches an existing DB.
test("organization foundation against isolated MongoDB replica set", { timeout: 120000 }, async t => {
  const reserve = net.createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const directory = await mkdtemp(path.join(tmpdir(), "notiva-organizations-"));
  const child = spawn(process.env.NOTIVA_TEST_MONGOD || "C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe",
    ["--dbpath", directory, "--bind_ip", "127.0.0.1", "--port", String(port), "--replSet", "notivaTest", "--oplogSize", "16", "--quiet", "--setParameter", `indexBuildMinAvailableDiskSpaceMB=${Math.max(16, Number(process.env.NOTIVA_TEST_INDEX_DISK_MB ?? 500))}`],
    { windowsHide: true, stdio: "ignore" });
  let launchError; child.on("error", e => { launchError = e; });
  let server;
  const oldSecret = process.env.JWT_SECRET;
  try {
    let connected = false;
    for (let i = 0; i < 20; i++) {
      if (launchError) throw launchError;
      try { await mongoose.connect(`mongodb://127.0.0.1:${port}/organizations_test?directConnection=true`, { serverSelectionTimeoutMS: 500, autoCreate: false, autoIndex: false }); connected = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(connected, "Test MongoDB must start");
    await mongoose.connection.db.admin().command({ replSetInitiate: { _id: "notivaTest", members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    for (let i = 0; i < 100; i++) {
      if ((await mongoose.connection.db.admin().command({ hello: 1 })).isWritablePrimary) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await prepareOrganizationIndexes(); await User.init();
    const users = await User.create(Array.from({ length: 7 }, (_, i) => ({ fullName: `Person ${i}`, notivaId: `person_${i}`,
      password: "test-hash", mobileNumber: "1234567890", recoveryEmail: `private${i}@example.com` })));
    const ids = users.map(u => String(u._id));
    process.env.JWT_SECRET = "isolated-organization-tests-only";
    const tokens = ids.map(userId => jwt.sign({ userId, tokenVersion: 0 }, process.env.JWT_SECRET));
    const app = express(); app.use(express.json()); app.use("/api/organizations", routes); app.use("/api/auth", authRoutes);
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    const api = async (user, method, url, body, status = 200) => {
      const result = await fetch(origin + url, { method, headers: { "Content-Type": "application/json", ...(user === null ? {} : { Authorization: `Bearer ${tokens[user]}` }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await result.json(); assert.equal(result.status, status, `${method} ${url}: ${JSON.stringify(data)}`); return data;
    };
    const base = "/api/organizations";
    let org, code, pending, adminRequest;
    const join = (user, joinCode = code) => api(user, "POST", `${base}/join-request`, { joinCode });
    const decision = (user, request, action = "approve", status = 200) => api(user, "POST", `${base}/${org}/join-requests/${request}/` + action, {}, status);
    const role = (user, target, value, status = 200) => api(user, "PATCH", `${base}/${org}/members/${ids[target]}/role`, value, status);
    await t.test("authentication required including legacy organization registration", async () => {
      await api(null, "POST", base, { name: "A" }, 401);
      await api(null, "GET", base + "/permission-options", undefined, 401);
      assert.deepEqual((await api(0, "GET", base + "/permission-options")).permissions, ORGANIZATION_PERMISSIONS);
      await api(null, "POST", "/api/auth/organization-register", { organizationName: "A" }, 401);
    });
    await t.test("create organization atomically with creator as sole Owner and unique cryptographic code", async () => {
      const result = await api(0, "POST", base, { name: "Studio A" }, 201);
      org = result.organization.id; code = result.organization.joinCode;
      assert.equal(result.membership.role, "owner"); assert.equal(result.organization.ownerUserId, ids[0]);
      assert.equal(await Member.countDocuments({ organizationId: org, role: "owner", status: "active" }), 1);
      assert.equal(new Set(Array.from({ length: 1000 }, generateJoinCode)).size, 1000);
      await assert.rejects(Organization.create({ name: "Duplicate", organizationCode: "legacy-unused", joinCode: code }), e => e.code === 11000);
    });
    await t.test("creation rollback leaves neither organization nor membership", async () => {
      const original = Member.create; Member.create = async () => { throw new Error("injected membership failure"); };
      try { await api(0, "POST", base, { name: "Rollback" }, 503); } finally { Member.create = original; }
      assert.equal(await Organization.countDocuments({ name: "Rollback" }), 0);
    });
    await t.test("invalid and legacy unclaimed join codes cannot grant access", async () => {
      await api(1, "POST", `${base}/join-request`, { joinCode: "ORG-INVALID12345" }, 404);
      await Organization.create({ organizationName: "Legacy", organizationCode: "ORG-ABC123" });
      await api(1, "POST", `${base}/join-request`, { joinCode: "ORG-ABC123" }, 404);
    });
    await t.test("join is pending; concurrent duplicates return one request and create no membership", async () => {
      const results = await Promise.all([join(1, code.toLowerCase()), join(1), join(1)]);
      pending = results[0].request.id;
      assert.equal(new Set(results.map(r => r.request.id)).size, 1);
      assert.equal(await Request.countDocuments({ organizationId: org, requesterUserId: ids[1], status: "pending" }), 1);
      assert.equal(await Member.countDocuments({ organizationId: org, userId: ids[1] }), 0);
    });
    await t.test("requester sees only own status; Owner pending data contains safe fields", async () => {
      await api(null, "GET", base + "/join-requests/mine", undefined, 401);
      const own = await api(1, "GET", base + "/join-requests/mine");
      assert.equal(own.requests.length, 1); assert.equal(own.requests[0].status, "pending");
      assert.equal(own.requests[0].organizationId, org); assert.equal(own.requests[0].id, pending);
      assert.deepEqual(Object.keys(own.requests[0]).sort(), ["id", "organizationId", "organizationName", "requestedAt", "status"]);
      const other = await api(6, "GET", base + "/join-requests/mine"); assert.equal(other.requests.length, 0);
      const owner = await api(0, "GET", base + "/" + org + "/join-requests?status=pending");
      const row = owner.requests.find(row => row.id === pending); assert.ok(row);
      assert.deepEqual(Object.keys(row.requester).sort(), ["_id", "fullName", "notivaId"]);
    });
    await t.test("Owner approval creates Member with no teams; actor and time visible; retry safe", async () => {
      await decision(0, pending); const first = await Request.findById(pending).lean();
      await decision(0, pending); assert.equal(+(await Request.findById(pending)).actedAt, +first.actedAt);
      const member = await Member.findOne({ organizationId: org, userId: ids[1] }).lean();
      assert.equal(member.role, "member"); assert.deepEqual(member.permissions, []); assert.equal(member.teamId, undefined);
      const history = await api(0, "GET", `${base}/${org}/join-requests?status=approved`);
      assert.equal(history.requests[0].actedByUserId, ids[0]); assert.ok(history.requests[0].actedAt);
      assert.equal(history.requests[0].actedBy.recoveryEmail, undefined);
      assert.equal((await join(1)).alreadyMember, true);
    });
    await t.test("Owner promotes Admin with explicit allowlisted permissions; arbitrary strings rejected", async () => {
      await role(0, 1, { role: "admin", permissions: ["superuser"] }, 400);
      await role(0, 1, { role: "admin", permissions: ["approve_join_requests", "manage_members"] });
      await role(1, 0, { role: "admin", permissions: [] }, 403);
      await api(1, "PATCH", `${base}/${org}/members/${ids[1]}/permissions`, { permissions: [] }, 403);
    });
    await t.test("unique membership and sole active Owner indexes reject duplicate rows", async () => {
      await assert.rejects(Member.create({ organizationId: org, userId: ids[0], role: "member", status: "active", joinedAt: new Date() }), e => e.code === 11000);
      await assert.rejects(Member.create({ organizationId: org, userId: ids[6], role: "owner", status: "active", joinedAt: new Date() }), e => e.code === 11000);
    });
    await t.test("member directory is safe and join code permission enforced", async () => {
      await api(1, "GET", `${base}/${org}/join-code`, undefined, 403);
      assert.equal((await api(1, "GET", `${base}/${org}`)).organization.joinCode, undefined);
      const directory = await api(1, "GET", `${base}/${org}/members`);
      assert.ok(directory.members.every(m => m.profile.recoveryEmail === undefined && m.profile.mobileNumber === undefined));
      await api(0, "PATCH", `${base}/${org}/members/${ids[1]}/permissions`, { permissions: ["approve_join_requests", "manage_members", "view_join_code"] });
      assert.equal((await api(1, "GET", `${base}/${org}/join-code`)).joinCode, code);
    });
    await t.test("authorized Admin approves and rejects with actor visible to Owner and eligible Admin", async () => {
      adminRequest = (await join(2)).request.id; await decision(1, adminRequest);
      const rejected = (await join(3)).request.id; await decision(1, rejected, "reject");
      for (const viewer of [0, 1]) {
        const history = await api(viewer, "GET", `${base}/${org}/join-requests?status=rejected`);
        assert.equal(history.requests[0].actedByUserId, ids[1]); assert.equal(history.requests[0].action, "rejected");
        const approvals = await api(viewer, "GET", `${base}/${org}/join-requests?status=approved`);
        assert.equal(approvals.requests.find(r => r.id === adminRequest).actedByUserId, ids[1]);
      }
      assert.equal(await Member.countDocuments({ organizationId: org, userId: ids[3] }), 0);
    });
    await t.test("Member cannot view code; Admin denied without permission; DB changes apply to same token", async () => {
      await role(1, 2, { role: "admin", permissions: [] }, 403);
      await api(2, "GET", `${base}/${org}/join-code`, undefined, 403);
      assert.equal((await api(2, "GET", `${base}/${org}`)).organization.joinCode, undefined);
      await role(0, 1, { role: "admin", permissions: [] });
      const request = (await join(3)).request.id;
      await decision(1, request, "approve", 403);
      await api(1, "GET", `${base}/${org}/join-requests`, undefined, 403);
      await role(0, 1, { role: "admin", permissions: ["approve_join_requests", "manage_members"] });
      await decision(1, request);
    });
    await t.test("regeneration Owner-only; invalidates old code; members and pending requests survive", async () => {
      const request = (await join(4)).request.id;
      await api(1, "POST", `${base}/${org}/regenerate-join-code`, {}, 403);
      const oldCode = code; code = (await api(0, "POST", `${base}/${org}/regenerate-join-code`, {})).organization.joinCode;
      assert.notEqual(code, oldCode);
      await api(5, "POST", `${base}/join-request`, { joinCode: oldCode }, 404);
      await api(2, "GET", `${base}/${org}`); await decision(1, request);
      assert.equal((await Organization.findById(org)).joinCodeVersion, 2);
    });
    await t.test("multi-org roles and permissions remain isolated; cross-org requests blocked", async () => {
      const b = (await api(2, "POST", base, { name: "Studio B" }, 201)).organization;
      const request = (await join(0, b.joinCode)).request.id;
      await api(2, "POST", `${base}/${b.id}/join-requests/${request}/approve`, {});
      const c = (await api(3, "POST", base, { name: "Studio C" }, 201)).organization;
      const cr = (await join(0, c.joinCode)).request.id;
      await api(3, "POST", `${base}/${c.id}/join-requests/${cr}/approve`, {});
      await api(3, "PATCH", `${base}/${c.id}/members/${ids[0]}/role`, { role: "admin", permissions: ["view_reports"] });
      const mine = (await api(0, "GET", base)).organizations;
      assert.equal(mine.find(r => r.organization.id === org).membership.role, "owner");
      assert.equal(mine.find(r => r.organization.id === b.id).membership.role, "member");
      assert.deepEqual(mine.find(r => r.organization.id === c.id).membership.permissions, ["view_reports"]);
      await api(0, "POST", `${base}/${b.id}/regenerate-join-code`, {}, 403);
      await api(0, "GET", `${base}/${c.id}/join-requests`, undefined, 403);
      await api(1, "GET", `${base}/${b.id}`, undefined, 403);
      await decision(0, request, "approve", 404);
    });
    await t.test("Admin cannot remove Owner or Admin; Owner cannot leave directly", async () => {
      await api(1, "DELETE", `${base}/${org}/members/${ids[0]}`, undefined, 409);
      await role(0, 3, { role: "admin", permissions: [] });
      await api(1, "DELETE", `${base}/${org}/members/${ids[3]}`, undefined, 403);
      const result = await api(0, "POST", `${base}/${org}/leave`, {}, 409);
      assert.equal(result.code, "OWNERSHIP_TRANSFER_REQUIRED");
    });
    await t.test("removal revokes organization access while account and personal items survive", async () => {
      const before = await User.findById(ids[2]).lean();
      const items = mongoose.connection.collection("items"); await items.insertOne({ userId: users[2]._id, marker: "personal" });
      await api(1, "DELETE", `${base}/${org}/members/${ids[2]}`);
      await api(2, "GET", `${base}/${org}`, undefined, 403);
      assert.deepEqual(await User.findById(ids[2]).lean(), before);
      assert.equal(await items.countDocuments({ userId: users[2]._id }), 1);
      const row = await Member.findOne({ organizationId: org, userId: ids[2] });
      assert.equal(String(row.removedByUserId), ids[1]); assert.ok(row.removedAt);
    });
    await t.test("Owner demotion clears permissions; Member and Admin self-leave revoke access", async () => {
      await role(0, 3, { role: "member" });
      assert.deepEqual((await Member.findOne({ organizationId: org, userId: ids[3] })).permissions, []);
      await api(3, "POST", `${base}/${org}/leave`, {});
      await api(1, "POST", `${base}/${org}/leave`, {});
      await api(1, "GET", `${base}/${org}`, undefined, 403);
      assert.deepEqual((await Member.findOne({ organizationId: org, userId: ids[1] })).permissions, []);
    });
    await t.test("removed user rejoins only after approval, with no stale Admin privileges", async () => {
      const request = (await join(1)).request.id; await decision(0, request);
      const row = await Member.findOne({ organizationId: org, userId: ids[1] });
      assert.equal(row.role, "member"); assert.deepEqual(row.permissions, []);
      assert.equal(await Member.countDocuments({ organizationId: org, userId: ids[1] }), 1);
    });
    await t.test("ownership transfer is atomic; sole Owner changes and previous Owner defaults to Member", async () => {
      const original = Organization.prototype.save;
      Organization.prototype.save = async function(options) {
        if (String(this._id) === org) throw new Error("injected transfer failure");
        return original.call(this, options);
      };
      try { await api(0, "POST", `${base}/${org}/transfer-ownership`, { targetUserId: ids[4] }, 503); }
      finally { Organization.prototype.save = original; }
      assert.equal(String((await Organization.findById(org)).ownerUserId), ids[0]);
      assert.equal((await Member.findOne({ organizationId: org, userId: ids[0] })).role, "owner");
      assert.equal((await Member.findOne({ organizationId: org, userId: ids[4] })).role, "member");
      await api(0, "POST", `${base}/${org}/transfer-ownership`, { targetUserId: ids[2] }, 404);
      await api(0, "POST", `${base}/${org}/transfer-ownership`, { targetUserId: ids[4] });
      assert.equal(await Member.countDocuments({ organizationId: org, status: "active", role: "owner" }), 1);
      assert.equal(String((await Organization.findById(org)).ownerUserId), ids[4]);
      assert.equal((await Member.findOne({ organizationId: org, userId: ids[0] })).role, "member");
      await api(0, "POST", `${base}/${org}/regenerate-join-code`, {}, 403);
      await api(4, "POST", `${base}/${org}/transfer-ownership`, { targetUserId: ids[0], previousOwnerRole: "admin", permissions: ["view_reports"] });
      assert.deepEqual((await Member.findOne({ organizationId: org, userId: ids[4] })).permissions, ["view_reports"]);
    });
    await t.test("racing approvals make one membership; failed decision rolls back membership and history", async () => {
      const request = (await join(6)).request.id;
      const original = Request.prototype.save;
      Request.prototype.save = async () => { throw new Error("injected decision failure"); };
      try { await decision(0, request, "approve", 503); } finally { Request.prototype.save = original; }
      assert.equal(await Member.countDocuments({ organizationId: org, userId: ids[6] }), 0);
      assert.equal((await Request.findById(request)).status, "pending");
      await Promise.all([decision(0, request), decision(0, request)]);
      assert.equal(await Member.countDocuments({ organizationId: org, userId: ids[6] }), 1);
      await decision(0, request, "reject", 409);
    });
    await t.test("legacy join routes create pending requests; legacy profile and session remain compatible", async () => {
      const result = await api(5, "POST", "/api/auth/join-organization", { organizationCode: code });
      assert.equal(result.request.status, "pending");
      assert.equal((await User.findById(ids[5])).organizationCode, "");
      const profile = await api(0, "GET", "/api/auth/profile");
      assert.equal(profile.user.id, ids[0]); assert.equal(profile.user.password, undefined);
      const ownerLeave = await api(0, "POST", "/api/auth/leave-organization", { organizationId: org }, 409);
      assert.equal(ownerLeave.code, "OWNERSHIP_TRANSFER_REQUIRED");
      await api(0, "POST", "/api/auth/register", { fullName: "New", notivaId: "new_person", recoveryEmail: "new@example.com",
        mobileNumber: "1234567890", password: "test-password", confirmPassword: "test-password", organizationCode: code }, 400);
    });
    await t.test("deletion Owner-only; memberships revoked and history preserved", async () => {
      await api(4, "DELETE", `${base}/${org}`, undefined, 403);
      await api(0, "DELETE", `${base}/${org}`);
      assert.equal(await Member.countDocuments({ organizationId: org, status: "active" }), 0);
      await api(4, "GET", `${base}/${org}`, undefined, 404);
      assert.ok(await Request.countDocuments({ organizationId: org, status: "approved" }));
      assert.equal((await Request.findOne({ organizationId: org, requesterUserId: ids[5] })).status, "cancelled");
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (child.exitCode === null && !launchError) { child.kill(); await once(child, "exit"); }
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("notiva-organizations-"));
    await rm(directory, { recursive: true, force: true });
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
  }
});

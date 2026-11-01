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
import routes from "../routes/organizationRoutes.js";
import authRoutes from "../routes/authRoutes.js";
import { prepareOrganizationIndexes } from "../services/organizationIndexes.js";

// Disposable real replica set. Never reads .env or an existing database.
export async function teamFixture(t) {
  const reserve = net.createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const directory = await mkdtemp(path.join(tmpdir(), "notiva-teams-"));
  const indexDiskMB = Number(process.env.NOTIVA_TEST_INDEX_DISK_MB ?? 500);
  assert.ok(Number.isSafeInteger(indexDiskMB) && indexDiskMB >= 16, "Disposable test index reserve must be at least 16 MB");
  const child = spawn(process.env.NOTIVA_TEST_MONGOD || "C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe",
    ["--dbpath", directory, "--bind_ip", "127.0.0.1", "--port", String(port), "--replSet", "notivaTeamsTest", "--oplogSize", "16", "--quiet", "--setParameter", `indexBuildMinAvailableDiskSpaceMB=${indexDiskMB}`],
    { windowsHide: true, stdio: "ignore" });
  let launchError, server; child.on("error", error => { launchError = error; });
  const oldSecret = process.env.JWT_SECRET;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (child.exitCode === null && !launchError) { child.kill(); await once(child, "exit"); }
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("notiva-teams-"));
    await rm(directory, { recursive: true, force: true });
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
  });
  let connected = false;
  for (let i = 0; i < 20; i++) {
    if (launchError) throw launchError;
    try { await mongoose.connect(`mongodb://127.0.0.1:${port}/teams_test?directConnection=true`, {
      serverSelectionTimeoutMS: 500, autoCreate: false, autoIndex: false,
    }); connected = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(connected, "Isolated MongoDB must start");
  await mongoose.connection.db.admin().command({ replSetInitiate: { _id: "notivaTeamsTest", members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
  let primary = false;
  for (let i = 0; i < 100; i++) {
    if ((await mongoose.connection.db.admin().command({ hello: 1 })).isWritablePrimary) { primary = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(primary, "Replica set must elect its primary");
  await prepareOrganizationIndexes();
  const users = await User.create(Array.from({ length: 10 }, (_, i) => ({ fullName: `Team Person ${i}`, notivaId: `team_person_${i}`,
    password: "test-hash", mobileNumber: "1234567890", recoveryEmail: `private-team-${i}@example.com` })));
  const ids = users.map(user => String(user._id));
  process.env.JWT_SECRET = "isolated-team-tests-only";
  const tokens = ids.map(userId => jwt.sign({ userId, tokenVersion: 0 }, process.env.JWT_SECRET));
  const app = express(); app.use(express.json()); app.use("/api/organizations", routes); app.use("/api/auth", authRoutes);
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const raw = async (user, method, url, body) => {
    const response = await fetch(origin + url, { method, headers: { "Content-Type": "application/json",
      ...(user === null ? {} : { Authorization: `Bearer ${tokens[user]}` }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const api = async (user, method, url, body, expected = 200) => {
    const result = await raw(user, method, url, body);
    assert.equal(result.status, expected, `${method} ${url}: ${JSON.stringify(result.body)}`);
    return result.body;
  };
  const base = "/api/organizations";
  const a = (await api(0, "POST", base, { name: "Team Org A" }, 201)).organization;
  const b = (await api(5, "POST", base, { name: "Team Org B" }, 201)).organization;
  const join = async (user, org = a, owner = 0) => {
    const result = await api(user, "POST", `${base}/join-request`, { joinCode: org.joinCode });
    await api(owner, "POST", `${base}/${org.id}/join-requests/${result.request.id}/approve`, {});
  };
  for (const i of [1, 2, 3, 4, 7, 8]) await join(i);
  for (const i of [0, 6]) await join(i, b, 5);
  const permissions = (target, values) => api(0, "PATCH", `${base}/${a.id}/members/${ids[target]}/role`, { role: "admin", permissions: values });
  await permissions(1, ["manage_teams", "assign_team_members"]);
  await permissions(2, ["manage_teams"]); await permissions(3, ["assign_team_members"]);
  await api(7, "POST", `${base}/${a.id}/leave`, {});
  await api(0, "DELETE", `${base}/${a.id}/members/${ids[8]}`);
  return { api, raw, ids, a, b, base, join, permissions };
}

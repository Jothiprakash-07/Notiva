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
import routes from "../routes/organizationRoutes.js";
import { prepareOrganizationIndexes } from "../services/organizationIndexes.js";

// Real isolated replica set + HTTP. Never reads .env or touches an existing DB.
test("organization creation only against isolated MongoDB replica set", { timeout: 120000 }, async t => {
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
    const users = await User.create(Array.from({ length: 1 }, (_, i) => ({ fullName: `Person ${i}`, notivaId: `person_${i}`,
      password: "test-hash", mobileNumber: "1234567890", recoveryEmail: `private${i}@example.com` })));
    const ids = users.map(u => String(u._id));
    process.env.JWT_SECRET = "isolated-organization-tests-only";
    const tokens = ids.map(userId => jwt.sign({ userId, tokenVersion: 0 }, process.env.JWT_SECRET));
    const app = express(); app.use(express.json()); app.use("/api/organizations", routes);
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    const api = async (user, method, url, body, status = 200) => {
      const result = await fetch(origin + url, { method, headers: { "Content-Type": "application/json", ...(user === null ? {} : { Authorization: `Bearer ${tokens[user]}` }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await result.json(); assert.equal(result.status, status, `${method} ${url}: ${JSON.stringify(data)}`); return data;
    };
    const base = "/api/organizations";

    await t.test('creation validates contact details, saves metadata, sole Owner and unique listed organization', async () => {
      const details={email:'Office@Example.com',mobileNumber:'9999999999',address:'Vivo validation office'};
      await api(0,'POST',base,{name:'   ',...details},400);
      for(const field of ['email','mobileNumber','address']) await api(0,'POST',base,{name:'Invalid',...details,[field]:''},400);
      await api(0,'POST',base,{name:'Invalid email',...details,email:'invalid'},400);
      const result=await api(0,'POST',base,{name:' Creation only ',...details},201);
      const id=result.organization.id;
      const row=await Organization.findById(id);
      assert.equal(row.name,'Creation only');assert.equal(row.email,'office@example.com');
      assert.equal(row.mobileNumber,details.mobileNumber);assert.equal(row.address,details.address);
      assert.equal(String(row.ownerUserId),ids[0]);assert.equal(result.membership.role,'owner');
      assert.equal(await Member.countDocuments({organizationId:id}),1);
      assert.equal(await Member.countDocuments({organizationId:id,userId:ids[0],role:'owner',status:'active'}),1);
      assert.match(row.joinCode,/^ORG-[A-F0-9]{12}$/);
      assert.equal(await Organization.countDocuments({joinCode:row.joinCode}),1);
      assert.equal(await Organization.countDocuments({name:'Creation only'}),1);
      const list=await api(0,'GET',base);
      assert.equal(list.organizations.filter(entry=>entry.organization.id===id).length,1);
    });
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    await mongoose.disconnect(); child.kill(); await once(child,'exit').catch(()=>{});
    await rm(directory,{recursive:true,force:true});
    if(oldSecret===undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET=oldSecret;
  }
});

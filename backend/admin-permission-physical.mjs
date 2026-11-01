import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import User from './models/user.js';
import Session from './models/Session.js';
import Member from './models/OrganizationMember.js';
import Organization from './models/Organization.js';
import TeamMember from './models/TeamMember.js';
import Request from './models/OrganizationJoinRequest.js';
import Item from './models/Item.js';
import { createAccessToken } from './services/accessToken.js';
dotenv.config({ quiet: true }); await mongoose.connect(process.env.MONGO_URI);
const file = '../.build-tools/admin-physical-state.json';
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const personal = async userId => ({ user: hash(await User.findById(userId).lean()), items: hash(await Item.find({ ownerUserId: userId }).sort({ _id: 1 }).lean()) });
try {
  const state = JSON.parse(fs.readFileSync(fs.existsSync(file) ? file : '../.build-tools/org-join-result.json'));
  const root = '/api/organizations/' + state.organizationId, phase = process.argv[2];
  const api = async (method, path, body, expected = 200, token = state.token) => {
    const response = await fetch('http://127.0.0.1:5000' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); assert.equal(response.status, expected, JSON.stringify({ method, path, status: response.status, data }));
    (state.checks ??= []).push({ method, path, status: response.status, code: data.code }); return data;
  };
  if (phase === 'prepare') {
    const user = await User.findById(state.secondUserId), session = await Session.findOne({ userId: user._id, revokedAt: null }); assert.ok(session && +session.expiresAt > Date.now());
    state.token = createAccessToken(user, session.sessionId); state.tokenHash = hash(state.token);
    state.beforePersonal = await personal(state.secondUserId);
    state.membershipId = String((await Member.findOne({ organizationId: state.organizationId, userId: state.secondUserId }))._id);
    state.selectedPermissions = ['view_members', 'manage_teams', 'assign_team_members', 'approve_join_requests']; state.checks = [];
    state.originalJoinCode = (await Organization.findById(state.organizationId)).joinCode;
  }
  if (phase === 'positive') {
    const entry = await api('GET', root); assert.equal(entry.membership.role, 'admin'); assert.deepEqual(entry.membership.permissions.sort(), [...state.selectedPermissions].sort());
    assert.equal(await Member.countDocuments({ organizationId: state.organizationId, userId: state.secondUserId }), 1);
    assert.equal((await Member.findOne({ organizationId: state.organizationId, userId: state.ownerUserId })).role, 'owner');
    await api('GET', root + '/members');
    state.teamId = (await api('POST', root + '/teams', { name: 'Admin Permission Validation ' + Date.now() }, 201)).team.id;
    await api('PATCH', root + '/teams/' + state.teamId, { description: 'Limited Admin positive permission test' });
    await api('POST', root + '/teams/' + state.teamId + '/members', { userId: state.secondUserId });
    const password = crypto.randomBytes(18).toString('hex'), notivaId = 'admin_join_' + Date.now().toString().slice(-8);
    state.thirdUserId = (await api('POST', '/api/auth/register', { fullName: 'Admin Approval Probe', notivaId, recoveryEmail: notivaId + '@example.com', mobileNumber: '9999999997', password, confirmPassword: password }, 201, null)).user.id;
    const login = await api('POST', '/api/auth/login', { identifier: notivaId, password, deviceId: crypto.randomUUID(), deviceName: 'Admin approval test identity', platform: 'web' }, 200, null);
    const joined = await api('POST', '/api/organizations/join-request', { joinCode: state.originalJoinCode }, 200, login.token);
    await api('POST', root + '/join-requests/' + joined.request.id + '/approve', {});
    const approved = await Request.findById(joined.request.id); assert.equal(String(approved.actedByUserId), state.secondUserId); assert.equal(approved.status, 'approved'); assert.ok(approved.actedAt);
    state.adminApproval = { requestId: joined.request.id, actedByUserId: String(approved.actedByUserId), actedAt: approved.actedAt };
    for (const [method, path, body] of [
      ['PATCH', root + '/members/' + state.thirdUserId + '/role', { role: 'admin', permissions: [] }],
      ['PATCH', root + '/members/' + state.secondUserId + '/permissions', { permissions: ['view_join_code'] }],
      ['POST', root + '/transfer-ownership', { targetUserId: state.thirdUserId }],
      ['POST', root + '/regenerate-join-code', {}], ['DELETE', root], ['GET', root + '/join-code'],
      ['DELETE', root + '/members/' + state.thirdUserId], ['PATCH', root + '/sharing-policy', { employeeSharingEnabled: true }],
    ]) await api(method, path, body, 403);
    assert.equal((await Organization.findById(state.organizationId)).joinCode, state.originalJoinCode);
    state.teamsBeforeDemotion = hash(await TeamMember.find({ organizationId: state.organizationId, userId: state.secondUserId }).sort({ _id: 1 }).lean());
  }
  if (phase === 'extra-denied') {
    await api('GET', root + '/shared-items', undefined, 403);
    await api('POST', root + '/shared-items', { type: 'task', title: 'Permission denial probe', schedule: { startAt: new Date(Date.now() + 3600000).toISOString() }, targets: [{ targetType: 'organization' }], clientRequestId: crypto.randomUUID() }, 403);
  }
  if (phase === 'removed') {
    assert.equal(hash(state.token), state.tokenHash);
    const entry = await api('GET', root); assert.equal(entry.membership.role, 'admin'); assert.ok(!entry.membership.permissions.includes('manage_teams'));
    await api('POST', root + '/teams', { name: 'Removed permission must deny' }, 403);
    await api('PATCH', root + '/teams/' + state.teamId, { description: 'Must deny immediately' }, 403);
    await api('GET', root + '/members'); state.immediateRevocation = true;
  }
  if (phase === 'demoted') {
    assert.equal(hash(state.token), state.tokenHash);
    const member = await Member.findOne({ organizationId: state.organizationId, userId: state.secondUserId }).lean();
    assert.equal(member.role, 'member'); assert.deepEqual(member.permissions, []); assert.equal(String(member._id), state.membershipId);
    assert.equal(await Member.countDocuments({ organizationId: state.organizationId, userId: state.secondUserId }), 1);
    assert.equal((await api('GET', root)).membership.role, 'member');
    await api('POST', root + '/teams', { name: 'Demoted must deny' }, 403);
    await api('POST', root + '/teams/' + state.teamId + '/members', { userId: state.thirdUserId }, 403);
    await api('GET', root + '/join-requests', undefined, 403);
    assert.deepEqual(await personal(state.secondUserId), state.beforePersonal);
    assert.equal(hash(await TeamMember.find({ organizationId: state.organizationId, userId: state.secondUserId }).sort({ _id: 1 }).lean()), state.teamsBeforeDemotion);
    assert.equal(String((await Organization.findById(state.organizationId)).ownerUserId), state.ownerUserId);
    Object.assign(state, { finalRole: member.role, finalPermissions: member.permissions, memberPreserved: true, personalDataUnchanged: true, teamMembershipUnchangedOnDemotion: true, ownerPreserved: true });
    const { token, ...safe } = state; fs.writeFileSync('../.build-tools/admin-physical-result.json', JSON.stringify(safe, null, 2));
  }
  fs.writeFileSync(file, JSON.stringify(state)); console.log(JSON.stringify({ phase, checks: state.checks, finalRole: state.finalRole, immediateRevocation: state.immediateRevocation }));
} finally { await mongoose.disconnect(); }

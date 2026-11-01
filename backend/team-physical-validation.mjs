import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import User from './models/user.js';
import Session from './models/Session.js';
import Organization from './models/Organization.js';
import Member from './models/OrganizationMember.js';
import Team from './models/Team.js';
import Link from './models/TeamMember.js';
import { createAccessToken } from './services/accessToken.js';

dotenv.config({ quiet: true });
await mongoose.connect(process.env.MONGO_URI);
const file = '../.build-tools/team-physical-result.json';
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const org = '6ae489400c5c35d54687c7e0', owner = '6ae487760edd352ea30d0897', member = '6ae48b400fbeb45bb61a6e0b';
const personal = async () => ({ user: digest(await User.findById(member).lean()), items: digest(await mongoose.connection.collection('items').find({ ownerUserId: new mongoose.Types.ObjectId(member) }).sort({ _id: 1 }).toArray()) });
const phase = process.argv[2];
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { organizationId: org, ownerUserId: owner, memberUserId: member, checks: [] };
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2));
const root = '/api/organizations/' + org;
const tokenFor = async id => {
  const user = await User.findById(id);
  const session = await Session.findOne({ userId: id, revokedAt: null, expiresAt: { $gt: new Date() } });
  assert.ok(session, 'Existing live session required');
  return createAccessToken(user, session.sessionId);
};
const api = async (token, method, path, body, expected = 200) => {
  const response = await fetch('http://127.0.0.1:5000' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify({ method, path, status: response.status, data }));
  state.checks.push({ method, path, status: response.status, code: data.code });
  save(); return data;
};
try {
  if (phase === 'baseline') {
    assert.equal(await Team.countDocuments({ organizationId: org, normalizedName: { $in: ['sales', 'development', 'development team'] }, status: 'active' }), 0);
    state.personalBefore = await personal();
    state.orgMembershipBefore = await Member.findOne({ organizationId: org, userId: member }).lean();
    assert.equal(state.orgMembershipBefore.status, 'active');
    assert.equal(state.orgMembershipBefore.role, 'member');
    state.baselineAt = new Date().toISOString();
    state.ownerSessionActive = !!(await tokenFor(owner));
    save();
  }
  if (phase === 'snapshot') {
    const teams = await Team.find({ organizationId: org }).sort({ _id: 1 }).lean();
    const links = await Link.find({ organizationId: org }).sort({ _id: 1 }).lean();
    state.teams = teams;
    state.links = links;
    state.personalUnchanged = JSON.stringify(await personal()) === JSON.stringify(state.personalBefore);
    state.organizationMembershipUnchanged = digest(await Member.findOne({ organizationId: org, userId: member }).lean()) === digest(state.orgMembershipBefore);
    const duplicates = await Link.aggregate([{ $match: { organizationId: new mongoose.Types.ObjectId(org) } }, { $group: { _id: { team: '$teamId', user: '$userId' }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]);
    assert.deepEqual(duplicates, []);
    for (const link of links) assert.ok(teams.some(team => String(team._id) === String(link.teamId)));
    state.noDuplicateLinks = true;
    state.snapshotAt = new Date().toISOString();
    (state.snapshots ??= []).push({ at: state.snapshotAt, teams, links, personalUnchanged: state.personalUnchanged, organizationMembershipUnchanged: state.organizationMembershipUnchanged });
    save();
    console.log(JSON.stringify({ teams: teams.map(t => ({ id: t._id, name: t.name, status: t.status })), links, personalUnchanged: state.personalUnchanged, organizationMembershipUnchanged: state.organizationMembershipUnchanged }, null, 2));
  }
  if (phase === 'security') {
    const ownerToken = await tokenFor(owner), memberToken = await tokenFor(member);
    const sales = await Team.findOne({ organizationId: org, normalizedName: 'sales', status: 'active' });
    const development = await Team.findOne({ organizationId: org, normalizedName: 'development team', status: 'active' });
    assert.ok(sales && development);
    assert.equal(String(development._id), '6ae5bea8d716edfc45884b07');
    for (const name of ['sales', 'SALES']) await api(ownerToken, 'POST', root + '/teams', { name }, 409);
    const linkBefore = await Link.findOne({ teamId: development._id, userId: member }).lean();
    await api(ownerToken, 'POST', root + '/teams/' + development._id + '/members', { userId: member });
    assert.deepEqual(await Link.findById(linkBefore._id).lean(), linkBefore);
    await api(ownerToken, 'PATCH', root + '/teams/' + development._id, { name: 'Development Team' });
    assert.deepEqual(await Link.findById(linkBefore._id).lean(), linkBefore);
    state.renameWithMembershipPreserved = true;
    await api(memberToken, 'POST', root + '/teams/' + sales._id + '/members', { userId: member }, 403);
    await api(memberToken, 'DELETE', root + '/teams/' + development._id + '/members/' + member, undefined, 403);
    state.selfAssignmentDenied = true;

    // Use the existing disposable approval-test identity; keep the approved Member's role untouched.
    const adminId = '6ae48ebbfa0951ef078b0a2c';
    const original = await Member.findOne({ organizationId: org, userId: adminId }).lean();
    assert.equal(original.status, 'active');
    const adminToken = await tokenFor(adminId);
    state.adminOriginalRole = original.role;
    let disposable;
    try {
      await api(ownerToken, 'PATCH', root + '/members/' + adminId + '/role', { role: 'admin', permissions: ['manage_teams', 'assign_team_members'] });
      disposable = (await api(adminToken, 'POST', root + '/teams', { name: 'Team Physical Disposable ' + Date.now() }, 201)).team;
      state.disposableTeamId = disposable.id; save();
      await api(adminToken, 'PATCH', root + '/teams/' + disposable.id, { description: 'Live limited Admin validation' });
      await api(adminToken, 'POST', root + '/teams/' + disposable.id + '/members', { userId: member });
      await api(adminToken, 'DELETE', root + '/teams/' + disposable.id + '/members/' + member);
      await api(ownerToken, 'PATCH', root + '/members/' + adminId + '/permissions', { permissions: ['assign_team_members'] });
      await api(adminToken, 'POST', root + '/teams', { name: 'Denied immediate revocation' }, 403);
      await api(adminToken, 'PATCH', root + '/teams/' + disposable.id, { name: 'Denied rename' }, 403);
      await api(adminToken, 'POST', root + '/teams/' + disposable.id + '/members', { userId: member });
      await api(ownerToken, 'PATCH', root + '/members/' + adminId + '/permissions', { permissions: ['manage_teams'] });
      await api(adminToken, 'POST', root + '/teams/' + disposable.id + '/members', { userId: member }, 403);
      await api(adminToken, 'DELETE', root + '/teams/' + disposable.id + '/members/' + member, undefined, 403);
      state.adminSameTokenRevocation = true;
    } finally {
      await api(ownerToken, 'PATCH', root + '/members/' + adminId + '/role', { role: original.role, permissions: original.permissions });
      state.adminRoleRestored = true; save();
    }
    const foreignOrg = '6ae487ff0edd352ea30d0899';
    const foreignRoot = '/api/organizations/' + foreignOrg;
    const foreignTeam = (await api(ownerToken, 'POST', foreignRoot + '/teams', { name: 'Cross Org Physical Probe ' + Date.now() }, 201)).team;
    state.foreignProbeTeamId = foreignTeam.id; save();
    try {
      for (const path of [foreignRoot + '/teams', foreignRoot + '/teams/' + foreignTeam.id]) {
        const denied = await api(memberToken, 'GET', path, undefined, 403);
        assert.equal(denied.team, undefined); assert.equal(denied.teams, undefined);
      }
      for (const [method, suffix, body] of [['GET', '', undefined], ['PATCH', '', { name: 'Forbidden mixed org' }], ['POST', '/members', { userId: member }], ['GET', '/members', undefined]]) {
        const denied = await api(ownerToken, method, root + '/teams/' + foreignTeam.id + suffix, body, 404);
        assert.equal(denied.team, undefined); assert.equal(denied.members, undefined);
      }
      await api(ownerToken, 'POST', root + '/teams/' + sales._id + '/members', { userId: '6ae47e6e0edd352ea30d0893' }, 400);
      await api(ownerToken, 'POST', root + '/teams', { name: 'Mixed org payload', organizationId: foreignOrg }, 400);
      state.crossOrganizationDenied = true;
    } finally { await api(ownerToken, 'DELETE', foreignRoot + '/teams/' + foreignTeam.id); }
    assert.deepEqual(await personal(), state.personalBefore);
    assert.equal(digest(await Member.findOne({ organizationId: org, userId: member }).lean()), digest(state.orgMembershipBefore));
    save();
    console.log(JSON.stringify({ checks: state.checks.length, adminSameTokenRevocation: state.adminSameTokenRevocation, selfAssignmentDenied: state.selfAssignmentDenied, crossOrganizationDenied: state.crossOrganizationDenied, disposableTeamId: state.disposableTeamId }));
  }
  if (phase === 'archive-check') {
    const token = await tokenFor(owner), id = state.disposableTeamId;
    const archived = await Team.findById(id).lean();
    assert.equal(archived.status, 'archived'); assert.ok(archived.archivedAt); assert.equal(String(archived.archivedByUserId), owner);
    assert.equal(await Link.countDocuments({ teamId: id, status: 'active' }), 0);
    const history = await Link.findOne({ teamId: id, userId: member }).lean();
    assert.equal(history.status, 'removed'); assert.ok(history.removedAt); assert.equal(String(history.removedByUserId), owner);
    await api(token, 'POST', root + '/teams/' + id + '/members', { userId: member }, 409);
    await api(token, 'PATCH', root + '/teams/' + id, { name: 'Archived edit denied' }, 409);
    assert.deepEqual(await personal(), state.personalBefore);
    assert.equal(digest(await Member.findOne({ organizationId: org, userId: member }).lean()), digest(state.orgMembershipBefore));
    state.archiveHistoryPreserved = true; save();
  }
  if (phase === 'final') {
    const token = await tokenFor(owner);
    const rows = (await api(token, 'GET', root + '/members/' + member + '/teams')).teams;
    assert.ok(rows.some(row => row.name === 'Development Team'));
    assert.ok(!rows.some(row => row.name === 'Sales' || row.id === state.disposableTeamId));
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
    for (const name of ['sales', 'development team']) assert.equal(await Team.countDocuments({ organizationId: org, normalizedName: name, status: 'active' }), 1);
    const sales = await Team.findOne({ organizationId: org, normalizedName: 'sales', status: 'active' });
    const development = await Team.findOne({ organizationId: org, normalizedName: 'development team', status: 'active' });
    assert.equal(String(development._id), '6ae5bea8d716edfc45884b07');
    assert.equal((await Link.findOne({ teamId: sales._id, userId: member })).status, 'removed');
    assert.equal((await Link.findOne({ teamId: development._id, userId: member })).status, 'active');
    for (const team of [sales, development]) assert.equal(await Link.countDocuments({ teamId: team._id, userId: member }), 1);
    assert.deepEqual(await personal(), state.personalBefore);
    assert.equal(digest(await Member.findOne({ organizationId: org, userId: member }).lean()), digest(state.orgMembershipBefore));
    state.finalMemberTeams = rows.map(({ id, name }) => ({ id, name }));
    state.finalValidatedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ checks: state.checks.length, finalMemberTeams: state.finalMemberTeams }));
  }
  console.log('PASS ' + phase);
} finally { await mongoose.disconnect(); }

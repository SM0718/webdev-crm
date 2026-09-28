import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_value_123';
process.env.ADMIN_NAME = 'Test Admin';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/webdev-crm-test';

const { app } = await import('../src/app.js');
const { seedAdminOnBoot, hashPassword } = await import('../controllers/authController.js');
const { User } = await import('../models/User.js');
const { Lead } = await import('../models/Lead.js');
const { makeTextPdf } = await import('./fixtures/makeTextPdf.js');
const { HOWRAH_GYMS_PDF } = await import('./fixtures/claudePdfs.js');

let mongo;
let adminToken;
let memberToken;
let memberId;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await seedAdminOnBoot();
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([Lead.deleteMany({}), User.deleteMany({ role: 'member' })]);

  const admin = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'Admin@12345' });
  assert.equal(admin.status, 200, JSON.stringify(admin.body));
  adminToken = admin.body.token;

  const member = await User.create({
    name: 'Rahul',
    email: 'rahul@test.com',
    passwordHash: await hashPassword('Member@12345'),
    role: 'member',
  });
  memberId = member._id.toString();
  const login = await request(app).post('/api/auth/login').send({ email: 'rahul@test.com', password: 'Member@12345' });
  memberToken = login.body.token;
});

/* ---------------------------------------------------------------------- auth */

test('POST /api/auth/login rejects a bad password with a generic message', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'wrong-password' });
  assert.equal(res.status, 401);
  assert.match(res.body.message, /Incorrect email or password/i);
});

test('POST /api/auth/login validates the payload', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'nope', password: '' });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.ok(res.body.details.length >= 2);
});

test('GET /api/auth/me returns the session user', async () => {
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'admin');
  assert.equal(res.body.user.passwordHash, undefined);
});

test('protected routes reject a missing or bogus token', async () => {
  assert.equal((await request(app).get('/api/leads')).status, 401);
  assert.equal((await request(app).get('/api/leads').set('Authorization', 'Bearer nonsense')).status, 401);
});

test('POST /api/auth/seed-admin is idempotent', async () => {
  const res = await request(app).post('/api/auth/seed-admin');
  assert.equal(res.status, 200);
  assert.equal(res.body.created, false);
  assert.equal(await User.countDocuments({ role: 'admin' }), 1);
});

/* ------------------------------------------------------------- pdf ingestion */

test('parse-pdf is admin only', async () => {
  const res = await request(app)
    .post('/api/leads/parse-pdf')
    .set('Authorization', `Bearer ${memberToken}`)
    .attach('file', makeTextPdf(['x']), 'list.pdf');
  assert.equal(res.status, 403);
});

test('parse-pdf rejects a non-PDF upload', async () => {
  const res = await request(app)
    .post('/api/leads/parse-pdf')
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', Buffer.from('nope'), 'leads.txt');
  assert.equal(res.status, 400);
});

test('parse-pdf -> preview without saving, then bulk-save', async () => {
  const parsed = await request(app)
    .post('/api/leads/parse-pdf')
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', makeTextPdf(HOWRAH_GYMS_PDF.split('\n')), 'Howrah_Gym_Leads.pdf');

  assert.equal(parsed.status, 200);
  assert.equal(parsed.body.fileName, 'Howrah_Gym_Leads.pdf');
  assert.equal(parsed.body.parsedLeads.length, 4);
  assert.equal(parsed.body.parsedLeads[0].customerName, 'Fitness Addiction Xtreme');
  assert.equal(parsed.body.parsedLeads[0].isDuplicate, false);

  assert.equal(await Lead.countDocuments({}), 0, 'preview step must not write to the DB');

  // Admin edits a cell in the preview before confirming.
  const rows = parsed.body.parsedLeads.map((l) => ({ ...l }));
  rows[0].customerName = 'Fitness Addiction Xtreme (edited)';
  rows.pop(); // uncheck the last row

  const saved = await request(app)
    .post('/api/leads/bulk-save')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileName: 'Howrah_Gym_Leads.pdf', leads: rows });

  assert.equal(saved.status, 201);
  assert.equal(saved.body.imported, 3);
  assert.equal(await Lead.countDocuments({}), 3);

  const stored = await Lead.findOne({ phoneNumber: '062908 79580' });
  assert.equal(stored.customerName, 'Fitness Addiction Xtreme (edited)');
  assert.equal(stored.status, 'New');
  assert.equal(stored.sourcePdfName, 'Howrah_Gym_Leads.pdf');
  assert.equal(stored.assignedTo, null);
});

test('parse-pdf flags phone numbers that already exist as duplicates', async () => {
  await Lead.create({
    customerName: 'Existing Gym',
    phoneNumber: '062908 79580',
    businessNiche: 'Gym',
  });

  const parsed = await request(app)
    .post('/api/leads/parse-pdf')
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', makeTextPdf(HOWRAH_GYMS_PDF.split('\n')), 'Howrah_Gym_Leads.pdf');

  const dupes = parsed.body.parsedLeads.filter((l) => l.isDuplicate);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].phoneNumber, '062908 79580');
});

test('bulk-save validates the array shape', async () => {
  const res = await request(app)
    .post('/api/leads/bulk-save')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ leads: [{ customerName: 'No phone', businessNiche: 'Gym' }] });

  assert.equal(res.status, 400);
  assert.ok(res.body.details.some((d) => d.field.endsWith('phoneNumber')), JSON.stringify(res.body.details));
  assert.equal(await Lead.countDocuments({}), 0, 'nothing is written when validation fails');
});

/* --------------------------------------------------------------------- leads */

const seedLeads = async () => {
  await Lead.insertMany([
    { customerName: 'Iron Temple Gym', phoneNumber: '098269 63500', businessNiche: 'Gym', address: 'Shibpur, Howrah', googleRating: '4.9 (78)', assignedTo: memberId, assignedAt: new Date(), status: 'Assigned' },
    { customerName: 'Anusha J Couture', phoneNumber: '098269 63501', businessNiche: "Women's clothing store", address: 'Dum dum, Kolkata', googleRating: '4.8 (1.7K)', assignedTo: memberId, assignedAt: new Date(), status: 'Interested' },
    { customerName: 'Royal Rasoi', phoneNumber: '098269 63502', businessNiche: 'Caterer', address: 'Park Street, Kolkata', status: 'New' },
    { customerName: 'New Kolkata Plumbing', phoneNumber: '098269 63503', businessNiche: 'Plumber', address: 'Lake Town, Kolkata', status: 'New' },
  ]);
};

test('members only ever see leads assigned to them', async () => {
  await seedLeads();

  const adminView = await request(app).get('/api/leads').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(adminView.body.leads.length, 4);

  const memberView = await request(app).get('/api/leads').set('Authorization', `Bearer ${memberToken}`);
  assert.equal(memberView.body.leads.length, 2);
  assert.ok(memberView.body.leads.every((l) => l.assignedTo._id === memberId));

  // A member cannot sneak another member's lead through a forged filter.
  const forced = await request(app)
    .get('/api/leads?assignedTo=000000000000000000000000')
    .set('Authorization', `Bearer ${memberToken}`);
  assert.equal(forced.body.leads.length, 2);
});

test('GET /api/leads supports status, niche, assignee and search filters', async () => {
  await seedLeads();
  const auth = (q) => request(app).get(`/api/leads${q}`).set('Authorization', `Bearer ${adminToken}`);

  assert.equal((await auth('?status=New')).body.leads.length, 2);
  assert.equal((await auth('?businessNiche=Gym')).body.leads.length, 1);
  assert.equal((await auth('?assignedTo=unassigned')).body.leads.length, 2);
  assert.equal((await auth(`?assignedTo=${memberId}`)).body.leads.length, 2);
  assert.equal((await auth('?search=Rasoi')).body.leads.length, 1);
  assert.equal((await auth('?search=63503')).body.leads.length, 1, 'search matches phone');
  assert.equal((await auth('?search=Lake Town')).body.leads.length, 1, 'search matches address');
  assert.equal((await auth('?status=New&businessNiche=Plumber')).body.leads.length, 1);
});

test('GET /api/leads rejects an unknown status', async () => {
  const res = await request(app).get('/api/leads?status=Bogus').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 400);
});

/* ------------------------------------------------------------- bulk assign */

test('bulk-assign sets the member, timestamp and bumps New -> Assigned', async () => {
  await seedLeads();
  const unassigned = await Lead.find({ status: 'New' }).select('_id').lean();

  const res = await request(app)
    .patch('/api/leads/bulk-assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ leadIds: unassigned.map((l) => l._id.toString()), memberId });

  assert.equal(res.status, 200);
  const updated = await Lead.find({ _id: { $in: unassigned.map((l) => l._id) } });
  assert.ok(updated.every((l) => String(l.assignedTo) === memberId && l.assignedAt instanceof Date && l.status === 'Assigned'));

  // Already-advanced leads keep their status.
  const kept = await Lead.findOne({ status: 'Interested' });
  assert.equal(kept.status, 'Interested');
});

test('bulk-assign with a null memberId unassigns and re-queues Assigned leads', async () => {
  await seedLeads();
  const lead = await Lead.findOne({ assignedTo: memberId, status: 'Assigned' });

  const res = await request(app)
    .patch('/api/leads/bulk-assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ leadIds: [lead._id.toString()], memberId: null });

  assert.equal(res.status, 200);
  const after = await Lead.findById(lead._id);
  assert.equal(after.assignedTo, null);
  assert.equal(after.assignedAt, null);
  assert.equal(after.status, 'New');
});

test('bulk-assign is admin only and validates its payload', async () => {
  assert.equal(
    (await request(app).patch('/api/leads/bulk-assign').set('Authorization', `Bearer ${memberToken}`).send({ leadIds: [], memberId: null })).status,
    403,
  );
  assert.equal(
    (await request(app).patch('/api/leads/bulk-assign').set('Authorization', `Bearer ${adminToken}`).send({ leadIds: [], memberId: null })).status,
    400,
    'empty leadIds is rejected',
  );
  assert.equal(
    (await request(app).patch('/api/leads/bulk-assign').set('Authorization', `Bearer ${adminToken}`).send({ leadIds: ['123'], memberId: null })).status,
    400,
    'malformed id is rejected',
  );
});

/* ------------------------------------------- assign a whole PDF to a member */

test('assign-pdf creates every lead in the PDF and assigns it to the member', async () => {
  const res = await request(app)
    .post('/api/leads/assign-pdf')
    .set('Authorization', `Bearer ${adminToken}`)
    .field('memberId', memberId)
    .attach('file', makeTextPdf(HOWRAH_GYMS_PDF.split('\n')), 'Howrah_Gym_Leads.pdf');

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.created, 4);
  assert.equal(res.body.reassigned, 0);
  assert.equal(res.body.total, 4);
  assert.match(res.body.message, /to Rahul \(4 new, 0 reassigned\)/);

  const stored = await Lead.find({ assignedTo: memberId });
  assert.equal(stored.length, 4);
  assert.ok(stored.every((l) => l.status === 'Assigned' && l.assignedAt instanceof Date));
  assert.ok(stored.every((l) => l.sourcePdfName === 'Howrah_Gym_Leads.pdf'));
});

test('assign-pdf hands over leads already in the CRM instead of duplicating them', async () => {
  // Three of the four PDF rows are already stored, each in a different state.
  await Lead.create({ customerName: 'Old Name', phoneNumber: '062908 79580', businessNiche: 'Gym', status: 'Assigned', assignedTo: memberId, assignedAt: new Date() });
  await Lead.create({ customerName: 'Unassigned Gym', phoneNumber: '098269 63500', businessNiche: 'Gym', status: 'New' });
  await Lead.create({ customerName: 'Won Deal', phoneNumber: '076048 61188', businessNiche: 'Gym', status: 'Converted', assignedTo: memberId, assignedAt: new Date() });

  const res = await request(app)
    .post('/api/leads/assign-pdf')
    .set('Authorization', `Bearer ${adminToken}`)
    .field('memberId', memberId)
    .attach('file', makeTextPdf(HOWRAH_GYMS_PDF.split('\n')), 'Howrah_Gym_Leads.pdf');

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.reassigned, 3);
  assert.equal(res.body.created, 1, 'only the 033 2499 7526 row is new to the CRM');
  assert.equal(res.body.total, 4);

  // 3 seeded + 1 created: nothing was duplicated.
  assert.equal(await Lead.countDocuments({}), 4);
  assert.equal(await Lead.countDocuments({ assignedTo: memberId }), 4);

  // An already-owned lead simply stays where it is.
  const owned = await Lead.findOne({ phoneNumber: '062908 79580' });
  assert.equal(owned.status, 'Assigned');
  assert.equal(owned.customerName, 'Old Name', 'existing data is not overwritten');

  // `New` is the only status promoted on handover.
  const promoted = await Lead.findOne({ phoneNumber: '098269 63500' });
  assert.equal(promoted.status, 'Assigned');
  assert.equal(String(promoted.assignedTo), memberId);

  // Anything further along the funnel keeps its status.
  const converted = await Lead.findOne({ phoneNumber: '076048 61188' });
  assert.equal(converted.status, 'Converted');
  assert.equal(String(converted.assignedTo), memberId);
});

test('assign-pdf is idempotent - re-uploading tops the list up', async () => {
  const upload = () =>
    request(app)
      .post('/api/leads/assign-pdf')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('memberId', memberId)
      .attach('file', makeTextPdf(HOWRAH_GYMS_PDF.split('\n')), 'Howrah_Gym_Leads.pdf');

  assert.equal((await upload()).body.created, 4);
  const second = await upload();

  assert.equal(second.status, 201);
  assert.equal(second.body.created, 0);
  assert.equal(second.body.reassigned, 4);
  assert.equal(await Lead.countDocuments({}), 4);
});

test('assign-pdf is admin only and validates memberId', async () => {
  const asMember = await request(app)
    .post('/api/leads/assign-pdf')
    .set('Authorization', `Bearer ${memberToken}`)
    .field('memberId', memberId)
    .attach('file', makeTextPdf(HOWRAH_GYMS_PDF.split('\n')), 'Howrah_Gym_Leads.pdf');
  assert.equal(asMember.status, 403);

  const badId = await request(app)
    .post('/api/leads/assign-pdf')
    .set('Authorization', `Bearer ${adminToken}`)
    .field('memberId', 'not-an-id')
    .attach('file', makeTextPdf(HOWRAH_GYMS_PDF.split('\n')), 'Howrah_Gym_Leads.pdf');
  assert.equal(badId.status, 400);

  const unknown = await request(app)
    .post('/api/leads/assign-pdf')
    .set('Authorization', `Bearer ${adminToken}`)
    .field('memberId', '000000000000000000000000')
    .attach('file', makeTextPdf(HOWRAH_GYMS_PDF.split('\n')), 'Howrah_Gym_Leads.pdf');
  assert.equal(unknown.status, 400);
  assert.equal(await Lead.countDocuments({}), 0, 'nothing is written when the member is rejected');
});

test('assign-pdf refuses to load up a deactivated member', async () => {
  const member = await User.findById(memberId);
  member.isActive = false;
  await member.save();

  const res = await request(app)
    .post('/api/leads/assign-pdf')
    .set('Authorization', `Bearer ${adminToken}`)
    .field('memberId', memberId)
    .attach('file', makeTextPdf(HOWRAH_GYMS_PDF.split('\n')), 'Howrah_Gym_Leads.pdf');

  assert.equal(res.status, 400);
  assert.match(res.body.message, /deactivated/i);
  assert.equal(await Lead.countDocuments({}), 0);
});

/* --------------------------------------------------------- status + remarks */

test('member updates status and appends a remark in one call', async () => {
  await seedLeads();
  const lead = await Lead.findOne({ status: 'Assigned' });

  const res = await request(app)
    .patch(`/api/leads/${lead._id}/status`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'Interested', remark: 'Asked for a demo on Saturday.' });

  assert.equal(res.status, 200);
  assert.equal(res.body.lead.status, 'Interested');
  const remark = res.body.lead.remarks.at(-1);
  assert.equal(remark.text, 'Asked for a demo on Saturday.');
  assert.equal(remark.authorName, 'Rahul');
  assert.equal(remark.statusAtRemark, 'Interested');
  assert.ok(remark.createdAt);
});

test('member cannot touch a lead assigned to someone else', async () => {
  await seedLeads();
  const unassigned = await Lead.findOne({ assignedTo: null });

  const status = await request(app)
    .patch(`/api/leads/${unassigned._id}/status`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'Contacted' });
  assert.equal(status.status, 403);

  const remark = await request(app)
    .post(`/api/leads/${unassigned._id}/remarks`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ text: 'let me call them' });
  assert.equal(remark.status, 403);
});

test('remark endpoint rejects an empty remark and bad status values', async () => {
  await seedLeads();
  const lead = await Lead.findOne({ assignedTo: memberId });

  const empty = await request(app)
    .post(`/api/leads/${lead._id}/remarks`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ text: '   ' });
  assert.equal(empty.status, 400);

  const badStatus = await request(app)
    .patch(`/api/leads/${lead._id}/status`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'Teleported' });
  assert.equal(badStatus.status, 400);
});

test('remarks accumulate chronologically on the lead', async () => {
  await seedLeads();
  const lead = await Lead.findOne({ assignedTo: memberId, status: 'Assigned' });

  await request(app).post(`/api/leads/${lead._id}/remarks`).set('Authorization', `Bearer ${memberToken}`).send({ text: 'First call - no answer.' });
  await request(app).patch(`/api/leads/${lead._id}/status`).set('Authorization', `Bearer ${memberToken}`).send({ status: 'Follow-Up', remark: 'Will try again.' });

  const after = await Lead.findById(lead._id);
  assert.equal(after.remarks.length, 2);
  assert.equal(after.remarks[0].text, 'First call - no answer.');
  assert.equal(after.remarks[0].statusAtRemark, 'Assigned');
  assert.equal(after.remarks[1].text, 'Will try again.');
  assert.equal(after.remarks[1].statusAtRemark, 'Follow-Up');
});

/* --------------------------------------------------------------------- team */

test('admin sees team workload stats', async () => {
  await seedLeads();
  const res = await request(app).get('/api/team').set('Authorization', `Bearer ${adminToken}`);

  assert.equal(res.status, 200);
  const rahul = res.body.team.find((m) => m.name === 'Rahul');
  assert.equal(rahul.role, 'member');
  assert.equal(rahul.totalAssigned, 2);
  assert.equal(rahul.assignedCount, 2);
  assert.equal(rahul.interested, 1);
  assert.ok(typeof rahul.conversionRate === 'number');

  // The member profile renders a full funnel, so every status must be present.
  assert.equal(rahul.statusCounts.Assigned, 1);
  assert.equal(rahul.statusCounts.Interested, 1);
  assert.equal(rahul.statusCounts.Converted, 0);

  // The roster also carries the admin account plus headline pipeline counts.
  const adminRow = res.body.team.find((m) => m.role === 'admin');
  assert.ok(adminRow, 'the admin account appears in the roster');
  assert.equal(res.body.counts.members, 1);
  assert.equal(res.body.counts.admins, 1);
  assert.equal(res.body.counts.totalLeads, 4);
  assert.equal(res.body.counts.assigned, 2);
  assert.equal(res.body.counts.unassigned, 2);
});

test('team routes are admin only', async () => {
  assert.equal((await request(app).get('/api/team').set('Authorization', `Bearer ${memberToken}`)).status, 403);
});

test('admin creates, toggles and re-passwords a member', async () => {
  const created = await request(app)
    .post('/api/team')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Priya', email: 'Priya@Test.com', password: 'Member@12345' });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.email, 'priya@test.com', 'email is lowercased');

  const dup = await request(app)
    .post('/api/team')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Priya 2', email: 'priya@test.com', password: 'Member@12345' });
  assert.equal(dup.status, 409);

  const short = await request(app)
    .post('/api/team')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Short', email: 'short@test.com', password: 'abc' });
  assert.equal(short.status, 400);

  const off = await request(app).patch(`/api/team/${created.body.user.id}/toggle`).set('Authorization', `Bearer ${adminToken}`);
  assert.equal(off.body.user.isActive, false);

  const blocked = await request(app).post('/api/auth/login').send({ email: 'priya@test.com', password: 'Member@12345' });
  assert.equal(blocked.status, 403, 'a deactivated member cannot sign in');

  await request(app).patch(`/api/team/${created.body.user.id}/password`).set('Authorization', `Bearer ${adminToken}`).send({ password: 'BrandNew@123' });
  const relogin = await request(app).post('/api/auth/login').send({ email: 'priya@test.com', password: 'BrandNew@123' });
  assert.equal(relogin.status, 403, 'still deactivated');

  await request(app).patch(`/api/team/${created.body.user.id}/toggle`).set('Authorization', `Bearer ${adminToken}`);
  const finalLogin = await request(app).post('/api/auth/login').send({ email: 'priya@test.com', password: 'BrandNew@123' });
  assert.equal(finalLogin.status, 200);
});

test('the admin account cannot be deactivated', async () => {
  const res = await request(app).patch(`/api/team/${(await User.findOne({ role: 'admin' }))._id}/toggle`).set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 400);
});

/* ---------------------------------------------------------------- analytics */

test('analytics returns stats plus a distinct niche list for filter dropdowns', async () => {
  await seedLeads();
  const res = await request(app).get('/api/leads/analytics').set('Authorization', `Bearer ${adminToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.scope, 'admin');
  assert.equal(res.body.stats.totalLeads, 4);
  assert.equal(res.body.stats.unassigned, 2);
  assert.equal(res.body.stats.converted, 0);
  assert.equal(res.body.statusCounts.Interested, 1);
  assert.deepEqual(res.body.businessNiches, ['Caterer', 'Gym', 'Plumber', "Women's clothing store"]);

  const member = await request(app).get('/api/leads/analytics').set('Authorization', `Bearer ${memberToken}`);
  assert.equal(member.body.scope, 'member');
  assert.equal(member.body.stats.totalLeads, 2);
  assert.deepEqual(member.body.businessNiches, ['Gym', "Women's clothing store"]);
});

test('GET /api/analytics is the documented alias and still needs a token', async () => {
  await seedLeads();

  const anonymous = await request(app).get('/api/analytics');
  assert.equal(anonymous.status, 401);

  const res = await request(app).get('/api/analytics').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.scope, 'admin');
  assert.equal(res.body.stats.totalLeads, 4);
});

/* ------------------------------------------------------------------- delete */

test('only the admin can delete a lead', async () => {
  await seedLeads();
  const lead = await Lead.findOne();

  assert.equal((await request(app).delete(`/api/leads/${lead._id}`).set('Authorization', `Bearer ${memberToken}`)).status, 403);

  const res = await request(app).delete(`/api/leads/${lead._id}`).set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.equal(await Lead.countDocuments({}), 3);
});

test('unknown routes and bad ids return friendly 404/400s', async () => {
  assert.equal((await request(app).get('/api/nope').set('Authorization', `Bearer ${adminToken}`)).status, 404);
  assert.equal((await request(app).get('/api/leads/not-an-id').set('Authorization', `Bearer ${adminToken}`)).status, 400);
  assert.equal(
    (await request(app).get('/api/leads/000000000000000000000000').set('Authorization', `Bearer ${adminToken}`)).status,
    404,
  );
});

/* --------------------------------------------------- salesman payment trail */

test('leads expose a derived remaining amount and paid flag, defaulting to zero', async () => {
  await seedLeads();

  const res = await request(app).get('/api/leads').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  for (const lead of res.body.leads) {
    assert.equal(lead.advanceAmount, 0);
    assert.equal(lead.amountPaidToSalesman, 0);
    assert.equal(lead.amountRemaining, 0);
    assert.equal(lead.isPaid, false, 'a zero advance is not "paid", it is "nothing advanced"');
  }
});

test('admin records advance and paid amounts, and remaining + paid are derived', async () => {
  await seedLeads();
  const lead = await Lead.findOne();

  const res = await request(app)
    .patch(`/api/leads/${lead._id}/payment`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ advanceAmount: 20000, amountPaidToSalesman: 5000 });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.lead.advanceAmount, 20000);
  assert.equal(res.body.lead.amountPaidToSalesman, 5000);
  assert.equal(res.body.lead.amountRemaining, 15000);
  assert.equal(res.body.lead.isPaid, false);

  // Settling the advance in full flips the paid flag.
  const settled = await request(app)
    .patch(`/api/leads/${lead._id}/payment`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ advanceAmount: 20000, amountPaidToSalesman: 20000 });
  assert.equal(settled.body.lead.amountRemaining, 0);
  assert.equal(settled.body.lead.isPaid, true);

  // The list endpoint agrees with the single lead endpoint.
  const list = await request(app).get('/api/leads').set('Authorization', `Bearer ${adminToken}`);
  const listed = list.body.leads.find((l) => l._id === lead._id.toString());
  assert.equal(listed.amountRemaining, 0);
  assert.equal(listed.isPaid, true);
});

test('payment amounts are validated and money is admin only', async () => {
  await seedLeads();
  const lead = await Lead.findOne();
  const patch = (body, token = adminToken) =>
    request(app).patch(`/api/leads/${lead._id}/payment`).set('Authorization', `Bearer ${token}`).send(body);

  // Paying more than the advance is a bookkeeping mistake, never accepted.
  const overpaid = await patch({ advanceAmount: 1000, amountPaidToSalesman: 1500 });
  assert.equal(overpaid.status, 400);
  assert.match(overpaid.body.details[0].message, /cannot be more than the advance/i);

  assert.equal((await patch({ advanceAmount: -5, amountPaidToSalesman: 0 })).status, 400);
  assert.equal((await patch({ advanceAmount: 1000 })).status, 400);
  assert.equal((await patch({ advanceAmount: 'abc', amountPaidToSalesman: 0 })).status, 400);

  assert.equal((await patch({ advanceAmount: 100, amountPaidToSalesman: 0 }, memberToken)).status, 403);
  assert.equal((await request(app).get(`/api/leads/${lead._id}`).set('Authorization', `Bearer ${adminToken}`)).status, 200);
  const untouched = await Lead.findById(lead._id);
  assert.equal(untouched.advanceAmount, 0, 'a rejected request must not write anything');
});

/* ------------------------------------------------------- per-lead PDF export */

test('GET /api/leads/:id/pdf streams a real PDF attachment', async () => {
  await seedLeads();
  const lead = await Lead.findOne({ assignedTo: null });
  await Lead.updateOne({ _id: lead._id }, { advanceAmount: 12000, amountPaidToSalesman: 12000 });
  await Lead.updateOne(
    { _id: lead._id },
    { $push: { remarks: { text: 'Demo sent over WhatsApp.', authorName: 'Rahul', statusAtRemark: 'Contacted' } } },
  );

  const res = await request(app)
    .get(`/api/leads/${lead._id}/pdf`)
    .set('Authorization', `Bearer ${adminToken}`)
    .buffer()
    .parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /application\/pdf/);
  assert.match(res.headers['content-disposition'], /attachment; filename="lead-/);
  assert.equal(res.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(res.body.length > 1000, 'pdf should contain a real page');
  // Page content is Flate compressed, so only the trailer is plain text.
  assert.match(res.body.toString('latin1'), /%%EOF/);
  assert.equal(res.headers['content-length'], String(res.body.length));
});

test('a member can only export their own lead PDF', async () => {
  await seedLeads();
  const mine = await Lead.findOne({ assignedTo: memberId });
  const theirs = await Lead.findOne({ assignedTo: null });

  const own = await request(app).get(`/api/leads/${mine._id}/pdf`).set('Authorization', `Bearer ${memberToken}`);
  assert.equal(own.status, 200);

  const foreign = await request(app).get(`/api/leads/${theirs._id}/pdf`).set('Authorization', `Bearer ${memberToken}`);
  assert.equal(foreign.status, 403);

  assert.equal((await request(app).get(`/api/leads/${mine._id}/pdf`)).status, 401);
});

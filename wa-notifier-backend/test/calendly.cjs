// Run after npm run build: node --test test/calendly.cjs
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { ForbiddenException, ValidationPipe } = require('@nestjs/common');
const { Test } = require('@nestjs/testing');
const { APP_GUARD } = require('@nestjs/core');
const { JwtAuthGuard } = require('../dist/common/guards/jwt-auth.guard');
const { JwtStrategy } = require('../dist/auth/jwt.strategy');
const { JwtService } = require('@nestjs/jwt');
const { CalendlyService, defaultCalendlySettings } = require('../dist/calendly/calendly.service');
const { CalendlyAccountGuard, CalendlyController, CalendlyWebhookController } = require('../dist/calendly/calendly.controller');
const { verifySignature, calendlyUri, bookingFields } = require('../dist/calendly/calendly.utils');
const { CalendlyConnectionSchema, CalendlyBookingSchema, CalendlyJobSchema } = require('../dist/calendly/calendly.schema');
const { encryptToken, decryptToken } = require('../dist/google-sheets/sheets.utils');
const accountId = '507f1f77bcf86cd799439011';
const bookingId = '507f1f77bcf86cd799439012';
const eventUri = 'https://api.calendly.com/scheduled_events/event-1';
const inviteeUri = `${eventUri}/invitees/invitee-1`;
const encryptionKey = Buffer.alloc(32, 7);
const signatureKey = 'signing-key';
const query = value => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value,
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const apply = (object, update) => {
  for (const [key, value] of Object.entries(update)) if (!key.startsWith('$')) object[key] = value;
  Object.assign(object, update.$set || {});
  for (const [key, value] of Object.entries(update.$inc || {})) object[key] = (object[key] || 0) + value;
  for (const key of Object.keys(update.$unset || {})) delete object[key];
};
const match = (object, filter) => Object.entries(filter).every(([key, value]) => key.startsWith('$') ||
  (value && typeof value === 'object' && value.$in ? value.$in.includes(object[key]) : String(object[key]) === String(value)));
function fixture() {
  const connection = { whatsappAccountId: accountId, connected: true, revision: 1, name: 'Host', settings: defaultCalendlySettings(),
    token: encryptToken('personal-token', encryptionKey), signingKey: encryptToken(signatureKey, encryptionKey) };
  const bookings = []; const jobs = []; const sends = []; const reads = [];
  const account = { _id: accountId, isActive: true, tenantId: 'tenant-a' }; const tenant = { status: 'active' };
  const template = { name: 'appointment', language: 'en', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hello {{1}}' }] };
  const models = {
    connections: { init: async () => {}, findOne: filter => query(match(connection, filter) ? connection : null),
      exists: async filter => match(connection, filter),
      updateOne: async (filter, update) => { if (match(connection, filter)) apply(connection, update); return { modifiedCount: 1 }; },
      findOneAndUpdate: async (_filter, update) => { apply(connection, update); return connection; } },
    bookings: { init: async () => {}, findOne: async filter => bookings.find(item => match(item, filter)),
      findById: async id => bookings.find(item => String(item._id) === String(id)),
      updateOne: async (filter, update, options) => {
        let item = bookings.find(item => match(item, filter));
        if (!item && options?.upsert) { item = { ...filter, ...update.$setOnInsert, _id: bookingId, status: 'active' }; bookings.push(item); }
        if (item) apply(item, update); return { modifiedCount: item ? 1 : 0 };
      },
      findOneAndUpdate: async (filter, update, options) => { await models.bookings.updateOne(filter, update, options); return bookings.find(item => match(item, filter)); } },
    jobs: { init: async () => {}, updateOne: async (filter, update, options) => {
      let item = jobs.find(item => match(item, filter));
      if (!item && options?.upsert) { item = { ...filter, ...update.$setOnInsert, _id: `job-${jobs.length}`, status: 'pending', attempts: 0 }; jobs.push(item); }
      if (item) apply(item, update); return { modifiedCount: item ? 1 : 0 };
    }, updateMany: async (filter, update) => { for (const item of jobs) if (match(item, filter)) apply(item, update); },
      exists: async filter => jobs.some(item => match(item, filter)),
      findOneAndUpdate: (_filter, update) => {
        const item = jobs.find(item => item.status === 'pending' && item.dueAt <= new Date());
        if (item) apply(item, update); return query(item ? { ...item } : null);
      } },
  };
  const contacts = [];
  const inbox = { sendTemplate: async (...args) => { sends.push(args); return { _id: bookingId }; } };
  const service = new CalendlyService(models.connections, models.bookings, models.jobs, { findById: async () => tenant },
    { findOne: async filter => { reads.push(filter); return contacts.find(item => item.phone === filter.phone); } },
    { findOne: async () => account }, { findByName: async () => template, findAll: async () => [template] }, inbox,
    { get: name => ({ CALENDLY_ENCRYPTION_KEY: encryptionKey.toString('hex'), CALENDLY_PUBLIC_API_URL: 'https://wms.example/api' })[name] });
  service.api = async (method, path) => {
    reads.push([method, path]);
    if (path === '/users/me') return { resource: { uri: 'https://api.calendly.com/users/host-1', current_organization: 'https://api.calendly.com/organizations/org-1', name: 'Host' } };
    if (method === 'POST') return { resource: { uri: 'https://api.calendly.com/webhook_subscriptions/sub-1' } };
    if (path.includes('/invitees/')) return { resource: { status: 'active' } };
    return { resource: { name: 'Demo', start_time: new Date(Date.now() + 7200000).toISOString(), status: 'active', location: { join_url: 'https://meeting.example' } } };
  };
  return { service, models, connection, bookings, jobs, sends, reads, account, tenant, contacts, inbox, template };
}
function webhook(event = 'invitee.created', overrides = {}) {
  const body = { event, payload: { uri: inviteeUri, event: eventUri, name: 'Alice', timezone: 'Asia/Kolkata',
    questions_and_answers: [{ question: 'WhatsApp number', answer: '+919876543210' }, { question: 'May we send you WhatsApp appointment updates?', answer: 'Yes' }], ...overrides } };
  const raw = Buffer.from(JSON.stringify(body)); const t = Math.floor(Date.now() / 1000);
  return { body, raw, signature: `t=${t},v1=${createHmac('sha256', signatureKey).update(`${t}.`).update(raw).digest('hex')}` };
}
const receive = (f, event, overrides) => { const w = webhook(event, overrides); return f.service.receive(accountId, '1', w.raw, w.signature, w.body); };
const enabled = () => ({ enabled: true, templateName: 'appointment', parameters: ['name'] });

test('validates raw-body signatures, rejects tampering, missing signature and stale/future timestamps', () => {
  const w = webhook(); verifySignature(w.raw, w.signature, signatureKey);
  assert.throws(() => verifySignature(Buffer.from('{}'), w.signature, signatureKey));
  assert.throws(() => verifySignature(w.raw, null, signatureKey));
  assert.throws(() => verifySignature(w.raw, w.signature, signatureKey, Date.now() + 181000));
  assert.throws(() => verifySignature(w.raw, w.signature, signatureKey, Date.now() - 181000));
});
test('only fetches official resource URLs and formats start times in the guest timezone', () => {
  assert.equal(calendlyUri(eventUri, 'scheduled_events'), eventUri);
  for (const url of ['http://api.calendly.com/scheduled_events/1', 'https://api.calendly.com.evil/scheduled_events/1', `${eventUri}?token=x`, 'https://localhost/scheduled_events/1']) assert.throws(() => calendlyUri(url, 'scheduled_events'));
  const fields = bookingFields({ startTime: '2026-10-05T10:00:00Z', timezone: 'Asia/Kolkata', name: 'Alice' });
  assert.match(fields.start_time, /15:30/); assert.equal(bookingFields({ startTime: '2026-10-05T10:00:00Z', timezone: 'invalid' }).timezone, 'UTC');
});
test('credential reads are hidden and booking/job indexes prevent duplicate events across one connection', () => {
  assert.equal(CalendlyConnectionSchema.path('token').options.select, false);
  assert.equal(CalendlyConnectionSchema.path('signingKey').options.select, false);
  assert.equal(CalendlyJobSchema.path('payload').options.select, false);
  for (const schema of [CalendlyBookingSchema, CalendlyJobSchema]) assert.ok(schema.indexes().some(([fields, options]) => fields.whatsappAccountId && fields.revision && options.unique));
});
test('account management rejects other tenants, team members and inactive tenants', async () => {
  const f = fixture(); const guard = new CalendlyAccountGuard(f.service);
  const context = user => ({ switchToHttp: () => ({ getRequest: () => ({ user, params: { whatsappAccountId: accountId } }), getResponse: () => ({ setHeader() {} }) }) });
  assert.equal(await guard.canActivate(context({ role: 'client_owner', tenantId: 'tenant-a' })), true);
  await assert.rejects(guard.canActivate(context({ role: 'client_owner', tenantId: 'tenant-b' })), ForbiddenException);
  await assert.rejects(guard.canActivate(context({ role: 'client_team', tenantId: 'tenant-a' })), ForbiddenException);
  f.tenant.status = 'suspended'; await assert.rejects(guard.canActivate(context({ role: 'admin' })), ForbiddenException);
});
test('connect creates a user-scoped signed subscription and encrypts the token', async () => {
  const f = fixture(); const calls = []; const original = f.service.api;
  f.connection.connected = false;
  f.service.api = async (...args) => { calls.push(args); return original(...args); };
  await f.service.connect(accountId, 'a-personal-token');
  const subscription = calls.find(([method]) => method === 'POST')[3];
  assert.equal(subscription.scope, 'user'); assert.match(subscription.url, /\/api\/webhooks\/calendly\//);
  assert.equal(subscription.signing_key.length, 64); assert.equal(decryptToken(f.connection.token, encryptionKey), 'a-personal-token');
  assert.equal(JSON.stringify(f.connection).includes('a-personal-token'), false);
});
test('webhook duplicates queue one ingestion and rejects old connection revisions or unrelated invitees', async () => {
  const f = fixture(); await receive(f); await receive(f); assert.equal(f.jobs.length, 1);
  assert.equal(f.jobs[0].payload.name, 'Alice');
  const w = webhook(); await assert.rejects(f.service.receive(accountId, '2', w.raw, w.signature, w.body));
  await assert.rejects(receive(f, 'invitee.created', { uri: 'https://api.calendly.com/scheduled_events/another/invitees/1' }));
});
test('creation queues confirmation/reminder, sends once, and requires matching consent', async () => {
  const f = fixture(); Object.assign(f.connection.settings, { confirmation: enabled(), reminder: enabled() });
  await receive(f); await f.service.work();
  assert.equal(f.bookings.length, 1); assert.equal(f.sends.length, 1); assert.equal(f.jobs.find(job => job.kind === 'reminder').status, 'pending');
  await receive(f); await f.service.work(); assert.equal(f.sends.length, 1);
  const denied = fixture(); denied.connection.settings.confirmation = enabled();
  await receive(denied, 'invitee.created', { questions_and_answers: [{ question: 'WhatsApp number', answer: '+919876543210' }] });
  await denied.service.work(); assert.equal(denied.sends.length, 0); assert.equal(denied.jobs.find(job => job.kind === 'confirmation').status, 'skipped');
});
test('cancellation before creation preserves a tombstone and prevents confirmations and reminders', async () => {
  const f = fixture(); Object.assign(f.connection.settings, { confirmation: enabled(), reminder: enabled(), cancellation: enabled() });
  await receive(f, 'invitee.canceled'); await receive(f); await f.service.work();
  assert.equal(f.bookings[0].status, 'canceled'); assert.equal(f.jobs.some(job => job.kind === 'reminder'), false);
  assert.equal(f.sends.length, 1); assert.equal(f.jobs.find(job => job.kind === 'cancellation').status, 'sent');
});
test('cancellation cancels queued reminders; inactive/opted-out contacts block sending', async () => {
  const f = fixture(); f.connection.settings.reminder = enabled();
  await receive(f); await f.service.work(); await receive(f, 'invitee.canceled');
  assert.equal(f.jobs.find(job => job.kind === 'reminder').status, 'canceled');
  for (const contact of [{ isActive: false }, { isActive: true, isOptedOut: true }]) {
    const blocked = fixture(); blocked.connection.settings.confirmation = enabled(); blocked.contacts.push({ phone: '+919876543210', ...contact });
    await receive(blocked); await blocked.service.work(); assert.equal(blocked.sends.length, 0);
  }
});
test('uncertain paid sends become needs_review and are never automatically retried', async () => {
  const f = fixture(); f.connection.settings.confirmation = enabled();
  f.inbox.sendTemplate = async () => { f.sends.push('attempt'); throw new Error('upstream secret token'); };
  await receive(f); await f.service.work(); await f.service.work();
  assert.equal(f.sends.length, 1); const job = f.jobs.find(job => job.kind === 'confirmation');
  assert.equal(job.status, 'needs_review'); assert.equal(job.error.includes('secret'), false);
});
test('a due reminder checks live cancellation before sending and safe API errors retry without billing', async () => {
  for (const scenario of ['canceled', 'temporary']) {
    const f = fixture(); f.connection.settings.reminder = enabled();
    await receive(f); await f.service.work();
    const reminder = f.jobs.find(job => job.kind === 'reminder'); reminder.dueAt = new Date(0);
    const original = f.service.api;
    f.service.api = async (method, path, ...args) => {
      if (path.includes('/invitees/')) {
        if (scenario === 'temporary') throw { response: { status: 503 } };
        return { resource: { status: 'canceled' } };
      }
      return original(method, path, ...args);
    };
    await f.service.work(); assert.equal(f.sends.length, 0);
    assert.equal(reminder.status, scenario === 'canceled' ? 'skipped' : 'pending');
    if (scenario === 'temporary') assert.ok(reminder.dueAt > new Date());
  }
});
test('saving settings validates approved templates and parameter count and queued events keep their mapping', async () => {
  const f = fixture(); f.connection.settings.confirmation = enabled();
  await receive(f);
  const settings = { ...defaultCalendlySettings(), confirmation: { ...enabled(), parameters: [] } };
  await assert.rejects(f.service.save(accountId, settings));
  settings.confirmation.parameters = ['event_name']; await f.service.save(accountId, settings);
  await f.service.work(); assert.equal(f.sends[0][4][0], 'Alice');
  f.template.status = 'REJECTED'; await assert.rejects(f.service.save(accountId, settings));
});
test('disconnect stops local automation even when remote deletion fails and retains cleanup credentials', async () => {
  const f = fixture(); f.connection.subscription = 'https://api.calendly.com/webhook_subscriptions/sub-1';
  f.service.api = async () => { throw new Error('Unavailable'); };
  await receive(f); await assert.rejects(f.service.disconnect(accountId));
  assert.equal(f.connection.connected, false); assert.equal(f.jobs[0].status, 'canceled'); assert.ok(f.connection.token);
  f.service.api = async () => ({}); await f.service.disconnect(accountId); assert.equal(f.connection.token, undefined); assert.equal(f.connection.subscription, undefined);
});
test('HTTP management requires JWT and validates nested notification rules; webhook requires signature', async () => {
  const f = fixture();
  const secret = 'calendly-test-secret';
  const strategy = new JwtStrategy({ get: () => secret }, { findById: () => query({ isActive: true, toObject: () => ({ role: 'admin' }) }) }, {});
  const module = await Test.createTestingModule({ controllers: [CalendlyController, CalendlyWebhookController], providers: [CalendlyAccountGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: JwtStrategy, useValue: strategy }, { provide: CalendlyService, useValue: f.service }] }).compile();
  const app = module.createNestApplication({ rawBody: true }); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  try {
    assert.equal((await fetch(`${base}/api/integrations/calendly/${accountId}`)).status, 401);
    const auth = new JwtService({ secret }).sign({ sub: 'admin-user' });
    const save = body => fetch(`${base}/api/integrations/calendly/${accountId}/settings`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body: JSON.stringify(body) });
    assert.equal((await save({ ...defaultCalendlySettings(), reminderMinutes: 0 })).status, 400);
    assert.equal((await save({ ...defaultCalendlySettings(), confirmation: { enabled: true, templateName: 'appointment', parameters: ['unknown'] } })).status, 400);
    assert.equal((await save({ ...defaultCalendlySettings(), confirmation: enabled() })).status, 201);
    const w = webhook();
    assert.equal((await fetch(`${base}/api/webhooks/calendly/${accountId}/1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: w.raw })).status, 401);
    assert.equal((await fetch(`${base}/api/webhooks/calendly/${accountId}/1`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Calendly-Webhook-Signature': w.signature }, body: w.raw })).status, 201);
  } finally { await app.close(); }
});

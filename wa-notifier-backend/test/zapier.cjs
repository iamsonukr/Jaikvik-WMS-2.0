// Run after npm run build: node --test test/zapier.cjs
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { ForbiddenException, ValidationPipe } = require('@nestjs/common');
const { Test } = require('@nestjs/testing');
const { APP_GUARD } = require('@nestjs/core');
const { JwtAuthGuard } = require('../dist/common/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/common/guards/roles.guard');
const { ZapierService } = require('../dist/zapier/zapier.service');
const { ZapierWorker } = require('../dist/zapier/zapier.worker');
const { ZapierAccountGuard, ZapierKeyGuard, ZapierApiController } = require('../dist/zapier/zapier.controller');
const { ZapierConnectionSchema, ZapierActionSchema, ZapierDeliverySchema, ZapierHookSchema } = require('../dist/zapier/zapier.schema');
const { normalizeHookUrl, secretHash, canonicalJson, templateParameterCount, safeCustomFields } = require('../dist/zapier/zapier.utils');
const accountId = '507f1f77bcf86cd799439011';
const foreignId = '507f1f77bcf86cd799439012';
const hookId = '507f1f77bcf86cd799439013';
const recordId = '507f1f77bcf86cd799439014';
const query = value => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value,
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const apply = (object, update) => {
  for (const [key, value] of Object.entries(update)) if (!key.startsWith('$')) object[key] = value;
  Object.assign(object, update.$set || {});
  for (const [key, value] of Object.entries(update.$inc || {})) object[key] = (object[key] || 0) + value;
  for (const key of Object.keys(update.$unset || {})) delete object[key];
};

function fixture() {
  const apiKey = `wms_zap_${randomBytes(32).toString('base64url')}`;
  const connection = { _id: 'connection', whatsappAccountId: accountId, keyHash: secretHash(apiKey), enabled: true, requestCount: 0 };
  const actions = new Map(); const contacts = []; const sent = []; const contactQueries = []; const hooks = [];
  const models = {};
  models.connections = {
    init: async () => {},
    exists: async filter => connection.enabled && String(filter.whatsappAccountId) === accountId,
    findOne: async filter => connection.enabled && filter.keyHash === connection.keyHash ? connection : null,
    findOneAndUpdate: async (filter, update) => {
      if (Array.isArray(update)) {
        if (!connection.enabled || filter.keyHash !== connection.keyHash) return null;
        const window = update[0].$set.rateWindow;
        connection.requestCount = connection.rateWindow === window ? connection.requestCount + 1 : 1;
        connection.rateWindow = window; return connection;
      }
      apply(connection, update); return connection;
    },
    updateOne: async (_filter, update) => apply(connection, update),
  };
  models.actions = {
    init: async () => {},
    findOne: async filter => actions.get(`${filter.whatsappAccountId}/${filter.requestId}`),
    create: async value => {
      const key = `${value.whatsappAccountId}/${value.requestId}`;
      if (actions.has(key)) throw Object.assign(new Error('Duplicate'), { code: 11000 });
      const action = { ...value, _id: key, status: 'processing' }; actions.set(key, action); return action;
    },
    updateOne: async (filter, update) => apply(actions.get(filter._id), update),
  };
  models.contacts = { findOne: async filter => { contactQueries.push(filter); return contacts.find(contact => contact.phone === filter.phone); } };
  models.hooks = { init: async () => {}, updateMany: async (_filter, update) => { for (const hook of hooks) apply(hook, update); },
    countDocuments: async () => hooks.length, create: async input => { const hook = { ...input, _id: hookId, enabled: true, revision: 0 }; hooks.push(hook); return hook; },
    findOne: async filter => hooks.find(hook => String(hook._id) === String(filter._id) && String(hook.whatsappAccountId) === String(filter.whatsappAccountId)),
  };
  models.deliveries = { init: async () => {}, updateMany: async () => {} };
  const account = { _id: accountId, name: 'Test business', tenantId: 'tenant-a', isActive: true };
  const tenant = { status: 'active' };
  const template = { name: 'welcome', language: 'en', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hello {{1}}' }] };
  const contactsService = {
    create: async input => { const contact = { ...input, _id: recordId, isActive: true, isOptedOut: false }; contacts.push(contact); return contact; },
    update: async (id, input) => { const contact = contacts.find(item => String(item._id) === id); apply(contact, input); return contact; },
  };
  const inbox = { sendTemplate: async (...args) => { sent.push(args); return { _id: recordId, waMessageId: 'wamid.test', deliveryStatus: 'sent' }; } };
  const service = new ZapierService(models.connections, models.hooks, models.deliveries, models.actions, models.contacts,
    { findById: async () => tenant }, { findOne: async () => account }, contactsService, inbox,
    { findByName: async () => template, findAll: async () => [template] });
  return { service, models, apiKey, connection, actions, contacts, sent, contactQueries, hooks, account, tenant, template, inbox };
}
const sendDto = (requestId = 'welcome-order-1') => ({ requestId, phone: '+919876543210', templateName: 'welcome', bodyParameters: ['Alice'], consent: true });

test('only accepts official HTTPS Zapier catch URLs; blocks redirects, private hosts and embedded credentials', () => {
  assert.equal(normalizeHookUrl('https://hooks.zapier.com/hooks/catch/123/abc/'), 'https://hooks.zapier.com/hooks/catch/123/abc/');
  for (const url of ['http://hooks.zapier.com/hooks/catch/123/abc/', 'https://localhost/hooks/catch/123/abc/',
    'https://hooks.zapier.com.evil.test/hooks/catch/123/abc/', 'https://user:pass@hooks.zapier.com/hooks/catch/123/abc/',
    'https://hooks.zapier.com:8443/hooks/catch/123/abc/', 'https://hooks.zapier.com/hooks/catch/123/abc/?redirect=http://localhost',
    'https://hooks.zapier.com/hooks/catch/123/abc/#secret', 'https://hooks.zapier.com/anything', 'https://127.0.0.1/hooks/catch/123/abc/']) {
    assert.throws(() => normalizeHookUrl(url));
  }
});
test('keys and hook URLs are hidden from ordinary database reads and dedup indexes exist', () => {
  assert.equal(ZapierConnectionSchema.path('keyHash').options.select, false);
  assert.equal(ZapierHookSchema.path('url').options.select, false);
  assert.ok(ZapierActionSchema.indexes().some(([fields, options]) => fields.whatsappAccountId && fields.requestId && options.unique));
  assert.ok(ZapierDeliverySchema.indexes().some(([fields, options]) => fields.hookId && fields.eventId && options.unique));
});
test('API keys are scoped, hashed, rotated and revoked', async () => {
  const f = fixture();
  assert.equal((await f.service.authenticate(f.apiKey)).accountId, accountId);
  await assert.rejects(f.service.authenticate('not-a-key'));
  const { apiKey: replacement } = await f.service.generateKey(accountId);
  assert.notEqual(replacement, f.apiKey); assert.equal(f.connection.keyHash, secretHash(replacement));
  assert.notEqual(f.connection.keyHash, replacement);
  await assert.rejects(f.service.authenticate(f.apiKey));
  assert.equal((await f.service.authenticate(replacement)).accountId, accountId);
  await f.service.revoke(accountId); await assert.rejects(f.service.authenticate(replacement));
});
test('API authentication blocks suspended tenants and enforces a per-account minute limit', async () => {
  const f = fixture(); f.tenant.status = 'suspended';
  await assert.rejects(f.service.authenticate(f.apiKey), /inactive/);
  f.tenant.status = 'active'; f.connection.rateWindow = Math.floor(Date.now() / 60000); f.connection.requestCount = 60;
  await assert.rejects(f.service.authenticate(f.apiKey), error => error.getStatus() === 429);
});
test('management authorization uses the route account and rejects other tenants/team members', async () => {
  const f = fixture(); const guard = new ZapierAccountGuard(f.service);
  const context = user => ({ switchToHttp: () => ({ getRequest: () => ({ user, params: { whatsappAccountId: accountId }, query: { whatsappAccountId: foreignId } }) }) });
  await assert.rejects(guard.canActivate(context({ role: 'client_owner', tenantId: 'other' })));
  await assert.rejects(guard.canActivate(context({ role: 'client_user', tenantId: 'tenant-a' })));
  assert.equal(await guard.canActivate(context({ role: 'client_owner', tenantId: 'tenant-a' })), true);
  assert.equal(await guard.canActivate(context({ role: 'admin' })), true);
});
test('template actions replay the original response without a second send and reject changed payloads', async () => {
  const f = fixture(); const first = await f.service.sendTemplate(accountId, sendDto());
  const second = await f.service.sendTemplate(accountId, sendDto());
  assert.deepEqual(first, second); assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0][0], accountId); assert.equal(f.sent[0][3], 'en');
  await assert.rejects(f.service.sendTemplate(accountId, { ...sendDto(), bodyParameters: ['Bob'] }), /different data/);
  assert.equal(f.sent.length, 1);
});
test('concurrent duplicate requests claim one action before calling Meta', async () => {
  const f = fixture();
  const outcomes = await Promise.allSettled([f.service.sendTemplate(accountId, sendDto()), f.service.sendTemplate(accountId, sendDto())]);
  assert.equal(f.sent.length, 1); assert.equal(outcomes.filter(result => result.status === 'fulfilled').length >= 1, true);
});
test('uncertain sends are not repeated automatically and errors hide upstream secrets', async () => {
  const f = fixture(); let attempts = 0;
  f.inbox.sendTemplate = async () => { attempts++; throw new Error('secret-token upstream failure'); };
  await assert.rejects(f.service.sendTemplate(accountId, sendDto()), /Check Inbox/);
  await assert.rejects(f.service.sendTemplate(accountId, sendDto()), /already attempted/);
  assert.equal(attempts, 1); const action = [...f.actions.values()][0];
  assert.equal(action.status, 'needs_review'); assert.equal(action.error.includes('secret-token'), false);
});
test('rejects missing consent, opted-out/inactive contacts, unapproved templates and parameter mismatches before billing', async () => {
  for (const scenario of ['consent', 'optout', 'inactive', 'template', 'params']) {
    const f = fixture(); const dto = sendDto();
    if (scenario === 'consent') dto.consent = false;
    if (scenario === 'optout') f.contacts.push({ phone: dto.phone, isActive: true, isOptedOut: true });
    if (scenario === 'inactive') f.contacts.push({ phone: dto.phone, isActive: false });
    if (scenario === 'template') f.template.status = 'PENDING';
    if (scenario === 'params') dto.bodyParameters = [];
    await assert.rejects(f.service.sendTemplate(accountId, dto)); assert.equal(f.sent.length, 0);
  }
});
test('contact updates preserve omitted fields, merge custom fields and never remove opt-outs', async () => {
  const f = fixture(); f.contacts.push({ _id: recordId, phone: '+919876543210', name: 'Before', tags: ['VIP'], customFields: { owner: 'Sam' }, isActive: true, isOptedOut: true });
  const dto = { requestId: 'contact-1', phone: '+919876543210', name: 'After', customFields: { city: 'Delhi' } };
  await f.service.upsertContact(accountId, dto); await f.service.upsertContact(accountId, dto);
  assert.equal(f.contacts.length, 1); assert.deepEqual(f.contacts[0].tags, ['VIP']); assert.equal(f.contacts[0].isOptedOut, true);
  assert.deepEqual(f.contacts[0].customFields, { owner: 'Sam', city: 'Delhi' });
  assert.ok(f.contactQueries.every(filter => filter.$or.some(part => String(part.whatsappAccountId) === accountId)));
});
test('rejects unsafe custom field keys and templates with unsupported dynamic content', () => {
  for (const fields of [{ 'a.b': 'x' }, { constructor: 'x' }, { nested: {} }]) assert.throws(() => safeCustomFields(fields));
  const f = fixture();
  f.template.components = [{ type: 'BODY', text: 'Hi {{name}}' }]; assert.throws(() => templateParameterCount(f.template));
  f.template.components = [{ type: 'HEADER', format: 'IMAGE' }]; assert.throws(() => templateParameterCount(f.template));
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
});
test('hook ownership rejects cross-account test actions and samples contain artificial data', async () => {
  const f = fixture(); await f.service.createHook(accountId, { name: 'CRM', event: 'message.received', url: 'https://hooks.zapier.com/hooks/catch/123/abc/' });
  await assert.rejects(f.service.testHook(foreignId, hookId), /not found/);
  let sample; f.models.deliveries.create = async input => { sample = input; };
  await f.service.testHook(accountId, hookId);
  assert.equal(sample.payload.test, true); assert.equal(sample.payload.data.phone, '+12025550123'); assert.equal(sample.hookRevision, 0);
});

function workerFixture() {
  const job = { _id: recordId, whatsappAccountId: accountId, hookId, hookRevision: 0, eventId: 'stable-event', payload: { id: 'stable-event', event: 'message.received' },
    attempts: 0, status: 'pending', nextAttemptAt: new Date(0) };
  const hook = { _id: hookId, whatsappAccountId: accountId, revision: 0, enabled: true, event: 'message.received', url: 'https://hooks.zapier.com/hooks/catch/123/abc/' };
  const state = { enabled: true, job, hook, error: null, claimed: false };
  const jobs = { findOneAndUpdate: async (_filter, update) => {
    if (state.claimed || !['pending', 'processing'].includes(job.status)) return null;
    state.claimed = true; apply(job, update); return { ...job };
  }, updateOne: async (filter, update) => { if (filter.lockOwner === job.lockOwner && job.status === 'processing') apply(job, update); } };
  const worker = new ZapierWorker({ exists: async () => state.enabled }, {
    findOne: filter => query(hook.enabled && hook.revision === filter.revision ? hook : null),
  }, jobs, {}, {}, {}, { activeAccount: async () => { if (state.error) throw state.error; return {}; } });
  return { worker, state, job, hook, jobs };
}
test('webhook delivery uses a stable event ID, HTTPS, a timeout and no redirects', async () => {
  const axios = require('axios'); const original = axios.default.post; const f = workerFixture(); let calls = 0;
  try {
    axios.default.post = async (url, payload, config) => {
      calls++; assert.equal(url, f.hook.url); assert.equal(payload.id, 'stable-event');
      assert.equal(config.maxRedirects, 0); assert.equal(config.timeout, 10000); assert.equal(config.headers['X-WMS-Event-ID'], 'stable-event');
      return { status: 200 };
    };
    await f.worker.deliver(); assert.equal(calls, 1); assert.equal(f.job.status, 'delivered');
  } finally { axios.default.post = original; }
});
test('transient webhook failures retry; permanent failures and exhausted attempts stop', async () => {
  const axios = require('axios'); const original = axios.default.post;
  try {
    for (const [status, attempts, expected] of [[500, 0, 'pending'], [429, 0, 'pending'], [404, 0, 'failed'], [500, 5, 'failed']]) {
      const f = workerFixture(); f.job.attempts = attempts;
      axios.default.post = async () => { throw { response: { status, data: { secret: 'do-not-log' } } }; };
      await f.worker.deliver(); assert.equal(f.job.status, expected); assert.equal(f.job.lastError.includes('do-not-log'), false);
      if (expected === 'pending') assert.ok(f.job.nextAttemptAt > new Date());
    }
  } finally { axios.default.post = original; }
});
test('disabled or superseded hooks cannot send queued events', async () => {
  const axios = require('axios'); const original = axios.default.post; let calls = 0;
  try {
    axios.default.post = async () => { calls++; return { status: 200 }; };
    for (const variant of ['disabled', 'revision', 'tenant', 'limit']) {
      const f = workerFixture();
      if (variant === 'disabled') f.state.enabled = false;
      if (variant === 'revision') f.hook.revision++;
      if (variant === 'tenant') f.state.error = new ForbiddenException('Suspended');
      if (variant === 'limit') f.job.attempts = 6;
      await f.worker.deliver(); assert.equal(f.job.status, variant === 'limit' ? 'failed' : 'canceled');
    }
    assert.equal(calls, 0);
  } finally { axios.default.post = original; }
});
test('temporary database errors during account validation retry instead of canceling events', async () => {
  const f = workerFixture(); f.state.error = new Error('Temporary database outage');
  await f.worker.deliver(); assert.equal(f.job.status, 'pending'); assert.equal(f.job.attempts, 1);
});
test('collector scopes records, deduplicates rescans, omits private data and queues before cursor advancement', async () => {
  const hook = { _id: hookId, whatsappAccountId: accountId, event: 'message.received', revision: 0, scanLockOwner: 'worker', startsAt: new Date(Date.now() - 60000), cursors: {} };
  const record = { _id: recordId, phone: '+919876543210', type: 'text', text: 'Hello', createdAt: new Date(Date.now() - 10000), internalNotes: ['private'], accessToken: 'secret' };
  const jobs = new Map(); let cursorWrites = 0; let fail = false;
  const worker = new ZapierWorker({}, { updateOne: async () => { assert.ok(jobs.size); cursorWrites++; } }, {
    bulkWrite: async operations => { if (fail) throw new Error('DB error'); for (const operation of operations) {
      const entry = operation.updateOne; if (!jobs.has(entry.filter.eventId)) jobs.set(entry.filter.eventId, entry.update.$setOnInsert);
    } },
  }, {}, {}, {}, {});
  const source = { find: filter => { assert.ok(filter.$and[0].$or.some(part => String(part.whatsappAccountId) === accountId)); return query([record]); } };
  await worker.scan(hook, 'inbox', source, 'createdAt', { direction: 'inbound' });
  await worker.scan(hook, 'inbox', source, 'createdAt', { direction: 'inbound' });
  assert.equal(jobs.size, 1); assert.equal(cursorWrites, 2);
  const payload = [...jobs.values()][0].payload;
  assert.equal(payload.data.text, 'Hello'); assert.equal(JSON.stringify(payload).includes('private'), false); assert.equal(JSON.stringify(payload).includes('secret'), false);
  fail = true; await assert.rejects(worker.scan(hook, 'inbox', source, 'createdAt', {})); assert.equal(cursorWrites, 2);
});
test('HTTP API requires X-API-Key, validates JSON consent/null fields and derives ownership from the key', async () => {
  const f = fixture();
  const module = await Test.createTestingModule({ controllers: [ZapierApiController], providers: [ZapierKeyGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RolesGuard },
    { provide: ZapierService, useValue: f.service }] }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const post = body => fetch(`${base}/api/zapier/v1/messages/template`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': f.apiKey }, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${base}/api/zapier/v1/me`)).status, 401);
    const me = await fetch(`${base}/api/zapier/v1/me`, { headers: { 'X-API-Key': f.apiKey } });
    assert.equal(me.status, 200); assert.equal(me.headers.get('cache-control'), 'no-store'); assert.equal((await me.json()).id, accountId);
    assert.equal((await post({ ...sendDto('bad-consent'), consent: 'true' })).status, 400);
    const badContact = await fetch(`${base}/api/zapier/v1/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': f.apiKey },
      body: JSON.stringify({ requestId: 'null-fields', phone: '+919876543210', customFields: null }) });
    assert.equal(badContact.status, 400);
    const response = await post({ ...sendDto(), whatsappAccountId: foreignId, tenantId: 'other' });
    assert.equal(response.status, 201); assert.equal(f.sent[0][0], accountId);
    assert.equal((await post(sendDto())).status, 201); assert.equal(f.sent.length, 1);
  } finally { await app.close(); }
});

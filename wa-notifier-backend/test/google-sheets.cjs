// Run after npm run build: node --test test/google-sheets.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { SheetsService } = require('../dist/google-sheets/sheets.service');
const { SheetsGoogleService } = require('../dist/google-sheets/sheets-google.service');
const { SheetsAccountGuard } = require('../dist/google-sheets/sheets.controller');
const { SheetsEventSchema } = require('../dist/google-sheets/sheets.schema');
const { hash, phoneNumber, consentGiven, dueTime, tabRange, readTable, encryptToken, decryptToken } = require('../dist/google-sheets/sheets.utils');
const accountId = '507f1f77bcf86cd799439011';
const query = value => ({ lean: async () => value, sort() { return this; }, limit() { return this; }, select() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });

test('normalizes international phones without treating scientific notation as a phone', () => {
  assert.equal(phoneNumber(' +91 (98765) 43210 '), '+919876543210');
  for (const value of ['9.19E+11', 'abc919876543210', '', '+0123456789', '123']) assert.equal(phoneNumber(value), '');
  assert.equal(consentGiven(' YES '), true);
  for (const value of ['false', 'no', '', 'ok']) assert.equal(consentGiven(value), false);
});
test('requires explicit reminder timezones and handles UTC conversion', () => {
  assert.equal(dueTime('2026-10-01T10:00:00+05:30'), '2026-10-01T04:30:00.000Z');
  for (const value of ['01/10/2026', '2026-10-01', '2026-10-01T10:00:00', '2026-02-30T00:00:00Z', '2026-10-01T24:00:00Z', 'garbage']) assert.equal(dueTime(value), null);
});
test('rejects ambiguous headers and oversized sheets, quotes tab titles safely', () => {
  for (const values of [[], [['Phone', 'Phone']], [['Phone', '']], [['Phone'], ['1', 'missing header']], [['Phone'], ...Array(5001).fill(['1'])]]) assert.throws(() => readTable(values));
  assert.equal(tabRange("Client's leads", 'A1'), "'Client''s leads'!A1");
  const table = readTable([['Phone', 'Notes'], [], ['+919876543210', '=IMPORTXML("url")']]);
  assert.equal(table.rows[0].rowNumber, 3);
  assert.equal(table.rows[0].data.Notes, '=IMPORTXML("url")');
});
test('refresh tokens are authenticated ciphertext and fail with the wrong key', () => {
  const key = randomBytes(32);
  const encrypted = encryptToken('sensitive-refresh-token', key);
  assert.equal(encrypted.includes('sensitive'), false);
  assert.equal(decryptToken(encrypted, key), 'sensitive-refresh-token');
  assert.throws(() => decryptToken(encrypted, randomBytes(32)));
  assert.ok(SheetsEventSchema.indexes().some(([index, options]) => index.key === 1 && options.unique));
});
test('account authorization uses the route account, rejects foreign tenants and team members', async () => {
  const guard = new SheetsAccountGuard({ findOne: async () => ({ tenantId: 'tenant-a', isActive: true }) });
  const context = user => ({ switchToHttp: () => ({ getRequest: () => ({ user, params: { whatsappAccountId: accountId }, query: { whatsappAccountId: 'owned-account' } }) }) });
  await assert.rejects(guard.canActivate(context({ role: 'client_owner', tenantId: 'tenant-b' })));
  await assert.rejects(guard.canActivate(context({ role: 'client_user', tenantId: 'tenant-a' })));
  assert.equal(await guard.canActivate(context({ role: 'client_owner', tenantId: 'tenant-a' })), true);
  assert.equal(await guard.canActivate(context({ role: 'admin' })), true);
});

function fixture(rows, settings = {}, contacts = []) {
  const connection = { _id: 'connection', whatsappAccountId: accountId, connected: true, revision: 0,
    settings: { spreadsheetId: 'spreadsheet_123', sheetId: 0, enabled: true, importContacts: true, exportLeads: false, exportReports: false,
      intervalMinutes: 15, phoneColumn: 'Phone', nameColumn: 'Name', customFields: {}, automation: 'new_row', consentColumn: 'Consent',
      statusColumn: 'Status', templateName: 'welcome', parameterColumns: ['Name'], ...settings } };
  const headers = ['Phone', 'Name', 'Consent', 'Due', 'Status'];
  let snapshot = [headers, ...rows];
  const events = new Map(); const messages = new Map(); const sent = []; const imports = []; const writes = [];
  const connectionModel = {
    findOneAndUpdate: async (_filter, update) => { if (connection.lockOwner) return null; Object.assign(connection, update); return { ...connection }; },
    exists: async filter => connection.connected && connection.revision === filter.revision && connection.lockOwner === filter.lockOwner,
    updateOne: async (_filter, update) => { Object.assign(connection, update); for (const key of Object.keys(update.$unset || {})) delete connection[key]; return { matchedCount: 1 }; },
  };
  const eventModel = {
    findOne: async ({ key }) => events.get(key) || null,
    create: async event => { if (events.has(event.key)) throw { code: 11000 }; const item = { ...event, _id: event.key }; events.set(event.key, item); return item; },
    updateOne: async ({ _id }, update) => { Object.assign(events.get(_id), update); },
  };
  const contactModel = { find: () => query(contacts), findOne: async ({ phone }) => contacts.find(c => c.phone === phone) };
  const contactsService = { commitImport: async (_id, items) => {
    imports.push(...items);
    for (const item of items) { const existing = contacts.find(c => c.phone === item.phone);
      if (existing) Object.assign(existing, item); else contacts.push({ ...item, isActive: true, isOptedOut: false }); }
    return { createdCount: items.length, updatedCount: 0 };
  } };
  const google = { accessToken: async () => 'token', request: async (_token, method, sid, suffix, data) => { writes.push({ method, sid, suffix, data }); return {}; } };
  const inbox = { sendTemplate: async (_id, phone, template, language, params) => {
    sent.push({ phone, template, language, params }); const message = { _id: `message-${sent.length}`, deliveryStatus: 'sent' };
    messages.set(message._id, message); return message;
  } };
  const service = new SheetsService(connectionModel, eventModel, contactModel, { findById: id => query(messages.get(id)) }, {},
    { findById: async () => ({ status: 'active' }) }, google, contactsService, inbox,
    { findByName: async () => ({ name: 'welcome', language: 'en', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hi {{1}}' }] }) },
    { findOne: async () => ({ tenantId: 'tenant', isActive: true }) });
  service.table = async () => ({ ...readTable(snapshot), title: 'Leads' });
  return { service, connection, events, sent, imports, writes, inbox, messages, contacts,
    setRows: next => { snapshot = [headers, ...next]; } };
}

test('sync imports and sends with mapped parameters once, then writes delivery updates without resending', async () => {
  const f = fixture([['+919876543210', 'Alice', 'YES', '', '']]);
  const first = await f.service.sync(accountId);
  assert.equal(first.sent, 1); assert.equal(first.imported, 1);
  assert.deepEqual(f.sent[0].params, ['Alice']);
  f.messages.get('message-1').deliveryStatus = 'read';
  const second = await f.service.sync(accountId);
  assert.equal(second.sent, 0); assert.equal(second.imported, 0);
  assert.equal(f.sent.length, 1);
  const lastWrite = f.writes.at(-1);
  assert.equal(lastWrite.data.valueInputOption, 'RAW');
  assert.deepEqual(lastWrite.data.data[0].values, [['read']]);
  assert.equal(f.connection.lockOwner, undefined);
});
test('skips duplicate phones, absent consent, inactive contacts and opt-outs while preserving unmapped fields', async () => {
  const f = fixture([
    ['+919876543210', 'A', 'YES'], ['+919876543210', 'Duplicate', 'YES'],
    ['+919876543211', 'B', 'NO'], ['+919876543212', 'C', 'YES'], ['+919876543213', 'D', 'YES'], ['+919876543214', 'Updated', 'YES'],
  ], {}, [
    { phone: '+919876543212', isActive: true, isOptedOut: true }, { phone: '+919876543213', isActive: false },
    { phone: '+919876543214', isActive: true, name: 'Original', tags: ['VIP'], customFields: { owner: 'Sam' }, variables: { order: '42' } },
  ]);
  const result = await f.service.sync(accountId);
  assert.equal(result.invalid, 2); assert.deepEqual(f.sent.map(item => item.phone), ['+919876543214']);
  assert.equal(f.imports.some(item => ['+919876543212', '+919876543213'].includes(item.phone)), false);
  const updated = f.contacts.find(item => item.phone === '+919876543214');
  assert.deepEqual(updated.tags, ['VIP']); assert.equal(updated.customFields.owner, 'Sam'); assert.equal(updated.variables.order, '42');
});
test('disabled automatic sync allows data sync without sending', async () => {
  const f = fixture([['+919876543210', 'Alice', 'YES']], { enabled: false });
  const result = await f.service.sync(accountId);
  assert.equal(result.imported, 1); assert.equal(f.sent.length, 0);
});
test('due reminders wait until due and deduplicate equivalent timestamps', async () => {
  const f = fixture([['+919876543210', 'Alice', 'YES', '2020-01-01T10:00:00+05:30'],
    ['+919876543211', 'Future', 'YES', '2099-01-01T10:00:00Z'], ['+919876543212', 'Bad date', 'YES', 'tomorrow']],
    { automation: 'due_date', dueColumn: 'Due' });
  await f.service.sync(accountId); assert.equal(f.sent.length, 1);
  f.setRows([['+919876543210', 'Alice', 'YES', '2020-01-01T04:30:00Z']]);
  await f.service.sync(accountId); assert.equal(f.sent.length, 1);
  f.setRows([['+919876543210', 'Alice', 'YES', '2020-01-02T04:30:00Z']]);
  await f.service.sync(accountId); assert.equal(f.sent.length, 2);
});
test('failed or uncertain sends are not automatically retried', async () => {
  const f = fixture([['+919876543210', 'Alice', 'YES']]); let attempts = 0;
  f.inbox.sendTemplate = async () => { attempts++; throw new Error('Upstream timeout containing sensitive details'); };
  await f.service.sync(accountId); await f.service.sync(accountId);
  assert.equal(attempts, 1); assert.equal([...f.events.values()][0].status, 'needs_review');
  assert.equal([...f.events.values()][0].error.includes('sensitive'), false);
});
test('status writeback re-resolves sorted rows by phone', async () => {
  const f = fixture([['+919876543210', 'Alice', 'YES'], ['+919876543211', 'Bob', 'NO']]);
  const send = f.inbox.sendTemplate;
  f.inbox.sendTemplate = async (...args) => { const result = await send(...args);
    f.setRows([['+919876543211', 'Bob', 'NO'], ['+919876543210', 'Alice', 'YES']]); return result; };
  await f.service.sync(accountId);
  assert.equal(f.writes[0].data.data[0].range, "'Leads'!E3");
});
test('does not overwrite reminder status after its date changes during sending', async () => {
  const f = fixture([['+919876543210', 'Alice', 'YES', '2020-01-01T00:00:00Z']], { automation: 'due_date', dueColumn: 'Due' });
  const send = f.inbox.sendTemplate;
  f.inbox.sendTemplate = async (...args) => { const result = await send(...args); f.setRows([['+919876543210', 'Alice', 'YES', '2099-01-01T00:00:00Z']]); return result; };
  await f.service.sync(accountId); assert.equal(f.writes.length, 0);
});
test('an occupied sync lock blocks another worker and missing columns release the lock on failure', async () => {
  const f = fixture([['+919876543210', 'Alice', 'YES']]);
  f.connection.lockOwner = 'another-worker'; await assert.rejects(f.service.sync(accountId), /current sync/);
  delete f.connection.lockOwner;
  f.connection.settings.phoneColumn = 'Missing'; await assert.rejects(f.service.sync(accountId), /mapped column/);
  assert.equal(f.connection.lockOwner, undefined); assert.match(f.connection.lastError, /mapped column/);
});
test('disconnect/revision change stops a running sync before sending', async () => {
  const f = fixture([['+919876543210', 'Alice', 'YES']]);
  const table = f.service.table;
  f.service.table = async (...args) => { f.connection.revision++; return table(...args); };
  await assert.rejects(f.service.sync(accountId), /Connection changed/); assert.equal(f.sent.length, 0);
});
test('refuses using an input or consent column as the writeback target', () => {
  const f = fixture([]);
  assert.throws(() => f.service.validateColumns({ ...f.connection.settings, statusColumn: 'Consent' }, ['Phone', 'Name', 'Consent']), /separate/);
});

test('lead export preserves manual follow-up columns and treats formula-looking messages as text', async () => {
  const f = fixture([]); const writes = [];
  const headers = ['Phone', 'Name', 'Latest message', 'Last received', 'Inbox status', 'Assigned user ID', 'Lead status', 'Next follow-up', 'Notes'];
  f.service.managedTab = async () => 'WMS Leads';
  f.service.google.request = async (_token, method, _sid, _suffix, data) => {
    if (method === 'GET') return { values: [headers, ['+919876543210', 'Alice', 'old', '', '', '', 'Qualified', '2026-10-01', 'Keep this']] };
    writes.push(data); return {};
  };
  f.service.messages.aggregate = async () => [{ latest: { phone: '919876543210', contactName: 'Alice', text: '=IMPORTXML("bad")', timestamp: new Date() } },
    { latest: { phone: '919876543211', contactName: 'Bob', text: 'New lead' } }];
  const result = await f.service.exportLeads(f.connection, 'token');
  assert.equal(result.rows, 2); assert.equal(writes[0].valueInputOption, 'RAW');
  assert.equal(writes[0].data[0].range, "'WMS Leads'!A2:F2");
  assert.equal(writes[0].data[0].values[0].length, 6);
  assert.equal(writes[0].data[0].values[0][2], '=IMPORTXML("bad")');
  assert.equal(writes[0].data[1].range, "'WMS Leads'!A3:F3");
});
test('report export includes campaign and automation delivery records and clears stale rows', async () => {
  const f = fixture([]); const writes = [];
  f.service.managedTab = async () => 'WMS Reports';
  f.service.logs.find = () => query([{ _id: 'log', broadcastId: 'campaign', phone: '+919876543210', status: 'read' }]);
  f.service.messages.find = () => query([{ _id: 'message', phone: '+919876543211', deliveryStatus: 'delivered' }]);
  f.service.google.request = async (_token, method, _sid, suffix, data) => { writes.push({ method, suffix, data }); };
  const result = await f.service.exportReports(f.connection, 'token');
  assert.equal(result.rows, 2); assert.equal(writes[0].method, 'PUT');
  assert.match(writes[0].suffix, /valueInputOption=RAW/);
  assert.equal(writes[0].data.values.length, 5001);
  assert.equal(writes[0].data.values[1][5], 'read');
  assert.equal(writes[0].data.values[2][5], 'delivered');
  assert.deepEqual(writes[0].data.values[3], Array(9).fill(''));
});
test('creates a new output tab rather than adopting an existing user tab with a WMS-like name', async () => {
  const f = fixture([]); const writes = [];
  f.connection.managedTabs = {};
  f.service.google.request = async (_token, method, _sid, suffix, data) => {
    writes.push({ method, suffix, data });
    if (method === 'GET') return { sheets: [{ properties: { title: 'WMS Reports', sheetId: 17 } }] };
    if (suffix === ':batchUpdate') return { replies: [{ addSheet: { properties: { title: data.requests[0].addSheet.properties.title, sheetId: 18 } } }] };
    return {};
  };
  const title = await f.service.managedTab(f.connection, 'token', 'Reports', ['Phone']);
  assert.match(title, /^WMS Reports [a-f0-9]{8}$/);
  assert.equal(f.connection.managedTabs.Reports.sheetId, 18);
  assert.equal(writes[1].data.requests[0].addSheet.properties.gridProperties.rowCount, 10001);
});

test('OAuth callback requires the initiating browser, consumes state once, and encrypts saved tokens', async () => {
  const axios = require('axios'); const original = axios.default.post;
  const config = { GOOGLE_SHEETS_CLIENT_ID: 'client', GOOGLE_SHEETS_CLIENT_SECRET: 'secret',
    GOOGLE_SHEETS_REDIRECT_URI: 'http://localhost:3001/api/google-sheets/oauth/callback', GOOGLE_SHEETS_FRONTEND_ORIGIN: 'http://localhost:3000',
    GOOGLE_SHEETS_ENCRYPTION_KEY: randomBytes(32).toString('hex') };
  const states = new Map(); const saved = []; let exchanges = 0;
  let pendingAttempt;
  const service = new SheetsGoogleService({ get: key => config[key] }, { findOneAndUpdate: async (...args) => {
    if (args[1].$set.oauthAttempt) { pendingAttempt = args[1].$set.oauthAttempt; return {}; }
    if (args[0].oauthAttempt !== pendingAttempt) return null;
    saved.push(args); pendingAttempt = undefined; return {};
  } }, {
    create: async state => { states.set(state.hash, state); },
    findOneAndDelete: async filter => { const state = states.get(filter.hash);
      if (!state || state.browserHash !== filter.browserHash || state.expiresAt <= filter.expiresAt.$gt) return null;
      states.delete(filter.hash); return state;
    },
  });
  const cookies = []; const html = [];
  const response = { cookie: (...args) => cookies.push(args), clearCookie() {}, setHeader() {}, type() { return this; }, send: value => html.push(value) };
  try {
    axios.default.post = async (_url, params) => { exchanges++; assert.ok(params.get('code_verifier')); return { data: { refresh_token: 'refresh-secret', scope: 'https://www.googleapis.com/auth/spreadsheets' } }; };
    const { url } = await service.start(accountId, response);
    const params = new URL(url).searchParams;
    assert.equal(params.get('code_challenge_method'), 'S256'); assert.equal(cookies[0][2].httpOnly, true);
    const req = { query: { state: params.get('state'), code: 'code' }, headers: {} };
    await service.callback(req, response); assert.equal(exchanges, 0); assert.equal(saved.length, 0);
    req.headers.cookie = `${cookies[0][0]}=${cookies[0][1]}`;
    await service.callback(req, response); assert.equal(exchanges, 1); assert.equal(saved.length, 1);
    assert.equal(saved[0][0].whatsappAccountId, accountId);
    assert.equal(saved[0][1].$set['settings.enabled'], false);
    assert.notEqual(saved[0][1].$set.refreshToken, 'refresh-secret');
    assert.equal(html.join('').includes('refresh-secret'), false);
    await service.callback(req, response); assert.equal(exchanges, 1);
    const second = await service.start(accountId, response);
    pendingAttempt = undefined; // Disconnect while the Google consent popup is open.
    req.query.state = new URL(second.url).searchParams.get('state');
    req.headers.cookie = `${cookies[1][0]}=${cookies[1][1]}`;
    await service.callback(req, response);
    assert.equal(saved.length, 1); assert.match(html.at(-1), /connection failed/);
  } finally { axios.default.post = original; }
});

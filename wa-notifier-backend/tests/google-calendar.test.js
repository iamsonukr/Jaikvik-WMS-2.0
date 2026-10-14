const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CalendarService, reminderDue } = require('../dist/google-calendar/calendar.service');
const { CalendarAccountGuard } = require('../dist/google-calendar/calendar.controller');
const { CalendarGoogleService } = require('../dist/google-calendar/calendar-google.service');

test('reminders respect cancellations, reschedules, all-day events and start time', () => {
  const now = Date.parse('2026-10-10T10:00:00Z');
  const event = { start: { dateTime: '2026-10-10T10:30:00Z' } };
  assert.equal(reminderDue(event, 60, now), true);
  assert.equal(reminderDue({ ...event, status: 'cancelled' }, 60, now), false);
  assert.equal(reminderDue({ start: { date: '2026-10-10' } }, 60, now), false);
  assert.equal(reminderDue({ start: { dateTime: '2026-10-10T12:00:00Z' } }, 60, now), false);
  assert.equal(reminderDue({ start: { dateTime: '2026-10-10T10:00:00Z' } }, 60, now), false);
});

function worker({ event, optedOut = false, fail = false, current = true } = {}) {
  const connection = { _id: 'connection', whatsappAccountId: '507f1f77bcf86cd799439011', revision: 1,
    settings: { calendarId: 'primary', enabled: true, reminderMinutes: 60, templateName: 'reminder', parameters: ['name'] } };
  const mapping = { _id: 'mapping', phone: '+919876543210', name: 'Sam', eventId: 'event', consent: true };
  const keys = new Set(), updates = []; let sends = 0;
  const connections = { find: async () => [connection], exists: async () => current, updateOne: async () => ({}) };
  const recipients = { find: async filter => { assert.equal(filter.consent, true); return [mapping]; }, exists: async () => true };
  const deliveries = { updateMany: async () => ({}), updateOne: async (_, data) => updates.push(data),
    create: async data => { if (keys.has(data.key)) throw { code: 11000 }; keys.add(data.key); return { _id: data.key }; } };
  const templates = { findByName: async () => ({ name: 'reminder', status: 'APPROVED', language: 'en', components: [{ type: 'BODY', text: 'Hello {{1}}' }] }) };
  const service = new CalendarService(connections, recipients, deliveries, {}, { findOne: async () => ({ isActive: true, isOptedOut: optedOut }) },
    { exists: async () => true }, { accessToken: async () => 'token' }, templates,
    { sendTemplate: async () => { sends++; if (fail) throw Error('uncertain'); return { _id: 'message' }; } },
    { findOne: async () => ({ isActive: true, tenantId: 'tenant' }) });
  service.request = async () => event || { id: 'event', summary: 'Appointment', start: { dateTime: new Date(Date.now() + 1800000).toISOString() } };
  return { service, updates, sends: () => sends };
}
test('persistent delivery claim prevents duplicate paid sends across worker runs', async () => {
  const event = { id: 'event', start: { dateTime: new Date(Date.now() + 1800000).toISOString() } };
  const fixture = worker({ event });
  await fixture.service.work(); await fixture.service.work();
  assert.equal(fixture.sends(), 1);
  assert.equal(fixture.updates[0].status, 'sent');
});
test('uncertain sends need review and never retry automatically', async () => {
  const event = { id: 'event', start: { dateTime: new Date(Date.now() + 1800000).toISOString() } };
  const fixture = worker({ event, fail: true });
  await fixture.service.work(); await fixture.service.work();
  assert.equal(fixture.sends(), 1);
  assert.equal(fixture.updates[0].status, 'needs_review');
});
test('opted-out contacts, canceled events and disconnected connections do not send', async () => {
  for (const config of [{ optedOut: true }, { event: { status: 'cancelled' } }, { current: false }]) {
    const fixture = worker(config); await fixture.service.work(); assert.equal(fixture.sends(), 0);
  }
});
test('one unreadable appointment does not prevent other recipients receiving reminders', async () => {
  const fixture = worker();
  fixture.service.recipients.find = async () => [
    { _id: 'missing', eventId: 'missing', phone: '+919876543210', name: 'Sam', consent: true },
    { _id: 'valid', eventId: 'valid', phone: '+919876543210', name: 'Sam', consent: true },
  ];
  fixture.service.request = async (_, path) => {
    if (path.endsWith('/missing')) throw Error('unavailable');
    return { id: 'valid', start: { dateTime: new Date(Date.now() + 1800000).toISOString() } };
  };
  await fixture.service.work();
  assert.equal(fixture.sends(), 1);
});
test('client owners cannot manage another tenant or inactive accounts', async () => {
  let account = { isActive: true, tenantId: 'tenant' };
  const guard = new CalendarAccountGuard({ findOne: async () => account });
  const context = tenantId => ({ switchToHttp: () => ({ getRequest: () => ({
    params: { whatsappAccountId: '507f1f77bcf86cd799439011' }, user: { role: 'client_owner', tenantId },
  }) }) });
  assert.equal(await guard.canActivate(context('tenant')), true);
  await assert.rejects(() => guard.canActivate(context('other')));
  account = { ...account, isActive: false };
  await assert.rejects(() => guard.canActivate(context('tenant')));
});
test('OAuth start uses read-only Calendar scope, PKCE and browser binding', async () => {
  const settings = { GOOGLE_CALENDAR_CLIENT_ID: 'id', GOOGLE_CALENDAR_CLIENT_SECRET: 'secret',
    GOOGLE_CALENDAR_REDIRECT_URI: 'http://localhost:3001/api/google-calendar/oauth/callback',
    GOOGLE_CALENDAR_FRONTEND_ORIGIN: 'http://localhost:3000', GOOGLE_CALENDAR_ENCRYPTION_KEY: 'a'.repeat(64) };
  let pending, cookie;
  const service = new CalendarGoogleService({ get: key => settings[key] }, { findOneAndUpdate: async () => ({}) },
    { create: async state => { pending = state; } });
  const result = await service.start('507f1f77bcf86cd799439011', { cookie: (...args) => { cookie = args; }, setHeader() {} });
  const url = new URL(result.url);
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/calendar.readonly');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(pending.browserHash); assert.ok(pending.verifier); assert.ok(cookie[2].httpOnly);
});

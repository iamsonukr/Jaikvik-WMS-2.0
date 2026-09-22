// Run after npm run build: node --test test/segments.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSegmentQuery, validateSegmentConditions } = require('../dist/contacts/segment-query');
const { ContactsService } = require('../dist/contacts/contacts.service');
const accountId = '507f1f77bcf86cd799439011';
const segmentId = '507f1f77bcf86cd799439012';

test('rejects arbitrary database paths, unknown operators and incomplete conditions', () => {
  for (const condition of [
    { field: '$where', operator: 'equals', value: 'x' },
    { field: 'tenantId', operator: 'equals', value: 'x' },
    { field: 'customFields.a.b', operator: 'equals', value: 'x' },
    { field: 'name', operator: '$ne', value: 'x' },
    { field: 'name', operator: 'equals', value: '' },
    { field: 'name', operator: 'greater_than', value: 'NaN' },
    { field: 'name', operator: 'before', value: 'invalid date' },
    { field: 'name', operator: 'before', value: '2026-02-30' },
    { field: 'name', operator: 'greater_than', value: '0x10' },
  ]) assert.throws(() => validateSegmentConditions([condition]));
  assert.throws(() => validateSegmentConditions(Array(31).fill({ field: 'name', operator: 'is_set' })));
});

test('legacy tags preserve AND/OR and empty segments cannot target everyone', () => {
  assert.deepEqual(buildSegmentQuery({ tags: ['VIP', 'Buyer'], matchMode: 'all' }), { $and: [{ tags: 'VIP' }, { tags: 'Buyer' }] });
  assert.deepEqual(buildSegmentQuery({ tags: ['VIP', 'Buyer'] }), { $or: [{ tags: 'VIP' }, { tags: 'Buyer' }] });
  assert.deepEqual(buildSegmentQuery({}), { _id: { $in: [] } });
});

test('text conditions escape regex metacharacters and treat dollar values literally', () => {
  const query = buildSegmentQuery({ conditions: [{ field: 'name', operator: 'contains', value: '.*$' }] });
  const expression = query.$or[0].$expr.$regexMatch;
  assert.equal(new RegExp(expression.regex, expression.options).test('Alice'), false);
  assert.equal(new RegExp(expression.regex, expression.options).test('Alice.*$'), true);
  const equals = buildSegmentQuery({ conditions: [{ field: 'name', operator: 'equals', value: '$phone' }] });
  assert.deepEqual(equals.$or[0].$expr.$eq[1], { $literal: '$phone' });
});

test('numeric comparisons exclude missing/unconvertible fields', () => {
  const query = buildSegmentQuery({ conditions: [{ field: 'customFields.spend', operator: 'less_than', value: '100' }] });
  assert.equal(query.$or[0].$expr.$and[0].$ne[0].$cond[1].$convert.onNull, null);
  assert.equal(query.$or[0].$expr.$and[0].$ne[1], null);
});

test('broadcast segment lookup scopes both collections and excludes inactive/opted-out contacts', async () => {
  let segmentFilter, contactFilter;
  const service = Object.create(ContactsService.prototype);
  service.segmentModel = { find: async filter => { segmentFilter = filter; return [{ tags: [], conditions: [{ field: 'name', operator: 'equals', value: 'Alice' }] }]; } };
  service.model = { find: async filter => { contactFilter = filter; return []; } };
  await service.findBySegmentIds(accountId, [segmentId]);
  assert.equal(segmentFilter.isActive, true);
  assert.equal(contactFilter.isActive, true);
  assert.equal(contactFilter.isOptedOut, false);
  assert.match(JSON.stringify(segmentFilter), new RegExp(accountId));
  assert.match(JSON.stringify(contactFilter), new RegExp(accountId));
  assert.ok(contactFilter.$and[1].$or[0].$or[0].$expr);
  assert.deepEqual(await service.findBySegmentIds(accountId, ['invalid']), []);
});

test('field-only segments save and empty updates are rejected', async () => {
  const service = Object.create(ContactsService.prototype);
  service.clients = { findOne: async () => ({}) };
  service.allowedTagSet = async () => new Map();
  service.segmentModel = { create: async value => value, findById: async () => ({ tags: ['VIP'], conditions: [] }) };
  const conditions = [{ field: 'name', operator: 'equals', value: 'Alice' }];
  const saved = await service.createSegment({ whatsappAccountId: accountId, name: ' Prospects ', conditions });
  assert.equal(saved.name, 'Prospects');
  assert.deepEqual(saved.conditions, conditions);
  await assert.rejects(service.updateSegment(segmentId, { tags: [], conditions: [] }));
});

test('contact preview supports mixed rules, missing fields, literal text, numbers and dates', async () => {
  const { matchesSegment } = await import('../../wa-notifier-frontend/lib/segments.mjs');
  const contact = { name: 'Alice.*', tags: ['VIP'], customFields: { spend: 150, joined: '2026-09-01', subscribed: false } };
  const rule = (field, operator, value) => [{ field, operator, value }];
  assert.equal(matchesSegment(contact, ['VIP'], rule('name', 'equals', 'Bob'), 'all'), false);
  assert.equal(matchesSegment(contact, ['VIP'], rule('name', 'equals', 'Bob'), 'any'), true);
  assert.equal(matchesSegment(contact, [], rule('name', 'contains', '.*'), 'all'), true);
  assert.equal(matchesSegment(contact, [], rule('customFields.spend', 'greater_than', '100'), 'all'), true);
  assert.equal(matchesSegment(contact, [], rule('customFields.missing', 'less_than', '100'), 'all'), false);
  assert.equal(matchesSegment(contact, [], rule('customFields.joined', 'before', '2026-09-22'), 'all'), true);
  assert.equal(matchesSegment(contact, [], rule('customFields.subscribed', 'is_set'), 'all'), true);
  assert.equal(matchesSegment(contact, [], rule('customFields.missing', 'is_not_set'), 'all'), true);
  for (const value of [' ', '0x10']) {
    assert.equal(matchesSegment({ name: value }, [], rule('name', 'less_than', '100'), 'all'), false);
  }
  assert.equal(matchesSegment({ name: '2026-02-30' }, [], rule('name', 'before', '2026-09-22'), 'all'), false);
});

test('malformed segment tags return validation errors instead of server errors', async () => {
  const service = Object.create(ContactsService.prototype);
  for (const tags of [null, 'VIP', [123], [{}]]) {
    await assert.rejects(service.updateSegment(segmentId, { tags }), error => error.getStatus() === 400);
    await assert.rejects(service.createSegment({ whatsappAccountId: accountId, name: 'Invalid', tags }), error => error.getStatus() === 400);
  }
});

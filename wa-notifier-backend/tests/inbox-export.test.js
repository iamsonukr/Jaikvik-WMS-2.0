const { test } = require('node:test');
const assert = require('node:assert/strict');
const { InboxService } = require('../dist/inbox/inbox.service');
const { TenantOwnershipGuard } = require('../dist/common/guards/tenant-ownership.guard');

const accountId = '507f1f77bcf86cd799439011';
const phone = '919876543210';
const baseThread = {
  phone, createdAt: new Date('2026-10-06T18:29:59Z'),
  threadStatus: 'open', priority: 'normal', threadTags: ['vip'],
};
const contacts = [{ phone: '+' + phone, name: 'Saved lead', customFields: { email: 'lead@example.com' } }];
function fixture(threads = [baseThread], savedContacts = contacts) {
  const queries = [];
  const model = {
    aggregate(pipeline) {
      queries.push(pipeline[0].$match);
      return { allowDiskUse() { return Promise.resolve([{ _id: phone, name: 'WhatsApp name' }]); } };
    },
    find(filter) {
      queries.push(filter);
      return {
        sort() { return this; }, select() { return this; }, allowDiskUse() { return this; }, lean() { return this; },
        async close() {},
        cursor() { return this; },
        async *[Symbol.asyncIterator]() {
          for (const number of filter.phone.$in) {
            for (let i = 0; i < 205; i++) {
              yield { phone: number, createdAt: new Date('2026-09-01T00:00:00Z'), direction: i % 2 ? 'outbound' : 'inbound', type: 'text', text: '=SUM(1,2)\n"quoted"', media: { caption: 'Photo' }, payload: { button: { text: 'Yes' } } };
            }
          }
        },
      };
    },
  };
  const contactModel = {
    find(filter) {
      queries.push(filter);
      return { select() { return this; }, lean() { return this; }, async *cursor() { yield* savedContacts; } };
    },
  };
  const service = new InboxService(model, null, null, null, null, null, null, contactModel);
  service.threads = async () => threads.map((thread) => ({ ...thread }));
  const streamExport = service.exportLeads.bind(service);
  service.exportLeads = async (...args) => {
    let csv = '';
    for await (const chunk of await streamExport(...args)) csv += chunk;
    return csv.trimEnd();
  };
  return { service, queries, streamExport };
}

test('exports full history, saved contact fields, structured content and safe CSV', async () => {
  const { service, queries } = fixture();
  const csv = await service.exportLeads(accountId, { mode: 'conversations' });
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal((csv.match(/Saved lead/g) || []).length, 205);
  assert.ok(csv.includes('lead@example.com'));
  assert.ok(csv.includes("'=SUM(1,2)\n"));
  assert.ok(csv.includes('""quoted""'));
  assert.ok(csv.includes('Photo'));
  assert.ok(csv.includes('Yes'));
  assert.ok(csv.includes('2026-09-01T00:00:00.000Z'));
  for (const query of queries) {
    assert.equal(query.$or.length, 4);
    assert.ok(query.$or.every((clause) => String(Object.values(clause)[0]) === accountId));
  }
});

test('recovers profile name after an outbound reply without a saved contact', async () => {
  const { service } = fixture([baseThread], []);
  const csv = await service.exportLeads(accountId, { mode: 'contacts' });
  assert.ok(csv.includes('WhatsApp name'));
});

test('date bounds match an inclusive local day with an exclusive UTC end', async () => {
  const { service } = fixture([
    baseThread,
    { ...baseThread, phone: 'next-day', createdAt: new Date('2026-10-06T18:30:00Z') },
    { ...baseThread, phone: 'start', createdAt: new Date('2026-10-05T18:30:00Z') },
    { ...baseThread, phone: 'before', createdAt: new Date('2026-10-05T18:29:59Z') },
    { ...baseThread, phone: 'missing', createdAt: null },
  ]);
  const csv = await service.exportLeads(accountId, { mode: 'contacts', from: '2026-10-05T18:30:00.000Z', to: '2026-10-06T18:30:00.000Z' });
  assert.equal(csv.split('\r\n').length, 3);
  assert.ok(csv.includes('start'));
  assert.ok(!csv.includes('next-day'));
  assert.ok(!csv.includes('before'));
  assert.ok(!csv.includes('missing'));
});

test('rejects repeated parameters, impossible dates, invalid modes and reversed ranges', async () => {
  const { service } = fixture();
  for (const options of [
    { from: ['2026-10-06T00:00:00Z'] }, { search: ['lead'] },
    { from: '2026-02-30T00:00:00Z' }, { from: 'invalid' },
    { from: '2026-10-07T00:00:00Z', to: '2026-10-06T00:00:00Z' },
    { mode: 'invalid' },
  ]) {
    await assert.rejects(() => service.exportLeads(accountId, { mode: 'contacts', ...options }), (error) => error.getStatus() === 400);
  }
});

test('applies search, status, priority, tag and assignee filters', async () => {
  const { service } = fixture();
  for (const filter of [{ search: 'absent' }, { status: 'resolved' }, { priority: 'urgent' }, { tag: 'other' }, { assignee: 'assigned-user' }]) {
    const csv = await service.exportLeads(accountId, { mode: 'contacts', ...filter });
    assert.equal(csv.split('\r\n').length, 1);
  }
  const csv = await service.exportLeads(accountId, { mode: 'contacts', search: 'VIP', status: 'open', priority: 'normal', tag: 'vip', assignee: 'unassigned' });
  assert.equal(csv.split('\r\n').length, 2);
});

test('ownership guard rejects exports for another tenant and missing accounts', async () => {
  const guard = new TenantOwnershipGuard({ async findOne() { return { tenantId: 'other-tenant' }; } });
  const context = (query) => ({ switchToHttp: () => ({ getRequest: () => ({ user: { role: 'client_owner', tenantId: 'my-tenant' }, query }) }) });
  await assert.rejects(() => guard.canActivate(context({ whatsappAccountId: accountId })), (error) => error.getStatus() === 403);
  await assert.rejects(() => guard.canActivate(context({})), (error) => error.getStatus() === 403);
  const allowedGuard = new TenantOwnershipGuard({ async findOne() { return { tenantId: 'my-tenant' }; } });
  assert.equal(await allowedGuard.canActivate(context({ whatsappAccountId: accountId })), true);
});

test('streams before reading history and splits large lead lists into bounded queries', async () => {
  const threads = Array.from({ length: 1001 }, (_, index) => ({ ...baseThread, phone: String(910000000000 + index) }));
  const { streamExport, queries } = fixture(threads, []);
  const stream = await streamExport(accountId, { mode: 'conversations' });
  const header = await stream.next();
  assert.ok(header.value.startsWith('\uFEFF'));
  assert.equal(queries.filter((query) => query.phone && !query.contactName).length, 0);
  let count = 0;
  for await (const row of stream) { assert.ok(row.endsWith('\r\n')); count++; }
  assert.equal(count, 1001 * 205);
  const historyQueries = queries.filter((query) => query.phone && !query.contactName);
  assert.deepEqual(historyQueries.map((query) => query.phone.$in.length), [500, 500, 1]);
  assert.ok(queries.filter((query) => query.contactName).every((query) => query.phone.$in.length <= 500));
});

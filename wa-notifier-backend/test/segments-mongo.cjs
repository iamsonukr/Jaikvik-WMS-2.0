// Optional integration check: first npm run build, then
// npm install --no-save --package-lock=false mongodb-memory-server
// node --test test/segments-mongo.cjs
// Finally npm ci to restore the application's locked dependency tree.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { buildSegmentQuery } = require('../dist/contacts/segment-query');
const { ContactSchema } = require('../dist/contacts/contact.schema');
const { ContactSegmentSchema } = require('../dist/contacts/contact-segment.schema');
const { ContactsService } = require('../dist/contacts/contacts.service');

test('MongoDB matching agrees with contact preview and respects broadcast account boundaries', async () => {
  const server = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  const connection = await mongoose.createConnection(server.getUri()).asPromise();
  try {
    const { matchesSegment } = await import('../../wa-notifier-frontend/lib/segments.mjs');
    const Contact = connection.model('Contact', ContactSchema);
    const Segment = connection.model('ContactSegment', ContactSegmentSchema);
    const account = new mongoose.Types.ObjectId();
    const otherAccount = new mongoose.Types.ObjectId();
    const values = ['Alice.*', 'ALICE', '', null, '0x10', ' ', '100', 150, false, '2026-09-01', '2026-02-30', '12/25/2025'];
    await Contact.insertMany(values.map((value, i) => ({ whatsappAccountId: account, phone: String(i), name: `Contact ${i}`, tags: ['VIP'], customFields: { value } })));
    const contacts = await Contact.find().lean();
    const failures = [];
    for (const [operator, value] of [['equals', '100'], ['not_equals', '100'], ['contains', '.*'], ['not_contains', 'alice'], ['is_set'], ['is_not_set'], ['greater_than', '10'], ['less_than', '10'], ['before', '2026-09-22'], ['after', '2026-01-01']]) {
      const segment = { tags: ['VIP'], matchMode: 'all', conditions: [{ field: 'customFields.value', operator, value }] };
      const actual = (await Contact.find(buildSegmentQuery(segment))).map(c => c.phone).sort();
      const expected = contacts.filter(c => matchesSegment(c, segment.tags, segment.conditions, segment.matchMode)).map(c => c.phone).sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push({ operator, actual, expected });
    }
    const saved = await Segment.create({ whatsappAccountId: account, name: 'VIP', tags: ['VIP'] });
    await Contact.create({ whatsappAccountId: otherAccount, phone: 'foreign', tags: ['VIP'] });
    await Contact.create({ whatsappAccountId: account, phone: 'opted-out', tags: ['VIP'], isOptedOut: true });
    const service = Object.create(ContactsService.prototype);
    service.model = Contact; service.segmentModel = Segment;
    const audience = await service.findBySegmentIds(String(account), [String(saved._id)]);
    assert.equal(audience.length, values.length);
    assert.ok(audience.every(c => String(c.whatsappAccountId) === String(account) && !c.isOptedOut));
    assert.deepEqual(failures, []);
  } finally {
    await connection.close();
    await server.stop();
  }
});

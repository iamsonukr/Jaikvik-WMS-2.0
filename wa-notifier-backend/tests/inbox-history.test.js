const { test } = require('node:test');
const assert = require('node:assert/strict');
const { InboxService } = require('../dist/inbox/inbox.service');

test('conversation history includes client messages beyond the first 200', async () => {
  const history = Array.from({ length: 205 }, (_, index) => ({ text: `Message ${index}` }));
  const model = { find() { return { sort(order) {
    assert.deepEqual(order, { createdAt: 1, _id: 1 });
    return Promise.resolve(history);
  } }; } };
  const service = new InboxService(model);
  const result = await service.messages('507f1f77bcf86cd799439011', '919876543210');
  assert.equal(result.length, 205);
  assert.equal(result.at(-1).text, 'Message 204');
});

test('downloads media retained only in the original webhook payload', async () => {
  const model = { async findOne() { return { type: 'unknown', payload: { image: { id: 'receipt-media' } } }; } };
  const meta = { async downloadMedia(id, token) {
    assert.equal(id, 'receipt-media');
    assert.equal(token, 'account-token');
    return { contentType: 'image/jpeg' };
  } };
  const clients = { async findOne() { return {}; }, getOperationalAccessToken() { return 'account-token'; } };
  const service = new InboxService(model, meta, clients);
  const result = await service.mediaAttachment('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012');
  assert.equal(result.contentType, 'image/jpeg');
});

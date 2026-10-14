const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { MetaService } = require('../dist/common/meta.service');

test('audio downloads retain the Meta MIME type when the file server returns generic binary', async () => {
  const originalGet = axios.get;
  let calls = 0;
  axios.get = async () => ++calls === 1
    ? { data: { url: 'https://media.example/audio', mime_type: 'audio/ogg; codecs=opus' } }
    : { data: Buffer.from('audio'), headers: { 'content-type': 'application/octet-stream' } };
  try {
    const service = new MetaService({ get: (_, fallback) => fallback });
    const result = await service.downloadMedia('voice-id', 'token');
    assert.equal(result.contentType, 'audio/ogg; codecs=opus');
    assert.equal(result.buffer.toString(), 'audio');
  } finally {
    axios.get = originalGet;
  }
});

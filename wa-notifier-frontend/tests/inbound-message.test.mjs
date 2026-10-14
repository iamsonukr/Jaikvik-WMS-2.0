import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleMessage, extraMessageContent, audioFilename } from '../lib/inbound-message.mjs';

test('recovers text and media from unknown historical webhook payloads', () => {
  assert.equal(visibleMessage({ type: 'unknown', payload: { text: { body: 'Help please' } } }).text, 'Help please');
  const image = { id: 'media-id', caption: 'Receipt' };
  const recovered = visibleMessage({ type: 'unsupported', payload: { image } });
  assert.equal(recovered.type, 'image');
  assert.deepEqual(recovered.media, image);
});

test('recovers voice notes and preserves audio metadata for playback and downloads', () => {
  const message = visibleMessage({ type: 'unsupported', media: { id: 'voice-id' }, payload: { audio: { id: 'voice-id', mime_type: 'audio/ogg; codecs=opus', voice: true } } });
  assert.equal(message.type, 'audio');
  assert.equal(message.media.voice, true);
  assert.equal(audioFilename(message.media), 'whatsapp-audio.ogg');
  assert.equal(visibleMessage({ type: 'unknown', media: { id: 'a', mime_type: 'audio/mpeg' } }).type, 'audio');
  assert.equal(audioFilename({ mime_type: 'audio/mp4' }), 'whatsapp-audio.m4a');
  assert.equal(audioFilename({ filename: 'client.mp3' }), 'client.mp3');
});

test('keeps true unsupported notifications and unfamiliar content visible', () => {
  const message = { type: 'unsupported', payload: { errors: [{ code: 131051 }], id: 'message-id', poll: { question: 'When?' } } };
  assert.equal(visibleMessage(message).type, 'unsupported');
  assert.deepEqual(extraMessageContent(message.payload), { poll: { question: 'When?' } });
  assert.deepEqual(extraMessageContent({ type: 'unknown', errors: [] }), {});
});

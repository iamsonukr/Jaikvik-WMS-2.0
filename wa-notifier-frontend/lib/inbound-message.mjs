const contentTypes = ['text', 'image', 'audio', 'video', 'document', 'sticker', 'interactive', 'button', 'location', 'contacts', 'reaction', 'order', 'system'];
const metadataKeys = new Set(['id', 'from', 'timestamp', 'type', 'errors', 'context', 'referral']);

// Older records retain the original webhook even when their stored type is unknown.
export function visibleMessage(message) {
  const payload = message.payload || {};
  let type = String(message.type || payload.type || '').toLowerCase();
  if (!type || ['unknown', 'unsupported'].includes(type)) {
    type = contentTypes.find((key) => payload[key] != null)
      || (String(message.media?.mime_type || '').startsWith('audio/') ? 'audio' : null)
      || type || 'unknown';
  }
  return {
    ...message,
    type,
    text: message.text || payload.text?.body,
    media: ['image', 'audio', 'video', 'document', 'sticker'].includes(type)
      ? { ...payload[type], ...message.media } : message.media,
  };
}

export function audioFilename(media = {}) {
  if (media.filename) return media.filename;
  const mime = String(media.mime_type || '').split(';')[0].trim().toLowerCase();
  const extension = { 'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/wav': 'wav' }[mime];
  return `whatsapp-audio${extension ? `.${extension}` : ''}`;
}

export function extraMessageContent(payload = {}) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !metadataKeys.has(key)));
}

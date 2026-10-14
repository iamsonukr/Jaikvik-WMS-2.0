const contentTypes = ['text', 'image', 'audio', 'video', 'document', 'sticker', 'interactive', 'button', 'location', 'contacts', 'reaction', 'order', 'system'];
const metadataKeys = new Set(['id', 'from', 'from_user_id', 'to_user_id', 'timestamp', 'type', 'errors', 'context', 'referral', 'unsupported', 'raw_type']);

// Older records retain the original webhook even when their stored type is unknown.
export function visibleMessage(message) {
  const payload = message.payload || {};
  const body = message.text || (typeof payload.text === 'string' ? payload.text : payload.text?.body);
  let type = String(message.type || payload.type || '').toLowerCase();
  if (!type || ['unknown', 'unsupported'].includes(type)) {
    const mime = String(message.media?.mime_type || '').toLowerCase();
    type = contentTypes.find((key) => payload[key] != null)
      || (body ? 'text' : null)
      || (message.media?.id || message.media?.url || message.media?.link
        ? (mime.startsWith('audio/') ? 'audio' : mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime ? 'document' : null)
        : null)
      || type || 'unknown';
  }
  return {
    ...message,
    type,
    text: body,
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

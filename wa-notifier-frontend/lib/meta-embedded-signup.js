export function isFacebookOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'facebook.com' || hostname.endsWith('.facebook.com');
  } catch {
    return false;
  }
}

function parseMaybeJson(value) {
  if (!value || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    const params = new URLSearchParams(value);
    return Object.fromEntries(params.entries());
  }
}

export function parseEmbeddedSignupMessage(message) {
  if (!message) return null;

  if (typeof message === 'object') {
    return message;
  }

  if (typeof message !== 'string') return null;

  try {
    return JSON.parse(message);
  } catch {
    const params = new URLSearchParams(message);
    const data = parseMaybeJson(params.get('data'));
    const event = params.get('event') || data?.event;
    const type = params.get('type') || data?.type;

    if (!event && !type && !data) return null;

    return {
      type: type || 'WA_EMBEDDED_SIGNUP',
      event,
      data,
    };
  }
}

export function normalizeEmbeddedSignupData(data) {
  if (!data || typeof data !== 'object') return {};

  const first = (value) => Array.isArray(value) ? value[0] : value;

  return {
    ...data,
    phone_number_id: first(data.phone_number_id || data.phoneNumberId || data.phoneNumberID || data.phone_number_ids),
    waba_id: first(data.waba_id || data.wabaId || data.whatsapp_business_account_id || data.waba_ids),
    business_id: data.business_id || data.businessId,
  };
}

export function isSuccessfulEmbeddedSignupEvent(event) {
  return [
    'FINISH',
    'FINISH_ONLY_WABA',
    'FINISH_GRANT_ONLY_API_ACCESS',
    'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
  ].includes(event);
}

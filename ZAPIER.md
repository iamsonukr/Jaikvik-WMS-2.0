# Zapier integration

Open **Integrations → Zapier** in the Admin, Master or Client Owner dashboard. The integration works with **Webhooks by Zapier**; it is not a published Jaikvik WMS app in Zapier's marketplace. Client team members cannot manage its credentials or hooks.

## Deployment requirements

- Deploy and rebuild both backend and frontend. `ZapierModule` is registered in `AppModule`; no additional package or Zapier OAuth credentials are required.
- Set the frontend's `NEXT_PUBLIC_API_URL` to your publicly reachable HTTPS backend API, such as `https://api.example.com/api`, and rebuild the frontend. Zapier cannot call localhost or a private development server.
- Keep the backend running continuously for scheduled event collection and delivery. The collector runs once per minute and the delivery worker every 15 seconds.
- MongoDB must retain the unique indexes on the connection account/key hash, action account/request ID, and webhook hook/event ID. Startup waits for model initialization. Production installations with automatic index creation disabled must provision these indexes themselves. Source schemas also include account/timestamp indexes for event scanning.
- The client needs access to the Webhooks by Zapier features used by their Zap; plan availability is controlled by Zapier.

References: [Webhooks by Zapier setup](https://help.zapier.com/hc/en-us/articles/8496083355661-How-to-get-started-with-Webhooks-by-Zapier), [Catch Hook triggers](https://help.zapier.com/hc/en-us/articles/8496288690317-Trigger-Zaps-from-webhooks), [API request options](https://help.zapier.com/hc/en-us/articles/44391646192397-Ways-to-make-API-requests-in-Zapier).

## Zapier → WMS actions

1. Select the WhatsApp account in WMS and generate an API key in **Integrations → Zapier**. Copy it immediately; it is shown only once. WMS stores its SHA-256 hash, not the original key.
2. Create a Zap with your source-app trigger, then add **Webhooks by Zapier → Custom Request**.
3. Set the method and URL from the table below. Add the headers `X-API-Key: <your WMS key>` and `Content-Type: application/json`. The key belongs to one WhatsApp account; do not add a tenant/account ID to the body.
4. For POST actions, place JSON in Data, leave Data Pass-Through off, and map source fields to the payload. Phone numbers require an international prefix, for example `+919876543210`.

| Method | Path relative to the backend API base | Purpose |
|---|---|---|
| GET | `/zapier/v1/me` | Test the key and return its account ID/name. No message is sent. |
| GET | `/zapier/v1/templates` | List supported approved templates, languages, body text and required parameter counts. |
| POST | `/zapier/v1/contacts` | Create or update a contact by phone. |
| POST | `/zapier/v1/messages/template` | Send an approved WhatsApp template using existing Inbox/billing services. |

Contact example:

```json
{
  "requestId": "crm-contact-SOURCE_EVENT_ID",
  "phone": "+919876543210",
  "name": "Customer name"
}
```

Optional `tags` is an array of existing WMS tag names; supplying it replaces the contact's tags. `customFields` is an object containing existing WMS field keys and simple values; supplied custom fields merge with existing fields. Omitted fields are preserved. Unknown tags follow the existing Contacts service's filtering rules. Inactive contacts cannot be reactivated through this action, and existing opt-outs are preserved.

Message example:

```json
{
  "requestId": "welcome-SOURCE_EVENT_ID",
  "phone": "+919876543210",
  "templateName": "your_approved_template",
  "bodyParameters": ["Customer name"],
  "consent": true
}
```

Use the JSON boolean `true` for `consent` only when messaging permission exists; the string `"true"` is rejected. Inactive/opted-out contacts are blocked. Only approved templates for the API key's account are accepted. This version supports numbered body parameters and static text headers/buttons; media headers, named parameters, dynamic headers and dynamic buttons are not supported. Map body parameters in template order, using `[]` for templates with none. The stored template determines its language. Normal wallet charges apply, including when testing a send action in Zapier.

### Request identity and limits

Every POST action requires a `requestId` (1–150 letters, digits or `_.:@/-`). Map it to the source event's stable ID and prefix it with a unique Zap/step name. The same account/request ID with the same data returns the original completed response without repeating the action. Reusing that ID for another action or payload returns HTTP 409. Separate steps, such as contact creation and a welcome message, need different prefixes.

An in-progress, failed or uncertain action is never automatically executed again. Check **Recent actions from Zapier**, Inbox and wallet before intentionally retrying with a new request ID. An interrupted process can leave an action marked `processing`; it needs the same review. Idempotency records are retained so old retries cannot resend messages. A message response reports submission status, not eventual delivery; use the delivery-status trigger for updates.

API usage is limited to 60 requests per minute per WhatsApp account. HTTP 429 includes `Retry-After: 60`. Keys must be in `X-API-Key`, not the URL. Replacing a key revokes the previous one. Disconnecting revokes API access, pauses hooks and cancels queued deliveries. An external request already in progress cannot be recalled.

## WMS → Zapier triggers

1. Create a Zap with **Webhooks by Zapier → Catch Hook** and copy its HTTPS URL.
2. In WMS, save a name, one event, and that Catch Hook URL. Up to 10 hooks are supported per WhatsApp account. Only URLs hosted at `hooks.zapier.com` with Catch Hook paths are accepted; custom hosts, query parameters and redirects are rejected.
3. Use **Send sample** in WMS, then **Test trigger** in Zapier. Samples contain artificial data and `test: true`; filter them out of production downstream actions. A sample can still run an enabled Zap.
4. Add your downstream Zap action, test it and turn the Zap on. WMS shows deliveries and offers retries for failed deliveries. To change the destination URL or event type, remove the old hook and add a replacement.

| Event | Payload data |
|---|---|
| `contact.created` | Contact ID, phone, name, tags, custom fields |
| `message.received` | Message ID, phone, contact name, type, text, WhatsApp message ID |
| `message.status_updated` | Message/log ID, phone, contact name, source (`inbox` or `campaign`), latest observed status, WhatsApp message ID, campaign ID when present, error code |

Example envelope:

```json
{
  "id": "stable-event-id",
  "event": "message.received",
  "test": false,
  "whatsappAccountId": "account-id",
  "occurredAt": "2026-09-28T10:00:00.000Z",
  "data": {
    "id": "message-id",
    "phone": "+919876543210",
    "name": "Customer name",
    "type": "text",
    "text": "Hello",
    "waMessageId": "wamid.example"
  }
}
```

Events are collected from persisted records approximately once per minute, with up to 200 records per source/hook per scan; busy accounts can take longer to catch up. Hooks begin at their creation/enable time and do not replay activity during pauses. Status triggers report the latest observed status, not every intermediate Meta status transition. A two-minute overlapping scan window handles ordinary concurrent/late commits; exceptionally late writes outside that window may require manual reconciliation. Source records need the app's standard timestamp fields. No binary attachments, private internal notes, account tokens or wallet details are exported.

Deliveries are persisted before scan checkpoints advance. Unique hook/event keys prevent duplicate queue entries. Delivery workers claim jobs with MongoDB leases. Transient failures, timeouts, HTTP 408/429 and server errors retry with exponential backoff, up to six attempts. Other HTTP 4xx failures stop automatically; fix the destination before retrying. Disabling, removing or replacing a hook session cancels stale deliveries.

Delivery is **at least once**: a timeout or crash after Zapier accepted an event may result in the same event being delivered again. Deduplicate downstream work using payload `id` (also sent as `X-WMS-Event-ID`). HTTP success means the Catch Hook accepted the event; consult Zapier's task history for later-step failures. Delivery logs/payloads expire after 30 days; the UI shows the latest 30 deliveries and API actions.

## Verification

```text
cd wa-notifier-backend
npm run build
node --test test/zapier.cjs test/google-sheets.cjs test/segments.cjs
cd ../wa-notifier-frontend
npm run build
```

Tests use a local Nest HTTP server and mocked Google/Meta/Zapier/database boundaries. They do not send real WhatsApp messages or call a real Zap. Before production use, connect a real Catch Hook, send the artificial sample, verify task history, then test one consented recipient with an approved template. Live Zapier/Meta delivery and production MongoDB index/lease behavior require that configured environment.

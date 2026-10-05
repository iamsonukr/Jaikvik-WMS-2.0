# Calendly integration

Open **Integrations → Calendly** as Admin, Master or Client Owner, with a WhatsApp account selected.

## Server setup

Set these backend environment variables, then rebuild/restart the backend and frontend:

```dotenv
CALENDLY_PUBLIC_API_URL=https://api.example.com/api
CALENDLY_ENCRYPTION_KEY=<64 hexadecimal characters>
```

Generate the encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep this key stable and backed up; changing it makes saved Calendly credentials unreadable. The public API URL must include `/api`, be reachable from Calendly and use HTTPS. Do not put Calendly personal access tokens into a shared environment variable.

## Account setup

1. In Calendly's **Integrations & apps → API & webhooks**, generate a personal access token. Its permissions must allow reading the current user and scheduled events/invitees, and managing webhook subscriptions. The Calendly account/plan must support webhooks.
2. Paste the token into WMS and connect. WMS creates a **user-scoped** subscription for `invitee.created` and `invitee.canceled`, with a random signing key. Tokens and signing keys are stored encrypted with AES-256-GCM and excluded from ordinary reads/responses. Organization-wide subscriptions and OAuth marketplace onboarding are not included.
3. Add required questions to each relevant Calendly booking form: an international WhatsApp number and an explicit consent question. For example, `WhatsApp number` and `May we send you WhatsApp appointment updates?`, with `Yes` as the consent option.
4. Enter the exact question labels and affirmative answer in WMS. A blank phone-question label uses Calendly's `text_reminder_number`; a number alone does not grant WhatsApp consent. Country codes are required. Unknown/missing consent and inactive/opted-out contacts block notifications.
5. Enable the desired confirmation, cancellation and reminder rules. Select approved WhatsApp templates and map each numbered body parameter to guest name, appointment name, local start time, timezone, location/meeting link, cancellation link or reschedule link. The template's saved language is used. Media headers, named body parameters and dynamic headers/buttons are unsupported. Normal wallet charges apply.

## Behavior and reliability

Bookings received after connecting are recorded; there is no historical import. Rescheduling emits a cancellation and a new booking. Cancellation tombstones handle out-of-order creation/cancellation events and stop pending reminders. Confirmations/reminders also check the live invitee status before sending. Start time formatting uses the guest's Calendly timezone, with UTC fallback for unknown zones.

The webhook endpoint is `/api/webhooks/calendly/{whatsappAccountId}/{revision}`. It verifies Calendly's raw-body HMAC-SHA256 signature and a three-minute timestamp window before accepting events. Only validated Calendly API resource URLs may be fetched. Webhooks acknowledge after persisting jobs; duplicate event deliveries cannot queue duplicate actions. The worker runs every 15 seconds and uses MongoDB claims. Safe processing/API failures retry up to six attempts; once billing/message submission starts, failed or interrupted sends need review and are never automatically repeated. Check Inbox and wallet before manually sending another message.

Settings are captured when a booking webhook arrives. Changes affect new events; already queued jobs retain their original mapping. Reminders are queued only when their configured due time is still in the future. Notifications for appointments already started are skipped. A disconnected/replaced integration cancels queued notifications, but cannot recall external requests already in progress. Disconnect also deletes the Calendly webhook; if remote cleanup fails, local automation remains stopped and the UI provides a cleanup retry.

MongoDB must retain unique connection/account, booking/account/invitee/revision and job/account/key/revision indexes. Startup awaits model initialization. If automatic index creation is disabled in production, provision the schema indexes yourself. Booking/activity records are retained for review; payload question answers are removed after successful ingestion. Interrupted `sending` jobs become `needs_review` after their lease expires. A process crash during subscription creation can leave an external subscription requiring removal in Calendly's API & webhooks dashboard before reconnecting.

## Verification

```text
cd wa-notifier-backend
npm run build
node --test test/calendly.cjs test/zapier.cjs test/google-sheets.cjs test/segments.cjs
cd ../wa-notifier-frontend
npm run build
```

Automated tests mock external APIs and MongoDB. For live validation, connect using your real token, save settings, make a future consented booking with an approved template, verify its confirmation in Inbox, then cancel/reschedule and verify pending reminders stop. Production API credentials and a public deployment are needed for this check.

References: [Calendly tokens](https://developer.calendly.com/docs/authentication/how-to-authenticate-with-personal-access-tokens), [webhook subscriptions](https://developer.calendly.com/api-docs/calendly-api/webhooks/create-webhook-subscription), [signature verification](https://developer.calendly.com/api-docs/overview/webhooks/webhook-signatures), [rescheduling events](https://developer.calendly.com/docs/api-guides/trigger-automations-with-other-apps-when-invitees-schedule-or-cancel-events).

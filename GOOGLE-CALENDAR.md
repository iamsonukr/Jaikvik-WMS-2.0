# Google Calendar → WhatsApp reminders

In WMS, open **Integrations → Google Calendar** as an admin, master, or client owner. Select the WhatsApp account, connect Google, choose a calendar and approved WhatsApp template, map its body parameters, and save reminder settings. Load upcoming appointments and save a recipient phone number and consent for each appointment.

## Server setup

1. In Google Cloud, enable **Google Calendar API** and configure the OAuth consent screen.
2. Create a **Web application** OAuth client. Add the exact callback URL as an authorized redirect URI, for example `http://localhost:3001/api/google-calendar/oauth/callback` or `https://api.example.com/api/google-calendar/oauth/callback`.
3. Set these backend environment variables:

```dotenv
GOOGLE_CALENDAR_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CALENDAR_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3001/api/google-calendar/oauth/callback
GOOGLE_CALENDAR_FRONTEND_ORIGIN=http://localhost:3000
GOOGLE_CALENDAR_ENCRYPTION_KEY=your-64-character-hex-key
```

Generate the encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep the key stable; changing it requires reconnecting accounts. Restart the backend after configuration. For production, use HTTPS and the exact frontend origin without a trailing slash. Frontend and backend should be on the same site so OAuth browser-binding cookies work; this matches the existing Sheets popup flow.

The integration requests `https://www.googleapis.com/auth/calendar.readonly`. It does not write events. Google may require OAuth verification before public use; while in testing, add your Google account as a test user. See [Google's Calendar scopes](https://developers.google.com/workspace/calendar/api/auth).

## Behavior

- Upcoming timed events are fetched on demand for the next eight days. Recurring events are expanded into individual occurrences. All-day events are excluded.
- Explicit recipient mappings are stored per WhatsApp account, calendar and occurrence. Attendee emails are never interpreted as phone numbers. Each occurrence needs its own mapping.
- The worker runs every minute and reads each mapped event's current status and start time. Canceled, deleted, already-started events, recipients without consent and inactive/opted-out contacts are skipped.
- Reminders become eligible within the configured lead time. A newly linked appointment already within that window receives its reminder on the next worker run.
- Parameters available: recipient name, event name, start time, timezone and location. Missing mapped values prevent sending. Event timezone is used when provided; otherwise time is formatted in UTC.
- Sends use the existing Inbox template path and billing. Persistent unique claims prevent multiple worker instances from sending the same occurrence/start time twice. Rescheduling to a new start time makes a new reminder eligible.
- An uncertain or interrupted send is marked `needs_review`; inspect Inbox and wallet before sending manually. It is never retried automatically.
- Disconnect and reconnect disable automation. Review settings and explicitly enable it again. Stored mappings and delivery history remain available.

## API

All management endpoints require JWT authentication and an active account owned by the client owner, or a platform admin/master.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/google-calendar/:whatsappAccountId` | Connection, settings, templates and delivery history |
| POST | `/api/google-calendar/:whatsappAccountId/connect` | Start browser-bound OAuth with PKCE |
| GET | `/api/google-calendar/oauth/callback` | Public, one-time browser-bound OAuth callback |
| DELETE | `/api/google-calendar/:whatsappAccountId/connection` | Remove credentials and disable reminders |
| GET | `/api/google-calendar/:whatsappAccountId/calendars` | Available calendars |
| GET | `/api/google-calendar/:whatsappAccountId/events?calendarId=primary` | Upcoming appointments and recipient mappings |
| POST | `/api/google-calendar/:whatsappAccountId/settings` | Save calendar, enabled, reminderMinutes, templateName, parameters |
| POST | `/api/google-calendar/:whatsappAccountId/recipient` | Save calendarId, eventId, phone, name, consent |

Validation: run `npm run build` in the backend, then `node --test tests/google-calendar.test.js`. Run the frontend build separately. A live OAuth and WhatsApp send check requires configured Google credentials, MongoDB and an operational WhatsApp account.

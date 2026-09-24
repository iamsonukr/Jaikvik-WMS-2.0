# Google Sheets integration

Google Sheets is available in the Client owner, Master and Admin navigation. Each WhatsApp account has its own Google connection and one source-tab configuration. Client team members cannot manage the integration.

## Server setup

1. In a Google Cloud project, enable the **Google Sheets API**. Configure the OAuth consent screen and create an OAuth client of type **Web application**. Add test users while the app is in testing.
2. Register the exact callback URI, such as `https://api.example.com/api/google-sheets/oauth/callback`.
3. Set these backend environment variables (also listed in `.env.example`):

   ```dotenv
   GOOGLE_SHEETS_CLIENT_ID=your-web-client-id
   GOOGLE_SHEETS_CLIENT_SECRET=your-web-client-secret
   GOOGLE_SHEETS_REDIRECT_URI=https://api.example.com/api/google-sheets/oauth/callback
   GOOGLE_SHEETS_FRONTEND_ORIGIN=https://app.example.com
   GOOGLE_SHEETS_ENCRYPTION_KEY=64-hex-characters
   CORS_ORIGIN=https://app.example.com
   ```

   Generate the encryption key locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it stable, secret, and backed up. Changing it requires reconnecting Google accounts. Do not commit actual credentials.
4. Set the frontend `NEXT_PUBLIC_API_URL` to the backend API base URL. Run the frontend and backend on the **same site** (for example `app.example.com` and `api.example.com`, both HTTPS). The authenticated connect response sets an HttpOnly, SameSite=Lax browser-binding cookie; unrelated hosting domains can block that cookie. Local development supports `localhost:3000` and `localhost:3001` with the default callback above. Do not mix `localhost` and `127.0.0.1`.
5. Restart the backend and rebuild/restart the frontend. Allow the connection popup. Configure a specific CORS frontend origin, not `*`, because the connect request uses credentials. If your proxy sets Cross-Origin-Opener-Policy, use a policy that permits OAuth popups to retain their opener (for example `same-origin-allow-popups`). The callback page also provides a plain completion message if the popup cannot notify WMS; use Refresh status afterward.

The integration requests `https://www.googleapis.com/auth/spreadsheets`, with offline access, because clients select existing spreadsheets by URL. This grants access to all spreadsheets the Google user can access; WMS operates on the selected spreadsheet. Public distribution may require Google's OAuth verification. A future Google Picker workflow could use the narrower `drive.file` scope. Google Drive listing and Picker are not required for this implementation.

References: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes), [writing values](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values.update).

## Client workflow

1. Select the WhatsApp account and open **Google Sheets**. Connect Google and grant permission.
2. Paste a spreadsheet URL or ID, select its source tab, and load columns/preview.
3. Map the phone column and optionally name, comma-separated tags and existing contact custom fields. Create custom fields in Contacts first for lead status, salesperson and next follow-up if needed.
4. Select contact import, inbound lead export and/or report export.
5. Optionally select an approved template and map its numbered body parameters. Choose a consent column (`YES`, `TRUE` or `1`) and a separate WMS status column. For reminders, map an ISO timestamp column that includes a timezone.
6. Save. Enable automatic sync to allow the selected messaging automation to run; default interval is 15 minutes, configurable from 5 to 1,440 minutes. With automatic sync disabled, **Sync now** only imports/exports data and updates existing message statuses.

Example source:

| Phone | Name | Consent | Reminder | WMS Status | Lead Stage |
|---|---|---|---|---|---|
| +919876543210 | Customer One | YES | 2026-10-01T10:00:00+05:30 | | New |

Store phones and reminder timestamps as **plain text** in Google Sheets. Row 1 must have unique, nonempty headers. Up to 5,000 data rows and 100 columns are supported. Scientific-notation phone numbers, duplicate phone rows and invalid numbers are skipped. Completely blank rows are ignored. A row with missing template values or an invalid reminder timestamp is not sent.

## Data behavior

- **Contacts:** Sheet-to-WMS updates run through the existing contact import service and appear in import history when changes occur. Unmapped details are carried forward; inactive and opted-out existing contacts are skipped. No contacts are deleted when sheet rows disappear. Custom field values follow existing contact field validation/conversion rules.
- **Personalized messages:** Uses the existing Inbox template service, including approved-template checks, wallet debits, failure refunds and webhook status updates. The current integration supports numbered body parameters, text/static headers and static buttons; dynamic headers, media headers, named body parameters and dynamic buttons are rejected.
- **New-row automation:** Sends once per phone per source spreadsheet/tab. Existing eligible rows are included on the first enabled run; it does not establish a historical baseline. Consent added later makes an unsent row eligible. Editing a name/template or sorting the sheet does not resend the same phone.
- **Reminders:** Sends once per phone and normalized timestamp in the source tab, once that timestamp is due. Past dates qualify, including on the first run. Changing the timestamp creates a new reminder. Dates without a timezone are invalid. Delivery is polling-based, not exact-to-the-second scheduling.
- **Writeback:** Only the selected WMS status column is updated. Rows are re-read and matched by phone before writing; changed reminder dates are checked again. Avoid simultaneously sorting/editing the sheet during the final Google API write because Sheets does not provide a transactional row-identity compare-and-swap for this operation.
- **Leads:** A newly created `WMS Leads <suffix>` tab contains each inbound phone's latest inbound message, timestamp, inbox status and assigned user ID. WMS updates only columns A–F. User-owned Lead status, Next follow-up and Notes columns G–I are preserved. These manual columns remain in Sheets; use custom-field mappings on the source tab to import follow-up data into WMS. Up to 5,000 unique inbound numbers and 10,000 output rows are supported. Do not rename/reorder the output column headers.
- **Reports:** A separate newly created `WMS Reports <suffix>` tab is a refreshed snapshot of the latest 2,500 campaign log entries plus 2,500 outbound inbox/automation messages. This tab is owned by the integration and is overwritten on every export. Financial reports are not part of this export. Output tabs cannot also be selected as the source.
- **Disconnect:** Removes this WhatsApp account's saved Google token, invalidates pending OAuth states and stops further syncs. It does not remove imported data or output tabs. It does not revoke a Google grant shared by another WMS account; the user can revoke that grant in their Google account. Reconnecting keeps mappings but disables automatic sync until explicitly saved/enabled again.

## Reliability and security

OAuth uses PKCE, expiring single-use server-side state, and an authenticated-request browser cookie. Refresh tokens are AES-256-GCM encrypted, hidden from normal database reads, and never returned to the frontend. Google/Meta response bodies are not exposed in sync errors. API routes verify the route's account ownership, without trusting a conflicting query/body account ID. Background sync also checks account and tenant activity.

A MongoDB lease prevents overlapping syncs across workers, with a heartbeat during long operations. Persistent unique event keys are claimed before each outgoing message. Failed/ambiguous/interrupted sends are **not automatically retried**; they appear as `needs_review`, or `processing` after an interruption. Inspect Inbox and wallet before retrying manually. This prefers avoiding duplicate messages over automatic recovery of uncertain sends. Disconnect cannot recall a send already in progress. Cron errors, last sync time, summaries and recent attempts are visible on the integration page.

Google writes use `RAW` so message text beginning with `=` stays text rather than executing spreadsheet formulas. Newly generated output tabs avoid overwriting pre-existing client tabs. Preserve the MongoDB unique indexes for `SheetsConnection.whatsappAccountId`, `SheetsOAuthState.hash` and `SheetsEvent.key` in production; the OAuth states also have a TTL index.

## Verification

```text
cd wa-notifier-backend
npm run build
node --test test/google-sheets.cjs
cd ../wa-notifier-frontend
npm run build
```

Tests use mocked Google/Meta/database boundaries and make no paid WhatsApp sends. They exercise OAuth browser binding/replay rejection, encrypted tokens, tenant isolation, duplicate sends, consent/opt-outs, reminder timing, sorted-row writeback and sync locking. Live OAuth, Google quotas/permissions, real MongoDB index behavior and Meta delivery must also be checked in a configured staging environment.

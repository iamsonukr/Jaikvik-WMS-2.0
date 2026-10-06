# Email two-factor authentication

Sign-in emails use **Jaikvik Whatsapp Marketing System**. Resend is called only by `EmailService`, with HTML and plain-text versions. Configure these backend environment variables:

```dotenv
RESEND_API_KEY=
RESEND_FROM_EMAIL=security@your-verified-domain.com
ADMIN_OTP_EMAILS=a@example.com,b@example.com,c@example.com
```

Use a sending address on a domain verified in Resend. Keep API keys server-side. `ADMIN_OTP_EMAILS` is parsed, trimmed, validated, deduplicated, and lowercased. An empty or malformed list prevents enabling/admin login with 2FA. Login presents masked options only after password verification. Option IDs are resolved against the server list; callers cannot supply arbitrary recipient addresses. Masters, client owners, and client users receive codes at their own registered email.

After deploying, run `npm run migrate:two-factor` in `wa-notifier-backend`. This idempotently backfills disabled 2FA and session-version defaults and creates challenge indexes. Existing accounts stay opted out until enabled; schema defaults also support unmigrated users. Set the three environment variables before enabling 2FA. Run `npm run test:two-factor` to build and execute regression tests.

For Docker deployments, run `docker compose exec api npm run migrate:two-factor` after rebuilding the image. The official Resend SDK requires Node.js 20 or newer, which matches the backend Docker image. Migration and live delivery are not run by the automated tests.

All Settings pages contain a password-protected 2FA control. Admins manage staff 2FA under Staff & roles and tenant-user 2FA under each tenant's login users. Admin changes also require the acting admin's password. Force-enable/disable clears pending codes and existing sessions. Reset clears pending codes and sessions while preserving enabled/disabled status. Admin OTP routing is editable only in the environment, never in either interface.

`POST /auth/login` returns the ordinary session when 2FA is disabled, or a random short-lived challenge when enabled. `POST /auth/2fa/send` accepts a challenge and optional admin recipient ID. `POST /auth/2fa/verify` consumes a correct OTP and returns the ordinary session. Challenges are not JWTs and cannot access protected routes. Only full sessions are saved in browser storage.

Codes use cryptographic randomness and a keyed hash bound to the challenge. OTPs expire after five minutes; login challenges expire after ten. Five wrong attempts invalidate the challenge; resending never resets the attempt budget. Sending is limited atomically per user to once per 60 seconds, including fresh logins and failed deliveries. Password confirmation permits five attempts per 15-minute window. TTL cleanup is supplemented by explicit expiry checks. Password, email, role, account activation and 2FA changes invalidate old challenges/sessions. A 2FA-protected verification-email change requires the current password.

Provider errors are logged without secrets, OTPs, recipients or provider response bodies. Email delivery errors are displayed without granting a session. Automated tests use mock email delivery; production delivery requires valid Resend configuration. No real emails are sent by tests.

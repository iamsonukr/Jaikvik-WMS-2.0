# Email two-factor authentication

Login 2FA remains disabled by default on every creation path. Users and admins can enable it only after the registered email has been verified; verifying a primary or secondary email does not automatically enable 2FA. Signup/first-login account email verification is separate from optional login 2FA.

Login, secondary email and signup verification cooldowns are released after failed email delivery. Genuine active reservations return HTTP 429 with the exact `retryAt` timestamp; unrelated database unique-index failures are logged safely and return HTTP 503, not a misleading cooldown. Login and secondary email Settings display the retry countdown. Verification resends retain the browser challenge token and replace the OTP, so a failed delivery can be retried without restarting the flow. Password-confirmation throttling is separate and returns a 15-minute attempt-limit message.

Settings now uses horizontal tabs: Profile, Plans, Billing, WhatsApp and Security for client accounts; General, Plans & billing and Security for platform accounts.

Admin Staff & roles and each tenant's login-user table show per-account 2FA status, registered-email verification status, linked secondary email and its verification status, and the effective OTP destination. Manage security supports the existing 2FA actions and password-confirmed removal of a secondary email. Removal preserves 2FA, switches delivery to the registered email, and invalidates sessions and pending verification challenges. Admin recipients remain environment-managed. Email verification can only be completed with a valid OTP; the admin panel does not mark addresses as verified manually.

Public signup requests a code using `POST /auth/register/start`, then submits the account details and code to `POST /auth/register`. No user, tenant or session is created before a valid code. `POST /auth/register/resend` rotates the code with a 60-second cooldown and preserves the five-attempt budget. Signup verification proves the registered email and does not enable login 2FA automatically. Admin-created staff and tenant users verify their registered email at first login, including when login 2FA is disabled. Admins with 2FA enabled must then complete the environment-routed second factor.

All roles can link a secondary account email in the Security tab using their current password and an OTP sent to the new address. Masters and clients choose their registered or verified secondary email only at login; an account with one usable email receives the code automatically. Admin login recipients remain exclusively controlled by `ADMIN_OTP_EMAILS`. Password-confirmed `DELETE /auth/account-email` accepts `emailType: primary|secondary`: removing the primary requires a verified secondary, which is promoted to the primary login address and removed from the secondary slot. Removing a secondary preserves the primary. Both operations invalidate other sessions and pending challenges while preserving the 2FA setting. An email already used as another account's primary cannot be promoted.

Re-run `npm run migrate:two-factor` before deploying this update to backfill legacy accounts as already verified and create email-verification TTL indexes. Newly created accounts explicitly require verification. The migration is idempotent and does not mark new, explicitly unverified users as verified. No additional environment variables are required.

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

`POST /auth/login` returns the ordinary session when 2FA is disabled, or a random short-lived challenge when enabled. `POST /auth/2fa/send` accepts a challenge and a recipient option ID when selection is required. IDs are validated against the account's available addresses or the admin environment list. `POST /auth/2fa/verify` consumes a correct OTP and returns the ordinary session. Challenges are not JWTs and cannot access protected routes. Only full sessions are saved in browser storage.

Codes use cryptographic randomness and a keyed hash bound to the challenge. OTPs expire after five minutes; login challenges expire after ten. Five wrong attempts invalidate the challenge; resending never resets the attempt budget. Sending is limited atomically per user to once per 60 seconds, including fresh logins and failed deliveries. Password confirmation permits five attempts per 15-minute window. TTL cleanup is supplemented by explicit expiry checks. Password, email, role, account activation and 2FA changes invalidate old challenges/sessions. A 2FA-protected verification-email change requires the current password.

Provider errors are logged without secrets, OTPs, recipients or provider response bodies. Email delivery errors are displayed without granting a session. Automated tests use mock email delivery; production delivery requires valid Resend configuration. No real emails are sent by tests.

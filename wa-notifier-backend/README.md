# Jaikvik WMS — Backend

Standalone NestJS REST API for the Jaikvik WMS WhatsApp Business Platform.

## Stack
- **NestJS 10** — framework
- **MongoDB 7** via Mongoose — database
- **Passport + JWT** — authentication
- **Meta Cloud API v19** — WhatsApp

## Quick Start (local dev)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set MONGODB_URI, JWT_SECRET, META_* values

# 3. Run MongoDB locally (or use Docker)
docker run -d -p 27017:27017 mongo:7

# 4. Seed first admin user
node seed.js

# 5. Start dev server
npm run start:dev
# API available at http://localhost:3001/api
# Swagger docs at  http://localhost:3001/api/docs
```

## Quick Start (Docker)

```bash
cp .env.example .env
# Edit .env

docker compose up -d --build

# Seed admin user
docker compose exec api node seed.js
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | — |
| `JWT_SECRET` | Secret for signing JWT tokens | — |
| `JWT_EXPIRES_IN` | Token expiry | `7d` |
| `META_APP_ID` | Meta App ID | — |
| `META_APP_SECRET` | Meta App Secret | — |
| `META_VERIFY_TOKEN` | Webhook verify token | `wa_notifier_verify` |
| `META_API_VERSION` | Meta API version | `v25.0` |
| `META_PRICING_API_VERSION` | Graph API version used for WhatsApp pricing analytics sync | `META_API_VERSION` |
| `META_WABA_ACCESS_MODE` | `embedded_signup` for direct Meta Cloud API, `provider_assignment`/`multi_partner` only for advanced partner flows | `embedded_signup` |
| `META_ENABLE_PROVIDER_ASSIGNMENT` | Must be `true` before backend calls `/{waba-id}/assigned_users` | `false` |
| `META_OPERATIONAL_ACCESS_TOKEN_SOURCE` | `account` uses the Embedded Signup token saved per WABA; `provider` uses `META_PROVIDER_SYSTEM_USER_ACCESS_TOKEN` for sends/templates/register/read receipts | `account` |
| `META_PROVIDER_BUSINESS_ID` | Provider business ID used to verify/list provider system users | — |
| `META_PROVIDER_SYSTEM_USER_ID` | Provider system user ID returned by `/{business-id}/system_users` | — |
| `META_PROVIDER_SYSTEM_USER_ACCESS_TOKEN` | Provider system user token used to manage assigned client WABAs | — |
| `META_WABA_SYSTEM_USER_TASKS` | Comma-separated WABA tasks assigned to the provider system user | `MANAGE` |
| `META_CREDIT_LINE_ID` | Provider credit line ID to attach to client WABAs when clients should not pay Meta directly | — |
| `META_WABA_CURRENCY` | Currency used when attaching the provider credit line | `INR` |
| `API_PORT` | Port to listen on | `3001` |
| `CORS_ORIGIN` | Frontend URL(s) — comma-separated | `*` |

## API Endpoints

All routes prefixed `/api/`. JWT Bearer token required except login/register and webhook.

### Auth
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register user |
| `POST` | `/api/auth/login` | Login → returns JWT |
| `GET` | `/api/auth/me` | Current user profile |
| `PATCH` | `/api/auth/me` | Update profile |
| `PATCH` | `/api/auth/password` | Change password |

### Clients
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/clients` | List all WABA clients |
| `POST` | `/api/clients` | Create client |
| `GET` | `/api/clients/:id` | Get single client |
| `PATCH` | `/api/clients/:id` | Update client |
| `DELETE` | `/api/clients/:id` | Delete client |

### Contacts
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/contacts?clientId=` | List contacts |
| `GET` | `/api/contacts/tags?clientId=` | List distinct tags |
| `GET` | `/api/contacts/count?clientId=&tag=` | Count by segment |
| `POST` | `/api/contacts` | Create contact |
| `POST` | `/api/contacts/bulk` | Bulk upsert from CSV |
| `PATCH` | `/api/contacts/:id` | Update contact |
| `DELETE` | `/api/contacts/:id` | Delete contact |

### Templates
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/templates?clientId=` | List templates |
| `POST` | `/api/templates/sync/:clientId` | Sync from Meta WABA |

### Broadcasts
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/broadcasts?clientId=` | List campaigns |
| `POST` | `/api/broadcasts` | Create campaign |
| `GET` | `/api/broadcasts/:id` | Get campaign |
| `PATCH` | `/api/broadcasts/:id` | Update campaign |
| `POST` | `/api/broadcasts/:id/send` | Fire broadcast (async) |
| `GET` | `/api/broadcasts/:id/logs` | Per-message delivery logs |

### Inbox
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/inbox/threads?clientId=` | All conversation threads |
| `GET` | `/api/inbox/messages?clientId=&phone=` | Messages in thread |
| `POST` | `/api/inbox/reply` | Send outbound message |
| `POST` | `/api/inbox/resolve` | Mark thread resolved |
| `POST` | `/api/inbox/assign/:id` | Assign thread to agent |

### Chatbot
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/chatbot?clientId=` | List keyword rules |
| `POST` | `/api/chatbot` | Create rule |
| `PATCH` | `/api/chatbot/:id` | Update rule |
| `DELETE` | `/api/chatbot/:id` | Delete rule |

### Analytics
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/analytics/overview?clientId=` | Summary stats |
| `GET` | `/api/analytics/daily?clientId=&days=` | Daily breakdown |
| `GET` | `/api/analytics/inbox?clientId=` | Inbox stats |

### Webhooks
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/webhooks/meta` | Meta verification handshake |
| `POST` | `/api/webhooks/meta` | Inbound events receiver |

## Meta Webhook Setup

1. Go to Meta Developer Console → your App → WhatsApp → Configuration
2. Set Callback URL: `https://yourdomain.com/api/webhooks/meta`
3. Set Verify Token: value of `META_VERIFY_TOKEN` in your `.env`
4. Subscribe to fields: `messages`, `message_deliveries`, `message_reads`

## Tech Provider Embedded Signup

For direct Meta Cloud API onboarding, keep `META_WABA_ACCESS_MODE` set to
`embedded_signup`. By default the backend uses the signup token returned by Meta
for that client WABA.

For provider-style platforms where your provider system-user token has already
been assigned access to customer WABAs, set
`META_OPERATIONAL_ACCESS_TOKEN_SOURCE=provider`. The backend will still onboard
and store each client's WABA/phone IDs through Embedded Signup, but sends,
template sync/create, registration, webhook subscription, and read receipts use
`META_PROVIDER_SYSTEM_USER_ACCESS_TOKEN`. During onboarding, the backend verifies
that the provider token can access the newly connected phone number so bad
grants fail early instead of failing later with Meta `#200` on send.

Only for advanced provider-assignment or multi-partner/BSP flows, set
`META_WABA_ACCESS_MODE` to `provider_assignment` or `multi_partner`, set
`META_ENABLE_PROVIDER_ASSIGNMENT=true`, configure a provider business system
user with access to the Meta app, and set `META_PROVIDER_BUSINESS_ID`,
`META_PROVIDER_SYSTEM_USER_ID`, and `META_PROVIDER_SYSTEM_USER_ACCESS_TOKEN`.
Use the system-user ID returned by
`GET /{META_PROVIDER_BUSINESS_ID}/system_users`; do not use a personal Facebook
user ID or a token debugger global user ID.
After exchanging the signup code, the backend assigns that system user to the
client WABA and stores the provider token for webhook subscription, phone
registration, templates, and messaging.

If clients pay Meta directly, leave `META_CREDIT_LINE_ID` empty and have them
add a payment method in their own Meta Business. If clients should send through
your technical provider credit line, set `META_CREDIT_LINE_ID`,
`META_WABA_CURRENCY`, and `META_PROVIDER_SYSTEM_USER_ACCESS_TOKEN`. The backend
then attaches the provider credit line to the client WABA during Embedded
Signup, manual account creation, phone registration, or webhook re-subscription.
If Meta rejects that attachment, onboarding/setup fails instead of saving an
account that will later fail sends because the client's own payment method is
missing.

## Project Structure

```
wa-notifier-backend/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── auth/              JWT auth, user schema, strategies
│   ├── clients/           WABA client CRUD
│   ├── contacts/          Contact management, bulk import, segments
│   ├── templates/         HSM template sync from Meta
│   ├── broadcasts/        Bulk send engine, delivery tracking
│   ├── inbox/             Message threads, live chat, outbound reply
│   ├── chatbot/           Keyword auto-reply rules
│   ├── analytics/         Stats aggregations
│   ├── webhooks/          Meta webhook receiver + event processor
│   └── common/
│       ├── guards/        JwtAuthGuard (applied globally)
│       ├── decorators/    @Public(), @CurrentUser()
│       └── meta.service.ts
├── seed.js
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── package.json
```

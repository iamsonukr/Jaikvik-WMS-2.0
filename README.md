# Jaikvik WMS

Jaikvik WMS is a WhatsApp Business Management System built for teams, agencies, and businesses that need more than the standard WhatsApp Business mobile app. It combines a Next.js dashboard with a NestJS API to manage WhatsApp Business Platform clients, contacts, broadcasts, templates, inbox activity, chatbot rules, and analytics.

## What Makes It Different

The normal WhatsApp Business app is designed for small-business, mostly manual communication. Jaikvik WMS is designed for platform-style operations: multi-client management, bulk campaigns, automation, delivery tracking, and team workflows.

| Capability | WhatsApp Business App | Jaikvik WMS |
|---|---|---|
| Manage multiple WABA clients | Limited | Yes, with client switching |
| Send template campaigns | Limited/manual | Yes, through Meta Cloud API |
| Target contacts by segment | Basic labels | Tags, filters, and campaign audiences |
| Track campaign delivery | Basic visibility | Sent, delivered, read, failed, and logs |
| Sync approved Meta templates | No dashboard sync | Yes |
| Team inbox workflow | Limited | Assign, resolve, and manage threads |
| Chatbot rules | Basic greeting/away replies | Keyword rules with match types and priority |
| Analytics | Limited | Campaign, read-rate, inbox, and contact metrics |
| Webhook automation | Not exposed | Inbound messages, delivery, and read events |
| Backend/API integration | Not available | Built for CRM/order/payment integrations |

## Core Features

### Multi-Client WhatsApp Management

Add and manage multiple WhatsApp Business Account clients from a single dashboard. Each client can store its WABA ID, phone number ID, access token, timezone, industry, and active status.

### Contact Management

Create contacts, bulk import them from CSV, tag them into segments, store personalization variables, and use those tags when launching broadcasts.

### Template Sync

Sync approved HSM/message templates directly from Meta and use them inside campaigns.

### Broadcast Campaigns

Create template-based campaigns, target all contacts or selected tag groups, send through the WhatsApp Cloud API, and monitor live campaign progress.

### Delivery Logs

Track each campaign message individually with status history such as queued, sent, delivered, read, or failed. Error codes and messages are stored for debugging failed sends.

### Team Inbox

Receive inbound WhatsApp messages through webhooks, view conversation threads, reply from the dashboard, assign conversations to agents, and mark threads as resolved.

### Chatbot Rules

Build keyword-based auto-replies using exact, contains, or starts-with matching. Rules can be prioritized and enabled or disabled per client.

### Analytics

View daily campaign performance, read-rate trends, inbox stats, total contacts, broadcast counts, delivery totals, and failed message counts.

### Webhook Automation

The backend receives Meta webhook events for inbound messages, message deliveries, and message reads. This powers inbox updates, campaign status tracking, chatbot replies, and read receipts.

## Project Structure

```text
WMS/
+-- wa-notifier-frontend/   # Next.js dashboard
+-- wa-notifier-backend/    # NestJS REST API
+-- flowcharts/             # Project flow diagrams
+-- privacy-policy.html
`-- README.md
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, Tailwind CSS, Recharts, Axios, Lucide React |
| Backend | NestJS 10, MongoDB, Mongoose, Passport, JWT |
| WhatsApp | Meta WhatsApp Cloud API |
| Deployment | Docker, Vercel/VPS-ready frontend, standalone backend |

## Quick Start

### Backend

```bash
cd wa-notifier-backend
npm install
cp .env.example .env
node seed.js
npm run start:dev
```

Backend runs at:

```text
http://localhost:3001/api
```

Swagger docs:

```text
http://localhost:3001/api/docs
```

### Frontend

```bash
cd wa-notifier-frontend
npm install
cp .env.example .env
npm run dev
```

Frontend runs at:

```text
http://localhost:3000
```

Set the frontend API URL in `.env`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## Main App Pages

| Page | Purpose |
|---|---|
| Dashboard | Overview stats and campaign activity |
| Clients | Manage WhatsApp Business clients |
| Contacts | Import, tag, and manage contact records |
| Templates | Sync and view approved Meta templates |
| Broadcasts | Create, send, and monitor campaigns |
| Inbox | Manage two-way WhatsApp conversations |
| Chatbot | Configure keyword auto-reply rules |
| Analytics | View campaign and inbox performance |
| Settings | Profile, password, and webhook setup reference |

## Meta Webhook Setup

Configure your Meta app webhook with:

```text
https://yourdomain.com/api/webhooks/meta
```

Subscribe to:

```text
messages
message_deliveries
message_reads
```

The verify token must match `META_VERIFY_TOKEN` in the backend environment.

## Summary

WhatsApp Business is best for manual one-to-one customer chats. Jaikvik WMS is built for serious business messaging operations: multi-client control, segmented broadcasts, template messaging, automation, team inbox workflows, delivery tracking, and analytics.

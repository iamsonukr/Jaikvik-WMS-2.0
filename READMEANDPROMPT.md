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


+-----------------------------------------------+-------+------+--------+-------+
| Feature                                       | Owner | User | Master | Admin |
+-----------------------------------------------+-------+------+--------+-------+
| Connect/setup WhatsApp account                |  ✅   |  ❌  |   ✅  |  ✅   |
| Edit/delete WhatsApp account                  |  ✅   |  ❌  |   ✅  |  ✅   |
| Subscribe webhooks / register phone           |  ✅   |  ❌  |   ✅  |  ✅   |
| View WhatsApp accounts                        |  ✅   |  ✅  |   ✅  |  ✅   |
| Switch between WhatsApp accounts              |  ✅   |  ✅* |   ✅  |  ✅   |
| Update company/billing profile                |  ✅   |  ❌  |   ✅  |  ✅   |
| Buy/verify subscription plan                  |  ✅   |  ❌  |   ❌  |  ✅   |
| View current plan                             |  ✅   |  ✅  |   ✅  |  ✅   |
| Manage plans/pricing                          |  ❌   |  ❌  |   ✅  |  ✅   |
| Assign/change client subscription             |  ❌   |  ❌  |   ✅  |  ✅   |
| Recharge wallet                               |  ✅   |  ❌  |   ❌  |  ✅   |
| View wallet balance/ledger                    |  ✅   |  ✅  |   ✅  |  ✅   |
| Manually adjust wallet                        |  ❌   |  ❌  |   ✅  |  ✅   |
| Reverse wallet transaction                    |  ❌   |  ❌  |   ✅  |  ✅   |
| View payments/invoices                        |  ✅   |  ✅  |   ✅  |  ✅   |
| Manage payment records                        |  ❌   |  ❌  |   ✅  |  ✅   |
| Invite team members                           |  ✅   |  ❌  |   ❌  |  ✅   |
| Change team roles                             |  ✅   |  ❌  |   ❌  |  ✅   |
| Disable/remove team members                   |  ✅   |  ❌  |   ❌  |  ✅   |
| Reset team member password                    |  ✅   |  ❌  |   ❌  |  ✅   |
| View team members                             |  ✅   |  ✅  |   ✅  |  ✅   |
| Create/import contacts                        |  ✅   |  ✅  |   ✅  |  ✅   |
| Delete contacts / bulk delete                 |  ✅   |  ✅  |   ✅  |  ✅   |
| Manage contact tags/groups                    |  ✅   |  ✅  |   ✅  |  ✅   |
| Export contacts/segments                      |  ✅   |  ✅  |   ✅  |  ✅   |
| Create/edit chatbot rules                     |  ✅   |  ✅  |   ✅  |  ✅   |
| Sync/create templates                         |  ✅   |  ✅  |   ✅  |  ✅   |
| Create broadcasts/campaigns                   |  ✅   |  ✅  |   ✅  |  ✅   |
| Send/schedule broadcasts                      |  ✅   |  ✅  |   ✅  |  ✅   |
| Pause/cancel broadcasts                       |  ✅   |  ✅  |   ✅  |  ✅   |
| View broadcast logs/analytics                 |  ✅   |  ✅  |   ✅  |  ✅   |
| View inbox conversations                      |  ✅   |  ✅  |   ✅  |  ✅   |
| Reply/send templates in inbox                 |  ✅   |  ✅  |   ✅  |  ✅   |
| Assign inbox chat to team member              |  ✅   |  ✅  |   ✅  |  ✅   |
| Resolve inbox thread                          |  ✅   |  ✅  |   ✅  |  ✅   |
| View notifications                            |  ✅   |  ✅  |   ✅  |  ✅   |
| Create support ticket                         |  ✅   |  ✅  |   ❌  |  ✅   |
| Reply to assigned support ticket              |  ✅   |  ✅  |   ✅  |  ✅   |
| Assign support tickets                        |  ❌   |  ❌  |   ✅  |  ✅   |
| View all support tickets                      |  ❌   |  ❌  |   ✅* |  ✅   |
| Manage admin/master staff                     |  ❌   |  ❌  |   ❌  |  ✅   |
| View audit logs                               |  ❌   |  ❌  |   ✅  |  ✅   |
| Manage tenants/clients                        |  ❌   |  ❌  |   ✅  |  ✅   |
+-----------------------------------------------+-------+------+--------+-------+

* Notes:
  - User can switch only between WhatsApp accounts they have been granted access to.
  - Master can view all support tickets across all assigned tenants/clients.

  You mean Interakt.
In Interakt’s WhatsApp tool:
Custom Field means an extra data field stored on a contact, beyond default fields like name, phone, email, city, etc. Interakt says users can create custom contact fields to capture extra business data, with types like text, number, email, and dropdown.
Examples:
Customer Type: VIP / Regular / New
Last Order Value: 2500
Preferred Language: Hindi
City: Jaipur
Lead Source: Instagram Ad
Birthday
Interested Product
So 30 Custom Fields means you can define 30 unique contact attributes.
Custom Tag means a label attached to contacts for grouping/filtering.
Examples:
VIP
New Lead
Abandoned Cart
Interested
Paid Customer
Follow Up
Opted Out
So 45 Custom Tags means 45 unique labels/tags.
Custom Event means a tracked customer action. Interakt’s Event Track API records user actions such as an order being placed, signup, etc., with event properties.
Examples:
OrderPlaced
CartAbandoned
PaymentSuccessful
LeadCreated
ProductViewed
AppointmentBooked
SubscriptionExpired
So 7 Custom Events means you can define/track 7 unique event names. Events are useful for campaign triggers, conversion tracking, segmentation, and automation.
For your WhatsApp Management System, you can model this as:
Custom Fields: extra contact properties
Tags: manual/automatic labels for segmentation
Events: customer activity timeline used for automation and reports
Sources: Interakt pricing lists limits like 30 Custom Fields, 45 Custom Tags, and 7 Custom Events on Advanced plans; their docs explain custom fields and Track/Event APIs.
https://www.interakt.shop/pricing-us/
https://www.interakt.shop/resource-center/how-to-add-custom-fields-on-contact-hub-in-sales-crm/
https://www.interakt.shop/resource-center/user-and-event-track-api/


It Shouldent have login and    or signup or any payment  functionality it will have only key registeration input box which wil get verified on this url POST https://nexusbackend-ookk.onrender.com/api/subscriptions/verify .. . BODY{   "productId": "6a7567937e01aee3cd38bb15",   "licenseKey": "USER_ENTERED_LICENSE_KEY" } ... payment will be handeled on this website only ... the extension should be standalone

Re-verification cadence:check on every browser start,

POST https://nexusbackend-ookk.onrender.com/api/subscriptions/verify
Body: { "productId": "6a7567937e01aee3cd38bb15", "licenseKey": "USER_ENTERED_LICENSE_KEY" } 
the respone of this url looks like

HTTP 200

{
  "success": true,
  "valid": true,
  "hasAccess": true,
  "reason": "active",
  "message": "License verified.",
  "verifiedAt": "2026-08-07T...",
  "user": {
    "id": "...",
    "firstName": "...",
    "lastName": "...",
    "fullName": "...",
    "username": "...",
    "email": "...",
    "avatar": "...",
    "isActive": true
  },
  "product": {
    "id": "6a7567937e01aee3cd38bb15",
    "name": "...",
    "slug": "...",
    "shortDescription": "...",
    "version": "...",
    "licenseType": "...",
    "supportedPlatforms": [],
    "published": true
  },
  "subscription": {
    "id": "...",
    "status": "active",
    "startDate": "...",
    "endDate": "...",
    "cancelledAt": null
  },
  "license": {
    "key": "USER-KEY-HERE",
    "status": "active",
    "durationDays": 30,
    "purchasedAt": "...",
    "redeemedAt": "...",
    "expiresAt": null,
    "invoiceNumber": "CNX-..."
  },
  "plan": {
    "id": "...",
    "name": "...",
    "type": "...",
    "price": 0,
    "currency": "INR",
    "durationDays": 30
  }
}..... {
  "success": false,
  "message": "productId is required."
}
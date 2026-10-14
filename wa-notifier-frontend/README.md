# Jaikvik WMS — Frontend

Standalone Next.js 14 dashboard for the Jaikvik WMS WhatsApp Business Platform. Talks to the [wa-notifier-backend](../wa-notifier-backend) API over HTTP — fully decoupled, deployable independently (Vercel, Docker, any Node host).

Client Help Center: `/client/help`, available to client owners and team members. Content coverage and maintenance notes: [CLIENT-HELP-CENTER.md](../CLIENT-HELP-CENTER.md).

## Stack

- **Next.js 14** (App Router)
- **Tailwind CSS**
- **Recharts** — analytics charts
- **Axios** — API client
- **Lucide React** — icons

## Quick Start (local dev)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Set NEXT_PUBLIC_API_URL to your backend's URL, e.g.:
# NEXT_PUBLIC_API_URL=http://localhost:3001/api

# 3. Start dev server
npm run dev
# Frontend at http://localhost:3000
```

> The backend must be running and reachable at the URL configured in `NEXT_PUBLIC_API_URL`. See [wa-notifier-backend](../wa-notifier-backend) for setup.

## Quick Start (Docker)

```bash
cp .env.example .env
# Edit NEXT_PUBLIC_API_URL to point at your deployed backend

docker compose up -d --build
# Frontend at http://localhost:3000
```

Note: `NEXT_PUBLIC_API_URL` is baked in at **build time** (Next.js convention for client-exposed env vars), so the Docker build passes it as a build arg — already wired in `docker-compose.yml` and `Dockerfile`.

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Full URL of the backend API, including `/api` | `https://api.yourdomain.com/api` |
| `NEXT_PUBLIC_META_APP_ID` | Meta app ID used by Facebook Login for Business | `100000000000000` |
| `NEXT_PUBLIC_META_CONFIG_ID` | Facebook Login for Business configuration ID | `900000000000000` |
| `NEXT_PUBLIC_META_BUSINESS_APP_CONFIG_ID` | Optional separate Login for Business configuration ID for existing WhatsApp Business App/coexistence onboarding. Falls back to `NEXT_PUBLIC_META_CONFIG_ID` when empty. | `900000000000001` |
| `NEXT_PUBLIC_META_API_VERSION` | Meta Graph API version used by the JS SDK | `v25.0` |
| `NEXT_PUBLIC_META_SOLUTION_ID` | Optional multi-partner/BSP solution ID passed as `extras.setup.solutionID` during Embedded Signup | `1985687578474211` |

The connect screen supports two Meta signup modes:

- `cloud_api`: standard WhatsApp Cloud API onboarding for a new/free number.
- `business_app`: WhatsApp Business App coexistence, launched with
  `featureType: whatsapp_business_app_onboarding`, for eligible numbers already
  active in the WhatsApp Business App.

## Deploying Separately

Since this is fully standalone, you can deploy it anywhere independent of the backend:

- **Vercel**: just set `NEXT_PUBLIC_API_URL` in project env vars and deploy
- **Docker / VPS**: use the included `Dockerfile` + `docker-compose.yml`
- **Static export**: not supported as-is (uses dynamic routes + client auth), use Node server deployment

Just ensure your backend has `CORS_ORIGIN` set to this frontend's deployed URL.

### VPS builds and missing CSS

`npm run build` also packages `.next/static` and `public` into
`.next/standalone`. Next.js standalone output does not include these assets
automatically; without them, the standalone server returns 404 for CSS and JS.
Use `npm run build` rather than calling `next build` directly so the packaging
step runs.

For a first deployment from the frontend directory:

```bash
npm ci --include=dev
npm run build
HOSTNAME=0.0.0.0 PORT=3000 npm run start:standalone
```

If PM2 already manages the frontend, stop that process before rebuilding in
its live directory, run `npm run build`, and restart the same process after
the build succeeds. Rebuilding a live `.next` directory can remove assets
that the running server is still referencing. For deployments without downtime,
build in a separate release directory and switch to the completed release.

Proxy all frontend requests, including `/_next/static/`, to the frontend Node
server. If Nginx serves those files directly, its alias must point to the current
release's static directory. Avoid caching HTML across deployments, since it can
reference old asset hashes. Check a failing CSS request in browser DevTools:
it should return HTTP 200 with a `text/css` content type.

## Project Structure

```
wa-notifier-frontend/
├── app/
│   ├── login/
│   ├── dashboard/
│   ├── clients/
│   │   └── [id]/
│   ├── contacts/
│   ├── templates/
│   ├── broadcasts/
│   │   ├── new/
│   │   └── [id]/
│   ├── inbox/
│   ├── chatbot/
│   ├── analytics/
│   ├── settings/
│   ├── layout.jsx
│   └── globals.css
├── components/
│   ├── layout/         Sidebar, AppShell (auth-guarded wrapper)
│   └── ui/              Button, Card, Modal, Input, Badge, etc.
├── hooks/
│   └── useClient.jsx    Active-client selector context
├── lib/
│   ├── api.js            Axios instance → calls backend directly
│   └── auth-context.jsx  JWT auth state
├── public/
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Pages

| Route | Description |
|---|---|
| `/login` | Email + password login |
| `/dashboard` | Overview stats + recent campaigns chart |
| `/clients` | Manage WhatsApp Business clients (agency model) |
| `/clients/[id]` | Single client detail + template sync |
| `/contacts` | Contact list, CSV import, tag filters |
| `/templates` | Synced HSM templates from Meta |
| `/broadcasts` | Campaign list with live delivery stats |
| `/broadcasts/new` | Create + send a new campaign |
| `/broadcasts/[id]` | Per-message delivery logs |
| `/inbox` | Two-way live chat / team inbox |
| `/chatbot` | Keyword-based auto-reply rules |
| `/analytics` | Charts: daily performance, read rate, inbox stats |
| `/settings` | Profile, password, webhook config reference |

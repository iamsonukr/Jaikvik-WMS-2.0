# Jaikvik WMS — Frontend

Standalone Next.js 14 dashboard for the Jaikvik WMS WhatsApp Business Platform. Talks to the [wa-notifier-backend](../wa-notifier-backend) API over HTTP — fully decoupled, deployable independently (Vercel, Docker, any Node host).

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

## Deploying Separately

Since this is fully standalone, you can deploy it anywhere independent of the backend:

- **Vercel**: just set `NEXT_PUBLIC_API_URL` in project env vars and deploy
- **Docker / VPS**: use the included `Dockerfile` + `docker-compose.yml`
- **Static export**: not supported as-is (uses dynamic routes + client auth), use Node server deployment

Just ensure your backend has `CORS_ORIGIN` set to this frontend's deployed URL.

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

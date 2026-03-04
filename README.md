# D-Mon Team Calendar

A web app for **D-Mon Hockey Club** that shows upcoming match attendance per team, scraped live from [Twizzit](https://app.twizzit.com). Coaches can see at a glance which players confirmed, declined, or haven't responded yet, and export the data to Excel.

---

## What it does

- Lists all active teams grouped by category (Bovenbouw, Onderbouw, Trimmers)
- Shows a per-team attendance grid: players × upcoming matches, with colour-coded dots
- Supports two date ranges: **Vandaag** (from today) or **Seizoen** (from January of the current season)
- Exports a single team to `.xlsx` (one sheet)
- Exports all teams at once to `.xlsx` (one sheet per team) with a real-time progress bar
- Protected by HTTP Basic Auth — single shared club password

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | SvelteKit 2 + Svelte 5 (runes) |
| Runtime | Node.js 22 via `@sveltejs/adapter-node` |
| Styling | Plain CSS (no framework) |
| Excel export | `xlsx-js-style` |
| HTTP | Native Node 22 `fetch` |
| Deployment | Docker → Google Cloud Run |

---

## Project structure

```
src/
├── hooks.server.ts              # Basic Auth on every request
├── lib/
│   ├── types.ts                 # Shared TypeScript interfaces
│   └── server/
│       ├── auth.ts              # Twizzit session cookie (2h cache, CSRF login)
│       ├── constants.ts         # ORG_ID, SEASON_ID, attendance type IDs
│       ├── team-data.ts         # Main orchestrator: roster + matches + attendance
│       ├── twizzit-api.ts       # HTML scrapers: groups, roster, match feed (10m cache)
│       ├── twizzit-scrape.ts    # Parses window.initActivityDetails() JS objects
│       └── xlsx-builder.ts      # Builds styled Excel worksheets
└── routes/
    ├── +page.server.ts          # Home: fetch & group all teams
    ├── +page.svelte             # Home: team list + "Download alles" button
    ├── download/all/
    │   └── +server.ts           # SSE endpoint: parallel all-teams Excel export
    └── team/[groupId]/
        ├── +page.server.ts      # Team: load columns & rows, ?from= param
        ├── +page.svelte         # Team: attendance table
        └── download/
            └── +server.ts       # Single-team Excel download
```

---

## How data is fetched

1. **Teams** — scraped from `/v2/ajax/group/search`, filtered to allowed categories
2. **Roster** — fetched from `/v2/ajax/group/profile?groupId=` — authoritative player list, avoids contamination from internal (club vs club) matches
3. **Matches** — fetched from `/v2/ajax/feed`, trainings filtered out
4. **Attendance** — fetched from `/v2/activity/details` per match, parsed from an embedded `window.initActivityDetails({...})` JS object
5. **Guest players** (`Gastspeler`) — discovered from activity contacts and merged into the roster

All Twizzit requests are cached for 10 minutes by URL.

---

## Running locally

### Prerequisites

- Node.js 22+
- A Twizzit account with access to the club

### Setup

```bash
git clone git@github.com:bavobbr/dmon-team-cal.git
cd dmon-team-cal
npm install
```

Create a `.env` file:

```env
SITE_USER=your_twizzit_username
SITE_PASSWORD=your_twizzit_password
LOGIN_USER=dmon
LOGIN_PASSWORD=your_chosen_app_password
```

### Dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and log in with the `LOGIN_USER` / `LOGIN_PASSWORD` credentials.

### Production build

```bash
npm run build
node build/index.js
```

---

## Deploying to Cloud Run

```bash
gcloud run deploy dmon-team-cal \
  --source . \
  --project dmon-team-cal \
  --region europe-west1 \
  --set-env-vars "SITE_USER=...,SITE_PASSWORD=...,LOGIN_USER=...,LOGIN_PASSWORD=..." \
  --allow-unauthenticated
```

- `--source .` builds the Docker image via Cloud Build (no local Docker needed)
- `--allow-unauthenticated` lets Cloud Run receive requests — the app's own Basic Auth gate handles access control
- Cloud Run injects `PORT` automatically; the Node adapter reads it

---

## Environment variables

| Variable | Description |
|---|---|
| `SITE_USER` | Twizzit login username |
| `SITE_PASSWORD` | Twizzit login password |
| `LOGIN_USER` | App Basic Auth username |
| `LOGIN_PASSWORD` | App Basic Auth password |

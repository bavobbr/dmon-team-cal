# D-Mon Team Calendar

A web app for **D-Mon Hockey Club** that shows match and training attendance per team, scraped live from [Twizzit](https://app.twizzit.com). Coaches can see at a glance which players confirmed, declined, or haven't responded yet for upcoming matches, look back at who came to training, and export the data to Excel.

---

## What it does

- Lists all active teams grouped by category (Onderbouw, Middenbouw, Bovenbouw)
- Each team page has two tabs, **Wedstrijden** and **Trainingen**, each a players × activities
  grid with colour-coded dots
- Activities are identified by Twizzit's `eventType`: 3 = Wedstrijd (Competitiewedstrijd and
  Oefenwedstrijd), 2 = Training — meetings, events and shifts are excluded
- **Wedstrijden** answers "who has indicated presence?": **Vandaag** (from today) or **Seizoen**
  (the current half-season)
- **Trainingen** answers "who came to train?": **Recent** (the last 4 weeks up to today) or
  **Seizoen**. Coaches correct attendance in Twizzit after training, so past trainings show who
  actually came. Totals and the **%** attendance rate count only trainings that already
  started; planned trainings are greyed out
- Half-seasons run 1 August – 31 December and 1 January – 31 July; the one containing today is used
- The current Twizzit season is discovered at runtime, so a season rollover needs no code change
- Exports a single team to `.xlsx`: the match grid, or for trainings the grid plus a flat
  **Data** sheet (one row per player per training, with IDs and a real date column) for analysis
  in other tools
- Exports all teams at once to `.xlsx` (one sheet per team, plus a combined **Data** sheet for
  trainings) with a real-time progress bar
- Exports a player list (ID, name, team) across all teams
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
│   ├── server/
│   │   ├── auth.ts              # Twizzit session cookie (2h cache, CSRF login)
│   │   ├── constants.ts         # ORG_ID, fallback season ID, attendance type IDs
│   │   ├── season.ts            # Current-season discovery + half-season ranges
│   │   ├── activity-types.ts    # Subtype colours per family (Wedstrijd / Training types)
│   │   ├── site-fetch.ts        # Authenticated fetch + 10m URL response cache
│   │   ├── team-data.ts         # Main orchestrator: roster + matches/trainings + attendance
│   │   ├── twizzit-api.ts       # HTML scrapers: groups, roster, activity feed (10m cache)
│   │   ├── twizzit-scrape.ts    # Parses window.initActivityDetails() JS objects (10m cache)
│   │   └── xlsx-builder.ts      # Builds styled Excel worksheets
│   └── components/
│       ├── AttendanceTable.svelte  # Shared players × activities grid
│       └── TeamToolbar.svelte      # Wedstrijden/Trainingen tabs, range toggle, download
└── routes/
    ├── +page.server.ts          # Home: fetch & group all teams
    ├── +page.svelte             # Home: team list + all-teams download buttons
    ├── download/all/
    │   └── +server.ts           # SSE endpoint: all-teams Excel export, ?kind=match|training
    ├── download/roster/
    │   └── +server.ts           # Player list Excel export
    └── team/[groupId]/
        ├── +page.server.ts      # Matches: load columns & rows, ?from= param
        ├── +page.svelte         # Matches: attendance table
        ├── download/
        │   └── +server.ts       # Single-team match Excel download
        └── trainingen/
            ├── +page.server.ts  # Trainings: ?from=season, default last 4 weeks
            ├── +page.svelte     # Trainings: attendance table with %
            └── download/
                └── +server.ts   # Single-team training Excel (grid + Data sheet)
```

---

## How data is fetched

1. **Teams** — scraped from `/v2/ajax/group/search`, filtered to allowed categories
2. **Roster** — fetched from `/v2/ajax/group/profile?groupId=` — authoritative player list, avoids contamination from internal (club vs club) matches
3. **Matches / trainings** — fetched from `/v2/ajax/feed`, pre-filtered by the subtype colour of the wanted family
4. **Attendance** — fetched from `/v2/activity/details` per activity (max 8 at a time), parsed from an embedded `window.initActivityDetails({...})` JS object; `eventType` there decides match vs training
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

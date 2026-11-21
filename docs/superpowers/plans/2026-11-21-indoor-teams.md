# Indoor Teams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the indoor teams in their own home-page section, with every indoor view bounded by the 21 Nov – 21 Mar season and separate "download all" exports per section.

**Architecture:** `fetchGroups()` adds the two indoor categories and tags each group `indoor`. A new pure module `season-range.ts` gives a range per kind of team. Team routes look up the group to choose the range. `/download/all` and `/download/roster` take a `section` parameter.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Node 22 built-in test runner (`node --experimental-strip-types --test`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-21-indoor-teams-design.md`

## Global Constraints

- Indoor categories: exactly `Indoor onderbouw` and `Indoor bovenbouw`. Outdoor stays `Onderbouw`, `Middenbouw`, `Bovenbouw`.
- Indoor season: 21 November – 21 March, both inclusive. 1 Jan – 21 Mar → season that started the previous 21 Nov; 22 Mar – 31 Dec → season starting 21 Nov this year.
- Outdoor behaviour (Aug–Dec / Jan–Jul half-seasons, existing file names, existing URLs without `section`) must not change.
- UI copy is Dutch, matching the current wording.
- No new npm dependencies.

## Review Focus

- A boundary day (21 Nov, 21 Mar, 22 Mar, 31 Dec, 1 Jan) must land in the right indoor season. Pinned by Task 1 tests.
- An unknown group ID (not in the team list, e.g. a bookmarked team from last season) should still load, using the outdoor range. Task 3 code step.
- `/download/all` and `/download/roster` without `section` must behave exactly as before (outdoor only). This covers old bookmarks and any scripts. Task 4 code step.
- No indoor teams in Twizzit (e.g. summer, when the groups are inactive): the home page must not show an empty "Indoor" heading or buttons. Task 5 code step.
- Two exports must not run at once: every download button is disabled while any export is running (the existing `downloading` flag covers all sections). Task 5.

---

### Task 1: Season range module

**Files:**
- Create: `src/lib/server/season-range.ts`
- Create: `src/lib/server/season-range.test.ts`
- Modify: `src/lib/server/season.ts:112-128` (move `iso` + `getHalfSeasonRange` out, re-export)
- Modify: `package.json` (add `"test"` script)

**Interfaces:**
- Produces:
  - `getHalfSeasonRange(now?: Date): DateRange` (moved unchanged, still re-exported from `season.ts`)
  - `getIndoorSeasonRange(now?: Date): DateRange`
  - `getSeasonRange(indoor: boolean, now?: Date): DateRange`

`season-range.ts` must import nothing at runtime (only `import type { DateRange } from '../types'`), so the test can run under plain Node without SvelteKit.

- [ ] **Step 1: Write the failing test** in `season-range.test.ts` using `node:test` and `node:assert/strict`, importing from `./season-range.ts`. Build dates as `new Date(y, m-1, d, 12)` (local noon):

```ts
test('indoor: start day opens the new season', () =>
  assert.deepEqual(getIndoorSeasonRange(new Date(2026, 10, 21, 12)), { from: '2026-11-21', to: '2027-03-21' }));
test('indoor: 31 Dec and 1 Jan belong to the same season', () => {
  assert.deepEqual(getIndoorSeasonRange(new Date(2026, 11, 31, 12)), { from: '2026-11-21', to: '2027-03-21' });
  assert.deepEqual(getIndoorSeasonRange(new Date(2027, 0, 1, 12)), { from: '2026-11-21', to: '2027-03-21' });
});
test('indoor: 21 Mar is the last day of the running season', () =>
  assert.deepEqual(getIndoorSeasonRange(new Date(2027, 2, 21, 12)), { from: '2026-11-21', to: '2027-03-21' }));
test('indoor: 22 Mar and summer point at the coming season', () => {
  assert.deepEqual(getIndoorSeasonRange(new Date(2027, 2, 22, 12)), { from: '2027-11-21', to: '2028-03-21' });
  assert.deepEqual(getIndoorSeasonRange(new Date(2027, 6, 15, 12)), { from: '2027-11-21', to: '2028-03-21' });
});
test('getSeasonRange picks indoor or half-season', () => {
  const d = new Date(2026, 10, 21, 12);
  assert.deepEqual(getSeasonRange(true, d), { from: '2026-11-21', to: '2027-03-21' });
  assert.deepEqual(getSeasonRange(false, d), { from: '2026-08-01', to: '2026-12-31' });
});
test('half-season unchanged', () =>
  assert.deepEqual(getHalfSeasonRange(new Date(2027, 2, 1, 12)), { from: '2027-01-01', to: '2027-07-31' }));
```

- [ ] **Step 2: Add the script** `"test": "node --experimental-strip-types --test src/lib/server/*.test.ts"` to `package.json`. Run `npm test`. Expected: FAIL, module `./season-range.ts` not found.

- [ ] **Step 3: Implement** `season-range.ts`. Move `iso()` and `getHalfSeasonRange()` (with their comment block) from `season.ts`, add the two new functions and a comment describing the indoor rule. Use local `getMonth()`/`getDate()` like the existing function. In `season.ts`, replace the moved code with `export { getHalfSeasonRange, getIndoorSeasonRange, getSeasonRange } from './season-range';`.

- [ ] **Step 4: Run** `npm test`. Expected: all 6 tests pass. Run `npm run build`. Expected: build succeeds.

- [ ] **Step 5: Commit** `git add package.json src/lib/server/season-range.ts src/lib/server/season-range.test.ts src/lib/server/season.ts && git commit -m "Add indoor season range (21 Nov – 21 Mar)"`

---

### Task 2: Indoor groups in the team list

**Files:**
- Modify: `src/lib/types.ts:1-6`
- Modify: `src/lib/server/twizzit-api.ts:7-50`

**Interfaces:**
- Produces:
  - `Group.indoor: boolean`
  - `fetchGroups(): Promise<Group[]>`, now returning outdoor and indoor groups
  - `fetchGroup(groupId: number): Promise<Group | undefined>` (looks the ID up in `fetchGroups()`, which is cached for 10 min by `siteFetch`)

- [ ] **Step 1: Implement.** Replace `ALLOWED_CATEGORIES` with `OUTDOOR_CATEGORIES = new Set(['Onderbouw', 'Middenbouw', 'Bovenbouw'])` and `INDOOR_CATEGORIES = new Set(['Indoor onderbouw', 'Indoor bovenbouw'])`. Skip a group in neither set. Set `indoor: INDOOR_CATEGORIES.has(categoryName)`. Add `indoor: boolean` to `Group` and `fetchGroup` below `fetchGroups`.

- [ ] **Step 2: Verify.** Run `npm run build`. Expected: succeeds. Then `npm run dev`, open `http://localhost:5173/`. Expected: the indoor categories now show as extra sections (they'll be grouped properly in Task 5), and the console log `[fetchGroups] parts count` still appears.

- [ ] **Step 3: Commit** `git commit -am "Include indoor categories in the team list"`

---

### Task 3: Team pages and per-team downloads use the team's season

**Files:**
- Modify: `src/lib/server/team-data.ts:149-154` (`loadTeamData`)
- Modify: `src/routes/team/[groupId]/+page.server.ts`
- Modify: `src/routes/team/[groupId]/download/+server.ts`
- Modify: `src/routes/team/[groupId]/trainingen/+page.server.ts`
- Modify: `src/routes/team/[groupId]/trainingen/download/+server.ts`

**Interfaces:**
- Consumes: `fetchGroup` (Task 2), `getSeasonRange` (Task 1)
- Produces: `loadTeamData(groupId: number, range?: DateRange, indoor = false): Promise<TeamData>`. With no `range`, the default is today → `getSeasonRange(indoor).to`.

- [ ] **Step 1: Implement.** In `loadTeamData`, swap `getHalfSeasonRange()` for `getSeasonRange(indoor)` in the default. In each of the four routes:
  - Start with `const group = await fetchGroup(groupId); const indoor = group?.indoor ?? false;`. An unknown ID falls back to outdoor.
  - Replace `getHalfSeasonRange()` with `getSeasonRange(indoor)`.
  - Pass `indoor` into `loadTeamData`.
  - In the two download routes, take `teamName` from `group?.name ?? String(groupId)` and drop the separate `fetchGroups()` call.
  - `loadTrainingData` keeps its signature: its default "recent" range doesn't depend on the season.

- [ ] **Step 2: Verify.** Run `npm run build`. Expected: succeeds. With `npm run dev`:
  - An indoor team's `/team/<id>?from=season` shows matches from 21 Nov 2026 to 21 Mar 2027 only.
  - An outdoor team's `?from=season` still shows 1 Aug – 31 Dec 2026.
  - `/team/999999` still renders (empty), with no crash.
  - Each team's "Download Excel" on both tabs downloads a file.

- [ ] **Step 3: Commit** `git commit -am "Use the indoor season range for indoor team pages"`

---

### Task 4: Section-aware all-teams and roster exports

**Files:**
- Modify: `src/routes/download/all/+server.ts:24-32`
- Modify: `src/routes/download/roster/+server.ts:6-8`

**Interfaces:**
- Consumes: `Group.indoor`, `getSeasonRange`
- Produces: `GET /download/all?kind=match|training&section=outdoor|indoor` and `GET /download/roster?section=outdoor|indoor`. A missing or unknown `section` means `outdoor`.

- [ ] **Step 1: Implement.** In both routes, read `const indoor = url.searchParams.get('section') === 'indoor';` and filter `fetchGroups()` to `g.indoor === indoor`. In `/download/all`, use `getSeasonRange(indoor)` in place of `getHalfSeasonRange()` and pass `indoor` to `loadTeamData`. Add `url` to the roster handler's destructured args.

- [ ] **Step 2: Verify.** Run `npm run build`. With `npm run dev`, `curl -N 'http://localhost:5173/download/all?kind=match&section=indoor' | head -c 300`. Expected: a `start` event whose `total` is the number of indoor teams. Without `section`, `total` is the outdoor count from before this change. `curl -so /tmp/r.xlsx 'http://localhost:5173/download/roster?section=indoor'` returns a non-empty file.

- [ ] **Step 3: Commit** `git commit -am "Split all-teams and roster exports by section"`

---

### Task 5: Home page sections

**Files:**
- Modify: `src/routes/+page.server.ts`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `Group.indoor`, the `section` query param (Task 4)
- Produces: page data `sections: Array<{ key: 'outdoor' | 'indoor'; title: string | null; categories: Array<{ categoryName: string; groups: Group[] }> }>`. Outdoor first with `title: null`, then indoor with `title: 'Indoor'`. A section with no groups is left out. Categories and groups keep today's `localeCompare(…, 'nl')` sorting.

- [ ] **Step 1: Implement the loader.** Run the existing category grouping once per section.

- [ ] **Step 2: Implement the page.**
  - Render each section: an `<h1>` with its title when the title isn't null, then the category `<h2>` blocks as now, then that section's own `.actions` row with three buttons: "Download alle wedstrijden", "Download alle trainingen" and "Download spelerslijst".
  - Change `downloadAll(kind, section)` to call `/download/all?kind=${kind}&section=${section}`. The roster link becomes `/download/roster?section=${key}`.
  - File names: outdoor keeps `aanwezigheid-alle-ploegen.xlsx`, `trainingen-alle-ploegen.xlsx` and `spelerslijst.xlsx`. Indoor uses `aanwezigheid-indoor.xlsx`, `trainingen-indoor.xlsx` and `spelerslijst-indoor.xlsx`.
  - The single `downloading` flag still disables every button and drives the overlay.
  - Add margin above the indoor `<h1>` so the sections read as separate blocks.

- [ ] **Step 3: Verify.** Run `npm run build`. With `npm run dev`, open `/`:
  - Outdoor categories, then their buttons, then an "Indoor" heading with Indoor bovenbouw and Indoor onderbouw and their own buttons.
  - The indoor "Download alle wedstrijden" shows the progress overlay counting the indoor teams, and saves `aanwezigheid-indoor.xlsx`.
  - The outdoor buttons behave as before.

- [ ] **Step 4: Commit** `git commit -am "Show indoor teams in their own home page section"`

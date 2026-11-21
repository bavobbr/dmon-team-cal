# Indoor teams — design

## Why
The app covers the outdoor teams well. The club also has indoor teams, and coaches
want the same calendar and attendance view for them during the indoor season.

## Goals
- Indoor teams (Twizzit categories **Indoor onderbouw** and **Indoor bovenbouw**) appear
  on the home page in their own section, apart from the outdoor teams.
- Every view of an indoor team uses the indoor season: **21 November – 21 March** (both inclusive).
- The home page has a separate "download all" per section (outdoor and indoor), each with its own range.

## Non-goals
- No change to how outdoor teams behave or to their Aug–Dec / Jan–Jul half-seasons.
- No change to how matches are recognised (eventType 3 + Wedstrijd subtype colours read from settings).

## Approaches (all-teams download)
- **A. Separate buttons per section (picked).** "Download all outdoor" and "Download all indoor",
  each with its own range. The two files never mix.
- B. One file, each team with its own range: outdoor and indoor dates mixed in one Data sheet.
- C. Leave indoor out of the download.

The user picked A.

## Design
- **Team list:** `fetchGroups()` accepts the three outdoor categories and the two indoor ones,
  and marks each group with `indoor: boolean` (from its category).
- **Home page:** outdoor categories first (as today), then an "Indoor" block with its two
  categories. Each block has its own match/training "download all" buttons, which call
  `/download/all?kind=…&section=outdoor|indoor`.
- **Season range:** `getIndoorSeasonRange(now)` in `season.ts`:
  - 1 Jan – 21 Mar → the season that started the previous 21 Nov
  - 22 Mar – 31 Dec → the season starting 21 Nov this year (so it's empty in summer)

  A helper `getSeasonRange(indoor, now)` returns the indoor or half-season range.
- **Team pages and downloads:** each team route looks the group up by ID in the (cached)
  team list to get `indoor`, then uses `getSeasonRange(indoor)` for "Seizoen" and as the
  end bound of the default "Vandaag" match view. The training "recent" default range stays as it is.
- **Roster export (my call):** the "spelerslijst" download also gets one button per section,
  so a player on both an outdoor and an indoor team doesn't appear twice in one list.
- An unknown group ID (not in the list) falls back to the outdoor range, as it does today.

## Left to the builder
- Exact button labels and section heading wording (Dutch, matching the current UI).
- Download file names for the indoor exports (e.g. `aanwezigheid-indoor.xlsx`).

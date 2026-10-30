# Sub-project 3c, part 2: event winds, and a developer panel

Part of the roadmap in `docs/roadmap.md` (3c, part 2), and steps 1, 2 and 5 of
`docs/venues-roadmap.md` for five venues. Each event gets the wind its reports
describe, at its real strength within what the game can sail, and a developer
panel lets the user change winds, venues, the champion and the AI's targets in
the game, without a new prompt for each change.

## Goal

When you race a rider in the solo challenge, the heat is sailed in the wind of
that rider's real event, read from the event's reports, and the event card
says where the wind came from. Five venues cover 43 of the 55 events. A Dev
chip opens a panel where any of these values can be tried as a draft and,
when it feels right, written to the repo.

## Decisions

| Topic | Decision |
|---|---|
| Wind range | Each event's real strength, 12–28 kt (the game's own practice range), not squeezed into the 1v1 rooms' 15–19 kt |
| Which wind | One wind per event: the day of the final elimination, the one that decided the podium. Reports describe it best |
| Where it applies | The solo challenge (any rider of any event), with the venues mod on. The full bracket (part 3) will use it later |
| Champion's challenge | Keeps its own 21 kt with 6 kt gusts and its target. They become editable in the panel |
| No report | The venue's usual wind, labelled as such. At a venue without a profile, this week's wind |
| Coverage | Five venues: Sotavento, Sylt, Podersdorf, Pozo and Bonaire (43 events). The other 12 events wait |
| New venues | Podersdorf, Pozo and Sorobon get profiles with a usual wind and no scenery: heats there sail in the game's own scene |
| Storage | A curated `tour/event-winds.json`, apart from the crawled season files (a data refresh would overwrite those) and from the venue catalog (places, not occasions) |
| Developer panel | A `dev` mod. It edits event winds, venues' usual winds and zones, the champion's wind and target, and one offset on every AI target |
| Draft | Changes are a draft kept by the local server in `data/` (git-ignored), applied on top of the files. "Write to repo" writes them into the data files; "Discard" drops them |

## Success criteria

1. In the challenge panel, an event at one of the five venues with a reported
   wind shows it (for example "Reported (26 July 2024): 18 kt, gusts 20–24 kt",
   with the source linked), and a heat against any of its riders is sailed in
   it: the game's countdown shows that wind, and the AI's heat is sailed in
   the same.
2. An event at one of the five venues without a reported wind shows "Usual at
   <venue>: …" and sails in the venue's usual wind.
3. Events at other venues show "This week's wind" and sail in it, as now.
4. Podersdorf, Pozo and Sorobon appear in the venue chooser with their usual
   wind, marked as the game's own scenery.
5. The Dev chip opens the panel. A changed wind is used by the next heat;
   Discard brings the files' values back; the draft survives a server
   restart; "Write to repo" leaves a `git diff` with only the changed values.
6. The Champion's challenge still sails 21 kt with 6 kt gusts and aims for
   45.5 until changed in the panel.
7. With the venues mod off, the challenge sails in this week's wind as before;
   with the dev mod off, nothing else changes. `npm test` passes.

## Out of scope

- The Champion's challenge's events' own winds (it keeps 21 kt).
- Patching the 1v1 rooms' winds for events: that comes with the full bracket.
- Scenery, water colours or wind zones for Podersdorf, Pozo and Sorobon.
- The other 12 events (Costa Teguise, Mui Ne, Aruba, the Netherlands, Warsaw,
  Leucate, Viana do Castelo, Marseille).
- A wind per day or per round.

## What exists

- **Game winds.** Practice takes 12–28 kt and gusts of 2–6 kt
  (`{min:12,max:28}` in the 2026-10-24 snapshot). A 1v1 room's wind comes from
  its id: 15–19 kt, gusts 0 (one room in five) or 4–6 kt. The game's gusts add
  up to `gustKnots` on top of `knots`, so at 28 kt with 6 kt gusts it already
  sails 34 kt in a gust.
- **Venues.** `tour/venues.json` (catalog version 2) has Sotavento and Sylt,
  each with `gameConditions` (checked to 15–19 kt by `server/venues.mjs`), wind
  zones, scenery (`mods/venues/coast.js`) and a picture
  (`mods/venues/assets/<id>.svg`). `venueConditions` in `mods/venues/venue.js`
  builds a heat's conditions from a room seed, the venue's wind and its zones.
- **The solo challenge.** `aiHeat` in `server/api/tour.mjs` sails a rider's
  heat in the event venue's conditions when the venues mod is on, or this
  week's wind; its cache key is the snapshot, week, rider, event, catalog
  version, venue and zone version. `eventRiders` gives the event card its
  venue. The card says "Typical: …" or "Sailed in this week's wind".
- **The champion.** `server/champion.json` holds his `target` (45.5).
  `mods/champion/wind.js` holds `WIND = { knots: 21, gustKnots: 6 }`; the
  game's main page is patched to pass champion rooms through its `roomWind`,
  and the server picks rooms whose own gusts are 6 kt and sails his heat for
  each, one queued ahead.
- **AI targets.** `heatTarget(rating, seed)` in `lib/ai/score.mjs`.
- **Local data.** `server/store.mjs` keeps JSON files in `data/`, replaced
  atomically on each change.
- **Event locations.** 55 events in `tour/seasons/*.json`, 13 location
  strings. At the five venues: Sotavento 16 events, Sylt 15, Podersdorf 6
  (`Neusiedler See, Podersdorf, Austria`), Pozo 3 (`Pozo Izquierdo, Gran
  Canaria`), Bonaire 3 (`Sorbon Beach, Bonaire, Dutch Netherlands Antilles`).

## Approach

Curated winds live in their own file, read by the server next to the venue
catalog. One function picks a heat's wind: the event's, else the venue's usual
one, else this week's. The developer panel never writes the data files while
you try things: its draft is kept by the server and laid over the files, so
every reader (the challenge, the champion, the venue chooser) sees the same
values, and the repo changes only on "Write to repo".

We considered storing the winds in the season files (a PWA refresh rewrites
them) and under each venue (mixes places with what happened at one event). For
the draft we considered the browser's storage: the server sails AI heats as
soon as the page loads, before a browser-held draft could reach it, and a
cleared browser would lose it.

## Components

### Event winds (`tour/event-winds.json`, new)

```json
{ "version": 1, "events": [
  { "event": 359, "slug": "2024-fuerteventura-grand-slam",
    "knots": 18, "gustKnots": 6,
    "reported": "Finals in 18–25 kt side-shore, gusty",
    "day": "2024-07-26", "confidence": "reported",
    "sources": [{ "title": "…", "date": "2024-07-26", "url": "https://www.pwaworldtour.com/…" }] },
  { "event": 120, "slug": "…", "knots": null,
    "reported": "The reports describe the heats but not the wind",
    "sources": [{ "title": "…", "date": "…", "url": "…" }] }
] }
```

- `event` is the tour id from the season files, and `slug` its slug, for
  people reading the file.
- `knots` is a whole number from 12 to 28, or `null` when the reports were
  read and give no wind. `gustKnots` is 0 or 2–6.
- `confidence` is `reported` (a number in a report), `bounded` (a range or
  description mapped by the rules below) or `inferred` (a weak hint).
- `reported` is our own short summary of what the reports say, never a quote.
- `day` is the day the wind refers to, when the reports say.

### Reading a report

- A range ("18–25 kt"): the low end is the wind, the spread the gusts, at
  most 6: 18 kt with 6 kt gusts. A spread under 2 kt is steady.
- One number ("20 knots"): that wind; 4 kt gusts if the report calls it gusty,
  otherwise steady. Gusts are never made up.
- m/s and Beaufort are converted to knots (1 m/s = 1.944 kt).
- Sail sizes (`bounded`): 5.8 m² or more 14 kt, 5.4–5.7 m² 17 kt, 5.0–5.3 m²
  20 kt, 4.6–4.9 m² 23 kt, 4.2–4.5 m² 26 kt, 4.1 m² or less 28 kt.
- Words only (`bounded` or `inferred`): light or marginal 13 kt, moderate 16,
  good or solid 19, strong or powered 23, nuking or survival 27.
- Below 12 kt is entered as 12 and above 28 kt as 28, and `reported` says the
  real wind was beyond the game's range.
- Sources: PWA reports and event pages first, then windsurf magazines (Surf,
  Windsurf Journal, Boards) when PWA's say nothing. Collected while building;
  the game and the local server never contact them.

### New venues (`tour/venues.json`)

`neusiedler-see-podersdorf` (Podersdorf, Neusiedler See),
`pozo-izquierdo-gran-canaria` (Pozo, Gran Canaria) and `sorobon-bonaire`
(Sorobon, Bonaire), each with its name, place, the season files' location
strings, `gameConditions` (its usual wind), `character`, `confidence` and
`sources`; no wind zones, landmarks or water zones. `server/venues.mjs` accepts
usual winds of 12–28 kt, and `publicVenue` adds `scenery` (whether
`coastFor(id)` has a coast), so the chooser and the event card show a picture
and the venues mod mounts a coast only where one exists.

### Loading and choosing the wind (`server/event-winds.mjs`, new)

- `loadEventWinds(file, tour)` reads and checks the file: the ranges above, no
  event twice, every event in the tour data with its slug matching, and a
  source with a URL and date on every `reported` or `bounded` entry. It throws
  with the reason, so the server refuses to start with a broken file. A
  missing file gives no event winds, and the server logs it.
- `eventWind(winds, eventId)` gives the entry with a wind, or null.
- `venueConditions` (`mods/venues/venue.js`) takes an optional wind that
  replaces the venue's usual one. In `aiHeat` the wind is the event's, else
  the venue's usual one, else this week's; the venue's zones are added in the
  first two cases.
- The AI heat's cache key ends in a hash of its conditions (zones included)
  and its target, so a changed wind, zone or offset sails a fresh heat.

### Wind zones at the edges (`mods/venues/zones.js`)

The zones still add to the event's wind. At the top no cap is needed: 28 kt
plus Sotavento's 4 kt is 32 kt, under the game's own 34 kt gusts. At the
bottom a zone never takes the local wind below 12 kt (Sotavento's 3 kt lee in
a 12 kt event would give 9): `zonesFor` cuts the lee to the heat's wind less
12 kt. The wind patch and the water both read the cut lee from the
conditions, and the cache key's hash of the conditions sails changed heats
again.

### The event card (`mods/challenge/`)

`eventRiders` adds `wind`: `{ source: "reported" | "usual" | "week", knots,
gustKnots, reported, day, confidence, url }`. The card shows:

- "Reported (26 July 2024): 18 kt, gusts 20–24 kt", the source linked;
- "Usual at Sorobon, Bonaire: 18 kt, steady wind";
- "This week's wind".

### The champion (`server/champion.json`, `mods/champion/wind.js`)

His wind moves into `champion.json` as `wind: { knots: 21, gustKnots: 6 }`.
The weekly API's answer, which the champion's card already reads, adds the
wind, and the champion mod hands it to `wind.js` (a `setWind` beside
`roomWind`) before a room opens. His knots can be 12–28. The game's rooms only
have gusts of 0, 4, 5 or 6 kt, so those are the gusts he can have. Changing his wind or target drops his queued
room heats, so the next room is sailed with the new values.

### AI targets (`server/tuning.json`, new)

`{ "aiTargetOffset": 0 }`: points added to every solo-challenge rider's target
from `heatTarget`, from −10 to +10. The champion keeps his own target.

### The draft (`server/dev.mjs` and `server/api/dev.mjs`, new)

- The draft is kept in `data/dev-draft.json` through `server/store.mjs`:
  `{ eventWinds: { "<event>": {…} }, venues: { "<id>": { gameConditions,
  windZones } }, champion: { wind, target }, tuning: { aiTargetOffset } }`.
- The values in force are the files' with the draft laid over them. Every
  reader asks for those: `aiHeat`, `eventRiders`, the venue catalog endpoint,
  the champion's heats and the weekly API.
- A draft is checked by laying it over copies of the files and running the
  files' own checks, so the panel and the files never disagree on what is
  allowed.
- Endpoints:
  - `GET /api/local/dev`: the files' values, the draft, and the 55 events
    grouped by venue;
  - `POST /api/local/dev/draft`: replaces the draft; 400 with the problem for
    each field it refuses, keeping the last good draft;
  - `POST /api/local/dev/discard`: discards it;
  - `POST /api/local/dev/write`: writes the values in force into whichever of
    `tour/event-winds.json`, `tour/venues.json`, `server/champion.json` and
    `server/tuning.json` the draft changes, reloads them, clears the draft,
    and answers with the files it wrote. It does not commit.
- Files are written as two-space JSON with their keys in their existing
  order. The build rewrites the four files once in that layout (venues'
  one-line wind zones become several lines), so a later write's diff shows
  only the values that changed.

### The panel (`mods/dev/`, new, on in `mods/enabled.json`)

- A "Dev" chip in the mods' tray, in the game's lagoon look (`mods/lib/ui.js`).
  It opens a popover (a bottom sheet on a phone) that closes on Escape or a
  click outside.
- Four tabs:
  - **Events:** the 55 events grouped by venue; for each, knots, gusts (steady
    or 2–6 kt), confidence and the note. Any event can be given a wind;
  - **Venues:** usual knots and gusts, and the zones' gain, where the outer
    zone starts, its ramp and the beach lee;
  - **Champion:** knots, gusts (steady, 4, 5 or 6) and target;
  - **AI:** the target offset.
- A changed value is highlighted with the file's value beside it ("file: 19")
  and a reset button. Each change is sent as the whole draft, a moment after
  typing stops; a refused value shows the server's reason under its field.
- A bar shows the number of changes, "Discard" and "Write to repo", and after
  a write the files it changed.
- A change applies from the next heat. The practice water follows a venue
  change when the venue is chosen again.

## Errors

- **Broken `tour/event-winds.json`, `tour/venues.json` or `server/tuning.json`:**
  the server refuses to start and names the file and the problem.
- **Missing event winds or tuning file:** no event winds, offset 0; logged.
- **A draft that no longer fits the files** (an event or venue gone after a
  data change): the server drops those parts of the draft, logs them, and the
  panel lists what was dropped.
- **Write to repo fails part-way:** each file is written to a temporary file
  and renamed, all checks run before any write, and the answer names any file
  not written; the draft is kept.

## Testing

- **Event winds file:** the checks (knots out of range, gusts of 1, an event
  twice, an unknown event, a slug that doesn't match, a reported entry without
  a source), and coverage: every one of the 43 events at the five venues has
  an entry, with a wind or `null`.
- **Venues:** the three new venues map their location strings; usual winds of
  12–28 kt are accepted; `scenery` is false for them.
- **Choosing the wind:** event, then venue, then week; zones added at the
  mapped venues; the cache key changes with the wind and the target; with the
  venues mod off, this week's wind as before.
- **Zones:** the floor of 12 kt; above 28 kt untouched.
- **Event card:** the three wordings.
- **Champion:** his wind from `champion.json` in the server and through
  `setWind` in the game's room wind (snapshot test); changing it drops the
  queued rooms.
- **Draft:** laid over the files; refused fields and their reasons; Discard;
  kept across a restart; Write to repo gives valid files whose diff is only the
  changed values; stale parts dropped.
- **Panel:** the browser preview: open it, change Sotavento's usual wind, race
  a rider of a Sotavento event without a report, see the wind in the
  countdown, discard.
- **One-off check while building:** the AI aiming for 40 at 12, 16, 20, 24 and
  28 kt (`node tools/ai-check.mjs --weeks 2 --targets 40 --winds
  12,16,20,24,28`). Measured 2026-10-30, two weeks' seeds, 4 kt gusts: 12 kt
  −0.56 against the target on average, 16 kt +0.06, 20 kt +0.04, 24 kt −0.71,
  28 kt −0.30; mean miss 0.36, worst 1.14, inside the AI check's bar. Light
  wind costs it no more than strong wind, so nothing is retuned.

## Risks

- **Old reports may give no numbers.** Many 2006–2012 reports describe the
  wind in words. They become `bounded` or `inferred`, or `null`.
- **The sail and word tables are approximations** for a pro freestyler of
  about 75 kg. The panel exists to correct them by feel.
- **The AI in light wind.** Fewer planing moves could pull its scores under
  its targets; the one-off check found it lands within a point at 12 kt.

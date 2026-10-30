# Event winds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Solo challenge heats sail in each event's reported wind (12–28 kt) for the 43 events at Sotavento, Sylt, Podersdorf, Pozo and Bonaire, else in the venue's usual wind, else in this week's, and the event card says which.

**Architecture:** A curated `tour/event-winds.json`, read and checked by `server/event-winds.mjs`, sits beside the venue catalog. `aiHeat` in `server/api/tour.mjs` picks the event's wind, the venue's usual wind or this week's, and adds the venue's wind zones, whose calm strip by the beach is cut so it never takes a heat under 12 kt. Three venues without scenery join `tour/venues.json`. The challenge card shows where the wind came from.

**Tech Stack:** Node 22 ES modules, `node:test`, no dependencies. Snapshot tests use the game snapshot in `vendor/` (skipped without one).

Spec: `docs/superpowers/specs/2026-10-30-event-winds-design.md`. The developer panel is a separate plan, `2026-10-30-dev-panel.md`, built on this one.

---

## Files

| File | Change | Responsibility |
|---|---|---|
| `server/problem.mjs` | Create | An error that names the field it is about (the developer panel shows it there) |
| `server/event-winds.mjs` | Create | Read, check and look up event winds |
| `server/venues.mjs` | Modify | Accept usual winds of 12–28 kt; say which venues have scenery |
| `tour/venues.json` | Modify | Add Podersdorf, Pozo and Sorobon |
| `tour/event-winds.json` | Create | The 43 events' winds, researched |
| `mods/venues/zones.js` | Modify | Cut the beach lee so the wind stays at 12 kt or more |
| `mods/venues/venue.js` | Modify | `venueConditions` and `venueZones` take the heat's wind |
| `mods/venues/index.js` | Modify | Practice zones use the practice wind; pictures only where there is scenery |
| `server/api/tour.mjs` | Modify | The wind order in `aiHeat`; `wind` on the event; the cache key |
| `server/api/index.mjs` | Modify | Pass event winds to `eventRiders` |
| `server/app.mjs` | Modify | Load event winds |
| `mods/challenge/challenge.js` | Modify | `windLine` for the card |
| `mods/challenge/index.js` | Modify | The card's wind line, source link, picture only with scenery |
| `tools/ai-check.mjs` | Modify | `--winds` to check the AI across wind strengths |
| `test/event-winds.test.mjs` | Create | Loader, checks and coverage |
| `test/venues.test.mjs`, `test/api-tour.test.mjs`, `test/challenge.test.mjs` | Modify | New behaviour |
| `README.md`, `docs/roadmap.md`, `docs/venues-roadmap.md` | Modify | Document it |

Run all tests with `npm test`. One file: `node --test test/<file>.test.mjs`.

---

### Task 1: Usual winds of 12–28 kt, and which venues have scenery

**Files:**
- Modify: `server/venues.mjs`
- Test: `test/venues.test.mjs`

- [ ] **Step 1: Change the refused wind and add tests**

In `test/venues.test.mjs`, in the test "a catalog with a missing file, an unsupported wind, …", replace

```js
  refused([venue("a", ["A"], { knots: 25, gustKnots: 4 })]);
```

with

```js
  refused([venue("a", ["A"], { knots: 29, gustKnots: 4 })]);
  refused([venue("a", ["A"], { knots: 11, gustKnots: 4 })]);
```

and add after that test:

```js
test("a venue's usual wind can be anything the game's practice takes, 12–28 kt", (t) => {
  const file = join(tempDir(t), "venues.json");
  const venue = (id, knots) => ({ id, name: id, locations: [id], gameConditions: { knots, gustKnots: 0 } });
  writeFileSync(file, JSON.stringify({ version: 2, venues: [venue("light", 12), venue("strong", 28)] }));
  assert.deepEqual(loadVenueCatalog(file).venues.map((v) => v.gameConditions.knots), [12, 28]);
});

test("only venues with a coast are marked as having scenery", () => {
  const venue = (id) => ({ id, name: id, locations: [], gameConditions: { knots: 17, gustKnots: 0 } });
  assert.equal(publicVenue(venue(SYLT)).scenery, true);
  assert.equal(publicVenue(venue("pozo-izquierdo-gran-canaria")).scenery, false);
});
```

and change the import line to

```js
import { loadVenueCatalog, publicVenue, venueForLocation } from "../server/venues.mjs";
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/venues.test.mjs`
Expected: FAIL: "a venue's usual wind can be anything…" throws `unsupported conditions for light`; "only venues with a coast…" gets `undefined` for `scenery`.

- [ ] **Step 3: Accept 12–28 kt and add `scenery`**

In `server/venues.mjs`, add under the first import:

```js
import { coastFor } from "../mods/venues/coast.js";
```

Replace

```js
    if (!Number.isInteger(knots) || knots < 15 || knots > 19 || !Number.isInteger(gustKnots) || (gustKnots !== 0 && gustKnots < 2) || gustKnots > 6) {
```

with

```js
    if (!Number.isInteger(knots) || knots < 12 || knots > 28 || !Number.isInteger(gustKnots) || (gustKnots !== 0 && gustKnots < 2) || gustKnots > 6) {
```

Replace `publicVenue` with:

```js
// What the browser gets of a venue. scenery: whether the venues mod has a
// coast for it; the others sail in the game's own scene.
export function publicVenue(venue) {
  if (!venue) return null;
  const { id, name, place, gameConditions, windZones, character, confidence, profileNote, courseNote, landmarks, waterZones, sources } = venue;
  return { id, name, place, gameConditions, windZones, character, confidence, profileNote, courseNote, landmarks, waterZones, sources, scenery: Boolean(coastFor(id)) };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test`
Expected: PASS. If another test compares a whole `publicVenue` result, add `scenery: true` to its expected value.

- [ ] **Step 5: Commit**

```bash
git add server/venues.mjs test/venues.test.mjs
git commit -m "Let venues' usual winds be 12-28 kt, and say which venues have scenery"
```

---

### Task 2: Podersdorf, Pozo and Sorobon as venues without scenery

**Files:**
- Modify: `tour/venues.json`
- Test: `test/venues.test.mjs`

- [ ] **Step 1: Update the matching test and add a sources test**

In `test/venues.test.mjs`, replace the first test ("the tour's Sotavento and Sylt events find their venue, …") with:

```js
test("the tour's events at the five venues find their venue, and no other event does", () => {
  const tour = loadTour(join(ROOT, "tour"));
  const matched = {};
  for (const event of tour.events.values()) {
    const venue = venueForLocation(catalog, event.location);
    if (venue) matched[event.location] = venue.id;
  }
  assert.deepEqual(matched, {
    "Sotavento, Fuerteventura": SOTAVENTO,
    "Westerland, Sylt, Germany": SYLT,
    "Neusiedler See, Podersdorf, Austria": "neusiedler-see-podersdorf",
    "Pozo Izquierdo, Gran Canaria": "pozo-izquierdo-gran-canaria",
    "Sorbon Beach, Bonaire, Dutch Netherlands Antilles": "sorobon-bonaire",
  });
  assert.equal(venueForLocation(catalog, "sotavento  FUERTEVENTURA")?.id, SOTAVENTO, "spelling and spacing don't matter");
  assert.equal(venueForLocation(catalog, "Las Chucharas, Costa Teguise, Lanzarote, Canary Islands"), null);
});

test("every venue's usual wind is sourced", () => {
  for (const venue of catalog.venues) assert.ok(venue.sources?.some((s) => s.url && (s.date || s.accessed)), `${venue.id} has no source`);
});
```

In the test "with the venues mod, an event at a venue names it, …", replace

```js
  assert.deepEqual(venues.venues.map((v) => v.id), [SOTAVENTO, SYLT]);
```

with

```js
  assert.deepEqual(venues.venues.map((v) => v.id), [SOTAVENTO, SYLT, "neusiedler-see-podersdorf", "pozo-izquierdo-gran-canaria", "sorobon-bonaire"]);
```

and replace the test "every catalog venue has a coast and a water look" with:

```js
test("every venue with a coast is in the catalog and has a water look", () => {
  const ids = catalog.venues.map((v) => v.id);
  for (const id of Object.keys(SITE_LAYOUTS)) assert.ok(ids.includes(id), `${id} isn't in the catalog`);
  assert.deepEqual(Object.keys(VENUE_LOOKS).sort(), Object.keys(SITE_LAYOUTS).sort());
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/venues.test.mjs`
Expected: FAIL: `matched` lacks the three new locations.

- [ ] **Step 3: Research each venue's usual wind**

For each of the three, find one or two pages that describe the wind in the season the PWA events were held (a tourism or windsurf-spot page, or a PWA event preview). Check the starting values below against them and change `knots` or `gustKnots` if the sources say otherwise (12–28 kt; gusts 0 or 2–6). Note each source as `{ "title", "accessed": "2026-10-30", "url" }`, or with `"date"` if the page is dated. Write `character` in our own words, not quoted.

Starting values:
- Podersdorf: 16 kt, gusts 6: gusty, shifting north-westerlies over a shallow lake.
- Pozo: 25 kt, gusts 6: very strong, gusty side-shore trades.
- Sorobon: 18 kt, steady (gusts 0): steady easterly trades in a flat lagoon.

- [ ] **Step 4: Add the three venues**

In `tour/venues.json`, add after the Sylt venue (inside `"venues"`), with the sources from Step 3:

```json
    {
      "id": "neusiedler-see-podersdorf",
      "name": "Podersdorf, Neusiedler See",
      "place": "Podersdorf am See, Burgenland, Austria",
      "locations": ["Neusiedler See, Podersdorf, Austria"],
      "gameConditions": { "knots": 16, "gustKnots": 6 },
      "character": "A shallow steppe lake: short, steep chop, no swell, and gusty, shifting north-westerlies.",
      "confidence": "qualitative",
      "profileNote": "No scenery yet: the game's own open water, in Podersdorf's usual wind.",
      "sources": []
    },
    {
      "id": "pozo-izquierdo-gran-canaria",
      "name": "Pozo Izquierdo, Gran Canaria",
      "place": "Pozo Izquierdo, Gran Canaria, Spain",
      "locations": ["Pozo Izquierdo, Gran Canaria"],
      "gameConditions": { "knots": 25, "gustKnots": 6 },
      "character": "Very strong, gusty side-shore trades over deep Atlantic water and swell, off a boulder beach.",
      "confidence": "qualitative",
      "profileNote": "No scenery yet: the game's own open water, in Pozo's usual wind.",
      "sources": []
    },
    {
      "id": "sorobon-bonaire",
      "name": "Sorobon, Bonaire",
      "place": "Lac Bay, Bonaire, Caribbean Netherlands",
      "locations": ["Sorbon Beach, Bonaire, Dutch Netherlands Antilles"],
      "gameConditions": { "knots": 18, "gustKnots": 0 },
      "character": "Steady easterly trades over a flat, shallow turquoise lagoon behind a reef.",
      "confidence": "qualitative",
      "profileNote": "No scenery yet: the game's own open water, in Sorobon's usual wind.",
      "sources": []
    }
```

(The location string says "Sorbon"; the beach is Sorobon. The string stays as the season files have it.)

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tour/venues.json test/venues.test.mjs
git commit -m "Add Podersdorf, Pozo and Sorobon as venues with their usual winds and no scenery"
```

---

### Task 3: Reading and checking event winds

**Files:**
- Create: `server/problem.mjs`, `server/event-winds.mjs`
- Test: `test/event-winds.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `test/event-winds.test.mjs`:

```js
// Event winds (tour/event-winds.json): each event's wind from its reports,
// checked against the tour data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkEventWinds, eventWind, indexEventWinds, loadEventWinds } from "../server/event-winds.mjs";
import { loadTour } from "../server/tour.mjs";
import { tempDir, writeTour } from "./helpers.mjs";

const SOURCE = { title: "2025 Sylt report", date: "2025-09-30", url: "https://example.test/report" };
const entry = (over = {}) => ({ event: 378, slug: "e378", knots: 18, gustKnots: 6, reported: "18–25 kt, gusty", confidence: "reported", sources: [SOURCE], ...over });

function setup(t) {
  const dir = tempDir(t);
  writeTour(join(dir, "tour"));
  return { dir, tour: loadTour(join(dir, "tour")) };
}

test("an event's wind is found by its tour id; an entry without a wind gives none", (t) => {
  const { dir, tour } = setup(t);
  const file = join(dir, "event-winds.json");
  writeFileSync(file, JSON.stringify({ version: 1, events: [entry(), { event: 300, slug: "e300", knots: null, reported: "The reports don't give the wind", sources: [SOURCE] }] }));
  const winds = loadEventWinds(file, tour);
  assert.equal(eventWind(winds, 378).knots, 18);
  assert.equal(eventWind(winds, 300), null);
  assert.equal(eventWind(winds, 375), null);
  assert.equal(eventWind(null, 378), null);
});

test("without the file, or without tour data, there are no event winds", (t) => {
  const { dir, tour } = setup(t);
  const logs = [];
  assert.equal(eventWind(loadEventWinds(join(dir, "none.json"), tour, (m) => logs.push(m)), 378), null);
  assert.match(logs[0], /usual wind/);
  assert.equal(eventWind(loadEventWinds(join(dir, "none.json"), null, () => {}), 378), null);
});

test("broken entries are refused with the reason", (t) => {
  const { tour } = setup(t);
  const check = (...events) => () => checkEventWinds({ version: 1, events }, tour);
  assert.throws(check(entry({ knots: 11 })), /knots must be a whole number from 12 to 28/);
  assert.throws(check(entry({ knots: 29 })), /knots must be a whole number from 12 to 28/);
  assert.throws(check(entry({ knots: 18.5 })), /knots must be a whole number from 12 to 28/);
  assert.throws(check(entry({ gustKnots: 1 })), /gusts must be 0 or 2–6 kt/);
  assert.throws(check(entry(), entry()), /listed twice/);
  assert.throws(check(entry({ event: 999 })), /no such event/);
  assert.throws(check(entry({ slug: "e375" })), /slug e375 should be e378/);
  assert.throws(check(entry({ sources: [] })), /needs a source with a URL and a date/);
  assert.throws(check(entry({ confidence: "guess" })), /confidence must be reported, bounded or inferred/);
  assert.throws(check(entry({ reported: "" })), /say what the reports say/);
  assert.throws(() => checkEventWinds({ events: [] }, tour), /not a list of event winds/);
  assert.doesNotThrow(check(entry({ confidence: "inferred", sources: [] })));
});

test("a refused entry names its field, so the developer panel can show the reason there", (t) => {
  const { tour } = setup(t);
  assert.throws(() => checkEventWinds({ version: 1, events: [entry({ gustKnots: 1 })] }, tour), { path: "eventWinds.378.gustKnots" });
  assert.throws(() => checkEventWinds({ version: 1, events: [entry({ knots: 30 })] }, tour), { path: "eventWinds.378.knots" });
});

test("indexing checks nothing and finds entries by event", () => {
  assert.equal(indexEventWinds({ version: 1, events: [entry()] }).byEvent.get(378).knots, 18);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/event-winds.test.mjs`
Expected: FAIL with `Cannot find module '…/server/event-winds.mjs'`.

- [ ] **Step 3: Write `server/problem.mjs`**

```js
// An error about one field of the curated data, named by its path (for
// example eventWinds.378.knots), so the developer panel can show the reason
// next to that field.
export const problem = (path, message) => Object.assign(new Error(message), { path });
```

- [ ] **Step 4: Write `server/event-winds.mjs`**

```js
// Each event's wind, read from its reports (tour/event-winds.json). Curated by
// hand, apart from the crawled season files, so a data refresh can't erase it.
// knots is null for an event whose reports were read and give no wind.
import { existsSync, readFileSync } from "node:fs";
import { problem } from "./problem.mjs";

const CONFIDENCE = new Set(["reported", "bounded", "inferred"]);
export const isKnots = (value) => Number.isInteger(value) && value >= 12 && value <= 28;
export const isGusts = (value) => Number.isInteger(value) && (value === 0 || (value >= 2 && value <= 6));

// Throws a problem() naming the first broken field. tour: loadTour()'s, for
// each entry's event and slug.
export function checkEventWinds(winds, tour, name = "tour/event-winds.json") {
  if (!Number.isInteger(winds?.version) || !Array.isArray(winds.events)) throw problem("eventWinds", `${name} is not a list of event winds`);
  const seen = new Set();
  for (const entry of winds.events) {
    const path = `eventWinds.${entry.event}`;
    const where = `${name}, event ${entry.event}`;
    const event = tour?.events.get(entry.event);
    if (!event) throw problem(path, `${where}: no such event in the tour data`);
    if (entry.slug !== event.slug) throw problem(`${path}.slug`, `${where}: slug ${entry.slug} should be ${event.slug}`);
    if (seen.has(entry.event)) throw problem(path, `${where}: listed twice`);
    seen.add(entry.event);
    if (typeof entry.reported !== "string" || !entry.reported.trim()) throw problem(`${path}.reported`, `${where}: say what the reports say in "reported"`);
    if (entry.knots === null) continue;
    if (!isKnots(entry.knots)) throw problem(`${path}.knots`, `${where}: knots must be a whole number from 12 to 28`);
    if (!isGusts(entry.gustKnots)) throw problem(`${path}.gustKnots`, `${where}: gusts must be 0 or 2–6 kt`);
    if (!CONFIDENCE.has(entry.confidence)) throw problem(`${path}.confidence`, `${where}: confidence must be reported, bounded or inferred`);
    if (entry.confidence !== "inferred" && !entry.sources?.some((s) => s.url && s.date)) throw problem(`${path}.sources`, `${where}: a ${entry.confidence} wind needs a source with a URL and a date`);
  }
  return winds;
}

// The winds with a lookup by event id. Checks nothing.
export const indexEventWinds = (winds) => ({ ...winds, byEvent: new Map(winds.events.map((entry) => [entry.event, entry])) });

const NONE = indexEventWinds({ version: 0, events: [] });

// Reads and checks the file; a broken one throws, so the server refuses to
// start. Without the file or the tour data there are no event winds.
export function loadEventWinds(file, tour, log = console.log) {
  if (!tour) return NONE;
  if (!existsSync(file)) {
    log(`No ${file}: events sail in their venue's usual wind.`);
    return NONE;
  }
  return indexEventWinds(checkEventWinds(JSON.parse(readFileSync(file, "utf8")), tour, file));
}

// The event's entry if its reports give a wind, or null.
export function eventWind(winds, eventId) {
  const entry = winds?.byEvent.get(eventId);
  return entry && entry.knots !== null ? entry : null;
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --test test/event-winds.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add server/problem.mjs server/event-winds.mjs test/event-winds.test.mjs
git commit -m "Read and check event winds, naming the field of any problem"
```

---

### Task 4: An event's wind at a venue, with a 12 kt floor under the zones

**Files:**
- Modify: `mods/venues/zones.js`, `mods/venues/venue.js`, `mods/venues/index.js:178`
- Test: `test/venues.test.mjs`

- [ ] **Step 1: Write the failing tests**

In `test/venues.test.mjs`, change the zones import to

```js
import { ZONE_VERSION, zoneKnots, zonesFor } from "../mods/venues/zones.js";
```

and add after "a venue heat keeps the room's seed and takes the venue's wind":

```js
const ZONED = { id: SOTAVENTO, gameConditions: { knots: 19, gustKnots: 6 }, windZones: { gain: 4, from: 300, over: 120, lee: 3 } };

test("the calm strip by the beach never takes the wind under 12 kt", () => {
  const coast = coastFor(SOTAVENTO);
  assert.equal(zonesFor(ZONED.windZones, coast, 19).lee, 3);
  assert.equal(zonesFor(ZONED.windZones, coast, 13).lee, 1);
  assert.equal(zonesFor(ZONED.windZones, coast, 12).lee, 0);
  assert.equal(zonesFor(ZONED.windZones, coast, 28).gain, 4, "no cap on top: 32 kt is under the game's own 34 kt gusts");
  assert.equal(zonesFor(ZONED.windZones, coast).lee, 3, "without a wind the lee stays");
});

test("an event's wind replaces the venue's usual one, with the venue's zones", () => {
  const room = () => ({ seed: 5, knots: 16, gustKnots: 0 });
  const pick = ({ seed, knots, gustKnots, zones }) => ({ seed, knots, gustKnots, lee: zones.lee });
  assert.deepEqual(pick(venueConditions(room, ZONED, "r")), { seed: 5, knots: 19, gustKnots: 6, lee: 3 });
  assert.deepEqual(pick(venueConditions(room, ZONED, "r", { knots: 12, gustKnots: 0 })), { seed: 5, knots: 12, gustKnots: 0, lee: 0 });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/venues.test.mjs`
Expected: FAIL: `lee` is 3 where 1 and 0 are expected, and `venueConditions` ignores the fourth argument (knots 19).

- [ ] **Step 3: Cut the lee in `zonesFor`**

In `mods/venues/zones.js`, replace the comment above `zonesFor` and the function with:

```js
// windZones (from tour/venues.json): { gain, from, over, lee }. gain knots
// more from `from` metres out from the beach, ramping in over `over` metres;
// lee knots less within 90 m of the beach. knots: the heat's wind; the lee is
// cut so it never takes the local wind under the game's lightest, 12 kt.
// There is no cap on top: 28 kt plus a 4 kt zone is under the 34 kt the
// game's own strongest gusts reach.
export function zonesFor(windZones, coast, knots = Infinity) {
  if (!windZones || !coast) return null;
  const { gain, from, over } = windZones;
  const lee = Math.min(windZones.lee, Math.max(0, knots - 12));
  return { inX: coast.inX, inZ: coast.inZ, shoreline: coast.shoreline, curve: coast.curve, gain, from, over, lee };
}
```

- [ ] **Step 4: Pass the heat's wind through `venue.js`**

In `mods/venues/venue.js`, replace `venueZones` and `venueConditions` (with their comments) with:

```js
// A venue's wind zones, placed on its coast, for a heat in `knots`, or null.
export const venueZones = (venue, knots) => zonesFor(venue?.windZones, coastFor(venue?.id), knots);

// A heat at a venue: the room's seed, the wind (an event's own, or the
// venue's usual one), and the venue's wind zones.
export function venueConditions(roomConditions, venue, roomId, wind = venue.gameConditions) {
  const { knots, gustKnots } = wind;
  const zones = venueZones(venue, knots);
  return { ...roomConditions(roomId), knots, gustKnots, ...(zones ? { zones } : {}) };
}
```

- [ ] **Step 5: Practice zones follow the practice wind**

In `mods/venues/index.js`, replace

```js
        const zones = conditions && !conditions.zones && venueZones(selected());
```

with

```js
        const zones = conditions && !conditions.zones && venueZones(selected(), conditions.knots);
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add mods/venues/zones.js mods/venues/venue.js mods/venues/index.js test/venues.test.mjs
git commit -m "Sail a venue heat in an event's wind, and keep the beach lee above 12 kt"
```

---

### Task 5: The solo challenge sails the event's wind

**Files:**
- Modify: `server/api/tour.mjs`, `server/api/index.mjs:30`, `server/app.mjs`
- Test: `test/api-tour.test.mjs`, `test/venues.test.mjs`

- [ ] **Step 1: Write the failing tests**

In `test/api-tour.test.mjs`, add imports:

```js
import { writeFileSync } from "node:fs";
import { indexEventWinds } from "../server/event-winds.mjs";
import { loadVenueCatalog } from "../server/venues.mjs";
```

In the existing test "an AI heat sails this week's solo wind …", the expected record's `key` changes form. Replace

```js
    { key: `2026-10-24|${weekStart}|m:balz-muller|378`, rider:
```

with

```js
    { key: body.key, rider:
```

and add after that `assert.deepEqual`:

```js
  assert.match(body.key, new RegExp(`^2026-10-24\\|${weekStart}\\|m:balz-muller\\|378\\|[0-9a-f]{12}$`));
```

In `test/venues.test.mjs`, in the test "with the venues mod, an event at a venue names it, …", replace

```js
  assert.equal(body.key, `2026-10-24|${weekStart}|m:yentel-caers|375|${catalog.version}|${SOTAVENTO}|z${ZONE_VERSION}`, "the cache keeps venue heats apart");
```

with

```js
  assert.match(body.key, new RegExp(`^2026-10-24\\|${weekStart}\\|m:yentel-caers\\|375\\|[0-9a-f]{12}$`), "the key ends in a hash of the conditions, so venue heats are kept apart");
```

and change that file's zones import to `import { zoneKnots, zonesFor } from "../mods/venues/zones.js";` (nothing else in it uses `ZONE_VERSION`).

Then add at the end of the file:

```js
const REPORTED = { event: 378, slug: "e378", knots: 24, gustKnots: 4, reported: "24 kt and gusty on finals day", day: "2025-09-30", confidence: "reported", sources: [{ title: "2025 Sylt report", date: "2025-09-30", url: "https://example.test/report" }] };

// The fixture's events are all at "Somewhere"; `at` says where the venue is.
function venueSetup(t, { winds = [REPORTED], at = "Somewhere" } = {}) {
  const s = setup(t);
  const file = join(tempDir(t), "venues.json");
  writeFileSync(file, JSON.stringify({ version: 2, venues: [{ id: "sotavento-fuerteventura", name: "Sotavento, Fuerteventura", locations: [at], gameConditions: { knots: 19, gustKnots: 6 }, windZones: { gain: 4, from: 300, over: 120, lee: 3 } }] }));
  Object.assign(s.ctx, {
    mods: ["venues"],
    game: { ...fakeGame, roomConditions: (id) => ({ seed: id.length, knots: 15, gustKnots: 0 }) },
    venues: loadVenueCatalog(file),
    eventWinds: indexEventWinds({ version: 1, events: winds }),
  });
  return s;
}

test("an AI heat sails the event's reported wind, else its venue's usual wind, with the venue's zones", async (t) => {
  const { call, ai } = venueSetup(t);
  await call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 378 });
  await call("POST", "/api/local/ai-heats", { rider: "m:yentel-caers", event: 375 });
  assert.deepEqual(ai.calls.map(({ conditions: c }) => [c.knots, c.gustKnots, c.zones?.gain]), [[24, 4, 4], [19, 6, 4]]);
});

test("an event with a reported wind at a venue we don't have sails that wind, without zones", async (t) => {
  const { call, ai } = venueSetup(t, { at: "Elsewhere" });
  await call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 378 });
  await call("POST", "/api/local/ai-heats", { rider: "m:yentel-caers", event: 375 });
  const weekStart = fakeGame.weekStart(NOW);
  assert.deepEqual(ai.calls[0].conditions, { seed: `event:378:week:${weekStart}`.length, knots: 24, gustKnots: 4 });
  assert.deepEqual(ai.calls[1].conditions, fakeGame.weekConditions(weekStart));
});

test("a changed wind sails the heat again; the same wind comes from the cache", async (t) => {
  const { call, ai, ctx } = venueSetup(t);
  const race = () => call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 378 });
  await race();
  await race();
  assert.equal(ai.calls.length, 1);
  ctx.eventWinds = indexEventWinds({ version: 1, events: [{ ...REPORTED, knots: 20 }] });
  await race();
  assert.equal(ai.calls.length, 2);
  assert.equal(ai.calls[1].conditions.knots, 20);
});

test("an event says where its wind comes from", (t) => {
  const { call } = venueSetup(t);
  assert.deepEqual(call("GET", "/api/local/tour/events/378").body.wind, { source: "reported", knots: 24, gustKnots: 4, reported: "24 kt and gusty on finals day", day: "2025-09-30", confidence: "reported", url: "https://example.test/report", title: "2025 Sylt report" });
  assert.deepEqual(call("GET", "/api/local/tour/events/375").body.wind, { source: "usual", knots: 19, gustKnots: 6 });
  const elsewhere = venueSetup(t, { winds: [], at: "Elsewhere" });
  assert.deepEqual(elsewhere.call("GET", "/api/local/tour/events/375").body.wind, { source: "week" });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/api-tour.test.mjs`
Expected: FAIL: the key has no hash; the heats sail 19 kt instead of 24; `wind` is undefined.

- [ ] **Step 3: Choose the wind in `server/api/tour.mjs`**

Add imports:

```js
import { createHash } from "node:crypto";
import { eventWind } from "../event-winds.mjs";
```

Add under `const round = …`:

```js
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);

// Where an event's heats get their wind: its reported wind, else its venue's
// usual one, else this week's. What the event card shows.
export function eventWindInfo(venue, wind) {
  if (wind) {
    const source = wind.sources?.[0];
    return { source: "reported", knots: wind.knots, gustKnots: wind.gustKnots, reported: wind.reported, day: wind.day ?? null, confidence: wind.confidence, url: source?.url ?? null, title: source?.title ?? null };
  }
  if (venue) return { source: "usual", knots: venue.gameConditions.knots, gustKnots: venue.gameConditions.gustKnots };
  return { source: "week" };
}
```

Replace `eventRiders` with:

```js
// An event's riders by division, in place order, with each one's average heat
// score going into the event; with the venues mod, its venue and wind.
export function eventRiders(tour, id, catalog = null, venuesEnabled = false, eventWinds = null) {
  if (!tour) return fail(404, NO_TOUR);
  const event = tour.events.get(Number(id));
  if (!event) return fail(404, `No event ${id} in the tour data.`);
  const venue = venuesEnabled ? venueForLocation(catalog, event.location) : null;
  const divisions = {};
  for (const [name, { entries }] of Object.entries(event.divisions)) {
    const ratings = tour.ratings.events[event.id][name];
    divisions[name] = entries.map((e) => ({ rider: e.rider, pseudonym: tour.riders.get(e.rider).pseudonym, place: e.place, average: round(averageScore(ratings[e.rider].rating)) }));
  }
  const result = { id: event.id, name: event.name, divisions };
  if (venuesEnabled) Object.assign(result, { location: event.location, venue: publicVenue(venue), wind: eventWindInfo(venue, eventWind(eventWinds, event.id)) });
  return ok(result);
}
```

Replace `aiHeat`'s comment and its lines from `const weekStart = …` up to and including `const target = …` with:

```js
// The rider's heat. With the venues mod: in the event's reported wind, else
// its venue's usual wind, with the venue's zones; otherwise, and at events
// with neither, in this week's solo wind. body: { rider, event }.
export async function aiHeat(body, { tour, venues, eventWinds, mods, game, now, ai, aiHeats, snapshot }) {
  if (!tour) return fail(404, NO_TOUR);
  const event = tour.events.get(Number(body.event));
  if (!event) return fail(404, `No event ${body.event} in the tour data.`);
  const division = Object.keys(event.divisions).find((name) => event.divisions[name].entries.some((e) => e.rider === body.rider));
  if (!division) return fail(404, `${body.rider} didn't sail at ${event.name}.`);
  const weekStart = game.weekStart(now());
  const venuesOn = !!mods?.includes("venues");
  const venue = venuesOn ? venueForLocation(venues, event.location) : null;
  const wind = venuesOn ? eventWind(eventWinds, event.id) : null;
  const roomId = `event:${event.id}:week:${weekStart}`;
  const conditions = venue
    ? venueConditions(game.roomConditions, venue, roomId, wind ?? venue.gameConditions)
    : wind
      ? { ...game.roomConditions(roomId), knots: wind.knots, gustKnots: wind.gustKnots }
      : game.weekConditions(weekStart);
  const rating = tour.ratings.events[event.id][division][body.rider].rating;
  const target = round(heatTarget(rating, seedOf(body.rider, event.id, weekStart)));
  // A changed wind, zone or target sails a fresh heat.
  const key = `${snapshot}|${weekStart}|${body.rider}|${event.id}|${digest({ conditions, target, zoneVersion: ZONE_VERSION })}`;
  const cached = aiHeats.data.heats[key];
  if (cached) return ok(cached);
```

The rest of `aiHeat` (from `let heat;`) stays as it is. Delete the old `venueKey`, `key`, `cached`, `conditions`, `rating` and `target` lines this replaces.

- [ ] **Step 4: Pass event winds to the event endpoint**

In `server/api/index.mjs`, replace

```js
  if (method === "GET" && path.startsWith(EVENT_PATH)) return eventRiders(ctx.tour, path.slice(EVENT_PATH.length), ctx.venues, ctx.mods?.includes("venues"));
```

with

```js
  if (method === "GET" && path.startsWith(EVENT_PATH)) return eventRiders(ctx.tour, path.slice(EVENT_PATH.length), ctx.venues, ctx.mods?.includes("venues"), ctx.eventWinds);
```

and add `eventWinds` to the list of `ctx` fields in the comment above `handleApi`.

- [ ] **Step 5: Load event winds in `server/app.mjs`**

Add the import:

```js
import { loadEventWinds } from "./event-winds.mjs";
```

Under `const venues = …`, add:

```js
  const eventWinds = mods?.includes("venues") ? loadEventWinds(join(root, "tour", "event-winds.json"), tour, log) : null;
```

and add `eventWinds` to `ctx`:

```js
  const ctx = { store, game, now, tour, venues, eventWinds, mods, ai, aiHeats, snapshot: snapshot.name, lobby, relay, weekly, champion, weekRooms, log };
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/api/tour.mjs server/api/index.mjs server/app.mjs test/api-tour.test.mjs test/venues.test.mjs
git commit -m "Sail challenge heats in the event's reported wind, else the venue's usual wind"
```

---

### Task 6: The event card says where the wind comes from

**Files:**
- Modify: `mods/challenge/challenge.js`, `mods/challenge/index.js`, `mods/venues/index.js`
- Test: `test/challenge.test.mjs`

- [ ] **Step 1: Write the failing test**

In `test/challenge.test.mjs`, add `windLine` to the import from `../mods/challenge/challenge.js`, and add:

```js
test("the event card says where its wind comes from", () => {
  const venue = { name: "Sorobon, Bonaire" };
  assert.equal(windLine({ venue, wind: { source: "reported", knots: 18, gustKnots: 6, day: "2024-07-26" } }), "Reported (26 July 2024): 18 kt, gusts 20–24 kt");
  assert.equal(windLine({ venue, wind: { source: "reported", knots: 20, gustKnots: 0, day: null } }), "Reported: 20 kt, steady wind");
  assert.equal(windLine({ venue, wind: { source: "usual", knots: 18, gustKnots: 0 } }), "Usual at Sorobon, Bonaire: 18 kt, steady wind");
  assert.equal(windLine({ venue: null, wind: { source: "week" } }), "This week's wind");
  assert.equal(windLine({}), "This week's wind", "without the venues mod");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/challenge.test.mjs`
Expected: FAIL: `windLine` is not exported.

- [ ] **Step 3: Write `windLine`**

In `mods/challenge/challenge.js`, add at the top, under the file's comment:

```js
import { windText } from "../venues/venue.js";
```

and at the end:

```js
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// The event card's wind: the event's own from its reports, its venue's usual
// wind, or this week's. event: as GET /api/local/tour/events/<id> answers.
export function windLine({ wind, venue }) {
  if (wind?.source === "reported") return `Reported${wind.day ? ` (${DAY.format(new Date(wind.day))})` : ""}: ${windText(wind)}`;
  if (wind?.source === "usual") return `Usual at ${venue.name}: ${windText(wind)}`;
  return "This week's wind";
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test test/challenge.test.mjs`
Expected: PASS.

- [ ] **Step 5: Use it on the card**

In `mods/challenge/index.js`, change the imports to:

```js
import { clearPlannedHeat, rememberPlannedHeat } from "../venues/venue.js";
import { aiSample, isSoloHeatStart, isStale, nextHeatText, planningText, resultText, riderLine, windLine } from "./challenge.js";
```

and replace the card's venue block

```js
          el("div", { className: "ft-venue" },
            event.venue && el("img", { src: `/__mods/venues/assets/${event.venue.id}.svg`, alt: "", width: 84, height: 52 }),
            el("div", {},
              el("strong", { textContent: event.venue?.name ?? event.location ?? "Venue unknown" }),
              el("div", { className: "ft-muted", textContent: event.venue ? `Typical: ${windText(event.venue.gameConditions)}` : "Sailed in this week's wind" }),
            ),
          ),
```

with

```js
          el("div", { className: "ft-venue" },
            event.venue?.scenery && el("img", { src: `/__mods/venues/assets/${event.venue.id}.svg`, alt: "", width: 84, height: 52 }),
            el("div", {},
              el("strong", { textContent: event.venue?.name ?? event.location ?? "Venue unknown" }),
              el("div", { className: "ft-muted", textContent: windLine(event) }),
              event.wind?.url && el("a", { className: "ft-muted", href: event.wind.url, target: "_blank", rel: "noopener noreferrer", textContent: event.wind.title ?? "Source" }),
            ),
          ),
```

- [ ] **Step 6: Pictures only where a venue has scenery, in the chooser**

In `mods/venues/index.js`, in `setVenueStatus`, replace

```js
      thumbnail.hidden = !venue;
      thumbnail.src = venue ? picture(venue) : "";
```

with

```js
      thumbnail.hidden = !venue?.scenery;
      thumbnail.src = venue?.scenery ? picture(venue) : "";
```

In `renderPanel`'s `option`, replace

```js
          el("img", { src: picture(venue), alt: "", width: 96, height: 64 }),
```

with

```js
          venue.scenery && el("img", { src: picture(venue), alt: "", width: 96, height: 64 }),
```

and replace

```js
            el("span", { className: "ft-option-meta", textContent: windText(venue.gameConditions) }),
```

with

```js
            el("span", { className: "ft-option-meta", textContent: venue.scenery ? windText(venue.gameConditions) : `${windText(venue.gameConditions)} · the game's own scenery` }),
```

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add mods/challenge/challenge.js mods/challenge/index.js mods/venues/index.js test/challenge.test.mjs
git commit -m "Say on the event card where its wind comes from, and show pictures only with scenery"
```

---

### Task 7: Research the 43 events' winds

**Files:**
- Create: `tour/event-winds.json`
- Test: `test/event-winds.test.mjs`

- [ ] **Step 1: Write the coverage test**

Add to `test/event-winds.test.mjs` the imports

```js
import { loadVenueCatalog, venueForLocation } from "../server/venues.mjs";
import { ROOT } from "./helpers.mjs";
```

(merge `ROOT` into the existing helpers import) and the test:

```js
test("every event at the five venues has an entry, with a wind or with none found", () => {
  const tour = loadTour(join(ROOT, "tour"));
  const catalog = loadVenueCatalog(join(ROOT, "tour", "venues.json"));
  const winds = loadEventWinds(join(ROOT, "tour", "event-winds.json"), tour);
  const missing = [...tour.events.values()].filter((e) => venueForLocation(catalog, e.location) && !winds.byEvent.has(e.id)).map((e) => e.slug);
  assert.deepEqual(missing, []);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/event-winds.test.mjs`
Expected: FAIL: `missing` lists 43 slugs.

- [ ] **Step 3: List the events to research**

Run:

```bash
node --input-type=module -e "
const { loadTour } = await import('./server/tour.mjs');
const { loadVenueCatalog, venueForLocation } = await import('./server/venues.mjs');
const tour = loadTour('tour'), catalog = loadVenueCatalog('tour/venues.json');
for (const e of tour.events.values()) { const v = venueForLocation(catalog, e.location); if (v) console.log(v.id, e.id, e.slug, e.start, e.end); }
"
```

Expected: 43 lines, grouped by venue.

- [ ] **Step 4: Start the file**

Create `tour/event-winds.json`:

```json
{
  "version": 1,
  "events": []
}
```

- [ ] **Step 5: Research and enter each venue's events, one venue at a time**

Order: Sotavento (16), Sylt (15), Podersdorf (6), Pozo (3), Bonaire (3). For each event:

1. Read its reports: first the PWA event page, `https://www.pwaworldtour.com/events/detail/<slug>/`, and the news reports it links for the competition days; pages already downloaded for the tour data may be in `cache/`. If PWA says nothing about the wind, try windsurf magazines (Surf, Windsurf Journal, Boards).
2. Find the day of the final elimination (the one that decided the podium) and what the reports say about the wind that day.
3. Turn it into knots with the spec's rules:
   - a range "18–25 kt": `knots` 18, `gustKnots` the spread, at most 6 (a spread under 2 is steady, 0); `confidence` "reported";
   - one number "20 knots": that wind; `gustKnots` 4 if the report calls it gusty, else 0; "reported";
   - m/s × 1.944 = knots; Beaufort to knots by the usual table;
   - sail sizes ("bounded"): 5.8 m² or more 14 kt, 5.4–5.7 m² 17, 5.0–5.3 m² 20, 4.6–4.9 m² 23, 4.2–4.5 m² 26, 4.1 m² or less 28;
   - words only ("bounded", or "inferred" when only hinted): light or marginal 13, moderate 16, good or solid 19, strong or powered 23, nuking or survival 27;
   - under 12 kt: 12, over 28: 28, and `reported` says the real wind was beyond the game's range.
4. Add an entry, in the order of the list from Step 3:

```json
    { "event": 359, "slug": "2024-fuerteventura-grand-slam", "knots": 18, "gustKnots": 6,
      "reported": "Our own short summary of what the reports say about the deciding day's wind",
      "day": "2024-07-26", "confidence": "reported",
      "sources": [{ "title": "The report's title", "date": "2024-07-26", "url": "https://www.pwaworldtour.com/news/detail/…" }] }
```

   or, when the reports give no wind:

```json
    { "event": 120, "slug": "…", "knots": null,
      "reported": "The reports describe the heats but not the wind",
      "sources": [{ "title": "…", "date": "…", "url": "…" }] }
```

   `reported` is always our own words, never a quote. `day` only when the reports say which day.

After each venue, run `node --test test/event-winds.test.mjs` (the loader's checks run on the real file through the coverage test; the coverage test itself fails until all five are done), then commit:

```bash
git add tour/event-winds.json
git commit -m "Add the reported winds of the Sotavento events"
```

(with the venue's name in each message).

- [ ] **Step 6: Run the coverage test to see it pass**

Run: `node --test test/event-winds.test.mjs`
Expected: PASS. Then print the summary for the spec:

```bash
node -e "
const w = JSON.parse(require('fs').readFileSync('tour/event-winds.json','utf8')).events;
const by = {}; for (const e of w) { const k = e.knots === null ? 'none found' : e.confidence; by[k] = (by[k] ?? 0) + 1; }
console.log(w.length, 'events:', by);
"
```

Expected: `43 events:` and the counts per confidence.

---

### Task 8: Check the AI across wind strengths

**Files:**
- Modify: `tools/ai-check.mjs`, `docs/superpowers/specs/2026-10-30-event-winds-design.md`

- [ ] **Step 1: Add `--winds`**

In `tools/ai-check.mjs`, replace the usage line in the top comment with

```js
//   node tools/ai-check.mjs [--weeks 5] [--targets 22,28,34,40,46] [--winds 12,16,20,24,28]
// --winds sails each target in each of those winds (4 kt gusts) instead of
// the weeks' own, and reports the misses per wind.
```

In `main`, replace the `parseArgs` line with

```js
  const { values } = parseArgs({ options: { weeks: { type: "string", default: "5" }, targets: { type: "string", default: "22,28,34,40,46" }, winds: { type: "string", default: "" } } });
```

replace the job loop with

```js
  const winds = values.winds ? values.winds.split(",").map(Number) : [null];
  const jobs = [];
  for (let back = 0; back < Number(values.weeks); back++) {
    const weekStart = game.weekStart(Date.now() - back * WEEK);
    const week = game.weekConditions(weekStart);
    for (const knots of winds) for (const target of targets) jobs.push({ weekStart, conditions: knots ? { ...week, knots, gustKnots: 4 } : week, target });
  }
```

and before the final `const { mean, worst, pass } = judge(results);` add

```js
  if (values.winds) {
    for (const knots of winds) {
      const at = results.filter((r) => r.conditions.knots === knots);
      const mean = at.reduce((sum, r) => sum + (r.score - r.target), 0) / at.length;
      console.log(`  ${knots} kt: ${at.length} heats, scored ${mean >= 0 ? "+" : ""}${mean.toFixed(2)} against the target on average`);
    }
  }
```

- [ ] **Step 2: Check the existing test still passes**

Run: `node --test test/ai-check.test.mjs`
Expected: PASS.

- [ ] **Step 3: Run the check**

Run (takes several minutes): `node tools/ai-check.mjs --weeks 2 --targets 40 --winds 12,16,20,24,28`
Expected: ten heats and one line per wind.

- [ ] **Step 4: Record the results in the spec**

In the spec's Testing section, replace the "One-off check while building" item's last two sentences with the measured averages per wind, for example "Measured 2026-10-31, aiming for 40, two weeks' seeds: 12 kt −1.8, 16 kt −0.6, …". If light wind costs much more than half a point, add: "Left as it is: real riders score less in light wind too."

- [ ] **Step 5: Commit**

```bash
git add tools/ai-check.mjs docs/superpowers/specs/2026-10-30-event-winds-design.md
git commit -m "Check the AI across wind strengths, and record how it scores"
```

---

### Task 9: Documentation, and checking it in the game

**Files:**
- Modify: `README.md`, `docs/roadmap.md`, `docs/venues-roadmap.md`

- [ ] **Step 1: README**

In `README.md`, replace the `venues` bullet with:

```markdown
- `venues`: choose a venue for your practice and solo heats. Sotavento and
  Sylt have their own coastal scenes; Podersdorf, Pozo and Sorobon have their
  usual winds in the game's own scene. Tour-event challenges at those five
  venues sail in each event's reported wind (`tour/event-winds.json`), or the
  venue's usual wind where the reports give none.
```

and after the paragraph that ends "…and checks that the AI lands within 1.0 of its target on average.", add:

```markdown
Event winds are in `tour/event-winds.json`, curated by hand from each event's
PWA reports and kept apart from the crawled results: the wind on the day of
the final elimination, at its real strength within the game's 12–28 kt, with
its source, and whether it was reported, read from sail sizes or words, or
inferred. `node tools/ai-check.mjs --winds 12,16,20,24,28` shows how the AI
scores across wind strengths.
```

- [ ] **Step 2: Roadmaps**

In `docs/roadmap.md`, change `2. **Event winds:**` to `2. **Event winds (done):**`. In `docs/venues-roadmap.md`, at the end of "## Current pilot", add:

```markdown
Event winds (`docs/superpowers/specs/2026-10-30-event-winds-design.md`) add
Podersdorf, Pozo and Sorobon as venues with a usual wind and no scenery, and
each of the 43 events at the five venues has its reported wind, or a note that
its reports give none. The scenery outline for the rest is
`docs/superpowers/plans/2026-10-30-venue-scenery.md`.
```

- [ ] **Step 3: Check it in the game**

Start the preview (`.claude/launch.json` has `local-copy` on port 5180). In the game:
1. Open Challenge, pick 2025, a Sylt event: the card shows "Reported (…): … kt…" with a source link, or "Usual at Westerland, Sylt: 17 kt, …".
2. Pick a Podersdorf season (for example 2013): the card shows "Usual at Podersdorf…" or its reported wind, with no picture.
3. Race a rider; when the solo heat starts, the game's countdown shows the same wind.
4. Open Venue: Podersdorf, Pozo and Sorobon are listed with "the game's own scenery" and no picture; choosing Pozo gives 25 kt in practice.
5. The browser console shows no errors from the mods.

- [ ] **Step 4: Run all tests and commit**

Run: `npm test`
Expected: PASS.

```bash
git add README.md docs/roadmap.md docs/venues-roadmap.md
git commit -m "Document the event winds"
```

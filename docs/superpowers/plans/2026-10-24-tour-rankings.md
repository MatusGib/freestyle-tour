# Results from the Season Rankings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a freestyle results page on pwaworldtour.com fails, take that division's entries from the season rankings page, filling 2010 Sotavento, 2010 Sylt and 2011 Podersdorf (men) in `tour/`.

**Architecture:** Two pure functions join `lib/pwa/parse.mjs`: `parseRanking` reads a rankings page, and `rankingEntries` picks the column for one event. The collector (`lib/pwa/collect.mjs`) calls them only when a results page or tab answers an HTTP error. Then the data is rebuilt, and checked to make sure nothing else moved.

**Tech Stack:** Node 22+ built-ins, as in the rest of `lib/pwa/`.

**Spec:** `docs/superpowers/specs/2026-10-24-tour-data-rankings-design.md` (an addendum to `docs/superpowers/specs/2026-10-24-tour-data-design.md`)

---

## Facts this plan relies on (verified 2026-10-24)

- The code in this plan was first run as a prototype: all tests pass. Run against the real cached pages for 2006, 2010 and 2011, it:
  - filled 2010 Sotavento men with 38 entries, 2010 Sylt men with 37 and 2011 Podersdorf men with 47;
  - noted that 2006 Sotavento (men and women) isn't in the 2006 rankings;
  - downloaded 16 pages: the 4 rankings pages, plus the pages that answer 500, which every online run tries again.
- **Rankings markup:** rankings pages put their table in `<div class="overall-ranking-full"><table>`.
  - The header row is `#`, `Name`, `Sail`, one `<th>` per event (with a leading space, like `<th> Sotavento Fuerteventura</th>`), then `Points`.
  - Rider rows have `rank-name`, `rank-sail` and one `rank-score` cell per event: `2034 (3)`, `0 (33)` or a bare `0`.
- **The 2006 pages:**
  - The men's page holds the wave ranking: event columns titled `<th>Red Bull Storm Rider - PWA Wave Qualifier</th>` and so on, with no space, and cells with bare points like `2034`.
  - The women's page has only `#`, `Name`, `Sail` and `Points`.
- **Event ids:** 166 is 2010 Sotavento (results page answers 500), 169 is 2010 Sylt (its Freestyle Men tab answers 500), 175 is 2011 Podersdorf (results page answers 500).
- **New fixtures,** committed with this plan in `test/fixtures/pwa/`:
  - `rankings-2010-men.html`: the 2010 men's rankings with five riders (Gollito, Taty Frans, Kiri Thode, Seyss, Verschooten);
  - `event-2010-sotavento.html` and `event-2010-sylt.html`: their event pages;
  - `results-2010-sylt.html`: the Sylt results page with its tabs.
- `npm test` passes 158 tests before Task 1.

## File structure

| File | Change |
|---|---|
| `lib/pwa/parse.mjs` | Import `nameKey`; add `parseRanking()` and `rankingEntries()` |
| `lib/pwa/collect.mjs` | Fall back to the season rankings when a results page or tab fails |
| `test/pwa-rankings.test.mjs` | New: the two functions |
| `test/pwa-collect.test.mjs` | Updated notes in two tests; two new tests |
| `test/tour-data.test.mjs` | A check for the three filled divisions |
| `tour/` | Rebuilt |

Run all commands from the repo root (`C:\Users\mateusz\Projects\freestyle-tour`) in Git Bash. Work on a branch: `git checkout -b tour-rankings`. The page cache from the last build is in `cache/pwa/`.

---

### Task 1: Rankings parser

**Files:**
- Modify: `lib/pwa/parse.mjs`
- Test: `test/pwa-rankings.test.mjs`

- [ ] **Step 1: Write the failing test** in `test/pwa-rankings.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRanking, rankingEntries } from "../lib/pwa/parse.mjs";

const page = (name) => readFileSync(new URL(`fixtures/pwa/${name}`, import.meta.url), "utf8");

// A rankings table like the site's, from header titles and rows of cells.
const table = (events, rows) => `<div class="overall-ranking-full">
<table><tr><th>#</th><th>Name</th><th>Sail</th>${events.map((e) => `<th>${e}</th>`).join("")}<th>Points</th></tr>
${rows.map(([name, sail, ...cells]) => `<tr><td class="rank-no">1</td><td class="rank-name-sponsors"><div class="rank-name"><a href="/athletes/x/">${name}</a></div></td><td class="rank-sail">${sail}</td>${cells.map((c) => `<td class="rank-score ">${c}</td>`).join("")}<td class="rank-total-points">0</td></tr>`).join("\n")}
</table></div>`;

test("parseRanking reads the event titles and each rider's points and place", () => {
  const ranking = parseRanking(page("rankings-2010-men.html"));
  assert.deepEqual(ranking.events, ["Podersdorf Austria", "Costa Teguise Lanzarote", "Sotavento Fuerteventura", "Colgate World Cup Sylt, Germany"]);
  assert.equal(ranking.riders.length, 5);
  assert.deepEqual(ranking.riders[0], {
    name: 'Jose "Gollito" Estredo',
    sailNumber: "V-01",
    results: [{ points: 2034, place: 3 }, { points: 2100, place: 1 }, { points: 2100, place: 1 }, { points: 2100, place: 1 }],
  });
});

test("0 (33) is 33rd with no points, and a bare 0 means the rider didn't compete", () => {
  const seyss = parseRanking(page("rankings-2010-men.html")).riders.find((r) => r.name === "Alexander Seyss");
  assert.deepEqual(seyss.results, [{ points: 0, place: 33 }, null, null, null]);
});

test("cells with points but no place give null, and a page without rows or a table gives nothing", () => {
  const wave = parseRanking(table(["Guincho, Portugal", "Pozo, Gran Canaria"], [["Kevin Pritchard", "US-3", "2034", "0"]]));
  assert.deepEqual(wave.riders[0].results, [null, null]);
  assert.deepEqual(parseRanking(table([], [])), { events: [], riders: [] });
  assert.deepEqual(parseRanking("<html>No ranking</html>"), { events: [], riders: [] });
});

test("parseRanking fails on a cell it can't read or a row of the wrong length", () => {
  assert.throws(() => parseRanking(table(["A"], [["Someone", "X-1", "DNS"]])), /unreadable rankings cell "DNS"/);
  assert.throws(() => parseRanking(table(["A", "B"], [["Someone", "X-1", "0"]])), /a rankings row has 1 results for 2 events/);
});

test("rankingEntries takes the column named like the event without its year, placed riders only", () => {
  const ranking = parseRanking(page("rankings-2010-men.html"));
  assert.deepEqual(rankingEntries(ranking, "2010 Colgate World Cup Sylt, Germany"), [
    { place: 1, name: 'Jose "Gollito" Estredo', sailNumber: "V-01", points: 2100 },
    { place: 2, name: "Kiri Thode", sailNumber: "NB-61", points: 2067 },
    { place: 5, name: "Elton (Taty) Frans", sailNumber: "NB-9", points: 1968 },
  ]);
  assert.deepEqual(rankingEntries(ranking, "2010 Podersdorf Austria").map((e) => [e.place, e.name]), [
    [1, "Elton (Taty) Frans"],
    [3, 'Jose "Gollito" Estredo'],
    [4, "Kiri Thode"],
    [33, "Alexander Seyss"],
    [33, "Jordi Verschooten"],
  ]);
  assert.equal(rankingEntries(ranking, "2010 Mui Ne, Vietnam"), null, "not an event of this ranking");
  assert.equal(rankingEntries(ranking, "Sotavento, Fuerteventura").length, 3, "punctuation is ignored");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/pwa-rankings.test.mjs`
Expected: FAIL with `SyntaxError: The requested module '../lib/pwa/parse.mjs' does not provide an export named 'parseRanking'`.

- [ ] **Step 3: Import `nameKey`** at the top of `lib/pwa/parse.mjs`. The header comment's last line and the line after it become:

```js
// doesn't have the expected shape; the caller adds the URL.
import { nameKey } from "./riders.mjs";

const ENTITIES = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
```

(`riders.mjs` imports nothing from `parse.mjs`, so there's no cycle.)

- [ ] **Step 4: Append the two functions** to the end of `lib/pwa/parse.mjs`:

```js

// A season's rankings page: the event column titles, and for each rider the
// result at every event, { place, points }, or null for a cell without a
// place. A bare 0 means the rider didn't compete; some old pages (2006) give
// points without places, which can't be used either.
export function parseRanking(html) {
  const table = html.match(/<div class="overall-ranking-full">\s*<table>([\s\S]*?)<\/table>/);
  if (!table) return { events: [], riders: [] };
  const [head, ...rows] = table[1].split("<tr>").slice(1);
  const events = [...head.matchAll(/<th>([\s\S]*?)<\/th>/g)].map((m) => clean(m[1])).slice(3, -1);
  const riders = rows.filter((row) => row.includes('class="rank-name"')).map((row) => {
    const name = row.match(/<div class="rank-name">([\s\S]*?)<\/div>/);
    const sail = row.match(/<td class="rank-sail">([\s\S]*?)<\/td>/);
    if (!sail) throw new Error("a rankings row is missing its sail number");
    const results = [...row.matchAll(/<td class="rank-score[^"]*">([\s\S]*?)<\/td>/g)].map((m) => {
      const cell = clean(m[1]);
      const scored = cell.match(/^(\d+) \((\d+)\)$/);
      if (scored) return { points: Number(scored[1]), place: Number(scored[2]) };
      if (/^\d+$/.test(cell)) return null;
      throw new Error(`unreadable rankings cell "${cell}"`);
    });
    if (results.length !== events.length) throw new Error(`a rankings row has ${results.length} results for ${events.length} events`);
    return { name: clean(name[1]), sailNumber: clean(sail[1]), results };
  });
  return { events, riders };
}

// The entries of the rankings column whose title is the event's name without
// its year, in place order, or null when there is no such column.
export function rankingEntries(ranking, eventName) {
  const key = nameKey(eventName.replace(/^\d{4}\s+/, ""));
  const column = ranking.events.findIndex((title) => nameKey(title) === key);
  if (column < 0) return null;
  return ranking.riders
    .filter((rider) => rider.results[column])
    .map((rider) => ({ place: rider.results[column].place, name: rider.name, sailNumber: rider.sailNumber, points: rider.results[column].points }))
    .sort((a, b) => a.place - b.place);
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `node --test test/pwa-rankings.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/pwa/parse.mjs test/pwa-rankings.test.mjs test/fixtures/pwa
git commit -m "Parse the PWA season rankings pages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Collector fallback

**Files:**
- Modify: `lib/pwa/collect.mjs`
- Test: `test/pwa-collect.test.mjs`

- [ ] **Step 1: Update the expected notes of the first collector test.** The women's tab there answers 404, so the collector now also tries the 2025 women's rankings, which answer 404 too. In `test/pwa-collect.test.mjs`, in the test "collect keeps freestyle events with their entries and freestyle ladders", replace:

```js
    `${results(375, 1020)}&cHash=3ccb7937506ea874db4e3aa22884357b answered 404, skipped`,
    `${ladder(1016, "fc2b88d9fb946c96cd27160b308fb8a5")} answered 404, skipped`,
```

with:

```js
    `${results(375, 1020)}&cHash=3ccb7937506ea874db4e3aa22884357b answered 404, skipped`,
    `${BASE}/rankings/2025/freestyle-women/ answered 404, skipped`,
    `${ladder(1016, "fc2b88d9fb946c96cd27160b308fb8a5")} answered 404, skipped`,
```

- [ ] **Step 2: Replace the test "an HTTP error on a results page skips the event with a note"** (the whole `test(...)` call) with these three tests and the 2010 site they share:

```js
test("an HTTP error on a results page, with no rankings to fall back on, skips the event with notes", async () => {
  const site = { ...SITE };
  delete site[`${BASE}/events/results/results/375?type=24`];
  const crawler = fakeCrawler(site);
  crawler.get = async (url) => {
    if (url in site) return site[url];
    throw Object.assign(new Error(`${url} answered 500`), { status: 500 });
  };
  const { events, notes } = await collect(crawler, { seasons: [2025] });
  assert.deepEqual(events, []);
  assert.deepEqual(notes, [
    `${BASE}/events/results/results/375?type=24 answered 500, skipped`,
    `${BASE}/rankings/2025/freestyle-men/ answered 500, skipped`,
    `${BASE}/rankings/2025/freestyle-women/ answered 500, skipped`,
  ]);
});

// 2010: Sotavento's results page and Sylt's men's freestyle tab answer 500,
// as on the real site; the 2010 men's rankings have both events.
const SYLT_TAB = `${BASE}/events/results/results/169?tx_pwaworldtour_eventresults%5BeventDiscipline%5D=508&type=24&cHash=94cfa9c67f60a0eb58513d4f19be2d0a`;
const SITE_2010 = {
  [`${BASE}/events/2010/`]: listing("2010-sotavento-fuerteventura", "2010-colgate-world-cup-sylt"),
  [`${BASE}/events/detail/2010-sotavento-fuerteventura/`]: page("event-2010-sotavento.html"),
  [`${BASE}/events/elimination-ladder/elimination-ladders/166?type=25`]: page("ladders-2008-sotavento.html"),
  [`${BASE}/events/detail/2010-colgate-world-cup-sylt/`]: page("event-2010-sylt.html"),
  [`${BASE}/events/results/results/169?type=24`]: page("results-2010-sylt.html"),
  [`${BASE}/events/elimination-ladder/elimination-ladders/169?type=25`]: page("ladders-2008-sotavento.html"),
  [`${BASE}/rankings/2010/freestyle-men/`]: page("rankings-2010-men.html"),
};

function crawlerFailing(pages, failing) {
  const crawler = fakeCrawler(pages);
  const get = crawler.get;
  crawler.get = async (url, options) => {
    if (failing.includes(url)) throw Object.assign(new Error(`${url} answered 500`), { status: 500 });
    return get(url, options);
  };
  return crawler;
}

test("a failing results page or freestyle tab gets its entries from the season rankings", async () => {
  const crawler = crawlerFailing(SITE_2010, [`${BASE}/events/results/results/166?type=24`, SYLT_TAB]);
  const { events, notes } = await collect(crawler, { seasons: [2010] });
  assert.deepEqual(events.map((e) => [e.id, e.name, Object.keys(e.divisions)]), [
    [166, "2010 Sotavento Fuerteventura", ["men"]],
    [169, "2010 Colgate World Cup Sylt, Germany", ["men"]],
  ]);
  assert.deepEqual(events[0].divisions.men.entries.map((e) => [e.place, e.name, e.sailNumber, e.points]), [
    [1, 'Jose "Gollito" Estredo', "V-01", 2100],
    [2, "Elton (Taty) Frans", "NB-9", 2067],
    [4, "Kiri Thode", "NB-61", 2001],
  ]);
  assert.deepEqual(events[1].divisions.men.entries.map((e) => e.place), [1, 2, 5]);
  assert.deepEqual(events[0].divisions.men.ladders, []);
  assert.ok(notes.includes("2010 Sotavento Fuerteventura: men's results taken from the 2010 rankings"), notes.join("\n"));
  assert.ok(notes.includes("2010 Colgate World Cup Sylt, Germany: men's results taken from the 2010 rankings"), notes.join("\n"));
});

test("without a matching rankings column the division stays out, with a note", async () => {
  const site = { ...SITE_2010, [`${BASE}/rankings/2010/freestyle-men/`]: page("rankings-2010-men.html").replace("Sotavento Fuerteventura", "Somewhere Else") };
  const crawler = crawlerFailing(site, [`${BASE}/events/results/results/166?type=24`]);
  const { events, notes } = await collect(crawler, { seasons: [2010] });
  assert.ok(!events.some((e) => e.id === 166));
  assert.ok(notes.includes("2010 Sotavento Fuerteventura: no men's results, not even in the 2010 rankings"), notes.join("\n"));
});
```

- [ ] **Step 3: Run the collector tests to see the new ones fail**

Run: `node --test test/pwa-collect.test.mjs`
Expected: FAIL in 4 tests:
- "collect keeps freestyle events…": no rankings note;
- "an HTTP error on a results page, with no rankings…": only one note;
- "a failing results page or freestyle tab…": `events` is empty;
- "without a matching rankings column…": the note is missing.

- [ ] **Step 4: Import the two functions** in `lib/pwa/collect.mjs`. The import line becomes:

```js
import { parseEvent, parseLadder, parseLadderIndex, parseRanking, parseResultTabs, parseResults, parseSeason, placesFromPoints, rankingEntries } from "./parse.mjs";
```

- [ ] **Step 5: Add `fromRankings`** inside the season loop of `collect`. Replace:

```js
    let found = 0;
    for (const slug of await read(`/events/${season}/`, parseSeason)) {
```

with:

```js
    // When an event's results page fails, the season rankings list each
    // rider's place at the event. null when they don't have it either.
    const fromRankings = async (eventName, division) => {
      const ranking = await readIfThere(`/rankings/${season}/freestyle-${division}/`, parseRanking);
      if (!ranking) return null;
      const entries = rankingEntries(ranking, eventName);
      notes.push(entries ? `${eventName}: ${division}'s results taken from the ${season} rankings` : `${eventName}: no ${division}'s results, not even in the ${season} rankings`);
      return entries;
    };
    let found = 0;
    for (const slug of await read(`/events/${season}/`, parseSeason)) {
```

- [ ] **Step 6: Use it when a results page or tab fails.** Replace:

```js
      const tabs = await readIfThere(event.resultsUrl, parseResultTabs);
      if (!tabs) continue;
      const sources = tabs.filter((tab) => TABS[tab.label]).map((tab) => ({ division: TABS[tab.label], url: tab.url }));
      const only = event.disciplines.length === 1 && DISCIPLINES[event.disciplines[0]];
      if (!tabs.length && only) sources.push({ division: only, url: event.resultsUrl });
      if (!sources.length) continue;
      const divisions = {};
      for (const { division, url } of sources) {
        let entries = await readIfThere(url, parseResults);
        if (!entries?.length) {
```

with:

```js
      const tabs = await readIfThere(event.resultsUrl, parseResultTabs);
      let sources;
      if (tabs) {
        sources = tabs.filter((tab) => TABS[tab.label]).map((tab) => ({ division: TABS[tab.label], url: tab.url }));
        const only = event.disciplines.length === 1 && DISCIPLINES[event.disciplines[0]];
        if (!tabs.length && only) sources.push({ division: only, url: event.resultsUrl });
      } else {
        // The results page failed: the event page says which divisions to look for.
        sources = [...new Set(event.disciplines.map((d) => DISCIPLINES[d]).filter(Boolean))].map((division) => ({ division, url: null }));
      }
      if (!sources.length) continue;
      const divisions = {};
      for (const { division, url } of sources) {
        let entries = url ? await readIfThere(url, parseResults) : null;
        if (entries === null) entries = await fromRankings(event.name, division);
        if (!entries?.length) {
```

The lines after it stay as they are. A division with no results notes "no men's results" when its tab says so. When its results came from nowhere, `fromRankings` has already noted why.

- [ ] **Step 7: Run the collector tests, then the whole suite**

Run: `node --test test/pwa-collect.test.mjs`
Expected: PASS, 10 tests.

Run: `npm test`
Expected: PASS, 158 + 5 + 2 = 165 tests, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add lib/pwa/collect.mjs test/pwa-collect.test.mjs
git commit -m "Fall back to the season rankings when results pages fail" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Rebuild the data

**Files:**
- Modify: `tour/seasons/2010.json`, `tour/seasons/2011.json`, `tour/riders.json`, `tour/ratings.json`; maybe `tour/pseudonyms.json`

- [ ] **Step 1: Keep the current riders for comparison**

```bash
git show HEAD:tour/riders.json > cache/riders-before.json
```

- [ ] **Step 2: Rebuild online.** This fetches the rankings pages and tries the failing pages again, about 30 pages, all others from the cache:

```bash
npm run tour-data > cache/tour-data.log 2>&1; echo "exit $?" >> cache/tour-data.log; grep -E "rankings|Check on|Wrote|exit" cache/tour-data.log
```

Expected:
- `2010 Sotavento Fuerteventura: men's results taken from the 2010 rankings`
- `2010 Colgate World Cup Sylt, Germany: men's results taken from the 2010 rankings`
- `2011 Podersdorf Austria: men's results taken from the 2011 rankings`
- two `Sotavento, Fuerteventura: no … results, not even in the 2006 rankings` notes
- a check line at or above 65%
- `exit 0`

If the check falls below 65%, nothing was written: stop and report it.

- [ ] **Step 3: Check that only 2010 and 2011 changed among the seasons**

```bash
git diff --stat -- tour/seasons
```

Expected: only `tour/seasons/2010.json` and `tour/seasons/2011.json`.

- [ ] **Step 4: Check that no existing rider's pseudonym moved**

```bash
node -e "const before=require('./cache/riders-before.json');const now=new Map(require('./tour/riders.json').map(r=>[r.id,r.pseudonym]));const moved=before.filter(r=>now.get(r.id)!==r.pseudonym);console.log(moved.length?moved.map(r=>r.id+': '+r.pseudonym+' -> '+now.get(r.id)).join('\n'):'no pseudonym moved');console.log('riders: '+before.length+' -> '+now.size)"
```

Expected: `no pseudonym moved`, and more riders than before.

If any moved, add each to `tour/pseudonyms.json` with its old pseudonym, as `"<id>": "<old pseudonym>"`. Rebuild with `npm run tour-data -- --offline`, then run this step again.

- [ ] **Step 5: Check that an offline rebuild repeats exactly**

```bash
sha256sum tour/riders.json tour/ratings.json tour/seasons/*.json > cache/tour-sums.txt
npm run tour-data -- --offline > /dev/null && sha256sum -c cache/tour-sums.txt --quiet && echo identical
```

Expected: `identical`.

- [ ] **Step 6: Commit**

```bash
git add tour
git commit -m "Fill 2010 Sotavento, 2010 Sylt and 2011 Podersdorf from the rankings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Data test

**Files:**
- Modify: `test/tour-data.test.mjs`

- [ ] **Step 1: Add the check** to the end of `test/tour-data.test.mjs`:

```js
test("the divisions taken from the season rankings are there", () => {
  const sizes = Object.fromEntries(events.filter((e) => [166, 169, 175].includes(e.id)).map((e) => [e.id, e.divisions.men?.entries.length]));
  assert.deepEqual(sizes, { 166: 38, 169: 37, 175: 47 });
});
```

- [ ] **Step 2: Run it, then the whole suite**

Run: `node --test test/tour-data.test.mjs`
Expected: PASS, 6 tests.

Run: `npm test`
Expected: PASS, 166 tests, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add test/tour-data.test.mjs
git commit -m "Test the divisions filled from the rankings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

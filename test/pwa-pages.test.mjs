import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeHtml, parseDates, parseEvent, parseResultTabs, parseResults, parseSeason, placesFromPoints } from "../lib/pwa/parse.mjs";

const page = (name) => readFileSync(new URL(`fixtures/pwa/${name}`, import.meta.url), "utf8");

test("decodeHtml turns named and numeric entities into text", () => {
  assert.equal(decodeHtml("Jose &quot;Gollito&quot; Estredo &amp; R&#233;mi &#x56;ila&nbsp;&bogus;"), 'Jose "Gollito" Estredo & Rémi Vila &bogus;');
  assert.equal(decodeHtml("2008 Pegasus Airlines Alaçat&amp;#305; PWA World Cup"), "2008 Pegasus Airlines Alaçatı PWA World Cup", "encoded twice");
});

test("parseSeason lists the event slugs of a season", () => {
  assert.deepEqual(parseSeason(page("season-2008.html")), ["2008-cabo-verde-men-only", "2008-podersdorf-austria-men-only", "2008-ulsan-korea"]);
  assert.deepEqual(parseSeason("<html><body>No events</body></html>"), []);
});

test("parseDates reads a range, a single day and a range across New Year", () => {
  assert.deepEqual(parseDates("Jul 18 - Jul 27 2025"), { start: "2025-07-18", end: "2025-07-27" });
  assert.deepEqual(parseDates("Sep 22 - Oct 01 2006"), { start: "2006-09-22", end: "2006-10-01" });
  assert.deepEqual(parseDates("Jul 4 2019"), { start: "2019-07-04", end: "2019-07-04" });
  assert.deepEqual(parseDates("Dec 28 - Jan 03 2008"), { start: "2007-12-28", end: "2008-01-03" });
  assert.throws(() => parseDates("TBA"), /unreadable dates "TBA"/);
});

test("parseEvent reads the name, dates, location and the results and ladder links", () => {
  assert.deepEqual(parseEvent(page("event-2025-fuerteventura.html")), {
    id: 375,
    name: "2025 Fuerteventura Grand Slam ******",
    start: "2025-07-18",
    end: "2025-07-27",
    location: "Sotavento, Fuerteventura",
    disciplines: ["Men Freestyle", "Women Freestyle", "Men Slalom x", "Women Slalom x"],
    resultsUrl: "/events/results/results/375?type=24",
    laddersUrl: "/events/elimination-ladder/elimination-ladders/375?type=25",
  });
  const sylt = parseEvent(page("event-2006-sylt.html"));
  assert.deepEqual([sylt.id, sylt.name, sylt.start, sylt.end, sylt.location], [115, "Colgate World Cup Sylt", "2006-09-22", "2006-10-01", "Westerland, Sylt, Germany"]);
  assert.deepEqual(sylt.disciplines, ["Men Wave", "Men Freestyle", "Women Wave", "Men"], "a discipline without a name shows as just Men");
  assert.throws(() => parseEvent("<html></html>"), /missing the event name/);
});

test("a one-discipline event names it on its event page, and its results page has no tabs", () => {
  const event = parseEvent(page("event-2012-podersdorf.html"));
  assert.deepEqual([event.id, event.start, event.disciplines], [189, "2012-04-27", ["Men Freestyle"]]);
  assert.deepEqual(parseResultTabs(page("results-2012-podersdorf.html")), []);
  assert.deepEqual(parseResults(page("results-2012-podersdorf.html")).map((e) => [e.place, e.name]), [[1, 'Jose "Gollito" Estredo'], [3, "Kiri Thode"], [4, "Steven Van Broeckhoven"]]);
});

test("parseResultTabs lists the division tabs with their links decoded", () => {
  const tabs = parseResultTabs(page("results-2025-fuerteventura.html"));
  assert.deepEqual(tabs.map((tab) => tab.label), ["Freestyle Men", "Freestyle Women", "Slalom X Men", "Slalom X Women"]);
  assert.equal(tabs[0].url, "/events/results/results/375?tx_pwaworldtour_eventresults%5BeventDiscipline%5D=1019&type=24&cHash=306d2ea1892d0f0e0d309d9ccd5b3676");
  assert.deepEqual(parseResultTabs(page("results-2006-sylt.html")).map((tab) => tab.label), ["Wave Men", "Freestyle Men", "Wave Women", "Slalom Men"]);
});

test("parseResults reads place, name, sail number and points, with tied places", () => {
  const entries = parseResults(page("results-2025-fuerteventura.html"));
  assert.equal(entries.length, 12);
  assert.deepEqual(entries[0], { place: 1, name: "Yentel Caers", sailNumber: "B-16", points: 10000 });
  assert.deepEqual(entries.slice(4, 8), [
    { place: 7, name: "Adrien Bosson", sailNumber: "F-296", points: 5245 },
    { place: 7, name: "Bodhi Kempen", sailNumber: "H-242", points: 5245 },
    { place: 9, name: 'Jose "Gollito" Estredo', sailNumber: "V-10", points: 4441 },
    { place: 9, name: "Balz Müller", sailNumber: "SUI-21", points: 4441 },
  ]);
});

test("parseResults gives [] for a division without results and fails on a page without a table", () => {
  assert.deepEqual(parseResults(page("results-2006-sylt.html")), []);
  assert.throws(() => parseResults("<div>nothing</div>"), /missing the results table/);
});

test("places come from the points when every place is 0, equal points sharing a place", () => {
  const entries = parseResults(page("results-2008-sotavento.html"));
  assert.deepEqual(entries.map((e) => e.place), [0, 0, 0, 0]);
  assert.deepEqual(placesFromPoints([...entries, { place: 0, name: "Late Entry", sailNumber: "X-1", points: 0 }]).map((e) => [e.place, e.name, e.points]), [
    [1, "Julien Quentel", 1242],
    [2, "Thomas Traversa", 1209],
    [3, "Levi Lenz", 1143],
    [4, "Omri Shapira", 0],
    [4, "Late Entry", 0],
  ]);
});

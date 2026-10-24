import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BASE, collect } from "../lib/pwa/collect.mjs";

const page = (name) => readFileSync(new URL(`fixtures/pwa/${name}`, import.meta.url), "utf8");
const listing = (...slugs) => slugs.map((slug) => `<a class="event-calendar-link" href="/events/detail/${slug}/">`).join("\n");
const results = (id, discipline) => `${BASE}/events/results/results/${id}?tx_pwaworldtour_eventresults%5BeventDiscipline%5D=${discipline}&type=24`;
const ladder = (id, cHash) => `${BASE}/events/elimination-ladder/elimination-ladders/375?tx_pwaworldtour_eliminationladders%5BeliminationLadder%5D=${id}&type=25&cHash=${cHash}`;

// The 2025 Fuerteventura pages from the fixtures, plus a 2006 event whose
// freestyle tab has no results.
const SITE = {
  [`${BASE}/events/2025/`]: listing("2025-fuerteventura-grand-slam"),
  [`${BASE}/events/detail/2025-fuerteventura-grand-slam/`]: page("event-2025-fuerteventura.html"),
  [`${BASE}/events/results/results/375?type=24`]: page("results-2025-fuerteventura.html"),
  [`${results(375, 1019)}&cHash=306d2ea1892d0f0e0d309d9ccd5b3676`]: page("results-2025-fuerteventura.html"),
  [`${BASE}/events/elimination-ladder/elimination-ladders/375?type=25`]: page("ladders-2025-fuerteventura.html"),
  [ladder(1015, "acb4e06628fb73ff5b5ad186f9ec9e01")]: page("ladder-2025-fuerteventura-women-double.html"),
  [ladder(1014, "27965ba0f08c1d11168455ca255b6a41")]: page("ladder-2025-fuerteventura-men.html"),
  [`${BASE}/events/2006/`]: listing("colgate-world-cup-sylt"),
  [`${BASE}/events/detail/colgate-world-cup-sylt/`]: page("event-2006-sylt.html"),
  [`${BASE}/events/results/results/115?type=24`]: page("results-2006-sylt.html"),
  [`${results(115, 369)}&cHash=594d38c6e9ae742a5270aab1f7778bed`]: page("results-2006-sylt.html"),
};

function fakeCrawler(pages) {
  const requests = [];
  return {
    requests,
    async get(url, { fresh = false } = {}) {
      requests.push({ url, fresh });
      if (url in pages) return pages[url];
      throw Object.assign(new Error(`${url} answered 404`), { status: 404 });
    },
  };
}

test("collect keeps freestyle events with their entries and freestyle ladders", async () => {
  const crawler = fakeCrawler(SITE);
  const { events, notes } = await collect(crawler, { seasons: [2006, 2025] });
  assert.equal(events.length, 1, "the 2006 event has no freestyle results");
  const [event] = events;
  assert.deepEqual(
    { ...event, divisions: Object.keys(event.divisions) },
    { season: 2025, id: 375, slug: "2025-fuerteventura-grand-slam", name: "2025 Fuerteventura Grand Slam ******", start: "2025-07-18", end: "2025-07-27", location: "Sotavento, Fuerteventura", divisions: ["men"] },
  );
  const men = event.divisions.men;
  assert.equal(men.entries.length, 12);
  assert.deepEqual(men.ladders.map((l) => [l.title, l.double, l.rounds.length]), [["Mens 2025 Fuerteventura Grand Slam Mens Freestyle elimination", false, 3]]);
  assert.deepEqual(notes, [
    "Colgate World Cup Sylt: no men's results",
    `${results(375, 1020)}&cHash=3ccb7937506ea874db4e3aa22884357b answered 404, skipped`,
    `${ladder(1016, "fc2b88d9fb946c96cd27160b308fb8a5")} answered 404, skipped`,
  ]);
  assert.ok(!crawler.requests.some((r) => r.url.includes("eliminationLadder%5D=983")), "the slalom ladder is never fetched");
});

test("only the refreshed season's pages are fetched fresh", async () => {
  const crawler = fakeCrawler(SITE);
  await collect(crawler, { seasons: [2006, 2025], refresh: 2025 });
  assert.ok(crawler.requests.filter((r) => r.url.includes("2006") || r.url.includes("/115")).every((r) => !r.fresh));
  assert.ok(crawler.requests.filter((r) => r.url.includes("/375")).every((r) => r.fresh));
});

test("places come from points when a division lists every place as 0", async () => {
  const site = {
    ...SITE,
    [`${BASE}/events/2025/`]: listing("2025-fuerteventura-grand-slam"),
    [`${results(375, 1019)}&cHash=306d2ea1892d0f0e0d309d9ccd5b3676`]: page("results-2008-sotavento.html"),
  };
  const { events, notes } = await collect(fakeCrawler(site), { seasons: [2025] });
  assert.deepEqual(events[0].divisions.men.entries.map((e) => e.place), [1, 2, 3, 4]);
  assert.ok(notes.includes("2025 Fuerteventura Grand Slam ******: men's places taken from points"));
});

test("a one-discipline event's entries come from its results page itself", async () => {
  const site = {
    [`${BASE}/events/2012/`]: listing("2012-podersdorf-austria"),
    [`${BASE}/events/detail/2012-podersdorf-austria/`]: page("event-2012-podersdorf.html"),
    [`${BASE}/events/results/results/189?type=24`]: page("results-2012-podersdorf.html"),
    [`${BASE}/events/elimination-ladder/elimination-ladders/189?type=25`]: page("ladders-2008-sotavento.html"),
  };
  const { events } = await collect(fakeCrawler(site), { seasons: [2012] });
  assert.deepEqual(events.map((e) => [e.id, Object.keys(e.divisions), e.divisions.men.entries.length]), [[189, ["men"], 3]]);
});

test("an HTTP error on a results page skips the event with a note", async () => {
  const site = { ...SITE };
  delete site[`${BASE}/events/results/results/375?type=24`];
  const crawler = fakeCrawler(site);
  crawler.get = async (url) => {
    if (url in site) return site[url];
    throw Object.assign(new Error(`${url} answered 500`), { status: 500 });
  };
  const { events, notes } = await collect(crawler, { seasons: [2025] });
  assert.deepEqual(events, []);
  assert.deepEqual(notes, [`${BASE}/events/results/results/375?type=24 answered 500, skipped`]);
});

test("a freestyle ladder link that serves another kind of ladder is skipped with a note", async () => {
  const site = { ...SITE, [ladder(1014, "27965ba0f08c1d11168455ca255b6a41")]: page("ladder-2015-fuerteventura-wrong.html") };
  const { events, notes } = await collect(fakeCrawler(site), { seasons: [2025] });
  assert.deepEqual(events[0].divisions.men.ladders, []);
  assert.ok(notes.includes('2025 Fuerteventura Grand Slam ******: the link "Mens 2025 Fuerteventura Grand Slam Mens Freestyle elimination" gave the ladder "2015 Sylt Elimination 1", skipped'), notes.join("\n"));
});

test("an index without links gives the ladder it holds itself", async () => {
  const site = { ...SITE, [`${BASE}/events/elimination-ladder/elimination-ladders/375?type=25`]: page("ladder-2025-fuerteventura-men.html") };
  const { events } = await collect(fakeCrawler(site), { seasons: [2025] });
  assert.deepEqual(events[0].divisions.men.ladders.map((l) => l.rounds.length), [3]);
});

test("a page with an unexpected shape stops collect with its URL", async () => {
  const site = { ...SITE, [`${BASE}/events/detail/2025-fuerteventura-grand-slam/`]: "<html>gone</html>" };
  await assert.rejects(collect(fakeCrawler(site), { seasons: [2025] }), /https:\/\/www.pwaworldtour.com\/events\/detail\/2025-fuerteventura-grand-slam\/: missing the event name/);
});

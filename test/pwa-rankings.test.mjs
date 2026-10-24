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

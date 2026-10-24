import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLadder, parseResults } from "../lib/pwa/parse.mjs";
import { buildTour, summarize } from "../tools/pwa.mjs";

const page = (name) => readFileSync(new URL(`fixtures/pwa/${name}`, import.meta.url), "utf8");

// The 2025 Fuerteventura men's results and ladder, and an earlier event with
// placings only.
function rawEvents() {
  const ladder = parseLadder(page("ladder-2025-fuerteventura-men.html"));
  return [
    { season: 2025, id: 375, slug: "2025-fuerteventura-grand-slam", name: "2025 Fuerteventura Grand Slam ******", start: "2025-07-18", end: "2025-07-27", location: "Sotavento, Fuerteventura", divisions: { men: { entries: parseResults(page("results-2025-fuerteventura.html")), ladders: [{ title: ladder.title, double: ladder.double, rounds: ladder.rounds }] } } },
    { season: 2012, id: 198, slug: "2012-sotavento-fuerteventura", name: "2012 Sotavento Fuerteventura", start: "2012-07-20", end: "2012-07-29", location: "Sotavento, Fuerteventura", divisions: { men: { entries: [{ place: 1, name: 'Jose "Gollito" Estredo', sailNumber: "V-10", points: 10000 }, { place: 2, name: "Balz Müller", sailNumber: "SUI-21", points: 8500 }], ladders: [] } } },
  ];
}

test("buildTour writes a file per season, the riders with pseudonyms, and the ratings", () => {
  const built = buildTour(rawEvents());
  assert.deepEqual(Object.keys(built.files), ["seasons/2012.json", "seasons/2025.json", "riders.json", "ratings.json"]);
  const season = JSON.parse(built.files["seasons/2025.json"]);
  assert.equal(season.season, 2025);
  assert.deepEqual(Object.keys(season.events[0]), ["id", "slug", "name", "start", "end", "location", "divisions"]);
  assert.deepEqual(season.events[0].divisions.men.ladders[0].rounds[0], [{ heat: "1 a", riders: ["m:antoine-albert", "m:nicolo-di-marco"], ranks: [1, 2] }]);
  const riders = JSON.parse(built.files["riders.json"]);
  assert.deepEqual(riders.find((r) => r.id === "m:balz-muller"), { id: "m:balz-muller", division: "men", name: "Balz Müller", pseudonym: "Balt Möller", sailNumbers: ["SUI-21"] });
  assert.equal(riders.find((r) => r.id === "m:jose-estredo").pseudonym, "Josa Astredo");
  const ratings = JSON.parse(built.files["ratings.json"]);
  const going = ratings.events[375].men;
  assert.ok(going["m:jose-estredo"].rating > going["m:yentel-caers"].rating, "Gollito won in 2012; Caers is new");
  assert.ok(going["m:balz-muller"].rating < going["m:yentel-caers"].rating, "Müller lost to Gollito in 2012");
  assert.deepEqual(built.unmatched, []);
});

test("buildTour follows aliases and pseudonym fixes, and gives identical files every time", () => {
  const first = buildTour(rawEvents(), { aliases: { "m:jose-estredo": "m:gollito" }, fixes: { "m:balz-muller": "Baltasar Mollar" } });
  const riders = JSON.parse(first.files["riders.json"]);
  assert.ok(riders.some((r) => r.id === "m:gollito"));
  assert.equal(riders.find((r) => r.id === "m:balz-muller").pseudonym, "Baltasar Mollar");
  assert.deepEqual(buildTour(rawEvents(), { aliases: { "m:jose-estredo": "m:gollito" }, fixes: { "m:balz-muller": "Baltasar Mollar" } }).files, first.files);
});

test("the summary counts seasons, unmatched sailors and the check", () => {
  const built = buildTour(rawEvents());
  const text = summarize(built, ["a note"]);
  assert.match(text, /2025 +1 +12 +4/);
  assert.match(text, /Unmatched ladder sailors: 0 of 8 \(0.0%\)/);
  assert.match(text, /  a note/);
  assert.match(text, /Check on 2022–2026: favourite won/);
});

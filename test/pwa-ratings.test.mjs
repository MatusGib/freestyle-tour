import { test } from "node:test";
import assert from "node:assert/strict";
import { newRider, ratePeriod } from "../lib/pwa/glicko.mjs";
import { buildRatings, gamesFor, runRatings, scorePredictions, tune } from "../lib/pwa/ratings.mjs";

const SETTINGS = { tau: 0.5, newcomerRating: 1400, placingsWeight: 4 };
const entries = (...ids) => ids.map((rider, i) => ({ rider, name: rider, sailNumber: "", place: i + 1, points: 0 }));
const heat = (winner, loser) => ({ heat: "1", riders: [winner, loser], ranks: [1, 2] });
const ladderEvent = (id, season, ids, heats) => ({ id, season, start: `${season}-01-0${id}`, divisions: { men: { entries: entries(...ids), ladders: [{ title: "L", double: false, rounds: [heats] }] } } });
const placingsEvent = (id, season, ids) => ({ id, season, start: `${season}-01-0${id}`, divisions: { men: { entries: entries(...ids), ladders: [] } } });

test("ladder heats give one game each, leaving out heats with an unmatched sailor", () => {
  const division = { entries: entries("a", "b", "c"), ladders: [{ rounds: [[heat("a", "b"), { heat: "2", riders: ["c", { surname: "X", sailNumber: "" }], ranks: [1, 2] }], [{ heat: "3", riders: ["b", "c"], ranks: [2, 1] }]] }] };
  assert.deepEqual(gamesFor(division, 4), [
    { winner: "a", loser: "b", weight: 1, heat: true },
    { winner: "c", loser: "b", weight: 1, heat: true },
  ]);
});

test("without ladder games, every pair of places is a game, so each rider's event counts like w heats", () => {
  const games = gamesFor({ entries: entries("a", "b", "c"), ladders: [{ rounds: [[]] }] }, 4);
  assert.deepEqual(games, [
    { winner: "a", loser: "b", weight: 2, heat: false },
    { winner: "a", loser: "c", weight: 2, heat: false },
    { winner: "b", loser: "c", weight: 2, heat: false },
  ]);
  for (const id of ["a", "b", "c"]) assert.equal(games.filter((g) => g.winner === id || g.loser === id).reduce((sum, g) => sum + g.weight, 0), 4);
});

test("the rating going into an event leaves that event out", () => {
  const events = [ladderEvent(1, 2015, ["a", "b"], [heat("a", "b")]), ladderEvent(2, 2015, ["a", "b", "c"], [heat("b", "a")])];
  const { before } = runRatings(events, SETTINGS);
  assert.deepEqual(before[1].men.get("a"), newRider(1400));
  const afterFirst = ratePeriod(newRider(1400), [{ opponent: newRider(1400), score: 1, weight: 1 }], 0.5);
  assert.deepEqual(before[2].men.get("a"), afterFirst);
  assert.deepEqual(before[2].men.get("c"), newRider(1400), "a newcomer");
});

test("a rider who misses an event comes back with a wider deviation", () => {
  const events = [ladderEvent(1, 2015, ["a", "b"], [heat("a", "b")]), ladderEvent(2, 2015, ["a", "c"], [heat("a", "c")]), ladderEvent(3, 2015, ["a", "b"], [heat("a", "b")])];
  const { before } = runRatings(events, SETTINGS);
  const afterFirst = ratePeriod(newRider(1400), [{ opponent: newRider(1400), score: 0, weight: 1 }], 0.5);
  assert.deepEqual(before[3].men.get("b"), ratePeriod(afterFirst, [], 0.5));
  assert.ok(before[3].men.get("b").rd > afterFirst.rd);
});

test("only ladder games are predictions, each the chance its winner was given", () => {
  const events = [placingsEvent(1, 2013, ["a", "b"]), ladderEvent(2, 2014, ["a", "b"], [heat("b", "a")])];
  const { before, predictions } = runRatings(events, SETTINGS);
  assert.equal(predictions.length, 1);
  assert.equal(predictions[0].season, 2014);
  assert.ok(predictions[0].p < 0.5, "b won though a had finished ahead of b before");
  assert.ok(before[2].men.get("a").rating > before[2].men.get("b").rating);
});

test("scorePredictions counts the favourite's wins, an even chance as half, and the mean log loss", () => {
  const predictions = [{ season: 2022, p: 0.8 }, { season: 2023, p: 0.3 }, { season: 2024, p: 0.5 }, { season: 2019, p: 0.9 }];
  const score = scorePredictions(predictions, [2022, 2026]);
  assert.equal(score.heats, 3);
  assert.equal(score.hitRate, 0.5);
  assert.ok(Math.abs(score.logLoss - -(Math.log(0.8) + Math.log(0.3) + Math.log(0.5)) / 3) < 1e-12);
  assert.deepEqual(scorePredictions(predictions, [2030, 2031]), { heats: 0, hitRate: 0, logLoss: 0 });
});

test("tune keeps the first settings when nothing tells them apart", () => {
  assert.deepEqual(tune([placingsEvent(1, 2010, ["a", "b"])]), { tau: 0.3, newcomerRating: 1300, placingsWeight: 2 });
});

test("tune picks the settings with the lowest log loss on 2014-2021", () => {
  // a keeps beating b, so a long memory of it predicts best.
  const events = [1, 2, 3, 4, 5, 6].map((id) => ladderEvent(id, 2015, ["a", "b"], [heat("a", "b")]));
  const chosen = tune(events);
  const loss = (settings) => scorePredictions(runRatings(events, settings).predictions, [2014, 2021]).logLoss;
  for (const tau of [0.3, 0.5, 0.75, 1.0]) for (const newcomerRating of [1300, 1400, 1500]) {
    assert.ok(loss(chosen) <= loss({ tau, newcomerRating, placingsWeight: 2 }));
  }
});

test("buildRatings writes the settings, the check and rounded ratings by event and rider", () => {
  const events = [ladderEvent(1, 2022, ["b", "a"], [heat("a", "b")]), ladderEvent(2, 2023, ["a", "b"], [heat("a", "b")])];
  const built = buildRatings(events);
  assert.deepEqual(Object.keys(built), ["settings", "check", "events"]);
  assert.deepEqual(built.check, { heats: 2, hitRate: 0.75, logLoss: built.check.logLoss });
  assert.deepEqual(Object.keys(built.events), ["1", "2"]);
  assert.deepEqual(Object.keys(built.events[1].men), ["a", "b"], "riders sorted by id");
  const a = built.events[2].men.a;
  assert.equal(a.rating, Number(a.rating.toFixed(2)));
  assert.equal(a.volatility, Number(a.volatility.toFixed(6)));
});

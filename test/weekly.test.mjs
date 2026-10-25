import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { averageScore, heatTarget, seedOf } from "../lib/ai/score.mjs";
import { createStore } from "../server/store.mjs";
import { loadTour } from "../server/tour.mjs";
import { DEFAULT_WIND, lookFor, opponentFor, recordResult, recordRoom, roomIdsFor, weekOf } from "../server/weekly.mjs";
import { WEEK, tempDir, writeTour } from "./helpers.mjs";

const WEEK_START = 1792360800000;

function tour(t) {
  const dir = tempDir(t);
  writeTour(dir);
  return loadTour(dir);
}

test("each week picks one event, the same all week, from all events in id order", (t) => {
  const data = tour(t);
  const ids = [300, 375, 378];
  const week = weekOf(data, WEEK_START);
  assert.equal(week.event.id, ids[seedOf("weekly", WEEK_START) % 3]);
  assert.equal(weekOf(data, WEEK_START).event.id, week.event.id);
  const picks = new Set(Array.from({ length: 12 }, (_, i) => weekOf(data, WEEK_START + i * WEEK).event.id));
  assert.ok(picks.size > 1, "the event changes from week to week");
});

test("events without a single winner are left out, and the rest go in id order", () => {
  const event = (id, places) => [id, { id, divisions: { men: { entries: places.map((place) => ({ place })) } } }];
  const data = { events: new Map([event(378, [1, 2]), event(363, [1, 1, 3]), event(300, [1])]) };
  const ids = [300, 378];
  for (let i = 0; i < 12; i++) {
    const weekStart = WEEK_START + i * WEEK;
    assert.equal(weekOf(data, weekStart).event.id, ids[seedOf("weekly", weekStart) % 2]);
  }
});

test("the opponent is the division's winner, aiming for a target seeded by the week", (t) => {
  const data = tour(t);
  const week = { weekStart: WEEK_START, event: data.events.get(378) };
  const men = opponentFor(data, week, "men");
  assert.deepEqual({ ...men, target: undefined }, { id: "m:yentel-caers", nickname: "Yenter Ceers", appearance: lookFor("men"), rating: 1938, average: Math.round(averageScore(1938) * 100) / 100, target: undefined });
  assert.equal(men.target, Math.round(heatTarget(1938, seedOf("m:yentel-caers", 378, WEEK_START, "super-final")) * 100) / 100);
  assert.equal(opponentFor(data, week, "women").nickname, "Sarah-Quito Uffringa");
  assert.equal(opponentFor(data, week, "women").appearance.bodyType, "female");
  assert.equal(opponentFor(data, { weekStart: WEEK_START, event: data.events.get(375) }, "women"), null);
});

test("room ids are those whose wind matches, in order, under the given prefix", () => {
  const knotsOf = (id) => 15 + (Number(id.split("-").at(-1)) % 5);
  const roomConditions = (id) => ({ seed: 1, knots: knotsOf(id), gustKnots: Number(id.split("-").at(-1)) % 2 ? 5 : 0 });
  const ids = roomIdsFor(roomConditions, DEFAULT_WIND, "super-final-378-99");
  const first = [ids.next().value, ids.next().value, ids.next().value];
  assert.deepEqual(first, ["super-final-378-99-2", "super-final-378-99-12", "super-final-378-99-22"]);
  for (const id of first) assert.deepEqual(roomConditions(id), { seed: 1, ...DEFAULT_WIND });
});

test("results keep each week's best score and whether you won; the prize comes with the first win", (t) => {
  const store = createStore(join(tempDir(t), "weekly.json"), { weeks: {}, prize: null });
  const result = (score, won, at) => recordResult(store, { weekStart: WEEK_START, event: 378, division: "men", score, won, at });
  result(20, false, 1);
  result(15, false, 2);
  assert.deepEqual(store.data, { weeks: { [WEEK_START]: { event: 378, division: "men", best: 20, won: false } }, prize: null });
  result(41, true, 3);
  result(30, false, 4);
  assert.deepEqual(store.data.weeks[WEEK_START], { event: 378, division: "men", best: 41, won: true });
  recordResult(store, { weekStart: WEEK_START + WEEK, event: 300, division: "men", score: 45, won: true, at: 5 });
  assert.deepEqual(store.data.prize, { earnedAt: 3 });
});

test("a finished room is recorded as a win only with outcome 1, and a forfeit not at all", (t) => {
  const store = createStore(join(tempDir(t), "weekly.json"), { weeks: {}, prize: null });
  const meta = { weekStart: WEEK_START, event: 378, division: "men" };
  const room = (outcome, score, forfeited = false) => ({ meta, outcome, you: { score, forfeited } });
  recordRoom(store, room("2", 0, true), 1);
  recordRoom(store, { ...room("1", 50), meta: null }, 2);
  assert.deepEqual(store.data.weeks, {}, "forfeits and rooms without a super final aren't recorded");
  recordRoom(store, room("2", 25), 3);
  recordRoom(store, room("draw", 30), 4);
  assert.deepEqual(store.data.weeks[WEEK_START], { event: 378, division: "men", best: 30, won: false });
  recordRoom(store, room("1", 33), 5);
  assert.deepEqual([store.data.weeks[WEEK_START].won, store.data.prize], [true, { earnedAt: 5 }]);
});

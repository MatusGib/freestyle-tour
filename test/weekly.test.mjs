import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { seedOf } from "../lib/ai/score.mjs";
import { createStore } from "../server/store.mjs";
import { loadTour } from "../server/tour.mjs";
import { LOOK, WIND, championRooms, checkChampion, opponentFor, recordResult, recordRoom, weekOf } from "../server/weekly.mjs";
import { ROOT, WEEK, tempDir } from "./helpers.mjs";

const WEEK_START = 1792360800000;
const event = (id) => ({ id, name: `Event ${id}`, when: "July 2026", place: "Somewhere", podium: ["A", "B", "C"], story: `Story ${id}.` });
const CHAMPION = { rider: "m:lennart-neubauer", name: "Lennart Neubauer", rating: 1946, target: 45.5, events: [event("a"), event("b"), event("c")] };

test("each week picks one of the champion's events, the same all week, in the order listed", () => {
  const week = weekOf(CHAMPION, WEEK_START);
  assert.equal(week.event, CHAMPION.events[seedOf("weekly", WEEK_START) % 3]);
  assert.equal(weekOf(CHAMPION, WEEK_START).event, week.event);
  const picks = new Set(Array.from({ length: 12 }, (_, i) => weekOf(CHAMPION, WEEK_START + i * WEEK).event.id));
  assert.ok(picks.size > 1, "the event changes from week to week");
});

test("the opponent is the champion under his real name, aiming for the champion's target", () => {
  assert.deepEqual(opponentFor(CHAMPION), { id: "m:lennart-neubauer", nickname: "Lennart Neubauer", appearance: LOOK, rating: 1946, target: 45.5 });
});

test("the champion wears the Red Bull helmet and sails a Severne Freek, on a plain board", () => {
  assert.deepEqual([LOOK.helmet, LOOK.sail, LOOK.board], ["redbull", "severne-freek-cc1", "orange"]);
});

test("the champion's rooms are those with his gusts, in order, at 21 kt", () => {
  const roomConditions = (id) => {
    const n = Number(id.split("-").at(-1));
    return { seed: n, knots: 15 + (n % 5), gustKnots: n % 2 ? 6 : 0 };
  };
  const rooms = championRooms(roomConditions, "2025-sylt", 99);
  assert.deepEqual([rooms.next().value, rooms.next().value], [
    { id: "champion-2025-sylt-99-1", conditions: { seed: 1, knots: 21, gustKnots: 6 } },
    { id: "champion-2025-sylt-99-3", conditions: { seed: 3, knots: 21, gustKnots: 6 } },
  ]);
  assert.deepEqual(WIND, { knots: 21, gustKnots: 6 });
});

test("results keep each week's best and whether you won; a win is your last win, and the first earns the prize", (t) => {
  const store = createStore(join(tempDir(t), "champion.json"), { weeks: {}, prize: null });
  const result = (score, opponentScore, won, at) => recordResult(store, { weekStart: WEEK_START, event: "2025-sylt", score, opponentScore, won, at });
  result(20, 47, false, 1);
  assert.deepEqual(store.data, { weeks: { [WEEK_START]: { event: "2025-sylt", best: 20, won: false } }, prize: null });
  result(48, 47, true, 2);
  result(30, 46, false, 3);
  assert.deepEqual(store.data.weeks[WEEK_START], { event: "2025-sylt", best: 48, won: true });
  assert.deepEqual(store.data.lastWin, { at: 2, event: "2025-sylt", score: 48, opponentScore: 47 });
  result(49, 46.5, true, 4);
  assert.deepEqual([store.data.lastWin.at, store.data.prize], [4, { earnedAt: 2 }]);
});

test("a finished room is recorded as a win only with outcome 1, and a forfeit not at all", (t) => {
  const store = createStore(join(tempDir(t), "champion.json"), { weeks: {}, prize: null });
  const meta = { weekStart: WEEK_START, event: "2025-sylt" };
  const room = (outcome, score, forfeited = false) => ({ meta, outcome, you: { score, forfeited }, ai: { score: 47 } });
  recordRoom(store, room("2", 0, true), 1);
  recordRoom(store, { ...room("1", 50), meta: null }, 2);
  assert.deepEqual(store.data.weeks, {}, "forfeits and rooms without a challenge aren't recorded");
  recordRoom(store, room("draw", 47), 3);
  assert.deepEqual([store.data.weeks[WEEK_START].won, store.data.lastWin, store.data.prize], [false, undefined, null]);
  recordRoom(store, room("1", 48), 4);
  assert.deepEqual(store.data.lastWin, { at: 4, event: "2025-sylt", score: 48, opponentScore: 47 });
});

test("server/champion.json agrees with the tour data where the tour data has the event", () => {
  const champion = JSON.parse(readFileSync(join(ROOT, "server", "champion.json"), "utf8"));
  const tour = loadTour(join(ROOT, "tour"));
  assert.equal(new Set(champion.events.map((e) => e.id)).size, champion.events.length, "event ids are unique");
  assert.equal(champion.target, 45.5, "the AI lands about half a point under it: around 45");
  const inTour = champion.events.filter((e) => e.tourId);
  assert.ok(inTour.length >= 3);
  for (const e of inTour) {
    const entries = tour.events.get(e.tourId).divisions.men.entries;
    assert.deepEqual(e.podium, entries.slice(0, 3).map((x) => tour.riders.get(x.rider).name), e.name);
    assert.equal(entries[0].rider, champion.rider, `${champion.name} won ${e.name}`);
  }
  const latest = inTour.at(-1).tourId;
  assert.equal(champion.rating, Math.round(tour.ratings.events[latest].men[champion.rider].rating), "his rating going into his latest event in the tour data");
});

test("the champion's rooms follow his wind: its knots, and rooms with its gusts", () => {
  const roomConditions = (id) => {
    const n = Number(id.split("-").at(-1));
    return { seed: n, knots: 15, gustKnots: n % 2 ? 6 : 0 };
  };
  const rooms = championRooms(roomConditions, "2025-sylt", 99, { knots: 18, gustKnots: 0 });
  assert.deepEqual(rooms.next().value, { id: "champion-2025-sylt-99-0", conditions: { seed: 0, knots: 18, gustKnots: 0 } });
});

test("the champion's wind and target must be ones his rooms can sail", () => {
  const champion = { target: 45.5, wind: { knots: 21, gustKnots: 6 } };
  assert.equal(checkChampion(champion), champion);
  assert.throws(() => checkChampion({ ...champion, wind: { knots: 29, gustKnots: 6 } }), { path: "champion.wind.knots" });
  assert.throws(() => checkChampion({ ...champion, wind: { knots: 21, gustKnots: 3 } }), { path: "champion.wind.gustKnots", message: /0, 4, 5 or 6/ });
  assert.throws(() => checkChampion({ ...champion, target: 70 }), { path: "champion.target" });
});

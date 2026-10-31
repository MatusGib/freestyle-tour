import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOLPHINS_AFTER, DOLPHINS_LEAVE, LAND, START, WHALE_AFTER, WHALE_GONE, isCalm, isPractice, isSailing, nextSea, sense,
} from "../mods/sealife/sealife.js";

const SAILING = { air: false, sliding: false, landing: false, crashTime: 0, dragging: false };
const practice = (over = {}) => ({ active: true, tutorial: null, competitionClock: null, state: { heat: { enabled: false }, ...SAILING }, ...over });
const controls = (keys = [], stick = { x: 0, y: 0 }) => ({ keys: new Set(keys), stick });

// Sailing in practice with nothing pressed.
const CALM = { practice: true, calm: true, sailing: true, loading: false, airborne: false, crashed: false };
// Runs nextSea every 0.05 s from `from` to `to`, with the sense at each time.
function run(to, senseAt = () => CALM, { from = 0, sea = START } = {}) {
  const hits = [];
  for (let i = Math.round(from * 20); i <= Math.round(to * 20); i++) {
    const time = i / 20;
    const next = nextSea(sea, senseAt(time), time);
    if (next.hit) hits.push(time);
    sea = next.sea;
  }
  return { sea, hits };
}
const near = (a, b) => Math.abs(a - b) < .06;

test("isPractice is true only on the water with no heat, tutorial or 1v1 clock", () => {
  assert.equal(isPractice(practice()), true);
  assert.equal(isPractice(practice({ active: false })), false);
  assert.equal(isPractice(practice({ tutorial: {} })), false);
  assert.equal(isPractice(practice({ competitionClock: () => 0 })), false);
  assert.equal(isPractice(practice({ state: { heat: { enabled: true } } })), false);
});

test("isCalm means no key held and the touch stick at rest", () => {
  assert.equal(isCalm(controls()), true);
  assert.equal(isCalm(controls(["KeyD"])), false);
  assert.equal(isCalm(controls([], { x: .3, y: 0 })), false);
  assert.equal(isCalm(controls([], { x: 0, y: -.2 })), false);
});

test("isSailing means on the water and upright", () => {
  assert.equal(isSailing(SAILING), true);
  for (const flag of ["air", "sliding", "landing", "dragging"]) assert.equal(isSailing({ ...SAILING, [flag]: true }), false, flag);
  assert.equal(isSailing({ ...SAILING, crashTime: 3 }), false);
});

test("sense reads practice, calm, sailing, a jump being loaded, the air and a crash from the game", () => {
  assert.deepEqual(sense({ ...practice(), controls: controls() }), CALM);
  const loading = sense({ ...practice(), controls: controls(["Space"]) });
  assert.equal(loading.loading, true);
  assert.equal(loading.calm, false);
  const flying = sense({ ...practice({ state: { heat: { enabled: false }, ...SAILING, air: true } }), controls: controls() });
  assert.equal(flying.airborne, true);
  assert.equal(flying.sailing, false);
  const crashed = sense({ ...practice({ state: { heat: { enabled: false }, ...SAILING, crashTime: 2 } }), controls: controls() });
  assert.equal(crashed.crashed, true);
});

test("the dolphins come after 10 s of sailing with nothing pressed", () => {
  assert.equal(DOLPHINS_AFTER, 10);
  assert.equal(run(9.95).sea.dolphins, null);
  assert.deepEqual(run(10).sea.dolphins, { start: 10, leave: null });
});

test("steering restarts the count for the whale, but the dolphins stay", () => {
  const steerAt15 = (time) => (time === 15 ? { ...CALM, calm: false } : CALM);
  for (const at of [12, 20, 30, 34.9]) {
    const { sea } = run(at, steerAt15);
    assert.deepEqual(sea.dolphins, { start: 10, leave: null }, `at ${at} s`);
    assert.equal(sea.whale, null, `at ${at} s`);
  }
  assert.ok(near(run(35.1, steerAt15).sea.whale.start, 35.05));
});

test("loading a jump sends the dolphins away", () => {
  const loadAt12 = (time) => (time >= 12 && time < 12.5 ? { ...CALM, calm: false, loading: true } : CALM);
  assert.deepEqual(run(12, loadAt12).sea.dolphins, { start: 10, leave: 12 });
  assert.deepEqual(run(12 + DOLPHINS_LEAVE - .05, loadAt12).sea.dolphins, { start: 10, leave: 12 });
  assert.equal(run(12 + DOLPHINS_LEAVE + .05, loadAt12).sea.dolphins, null);
});

test("a crash sends the dolphins away", () => {
  const crashAt13 = (time) => (time >= 13 ? { ...CALM, sailing: false, crashed: true } : CALM);
  assert.deepEqual(run(14, crashAt13).sea.dolphins, { start: 10, leave: 13 });
});

test("the whale comes after 20 s of sailing with nothing pressed", () => {
  assert.equal(WHALE_AFTER, 20);
  assert.equal(run(19.95).sea.whale, null);
  assert.deepEqual(run(20).sea.whale, { start: 20, outcome: null });
});

test("the whale lands on a rider on the water once", () => {
  const { sea, hits } = run(20 + WHALE_GONE - .1);
  assert.equal(hits.length, 1);
  assert.ok(near(hits[0], 20 + LAND), `landed at ${hits[0]}`);
  assert.equal(sea.whale.outcome, "hit");
});

test("the whale misses a rider in the air or already down", () => {
  for (const when of [{ ...CALM, calm: false, sailing: false, airborne: true }, { ...CALM, sailing: false, crashed: true }]) {
    const away = (time) => (time >= 22 && time < 23 ? when : CALM);
    const { sea, hits } = run(23, away);
    assert.deepEqual(hits, []);
    assert.equal(sea.whale.outcome, "missed");
  }
});

test("the whale goes, and the next one needs another 20 s", () => {
  assert.equal(run(20 + WHALE_GONE + .05).sea.whale, null);
  assert.equal(run(20 + LAND + WHALE_AFTER - .1).sea.whale, null);
  assert.ok(run(20 + LAND + WHALE_AFTER + .1).sea.whale);
});

test("out of practice, the dolphins and the whale are gone at once", () => {
  const menuAt21 = (time) => (time >= 21 ? { ...CALM, practice: false } : CALM);
  assert.ok(run(20.9, menuAt21).sea.whale);
  assert.deepEqual(run(21, menuAt21).sea, START);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOLPHINS, DOLPHINS_AFTER, DOLPHINS_LEAVE, LAND, START, WHALE_AFTER, WHALE_GONE, WHALE_SPLASH, aim, dolphinPose, dolphinSpot,
  isCalm, isPractice, isSailing, nextSea, sense, whaleSpot, whaleSplash,
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

// Times from t to `to` every 0.01 s.
const times = (from, to) => Array.from({ length: Math.round((to - from) * 100) }, (_, i) => from + i / 100);
const highest = (spot, from, to) => Math.max(...times(from, to).map((t) => spot(t)?.lift ?? -Infinity));
const steps = (spot, from, to) => times(from, to).map((t) => [spot(t), spot(t + .01)]).filter(([a, b]) => a && b)
  .map(([a, b]) => Math.hypot(b.forward - a.forward, b.side - a.side, b.lift - a.lift));

test("the dolphins swim in from behind and below", () => {
  for (const dolphin of DOLPHINS) {
    assert.equal(dolphinSpot(dolphin, dolphin.delay), null);
    const early = dolphinSpot(dolphin, dolphin.delay + .05);
    assert.ok(early.forward < dolphin.forward - 10 && early.lift < -1.5, JSON.stringify(early));
  }
});

test("the dolphins swim beside the rider, two on one side and one on the other, fins showing", () => {
  assert.equal(DOLPHINS.filter((d) => d.side > 0).length, 2);
  assert.equal(DOLPHINS.filter((d) => d.side < 0).length, 1);
  for (const dolphin of DOLPHINS) {
    for (const t of times(dolphin.first, 12)) {
      const spot = dolphinSpot(dolphin, t);
      assert.equal(spot.side, dolphin.side);
      assert.ok(spot.forward >= dolphin.forward - .01 && spot.forward <= dolphin.forward + 2.51, `${t}: ${spot.forward}`);
      assert.ok(spot.lift > -.32, `${t}: ${spot.lift}`);
    }
  }
});

test("each dolphin leaps every few seconds, at least 1.2 m high, in turn with the others", () => {
  assert.equal(new Set(DOLPHINS.map((d) => d.first)).size, DOLPHINS.length);
  for (const dolphin of DOLPHINS) {
    const lifts = times(0, 12).map((t) => dolphinSpot(dolphin, t)?.lift ?? -9);
    const leaps = lifts.filter((lift, i) => i && lift > .5 && lifts[i - 1] <= .5).length;
    assert.ok(leaps >= 3, `${leaps} leaps`);
    assert.ok(highest((t) => dolphinSpot(dolphin, t), dolphin.first, dolphin.first + 1.5) > 1.2);
  }
});

test("a leaping dolphin points its nose up leaving the water and down coming back", () => {
  const dolphin = DOLPHINS[0];
  assert.ok(dolphinPose(dolphin, dolphin.first + .1, null, 8).pitch > .3);
  assert.ok(dolphinPose(dolphin, dolphin.first + 1, null, 8).pitch < -.3);
});

test("the dolphins move smoothly, swimming in, leaping and leaving", () => {
  for (const dolphin of DOLPHINS) {
    for (const leave of [null, 11.3]) {
      const most = Math.max(...steps((t) => dolphinSpot(dolphin, t, leave), dolphin.delay, 15));
      assert.ok(most < .15, `dolphin ${DOLPHINS.indexOf(dolphin)}, leaving at ${leave}: ${most} m in 0.01 s`);
    }
  }
});

test("a dolphin leaping when the rider loads a jump finishes its leap, then dives and is gone", () => {
  const dolphin = DOLPHINS[0], leave = dolphin.first + .5;
  assert.ok(dolphinSpot(dolphin, dolphin.first + .8, leave).lift > 1);
  const lifts = times(leave, leave + DOLPHINS_LEAVE).map((t) => dolphinSpot(dolphin, t, leave)?.lift).filter((lift) => lift !== undefined);
  assert.ok(Math.min(...lifts) < -2);
  assert.equal(dolphinSpot(dolphin, leave + DOLPHINS_LEAVE, leave), null);
});

test("a dolphin under water when the rider loads a jump doesn't come up again", () => {
  for (const dolphin of DOLPHINS) {
    const leave = dolphin.first + 1.6;
    assert.ok(highest((t) => dolphinSpot(dolphin, t, leave), leave, leave + DOLPHINS_LEAVE) < -.15);
    assert.equal(dolphinSpot(dolphin, leave + DOLPHINS_LEAVE, leave), null);
  }
});

test("the whale surfaces 8 m to the side, leaps high and belly-flops flat on the landing point", () => {
  assert.equal(whaleSpot(-.01), null);
  const surfacing = whaleSpot(0);
  assert.ok(surfacing.across === 8 && surfacing.lift < -2);
  assert.ok(highest(whaleSpot, 0, LAND) > 4);
  const flop = whaleSpot(LAND);
  assert.ok(Math.abs(flop.across) < .01 && Math.abs(flop.lift) < .05 && Math.abs(flop.pitch) < .05, JSON.stringify(flop));
});

test("the whale sinks away after its belly flop", () => {
  assert.ok(whaleSpot(WHALE_GONE - .05).lift < -3);
  assert.equal(whaleSpot(WHALE_GONE), null);
});

test("the whale moves smoothly", () => {
  const most = Math.max(...times(0, WHALE_GONE - .01).map((t) => {
    const a = whaleSpot(t), b = whaleSpot(t + .01);
    return b ? Math.hypot(b.across - a.across, b.lift - a.lift) + Math.abs(b.pitch - a.pitch) : 0;
  }));
  assert.ok(most < .2, `${most} in 0.01 s`);
});

test("the whale aims at where the rider will be when it lands", () => {
  const rider = { x: 10, z: 5, vx: 8, vz: -2 };
  const at = aim(rider, { start: 100 }, 101);
  assert.ok(Math.abs(at.x - (10 + 8 * (LAND - 1))) < 1e-9 && Math.abs(at.z - (5 - 2 * (LAND - 1))) < 1e-9);
  assert.deepEqual(aim(rider, { start: 100 }, 100 + LAND + 1), { x: 10, z: 5 });
});

test("the whale's splash throws big droplets up and out in a ring, which fall back and shrink away", () => {
  const start = whaleSplash(0, 12, 0), mid = whaleSplash(0, 12, WHALE_SPLASH * .3), end = whaleSplash(0, 12, WHALE_SPLASH);
  assert.ok(Math.hypot(start.x, start.y, start.z) < 1e-9);
  assert.ok(mid.y > 1.5 && Math.hypot(mid.x, mid.z) > 1);
  assert.ok(end.y < 0 && end.size === 0);
  const ring = Array.from({ length: 12 }, (_, i) => whaleSplash(i, 12, WHALE_SPLASH * .3));
  assert.ok(Math.abs(ring.reduce((sum, d) => sum + d.x, 0)) < 1e-9 && Math.abs(ring.reduce((sum, d) => sum + d.z, 0)) < 1e-9);
});

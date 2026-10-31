import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOLPHINS, DOLPHINS_AFTER, DOLPHINS_LEAVE, LAND, START, WHALE_AFTER, WHALE_GONE, WHALE_SPLASH, aim, dolphinPose, dolphinSplashes, dolphinSpot,
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

// When a dolphin rises through the surface into a leap, and when it comes back in.
const crossings = (dolphin, from, to, leave = null, up = true) => times(from, to).filter((t) => {
  const a = dolphinSpot(dolphin, t, leave), b = dolphinSpot(dolphin, t + .01, leave);
  return a && b && (up ? a.lift <= 1e-9 && b.lift > 1e-9 : a.lift > 1e-9 && b.lift <= 1e-9);
});
const lowest = (spot, from, to) => Math.min(...times(from, to).map((t) => spot(t)?.lift ?? Infinity));

test("the dolphins swim in from behind, deep under the water, out of sight until they leap", () => {
  for (const dolphin of DOLPHINS) {
    assert.equal(dolphinSpot(dolphin, dolphin.delay), null);
    const early = dolphinSpot(dolphin, dolphin.delay + .05);
    assert.ok(early.forward < dolphin.forward - 10 && early.lift < -1, JSON.stringify(early));
    assert.ok(highest((t) => dolphinSpot(dolphin, t), dolphin.delay, dolphin.first - .01) < 0);
  }
});

test("the dolphins keep beside the rider, two on one side and one on the other", () => {
  assert.equal(DOLPHINS.filter((d) => d.side > 0).length, 2);
  assert.equal(DOLPHINS.filter((d) => d.side < 0).length, 1);
  for (const dolphin of DOLPHINS) {
    for (const t of times(dolphin.first, 12)) {
      const spot = dolphinSpot(dolphin, t);
      assert.equal(spot.side, dolphin.side);
      assert.ok(spot.forward >= dolphin.forward - .01 && spot.forward <= dolphin.forward + 1.51, `${t}: ${spot.forward}`);
    }
  }
});

test("each dolphin leaps out every couple of seconds, 1 to 1.6 m high, in turn with the others", () => {
  assert.equal(new Set(DOLPHINS.map((d) => d.first)).size, DOLPHINS.length);
  for (const dolphin of DOLPHINS) {
    const leaps = crossings(dolphin, 0, 12);
    assert.ok(leaps.length >= 4, `${leaps.length} leaps`);
    for (let i = 1; i < leaps.length; i++) assert.ok(leaps[i] - leaps[i - 1] > 2 && leaps[i] - leaps[i - 1] < 3);
    const high = highest((t) => dolphinSpot(dolphin, t), leaps[0], leaps[0] + 1.2);
    assert.ok(high > 1 && high < 1.6, `${high} m`);
  }
});

test("between leaps a dolphin swims well under the water, out of sight", () => {
  for (const dolphin of DOLPHINS) {
    const [out, next] = crossings(dolphin, 0, 12);
    const [back] = crossings(dolphin, out, next, null, false);
    assert.ok(next - back > 1, `under for ${next - back} s`);
    assert.ok(highest((t) => dolphinSpot(dolphin, t), back + .02, next - .02) < 0);
    assert.ok(lowest((t) => dolphinSpot(dolphin, t), back, next) < -1.2);
  }
});

test("a dolphin leaves the water nose up and goes back in nose first, diving on down", () => {
  const dolphin = DOLPHINS[0];
  const [out] = crossings(dolphin, 0, 6);
  const [back] = crossings(dolphin, out, 6, null, false);
  assert.ok(dolphinPose(dolphin, out + .1, null, 8).pitch > .3);
  assert.ok(dolphinPose(dolphin, back - .05, null, 8).pitch < -.3);
  assert.ok(dolphinPose(dolphin, back + .1, null, 8).pitch < -.3);
  assert.ok(dolphinSpot(dolphin, back + .3).lift < -.8);
});

test("the dolphins move smoothly, swimming in, leaping and leaving", () => {
  for (const dolphin of DOLPHINS) {
    for (const leave of [null, 11.3]) {
      const most = Math.max(...steps((t) => dolphinSpot(dolphin, t, leave), dolphin.delay, 15));
      assert.ok(most < .15, `dolphin ${DOLPHINS.indexOf(dolphin)}, leaving at ${leave}: ${most} m in 0.01 s`);
    }
  }
});

test("a dolphin leaping when the rider loads a jump finishes its leap, then dives deep and is gone", () => {
  const dolphin = DOLPHINS[0];
  const [out] = crossings(dolphin, 0, 6);
  const leave = out + .4;
  assert.ok(dolphinSpot(dolphin, out + .6, leave).lift > .5);
  assert.deepEqual(crossings(dolphin, leave, leave + DOLPHINS_LEAVE, leave), []);
  assert.ok(lowest((t) => dolphinSpot(dolphin, t, leave), leave, leave + DOLPHINS_LEAVE) < -3.5);
  assert.equal(dolphinSpot(dolphin, leave + DOLPHINS_LEAVE, leave), null);
});

test("a dolphin under water when the rider loads a jump never comes up again, and dives deep", () => {
  for (const dolphin of DOLPHINS) {
    const [out, next] = crossings(dolphin, 0, 12);
    for (const leave of [out + 1.5, next - .1]) {
      const spot = (t) => dolphinSpot(dolphin, t, leave);
      assert.ok(spot(leave).lift < 0);
      assert.ok(highest(spot, leave, leave + DOLPHINS_LEAVE) <= spot(leave).lift + 1e-9, `leaving at ${leave}`);
      assert.ok(lowest(spot, leave, leave + DOLPHINS_LEAVE) < -3.5);
      assert.equal(spot(leave + DOLPHINS_LEAVE), null);
    }
  }
});

test("a dolphin splashes where it leaves the water and where it goes back in, and not for leaps it never makes", () => {
  const dolphin = DOLPHINS[0];
  const [out, next] = crossings(dolphin, 0, 12);
  const [back] = crossings(dolphin, out, next, null, false);
  assert.deepEqual(dolphinSplashes(dolphin, out - .2), []);
  const [leaving] = dolphinSplashes(dolphin, out + .1);
  assert.ok(Math.abs(leaving.age - .1) < .02 && Math.abs(leaving.forward - dolphinSpot(dolphin, out).forward) < .1);
  const [entering] = dolphinSplashes(dolphin, back + .1);
  assert.ok(Math.abs(entering.age - .1) < .02 && Math.abs(entering.forward - dolphinSpot(dolphin, back).forward) < .1);
  const leave = out + .4;
  assert.equal(dolphinSplashes(dolphin, back + .1, leave).length, 1);
  assert.deepEqual(dolphinSplashes(dolphin, next + .1, leave), []);
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

test("the whale aims 6 m in front of where the rider will be when it lands", () => {
  const rider = { x: 10, z: 5, vx: 8, vz: -2 }, speed = Math.hypot(8, -2);
  const at = aim(rider, { start: 100 }, 101);
  assert.ok(Math.abs(at.x - (10 + 8 * (LAND - 1) + 6 * 8 / speed)) < 1e-9);
  assert.ok(Math.abs(at.z - (5 - 2 * (LAND - 1) - 6 * 2 / speed)) < 1e-9);
  const late = aim(rider, { start: 100 }, 100 + LAND + 1);
  assert.ok(Math.abs(late.x - (10 + 6 * 8 / speed)) < 1e-9);
  assert.deepEqual(aim({ x: 1, z: 2, vx: 0, vz: 0 }, { start: 100 }, 101), { x: 1, z: 2 });
});

test("the whale's splash throws big droplets up and out in a ring, which fall back and shrink away", () => {
  const start = whaleSplash(0, 12, 0), mid = whaleSplash(0, 12, WHALE_SPLASH * .3), end = whaleSplash(0, 12, WHALE_SPLASH);
  assert.ok(Math.hypot(start.x, start.y, start.z) < 1e-9);
  assert.ok(mid.y > 1.5 && Math.hypot(mid.x, mid.z) > 1);
  assert.ok(end.y < 0 && end.size === 0);
  const ring = Array.from({ length: 12 }, (_, i) => whaleSplash(i, 12, WHALE_SPLASH * .3));
  assert.ok(Math.abs(ring.reduce((sum, d) => sum + d.x, 0)) < 1e-9 && Math.abs(ring.reduce((sum, d) => sum + d.z, 0)) < 1e-9);
});

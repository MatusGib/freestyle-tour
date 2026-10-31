import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARRIVE, FISH, JUMP, LEAVE, fishPose, fishSpot, nextVisit, splashes, wipedOut,
} from "../mods/fish/fish.js";
import { SPLASH } from "../mods/lib/splash.js";

const flat = (spot) => Math.hypot(spot.x, spot.z);
const jumpers = FISH.filter((fish) => fish.jumps.length);
const swimmers = FISH.filter((fish) => !fish.jumps.length);
const inJump = (fish, t) => fish.jumps.some((at) => t >= at && t <= at + JUMP);
const angleBetween = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test("wipedOut is true while the game counts down the rider's crash", () => {
  assert.equal(wipedOut({ active: true, state: { crashTime: 4.8 } }), true);
  assert.equal(wipedOut({ active: true, state: { crashTime: 0.01 } }), true);
  assert.equal(wipedOut({ active: true, state: { crashTime: 0 } }), false);
});

test("wipedOut is false once the game has left the water for its menu", () => {
  assert.equal(wipedOut({ active: false, state: { crashTime: 3 } }), false);
});

test("nextVisit starts at a wipe-out, notes when the rider is up, and ends once the fish have left", () => {
  assert.equal(nextVisit(null, false, 10), null);
  const visit = nextVisit(null, true, 10);
  assert.deepEqual(visit, { start: 10, up: null });
  assert.equal(nextVisit(visit, true, 12), visit);
  const leaving = nextVisit(visit, false, 14.8);
  assert.deepEqual(leaving, { start: 10, up: 14.8 });
  assert.equal(nextVisit(leaving, false, 14.8 + LEAVE / 2), leaving);
  assert.equal(nextVisit(leaving, false, 14.8 + LEAVE), null);
});

test("a new wipe-out while the fish are leaving brings them back", () => {
  assert.deepEqual(nextVisit({ start: 10, up: 14.8 }, true, 15), { start: 15, up: null });
});

test("the fish swim in from further out and below the surface", () => {
  for (const fish of FISH) {
    assert.equal(fishSpot(fish, fish.delay), null);
    const early = fishSpot(fish, fish.delay + .05);
    assert.ok(flat(early) > fish.radius + 3, `fish ${FISH.indexOf(fish)} starts ${flat(early)} m out`);
    assert.ok(early.lift < -.8, `fish ${FISH.indexOf(fish)} starts ${early.lift} m deep`);
  }
});

test("once in, the fish circle at their radius, at the surface", () => {
  for (const fish of FISH) {
    for (let t = fish.delay + ARRIVE; t < 6; t += .05) {
      if (inJump(fish, t)) continue;
      const spot = fishSpot(fish, t);
      assert.ok(Math.abs(flat(spot) - fish.radius) < .01, `fish ${FISH.indexOf(fish)} at ${t}: ${flat(spot)} m out`);
      assert.ok(spot.lift > -.35 && spot.lift < .05, `fish ${FISH.indexOf(fish)} at ${t}: lift ${spot.lift}`);
    }
  }
});

test("the jumps start after the jumper has swum in", () => {
  assert.ok(jumpers.length >= 2);
  for (const fish of jumpers) assert.ok(fish.jumps[0] >= fish.delay + ARRIVE);
});

test("the leaps cross the middle while the sail still lies in the water", () => {
  // The game's water start lifts the sail high from about 2.5 s after the wipe-out.
  for (const fish of jumpers) for (const at of fish.jumps) assert.ok(at + JUMP / 2 <= 2.5, `the leap at ${at} crosses at ${at + JUMP / 2} s`);
});

test("a jumping fish leaps across the middle, high over the rider and the sail", () => {
  for (const fish of jumpers) {
    for (const at of fish.jumps) {
      const start = fishSpot(fish, at), middle = fishSpot(fish, at + JUMP / 2), end = fishSpot(fish, at + JUMP);
      assert.ok(flat(middle) < .01, `the jump at ${at} passes ${flat(middle)} m from the middle`);
      assert.ok(middle.lift > 2.8, `the jump at ${at} is ${middle.lift} m high`);
      assert.ok(Math.hypot(start.x + end.x, start.z + end.z) < .01, `the jump at ${at} lands on the far side`);
    }
  }
});

test("the fish move smoothly, without skipping from place to place", () => {
  for (const fish of FISH) {
    for (let t = fish.delay + .01; t < 6; t += .01) {
      const a = fishSpot(fish, t), b = fishSpot(fish, t + .01);
      const step = Math.hypot(b.x - a.x, b.z - a.z, b.lift - a.lift);
      assert.ok(step < .15, `fish ${FISH.indexOf(fish)} moves ${step} m between ${t} and ${t + .01}`);
    }
  }
});

test("fishPose faces each fish the way it swims", () => {
  const fish = swimmers[0];
  const visit = { start: 100, up: null };
  const t = fish.delay + ARRIVE + .5;
  const pose = fishPose(fish, visit, 100 + t), ahead = fishSpot(fish, t + .02);
  assert.ok(angleBetween(pose.yaw, Math.atan2(-(ahead.z - pose.z), ahead.x - pose.x)) < .05);
});

test("a jumping fish points up as it leaves the water and down as it comes back", () => {
  const fish = jumpers[0], at = fish.jumps[0];
  const visit = { start: 0, up: null };
  assert.ok(fishPose(fish, visit, at + .1).pitch > .5);
  assert.ok(fishPose(fish, visit, at + JUMP - .1).pitch < -.5);
});

test("when the rider is up the fish swim away and dive out of sight", () => {
  for (const up of [3, 4.8]) {
    const visit = { start: 0, up };
    for (const fish of FISH) {
      const at = fishPose(fish, visit, up), later = fishPose(fish, visit, up + LEAVE * .95);
      assert.ok(flat(later) > flat(at) + 1, `fish ${FISH.indexOf(fish)} only got to ${flat(later)} m from ${flat(at)} m`);
      assert.ok(later.lift < -1.2, `fish ${FISH.indexOf(fish)} is still at ${later.lift} m`);
      assert.equal(fishPose(fish, visit, up + LEAVE), null);
    }
  }
});

test("fish that had not swum in when the rider got up stay away", () => {
  const late = FISH.find((fish) => fish.delay > 0);
  assert.equal(fishPose(late, { start: 0, up: late.delay / 2 }, late.delay), null);
});

test("a jump splashes where the fish leaves the water and where it lands", () => {
  const fish = jumpers[0], at = fish.jumps[0];
  assert.deepEqual(splashes(fish, at - .1), []);
  const [takeOff] = splashes(fish, at + .2);
  const from = fishSpot(fish, at);
  assert.ok(Math.abs(takeOff.age - .2) < 1e-9 && Math.hypot(takeOff.x - from.x, takeOff.z - from.z) < 1e-9);
  const [landing] = splashes(fish, at + JUMP + .1);
  const to = fishSpot(fish, at + JUMP);
  assert.ok(Math.abs(landing.age - .1) < 1e-9 && Math.hypot(landing.x - to.x, landing.z - to.z) < 1e-9);
  assert.ok(!splashes(fish, at + JUMP + SPLASH + .01).some((s) => Math.hypot(s.x - to.x, s.z - to.z) < 1e-6), "the landing splash is over");
  for (let t = 0; t < 6; t += .1) for (const swimmer of swimmers) assert.deepEqual(splashes(swimmer, t), []);
});

test("a jump cut short when the rider gets up makes no landing splash", () => {
  const fish = jumpers[0], at = fish.jumps[0];
  assert.deepEqual(splashes(fish, at + JUMP + .1, at + JUMP / 2), []);
  assert.equal(splashes(fish, at + .1, at + JUMP / 2).length, 1);
});


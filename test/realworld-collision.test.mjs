// The rider stops at a real-world spot's shore.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLEARANCE, resolveSpotCollision } from "../mods/venues/realworld/collision.js";

// Land is x > 100 here.
const spot = { isLand: (x) => x > 100 };
const state = (x, vx) => ({ x, z: 0, vx, vz: 0, speed: Math.abs(vx), heading: Math.PI / 2, air: false, height: 0 });

test("a rider driving onto land is stopped with the whole board and rig still in the water", () => {
  const s = state(100.5, 5), input = { power: 1 };
  resolveSpotCollision(s, input, spot);
  assert.ok(CLEARANCE >= 2.5, "the board's half length and the rig's reach");
  assert.ok(s.x <= 100 - CLEARANCE && s.x > 100 - CLEARANCE - 0.5, `x ${s.x}`);
  assert.ok(s.vx <= 0);
  assert.equal(s.speed, Math.hypot(s.vx, s.vz));
  assert.equal(input.power, 0, "no drive into the land");
});

test("a rider whose nose reaches the sand, though the rider is still in the water, is held off too", () => {
  const s = state(98.5, 4), input = { power: 1 };
  resolveSpotCollision(s, input, spot);
  assert.ok(s.x <= 100 - CLEARANCE, `x ${s.x}`);
  assert.ok(s.vx <= 0 && input.power === 0);
});

test("a rider deep inside land, where its edge is out of reach, is taken out to the nearest water", () => {
  const s = { x: 130, z: 0, vx: 0, vz: 5, speed: 5, heading: Math.PI, air: false, height: 0 };
  resolveSpotCollision(s, { power: 1 }, spot);
  assert.ok(s.x <= 100 - CLEARANCE && s.x > 100 - CLEARANCE - 1, `x ${s.x}`);
  assert.ok(Math.abs(s.z) < 1e-6, "straight out, not along the way it was going");
});

test("a rider in open water, or sailing away from the shore, is left alone", () => {
  const a = state(0, 5), b = state(95, -5);
  resolveSpotCollision(a, {}, spot); resolveSpotCollision(b, {}, spot);
  assert.deepEqual([a.x, a.vx, b.x, b.vx], [0, 5, 95, -5]);
});

test("along a shore the rider slides on, keeping the speed along it", () => {
  const s = { x: 98.5, z: 0, vx: 3, vz: 4, speed: 5, heading: Math.PI / 2, air: false, height: 0 };
  resolveSpotCollision(s, {}, spot);
  assert.ok(s.vx <= 1e-9 && Math.abs(s.vz - 4) < 1e-9, `${s.vx}, ${s.vz}`);
});

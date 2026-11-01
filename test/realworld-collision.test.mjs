// The rider stops at a real-world spot's shore.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSpotCollision } from "../mods/venues/realworld/collision.js";

// Land is x > 100 here.
const spot = { isLand: (x) => x > 100 };
const state = (x, vx) => ({ x, z: 0, vx, vz: 0, speed: Math.abs(vx), heading: Math.PI / 2, air: false, height: 0 });

test("a rider driving onto land is stopped at the water's edge", () => {
  const s = state(100.5, 5), input = { power: 1 };
  resolveSpotCollision(s, input, spot);
  assert.ok(s.x <= 100, `x ${s.x}`);
  assert.ok(s.vx <= 0);
  assert.equal(s.speed, Math.hypot(s.vx, s.vz));
  assert.equal(input.power, 0, "no drive into the land");
});

test("a rider deep inside land, where its edge is out of reach, is taken out to the nearest water", () => {
  const s = { x: 130, z: 0, vx: 0, vz: 5, speed: 5, heading: Math.PI, air: false, height: 0 };
  resolveSpotCollision(s, { power: 1 }, spot);
  assert.ok(s.x <= 100 && s.x > 95, `x ${s.x}`);
  assert.ok(Math.abs(s.z) < 1e-6, "straight out, not along the way it was going");
});

test("a rider in open water, or sailing away from the shore, is left alone", () => {
  const a = state(0, 5), b = state(99, -5);
  resolveSpotCollision(a, {}, spot); resolveSpotCollision(b, {}, spot);
  assert.deepEqual([a.x, a.vx, b.x, b.vx], [0, 5, 99, -5]);
});

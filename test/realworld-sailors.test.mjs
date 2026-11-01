// Windsurfers sailing a spot's water beyond the heat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSailors, sailorAt } from "../mods/venues/realworld/sailors.js";

const lane = { from: [0, -100], to: [0, 100], count: 3, speed: 10 };

test("a sailor sails its lane end to end and back, jibing at each end", () => {
  const heads = [], spots = [];
  for (let t = 0; t < 60; t += 0.25) {
    const s = sailorAt(lane, 0, t);
    spots.push(s);
    heads.push(Math.sign(Math.cos(s.yaw)));
  }
  assert.ok(spots.every(({ x, z }) => Math.abs(x) < 1e-9 && z >= -100 - 1e-9 && z <= 100 + 1e-9), "always on the lane");
  assert.ok(Math.min(...spots.map((s) => s.z)) < -95 && Math.max(...spots.map((s) => s.z)) > 95, "end to end");
  const turns = heads.filter((h, k) => k && h !== heads[k - 1]).length;
  assert.ok(turns >= 2 && turns <= 4, `${turns} jibes in a minute: 600 m sailed on a 200 m lane`);
  assert.ok(spots.some((s) => s.mirror) && spots.some((s) => !s.mirror), "the rig is on the windward side both ways");
});

test("sailors on one lane are spread out, and the meshes follow the water's clock", () => {
  const a = sailorAt(lane, 0, 5), b = sailorAt(lane, 1, 5), c = sailorAt(lane, 2, 5);
  assert.ok(Math.abs(a.z - b.z) > 20 && Math.abs(b.z - c.z) > 20, "not bunched");
  const time = { value: 0 }, group = buildSailors([lane], time);
  assert.equal(group.children.length, 3, "boards, sails, riders: three draw calls for all of them");
  const board = group.children[0];
  board.onBeforeRender();
  const z0 = board.instanceMatrix.array[14];
  time.value = 2;
  board.onBeforeRender();
  assert.ok(Math.abs(board.instanceMatrix.array[14] - z0) > 10, "they move with the clock");
  assert.ok(group.children.every((m) => m.frustumCulled === false && m.count === 3));
});

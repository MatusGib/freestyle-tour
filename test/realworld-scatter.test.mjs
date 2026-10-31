// Where a real-world spot's plants go.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scatter } from "../mods/venues/realworld/scatter.js";

test("plants go only on their ground, at their density, the same every time", () => {
  const spot = { groundAt: (x) => (x < 0 ? 6 : 4), heightAt: () => 1 };
  const rules = { mangrove: { ground: [6], perHectare: 400 }, kadushi: { ground: [4], perHectare: 30 } };
  const a = scatter(spot, rules, { half: 200, seed: 7 }), b = scatter(spot, rules, { half: 200, seed: 7 });
  assert.deepEqual(a, b);
  assert.ok(a.mangrove.every((p) => p.x < 0) && a.kadushi.every((p) => p.x >= 0));
  const ratio = a.mangrove.length / a.kadushi.length;
  assert.ok(ratio > 8 && ratio < 18, `mangrove/kadushi ${ratio}`);
  for (const p of [...a.mangrove, ...a.kadushi]) {
    assert.equal(p.y, 1, "on the ground");
    assert.ok(p.scale >= 0.7 && p.scale <= 1.3 && Number.isInteger(p.variant) && p.variant >= 0 && p.variant <= 3);
  }
});

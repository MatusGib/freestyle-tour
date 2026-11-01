// The whitewater standing on a real-world spot's reef.
import { test } from "node:test";
import assert from "node:assert/strict";
import { surfRibbon } from "../mods/venues/realworld/surf.js";

test("the surf stands along the reef line, a foot and a top every few metres, with the distance along it", () => {
  const g = surfRibbon([[[0, 0], [10, 0], [10, 10]]], { step: 2.5, height: 1.2, base: -0.2 });
  assert.equal(g.positions.length / 3, 18, "9 points along 20 m, two vertices each");
  assert.equal(g.indices.length, 8 * 6, "two triangles per stretch");
  for (let k = 0; k < 18; k++) {
    const [x, y, z] = g.positions.slice(k * 3, k * 3 + 3), [u, v] = g.uvs.slice(k * 2, k * 2 + 2);
    assert.ok(x === 10 || z === 0, "on the line");
    assert.ok(v === 0 ? Math.abs(y + 0.2) < 1e-6 : y > 0.5 && y <= 1.2, `height ${y}`);
    assert.equal(u, x + z, "u is the distance along the line");
  }
});

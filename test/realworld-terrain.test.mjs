// A real-world spot's terrain: its rings of geometry, and which detail
// texture shows where.
import { test } from "node:test";
import assert from "node:assert/strict";
import { groundWeights, ringGeometry } from "../mods/venues/realworld/terrain.js";

test("a terrain ring covers its square, leaves the inner square open, and samples heights", () => {
  const heightAt = (x, z) => x + z;
  const g = ringGeometry({ outer: 100, inner: 40, step: 20, heightAt, skirt: 5 });
  assert.equal(g.positions.length % 3, 0);
  const xs = [], ys = [];
  for (let k = 0; k < g.positions.length; k += 3) { xs.push(g.positions[k]); ys.push(g.positions[k + 1]); }
  assert.equal(Math.min(...xs), -100); assert.equal(Math.max(...xs), 100);
  for (let t = 0; t < g.indices.length; t += 3) {
    const cx = [0, 1, 2].reduce((a, v) => a + g.positions[g.indices[t + v] * 3], 0) / 3, cz = [0, 1, 2].reduce((a, v) => a + g.positions[g.indices[t + v] * 3 + 2], 0) / 3;
    assert.ok(Math.max(Math.abs(cx), Math.abs(cz)) > 40 - 1e-9, "no triangle inside the inner square");
  }
  assert.equal(g.positions[1], heightAt(-100, -100), "heights come from heightAt");
});

test("the detail weights put sand on the mapped beaches and each texture on its ground type", () => {
  // Ground types by x: coral rubble, rock, mangrove, scrub soil; a beach
  // polygon over the scrub soil.
  const spot = {
    manifest: { ground: { water: 0, drySand: 1, wetSand: 2, coralRubble: 3, scrubSoil: 4, rock: 5, mangrove: 6, builtUp: 7 } },
    groundAt: (x) => (x < -50 ? 3 : x < 0 ? 5 : x < 50 ? 6 : 4),
    features: { beaches: [[[60, -100], [100, -100], [100, 100], [60, 100]]] },
  };
  const size = 20, w = groundWeights(spot, 100, size);
  const at = (x, z) => { const i = Math.floor(((x + 100) * size) / 200), j = Math.floor(((z + 100) * size) / 200); return [...w.slice((j * size + i) * 4, (j * size + i) * 4 + 4)]; };
  assert.deepEqual(at(-75, 0), [0, 255, 0, 0], "coral rubble");
  assert.deepEqual(at(-25, 0), [0, 0, 255, 0], "rock");
  assert.deepEqual(at(25, 0), [0, 0, 0, 255], "mangrove mud");
  assert.deepEqual(at(55, 0), [0, 0, 0, 0], "scrub soil is what's left");
  assert.deepEqual(at(80, 0), [255, 0, 0, 0], "the beach is sand");
});

// OpenStreetMap footprints raised into buildings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extrudeFootprint } from "../mods/venues/realworld/buildings.js";

test("a footprint becomes outward-facing walls to its height and a roof, on its lowest ground", () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  for (const ring of [square, [...square].reverse()]) {
    const g = extrudeFootprint(ring, 4, (x) => (x > 5 ? 1 : 0.5));
    const ys = [];
    for (let k = 1; k < g.positions.length; k += 3) ys.push(g.positions[k]);
    assert.equal(Math.min(...ys), 0.5);
    assert.equal(Math.max(...ys), 4.5);
    for (let k = 0; k < g.normals.length; k += 3) {
      if (Math.abs(g.normals[k + 1]) > 0.9) continue; // the roof
      assert.ok((g.positions[k] - 5) * g.normals[k] + (g.positions[k + 2] - 5) * g.normals[k + 2] > 0, "walls face out");
    }
    assert.equal(g.roofTriangles, 2);
    // Each triangle winds counter-clockwise seen from the side its normal
    // points to, so the renderer lights it from that side.
    for (let k = 0; k < g.positions.length; k += 9) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = g.positions.slice(k, k + 9);
      const [ux, uy, uz, vx, vy, vz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      assert.ok(n[0] * g.normals[k] + n[1] * g.normals[k + 1] + n[2] * g.normals[k + 2] > 0, `triangle ${k / 9} faces its normal`);
    }
  }
});

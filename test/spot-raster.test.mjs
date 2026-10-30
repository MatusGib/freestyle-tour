import { test } from "node:test";
import assert from "node:assert/strict";
import { bilinear, distanceTransform, fillPolygons, gridPoint, imagePoint } from "../tools/spot/raster.mjs";

test("grid points and image pixels sit where the conventions say", () => {
  assert.deepEqual(gridPoint(0, 0, 100, 50), { x: -100, z: -100 });
  assert.deepEqual(gridPoint(4, 2, 100, 50), { x: 100, z: 0 });
  assert.deepEqual(imagePoint(0, 0, 100, 4), { x: -75, z: -75 });
});

test("polygons fill by even-odd, so a hole stays empty", () => {
  const outer = [[-80, -80], [80, -80], [80, 80], [-80, 80]], hole = [[-30, -30], [30, -30], [30, 30], [-30, 30]];
  const mask = fillPolygons([outer, hole], 100, 10); // 10 × 10 pixels of 20 m
  assert.equal(mask[5 * 10 + 5], 0, "the hole");
  assert.equal(mask[5 * 10 + 1], 1, "inside the outer ring");
  assert.equal(mask[0], 0, "outside");
});

test("the distance transform measures to the nearest marked cell", () => {
  const mask = new Uint8Array(25); mask[12] = 1; // the centre of 5 × 5
  const d = distanceTransform(mask, 5, 5);
  assert.equal(d[12], 0); assert.equal(d[13], 1); assert.ok(Math.abs(d[0] - Math.SQRT2 * 2) < 1e-6); // the output is Float32
});

test("bilinear sampling blends the four neighbours and clamps at the edges", () => {
  const values = Float32Array.from([0, 10, 20, 30]); // 2 × 2
  assert.equal(bilinear(values, 2, 2, 0.5, 0.5), 15);
  assert.equal(bilinear(values, 2, 2, -3, 9), 20);
});

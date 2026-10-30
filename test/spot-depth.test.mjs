import { test } from "node:test";
import assert from "node:assert/strict";
import { DEPTH_MAX, depthImage, fitDepth, logRatio } from "../tools/spot/depth.mjs";

test("deeper clear water has a higher blue-over-green log ratio", () => {
  assert.ok(logRatio(60, 200, 210) < logRatio(20, 90, 160));
});

test("the fit returns the calibration depths and clamps to 0..DEPTH_MAX", () => {
  const depth = fitDepth([{ ratio: 1.0, depth: 1 }, { ratio: 1.2, depth: 11 }]);
  assert.ok(Math.abs(depth(1.0) - 1) < 1e-9);
  assert.ok(Math.abs(depth(1.2) - 11) < 1e-9);
  assert.equal(depth(0.5), 0);
  assert.equal(depth(9), DEPTH_MAX);
  assert.throws(() => fitDepth([{ ratio: 1, depth: 1 }]), /two calibration depths/);
});

test("land has no depth, and the image stores depth in 0..255", () => {
  const colour = { width: 2, height: 1, channels: 3, data: Uint8Array.from([60, 200, 210, 20, 90, 160]) };
  const out = depthImage(colour, Uint8Array.from([1, 0]), () => 10);
  assert.deepEqual([...out.data], [0, Math.round((10 / DEPTH_MAX) * 255)]);
});

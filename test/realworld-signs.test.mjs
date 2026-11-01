// Painted signs at a real-world spot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSigns, signCanvasSize } from "../mods/venues/realworld/signs.js";

const sign = { at: [10, 3, -4], yaw: 0.5, width: 4, height: 1, draw: () => {} };

test("a sign's canvas has its shape, at about 64 pixels a metre, within the GPU's limits", () => {
  assert.deepEqual(signCanvasSize(sign), [256, 64]);
  assert.deepEqual(signCanvasSize({ ...sign, width: 60 }), [2048, 34], "a long fascia is capped at 2048 wide and keeps its shape");
});

test("each sign is a plane facing along its yaw, painted by its draw function in the browser", () => {
  const painted = [];
  const canvas = () => ({ width: 0, height: 0, getContext: () => ({ painted }) });
  const group = buildSigns([{ ...sign, draw: (ctx, w, h) => painted.push([w, h]) }], { createCanvas: canvas });
  assert.equal(group.children.length, 1);
  const mesh = group.children[0];
  assert.deepEqual(mesh.position.toArray(), [10, 3, -4]);
  assert.equal(mesh.rotation.y, 0.5);
  assert.deepEqual(painted, [[256, 64]]);
  assert.ok(mesh.material.map, "painted onto a texture");
});

test("without a document (Node, tests) there are no signs, and nothing breaks", () => {
  assert.equal(buildSigns([sign]).children.length, 0);
});

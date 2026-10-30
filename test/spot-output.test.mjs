import { test } from "node:test";
import assert from "node:assert/strict";
import { COURSE, courseProblems, credits, drawLines, picture } from "../tools/spot/output.mjs";

test("the course needs sailable water under it and around its ends", () => {
  const size = 20, half = 500; // 50 m pixels
  const deep = { width: size, height: size, channels: 1, data: new Uint8Array(size * size).fill(30) };
  assert.deepEqual(courseProblems(deep, half), []);
  const shallow = structuredClone(deep);
  shallow.data[10 * size + 10] = 0;
  assert.equal(courseProblems(shallow, half).length, 1);
  assert.match(courseProblems(shallow, half)[0], /at x 25, z 25: 0\.0 m deep/);
  assert.deepEqual(COURSE, { x: 110, z: 210 + 43 });
});

test("lines are drawn into an RGB image in the game frame", () => {
  const image = { width: 4, height: 4, channels: 3, data: new Uint8Array(48) };
  drawLines(image, 100, [[[-75, -75], [75, -75]]], [255, 0, 0]);
  assert.deepEqual([...image.data.subarray(0, 3)], [255, 0, 0]);
  assert.deepEqual([...image.data.subarray(9, 12)], [255, 0, 0]);
  assert.deepEqual([...image.data.subarray(12, 15)], [0, 0, 0]);
});

test("the picture is a 384 × 256 crop around the course", () => {
  const colour = { width: 8, height: 8, channels: 3, data: new Uint8Array(192).fill(100) };
  const p = picture(colour, 2500);
  assert.deepEqual([p.width, p.height, p.channels], [384, 256, 3]);
});

test("credits list every source with its licence", () => {
  const text = credits({ name: "Sorobon", sources: [{ name: "OpenStreetMap", licence: "ODbL", credit: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" }] });
  assert.match(text, /# Sorobon: data credits/);
  assert.match(text, /OpenStreetMap.*ODbL/s);
});

// A real-world spot's files as samplers in the game frame.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSpot } from "../mods/venues/realworld/spot.js";
import { decodePng } from "../tools/spot/png.mjs";
import { ROOT } from "./helpers.mjs";

const fetchBytes = async (url) => new Uint8Array(readFileSync(join(ROOT, "mods", url.replace("/__mods/", ""))));
const decodeImage = async (bytes) => decodePng(Buffer.from(bytes));

test("Sorobon loads, with the course in water and the beach on land", async () => {
  const spot = await loadSpot("sorobon-bonaire", { fetchBytes, decodeImage });
  assert.equal(spot.manifest.id, "sorobon-bonaire");
  assert.ok(spot.heightAt(0, 0) < 0, "the course is over the seabed");
  assert.ok(spot.depthAt(0, 0) >= 0.8, "the lagoon is at least 0.8 m deep");
  assert.equal(spot.groundAt(0, 0), 0, "water");
  assert.ok(spot.isLand(240, -330), "Sorobon's buildings stand on land");
  assert.ok(spot.heightAt(240, -330) > 0);
  assert.equal(typeof spot.heightAt(9000, 9000), "number", "beyond the detail grid, the horizon grid");
});

test("mangroves standing in the water count as land, so they stop a board too", async () => {
  const spot = await loadSpot("sorobon-bonaire", { fetchBytes, decodeImage });
  assert.ok(spot.isLand(465, -297), "a mangrove beyond the mapped shoreline");
  assert.equal(spot.depthAt(465, -297), 0);
});

test("the lagoon inside the reef is never read shallower than 0.8 m", async () => {
  const spot = await loadSpot("sorobon-bonaire", { fetchBytes, decodeImage });
  for (let x = -100; x <= 100; x += 25) for (let z = -200; z <= 200; z += 50) assert.ok(spot.depthAt(x, z) >= 0.8, `${x}, ${z}`);
});

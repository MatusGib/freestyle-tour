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
const spot = await loadSpot("sorobon-bonaire", { fetchBytes, decodeImage });

test("Sorobon loads, with the course in water and the beach on land", () => {
  assert.equal(spot.manifest.id, "sorobon-bonaire");
  assert.ok(spot.heightAt(0, 0) < 0, "the course is over the seabed");
  assert.ok(spot.depthAt(0, 0) >= 0.8, "the lagoon is at least 0.8 m deep");
  assert.equal(spot.groundAt(0, 0), 0, "water");
  assert.ok(spot.isLand(240, -330), "Sorobon's buildings stand on land");
  assert.ok(spot.heightAt(240, -330) > 0);
  assert.equal(typeof spot.heightAt(9000, 9000), "number", "beyond the detail grid, the horizon grid");
});

test("the seabed in the water of the detail area lies at least 0.8 m down, so it never shows through the water", () => {
  const offshore = (x, z) => [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10]].every(([a, b]) => !spot.isLand(x + a, z + b));
  for (let x = -1200; x <= 1200; x += 25) for (let z = -1200; z <= 1200; z += 25) {
    if (offshore(x, z)) assert.ok(spot.heightAt(x, z) <= -0.8, `${x}, ${z}: ${spot.heightAt(x, z)}`);
  }
  assert.ok(spot.heightAt(465, -297) <= -0.8, "mangroves in the water stand in it");
});

test("on a 5 m grid the waterline still falls where the map's shoreline is, not on the grid's steps", () => {
  // Lines from the lagoon towards Sorobon beach (+x), against where they first
  // cross the map's shoreline.
  for (let z = -480; z <= -380; z += 7) {
    const crossings = spot.features.shoreline.flatMap((ring) => ring.map((p, k) => [p, ring[(k + 1) % ring.length]])
      .filter(([[, z1], [, z2]]) => (z1 <= z) !== (z2 <= z)).map(([[x1, z1], [x2, z2]]) => x1 + ((z - z1) / (z2 - z1)) * (x2 - x1)));
    const mapped = Math.min(...crossings.filter((x) => x > 0));
    let x = 0;
    while (spot.heightAt(x + 5, z) <= 0) x += 5;
    const a = spot.heightAt(x, z), b = spot.heightAt(x + 5, z), drawn = x + (5 * a) / (a - b);
    assert.ok(Math.abs(drawn - mapped) < 2, `z ${z}: drawn ${drawn.toFixed(1)}, mapped ${mapped}`);
  }
});

test("mangroves standing in the water count as land, so they stop a board too", () => {
  assert.ok(spot.isLand(465, -297), "a mangrove beyond the mapped shoreline");
  assert.equal(spot.depthAt(465, -297), 0);
});

test("the lagoon inside the reef is never read shallower than 0.8 m", () => {
  for (let x = -100; x <= 100; x += 25) for (let z = -200; z <= 200; z += 50) assert.ok(spot.depthAt(x, z) >= 0.8, `${x}, ${z}`);
});

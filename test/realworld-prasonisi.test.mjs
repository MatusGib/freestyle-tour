// Prasonisi's files: the flat-water bay east of the sandbar, the sandbar
// joining Rhodes to the islet as it does all summer, and the beach centres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSpot } from "../mods/venues/realworld/spot.js";
import { decodePng } from "../tools/spot/png.mjs";
import { ROOT } from "./helpers.mjs";

const fetchBytes = async (url) => new Uint8Array(readFileSync(join(ROOT, "mods", url.replace("/__mods/", ""))));
const decodeImage = async (bytes) => decodePng(Buffer.from(bytes));
const spot = await loadSpot("prasonisi-rhodes", { fetchBytes, decodeImage });

test("the course lies in the flat-water bay, the centres on the beach upwind of it", () => {
  for (let x = -110; x <= 110; x += 55) for (let z = -253; z <= 253; z += 46) {
    assert.ok(!spot.isLand(x, z) && spot.depthAt(x, z) >= 0.8, `${x}, ${z}`);
  }
  assert.ok(spot.isLand(-336, -292) && spot.heightAt(-336, -292) > 0, "Surfcenter Kirschner");
  assert.ok(spot.isLand(-541, -261), "Wind4Fun");
});

test("the sandbar's neck is dry sand, though OpenStreetMap's coastline leaves it open", () => {
  for (const z of [300, 380, 460]) {
    assert.ok(spot.isLand(-465, z), `z ${z}`);
    assert.ok(spot.heightAt(-465, z) > 0, `z ${z}: ${spot.heightAt(-465, z)}`);
    assert.equal(spot.depthAt(-465, z), 0);
  }
  assert.equal(spot.groundAt(-465, 380), spot.manifest.ground.drySand);
});

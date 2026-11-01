// Prasonisi's files: the flat-water bay east of the sandbar, the sandbar
// joining Rhodes to the islet as it does all summer, and the beach centres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBuildings } from "../mods/venues/realworld/buildings.js";
import { buildPlants } from "../mods/venues/realworld/plants.js";
import { loadSpot, waterMap } from "../mods/venues/realworld/spot.js";
import * as site from "../mods/venues/sites/prasonisi-rhodes.js";
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

test("the water map knows the bay lies in the sandbar's lee, and the wave side is open to the Aegean", () => {
  const map = waterMap(spot, 512);
  const fetchAt = (x, z) => {
    const i = Math.floor(((x + map.half) * map.size) / (2 * map.half)), j = Math.floor(((z + map.half) * map.size) / (2 * map.half)), a = map.data[(j * map.size + i) * 4 + 3];
    return a === 255 ? Infinity : (a / 255) * map.fetchMax;
  };
  for (const z of [-200, 0, 200]) assert.ok(fetchAt(0, z) > 150 && fetchAt(0, z) < 650, `the course at z ${z}: ${fetchAt(0, z)} m from the sandbar`);
  assert.equal(fetchAt(-900, 200), Infinity, "off the west beach: open water all the way upwind");
});

test("the wave side's surf breaks in the water off the west beach and the islet", () => {
  const [outer, inner, islet] = site.surfLines(spot);
  assert.ok(outer.length > 40 && inner.length > 40 && islet.length > 40, `${outer.length}, ${inner.length}, ${islet.length} points`);
  for (const [x, z] of [...outer, ...inner, ...islet]) {
    assert.ok(!spot.isLand(x, z), `${x}, ${z} is in the water`);
    assert.ok(x < -400, `${x}, ${z} is upwind of the sandbar, not in the bay`);
  }
  for (const [x, z] of outer) assert.ok(spot.isLand(x + 75, z) && !spot.isLand(x + 70, z), `${x}, ${z}: 75 m off the beach`);
});

test("the site's landmarks, plants and buildings build on the real ground", () => {
  const batches = [];
  site.landmarks({ point: (s, d, y = 0) => [s, y, d], add: (positions, indices, colour) => batches.push({ positions, colour }) }, spot);
  const points = batches.flatMap(({ positions }) => Array.from({ length: positions.length / 3 }, (_, k) => positions.slice(k * 3, k * 3 + 3)));
  assert.ok(points.length > 20000, `${points.length} vertices`);
  const lantern = points.filter(([x, , z]) => Math.hypot(x + 1086, z - 2206) < 3);
  const ground = spot.heightAt(-1086, 2206), top = Math.max(...lantern.map(([, y]) => y));
  // The chart puts the light 61 m up; the 30 m elevation data averages the
  // narrow tip's cliff with the sea, so the cliff stands lower here, but it
  // isn't flattened into a beach.
  assert.ok(ground > 20, `the lighthouse's cliff, ${ground} m`);
  assert.ok(top - ground > 12 && top - ground < 15, `the tower and lantern, ${top - ground} m`);
  const plants = buildPlants(spot, { flora: site.flora, radius: 900 });
  const count = (kind) => plants.children.filter((m) => m.userData.kind === kind).reduce((n, m) => n + m.count, 0);
  assert.ok(count("tamarisk") >= 10, `tamarisks ${count("tamarisk")}`);
  assert.ok(count("phrygana") > 3000 && count("juniper") > 50, `phrygana ${count("phrygana")}, juniper ${count("juniper")}`);
  const before = buildBuildings(spot).geometry.getAttribute("position").count, after = buildBuildings(spot, site.buildings).geometry.getAttribute("position").count;
  assert.ok(after < before, "the lighthouse's footprints are left to the site");
});

test("from the aerial imagery: cars only in the car parks, the bases 200 m apart, the tower and sunbeds by the water", () => {
  const inside = (ring, x, z) => {
    let hit = false;
    for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) if ((ring[k][1] > z) !== (ring[j][1] > z) && x < ((ring[j][0] - ring[k][0]) * (z - ring[k][1])) / (ring[j][1] - ring[k][1]) + ring[k][0]) hit = !hit;
    return hit;
  };
  const vehicles = site.vehicleSpots(spot);
  assert.ok(vehicles.length > 30 && vehicles.length < 160, `${vehicles.length} vehicles`);
  for (const { x, z } of vehicles) assert.ok(spot.features.parking.some((ring) => inside(ring, x, z)), `${x}, ${z} is in a car park`);
  const [[ax, az], [bx, bz]] = [site.PROCENTER.from, site.PROCENTER.to];
  const between = Math.hypot((ax + bx) / 2 - site.STATION[0], (az + bz) / 2 - site.STATION[1]);
  assert.ok(between > 180 && between < 240, `ProCenter to the second station: ${between} m`);
  const [tx, tz] = site.towerAt(spot);
  assert.ok(spot.isLand(tx, tz) && !spot.isLand(tx + 25, tz), "the spotting tower stands on the sand, within 25 m of the water");
});

test("the windsurfers out on the bay sail open water, well clear of the heat", () => {
  const lanes = site.sailors(spot);
  assert.ok(lanes.reduce((n, l) => n + l.count, 0) >= 12);
  for (const { from: [ax, az], to: [bx, bz] } of lanes) for (let t = 0; t <= 1; t += 0.05) {
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (let k = 0; k < 16; k++) assert.ok(!spot.isLand(x + Math.cos(k * 0.39) * 25, z + Math.sin(k * 0.39) * 25), `${x}, ${z} is 25 m off land`);
    assert.ok(Math.abs(x) > 110 + 80 || Math.abs(z) > 253 + 40, `${x}, ${z} keeps clear of the course and the AI's overshoot`);
  }
});

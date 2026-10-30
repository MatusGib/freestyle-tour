import { test } from "node:test";
import assert from "node:assert/strict";
import { latLonBox, localFrame, tileOf } from "../tools/spot/frame.mjs";

const near = (a, b, tolerance = 0.5) => assert.ok(Math.abs(a - b) < tolerance, `${a} is not ${b}`);
const CENTRE = { lat: 12.08, lon: -68.23 };
const metresNorth = (m) => ({ lat: CENTRE.lat + m / 111319.49, lon: CENTRE.lon });
const metresEast = (m) => ({ lat: CENTRE.lat, lon: CENTRE.lon + m / (111319.49 * Math.cos(CENTRE.lat * Math.PI / 180)) });

test("the wind blows along +x: with an east wind, west is +x and north is +z", () => {
  const frame = localFrame(CENTRE, 90);
  const west = metresEast(-1000), north = metresNorth(1000);
  const w = frame.toGame(west.lat, west.lon), n = frame.toGame(north.lat, north.lon);
  near(w.x, 1000); near(w.z, 0); near(n.x, 0); near(n.z, 1000);
});

test("the frame is turned, never mirrored, whatever the wind", () => {
  for (let windFrom = 0; windFrom < 360; windFrom += 30) {
    const frame = localFrame(CENTRE, windFrom);
    const e = frame.toGame(metresEast(1000).lat, metresEast(1000).lon), n = frame.toGame(metresNorth(1000).lat, metresNorth(1000).lon);
    near(e.x * n.z - e.z * n.x, -1e6, 1e3);
  }
});

test("game coordinates go back to the same place", () => {
  const frame = localFrame(CENTRE, 75);
  const { lat, lon } = frame.toLatLon(1234, -567);
  const back = frame.toGame(lat, lon);
  near(back.x, 1234, 1e-6); near(back.z, -567, 1e-6);
});

test("a box holds every corner of the game square, and tiles count like Web Mercator", () => {
  const frame = localFrame(CENTRE, 75);
  const box = latLonBox(frame, 2500);
  for (const [x, z] of [[-2500, -2500], [2500, -2500], [-2500, 2500], [2500, 2500]]) {
    const { lat, lon } = frame.toLatLon(x, z);
    assert.ok(lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east);
  }
  near(tileOf(0, 0, 1).x, 1, 1e-9); near(tileOf(0, 0, 1).y, 1, 1e-9);
  near(tileOf(85.0511287798, -180, 3).y, 0, 1e-6);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { beachHeight, terrariumHeight, terrainUrls } from "../tools/spot/elevation.mjs";

test("terrarium pixels decode to metres", () => {
  assert.equal(terrariumHeight(128, 0, 0), 0);
  assert.equal(terrariumHeight(128, 10, 128), 10.5);
  assert.equal(terrariumHeight(127, 255, 0), -1);
});

test("the tiles covering a box are listed once each", () => {
  const urls = terrainUrls({ south: 12.07, west: -68.24, north: 12.09, east: -68.22 }, 14);
  assert.ok(urls.length >= 1 && urls.length <= 4);
  assert.match(urls[0].url, /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\/14\/\d+\/\d+\.png$/);
  assert.equal(new Set(urls.map((u) => u.url)).size, urls.length);
});

test("near the shore the beach profile replaces the coarse elevation", () => {
  const beach = { top: 0.4, slope: 0.02, width: 80 };
  assert.equal(beachHeight(5, 0, beach), 0.5, "on the beach: the profile");
  assert.equal(beachHeight(200, 7, beach), 7, "inland: the elevation");
  assert.ok(beachHeight(60, 7, beach) > 1.6 && beachHeight(60, 7, beach) < 7, "in between: blended");
  assert.equal(beachHeight(-30, 0, beach, 1.2), -1.2, "under water: the seabed");
});

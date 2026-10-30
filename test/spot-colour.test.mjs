import { test } from "node:test";
import assert from "node:assert/strict";
import { resampleColour, wmsUrl } from "../tools/spot/colour.mjs";

test("the WMS request asks for PNG over the box, longitude first", () => {
  const url = new URL(wmsUrl({ south: 1, west: 2, north: 3, east: 4 }, 1024, "s2cloudless-2024"));
  assert.equal(url.origin + url.pathname, "https://tiles.maps.eox.at/wms");
  assert.equal(url.searchParams.get("bbox"), "2,1,4,3");
  assert.equal(url.searchParams.get("format"), "image/png");
  assert.equal(url.searchParams.get("srs"), "EPSG:4326");
  assert.equal(url.searchParams.get("layers"), "s2cloudless-2024");
});

test("each game pixel takes the colour at its place in the image", () => {
  // A 2 × 2 image over lat 0..1, lon 0..1: north-west red, north-east green, south-west blue, south-east white.
  const image = { width: 2, height: 2, channels: 3, data: Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]) };
  const frame = { toLatLon: (x, z) => ({ lat: 0.5 - z / 100, lon: 0.5 + x / 100 }) };
  const out = resampleColour(image, { south: 0, west: 0, north: 1, east: 1 }, frame, 50, 2);
  assert.deepEqual([...out.data.subarray(0, 3)], [255, 0, 0], "pixel (0, 0), at -x and -z, is the image's north-west");
});

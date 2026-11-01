// A real-world spot's files (mods/venues/spots/<id>/, written by
// tools/spot.mjs) as samplers in the game frame: heights in metres (the
// seabed under water), depth, ground type and land. fetchBytes(url) →
// Uint8Array; decodeImage(bytes) → { width, height, channels, data }.
import { bilinear, distanceTransform, fillPolygons, imagePoint } from "./raster.js";

const LAGOON_FLOOR = 0.8; // the colour method can't resolve Lac Bay's floor (PR #2)
const LAND_CELL = 2; // metres
const SHORE = 8; // metres either side of the shoreline that are shaped by it
const SHORE_SLOPE = 0.2; // rise of the beach and the shallows, m per m
const DISTANCE_MAX = 80; // metres the water map's distances reach
const FETCH_MAX = 5000; // metres the water map's fetch reaches

export async function loadSpot(id, { fetchBytes, decodeImage }) {
  const base = `/__mods/venues/spots/${id}/`;
  const text = async (name) => JSON.parse(new TextDecoder().decode(await fetchBytes(base + name)));
  // Int16 little-endian decimetres; copied so the view is aligned.
  const heights = async (name) => new Int16Array((await fetchBytes(base + name)).slice().buffer);
  const image = async (name) => decodeImage(await fetchBytes(base + name));
  const manifest = await text("spot.json");
  const [features, terrain, horizon, ground, horizonColour, depth, horizonDepth, groundType] = await Promise.all([
    text("features.json"), heights("terrain.bin"), heights("horizon.bin"), image("ground.png"), image("horizon.png"), image("depth.png"), image("horizon-depth.png"), image("ground-type.png"),
  ]);
  const { detail, horizon: far } = manifest;
  const sampleGrid = (grid, part, x, z) => bilinear(grid, part.n, part.n, (x + part.half) / part.step, (z + part.half) / part.step) / 10;
  const pixel = (img, half, x, z) => [((x + half) * img.width) / (2 * half) - 0.5, ((z + half) * img.height) / (2 * half) - 0.5];
  const inDetail = (x, z) => Math.abs(x) <= detail.half && Math.abs(z) <= detail.half;
  // Land at 2 m over the detail area: 1 inside the shoreline rings
  // (even-odd) and, where the spot says so, its mapped beaches; 2 in the
  // mangroves, which often stand in the water beyond.
  const landSize = (2 * detail.half) / LAND_CELL;
  const land = fillPolygons(features.shoreline, detail.half, landSize);
  if (manifest.beachesAreLand) fillPolygons(features.beaches, detail.half, landSize).forEach((v, k) => { land[k] |= v; });
  const mangroves = fillPolygons(features.mangroves, detail.half, landSize);
  for (let k = 0; k < land.length; k++) land[k] |= mangroves[k] << 1;
  const landAt = (x, z) => {
    if (!inDetail(x, z)) return 0;
    const i = Math.floor((x + detail.half) / LAND_CELL), j = Math.floor((z + detail.half) / LAND_CELL);
    return land[Math.min(landSize - 1, j) * landSize + Math.min(landSize - 1, i)];
  };
  const isLand = (x, z) => landAt(x, z) !== 0;
  const shore = (x, z) => landAt(x, z) & 1;
  // Metres from the shoreline, + on land, within ±SHORE: from the share of
  // land in a square around the point, which a straight shore splits at
  // that distance.
  const shoreDistance = (x, z) => {
    let land = 0, count = 0;
    for (let b = -SHORE; b <= SHORE; b += LAND_CELL) for (let a = -SHORE; a <= SHORE; a += LAND_CELL, count++) land += shore(x + a, z + b);
    return (land / count - 0.5) * 2 * SHORE;
  };
  // In the water the seabed stays at least LAGOON_FLOOR down, so dark floor
  // read as 0 m doesn't rise through the water. Near the shore, heights
  // follow the distance from it, so the waterline falls where the map's
  // shoreline is, even between the terrain's grid points.
  const heightAt = (x, z) => {
    if (!inDetail(x, z)) return sampleGrid(horizon, far, x, z);
    const h = sampleGrid(terrain, detail, x, z), here = shore(x, z), water = Math.min(h, -LAGOON_FLOOR);
    if ([[-SHORE, -SHORE], [SHORE, -SHORE], [-SHORE, SHORE], [SHORE, SHORE]].every(([a, b]) => shore(x + a, z + b) === here)) return here ? h : water;
    const d = shoreDistance(x, z);
    return d > 0 ? Math.min(h, SHORE_SLOPE * d) : Math.max(water, SHORE_SLOPE * d);
  };
  const rawDepth = (x, z) => {
    const [img, half] = inDetail(x, z) ? [depth, detail.half] : [horizonDepth, far.half];
    const [u, v] = pixel(img, half, x, z);
    return (bilinear(img.data, img.width, img.height, u, v, img.channels, 0) / 255) * manifest.depth.max;
  };
  return {
    manifest, features, images: { ground, horizonColour, depth, horizonDepth, groundType },
    grids: { terrain, horizon },
    isLand,
    isMangrove: (x, z) => (landAt(x, z) & 2) !== 0,
    heightAt,
    depthAt: (x, z) => (isLand(x, z) ? 0 : Math.max(rawDepth(x, z), inDetail(x, z) ? LAGOON_FLOOR : 0)),
    groundAt: (x, z) => {
      if (!inDetail(x, z)) return heightAt(x, z) > 0 ? manifest.ground.scrubSoil : manifest.ground.water;
      const i = Math.floor(((x + detail.half) * groundType.width) / (2 * detail.half)), j = Math.floor(((z + detail.half) * groundType.height) / (2 * detail.half));
      return groundType.data[(Math.min(groundType.height - 1, j) * groundType.width + Math.min(groundType.width - 1, i)) * groundType.channels];
    },
  };
}

// The water's map of the detail area, for the water shader and the waves
// (waves.js): RGBA bytes, row 0 at -z. R the depth the colour method
// measured (0–depth.max m; 0 on land and on dark lagoon floor), G the
// distance to the reef line and B to the shore (land or mangroves), each
// 0–DISTANCE_MAX m; A the fetch, how far the wind (+x) has blown over water
// since it last crossed land, 0–FETCH_MAX m, or 255 where no land lies
// upwind in the map: the open sea. reefs: the lines the surf breaks on.
export function waterMap(spot, size = 1024, reefs = spot.features.reefs) {
  const { half } = spot.manifest.detail, cell = (2 * half) / size, depth = spot.images.depth;
  const land = new Uint8Array(size * size), reef = new Uint8Array(size * size), data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const { x, z } = imagePoint(i, j, half, size);
    land[j * size + i] = spot.isLand(x, z) ? 1 : 0;
  }
  for (const line of reefs) for (let k = 0; k + 1 < line.length; k++) {
    const [x1, z1] = line[k], [x2, z2] = line[k + 1], steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / (cell / 2));
    for (let s = 0; s <= steps; s++) {
      const i = Math.floor((x1 + ((x2 - x1) * s) / steps + half) / cell), j = Math.floor((z1 + ((z2 - z1) * s) / steps + half) / cell);
      if (i >= 0 && j >= 0 && i < size && j < size) reef[j * size + i] = 1;
    }
  }
  const toReef = distanceTransform(reef, size, size), toShore = distanceTransform(land, size, size);
  const byte = (cells) => Math.round(Math.min(255, ((cells * cell) / DISTANCE_MAX) * 255));
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const p = j * size + i, { x, z } = imagePoint(i, j, half, size);
    const u = ((x + half) * depth.width) / (2 * half) - 0.5, v = ((z + half) * depth.height) / (2 * half) - 0.5;
    data[p * 4] = Math.round(bilinear(depth.data, depth.width, depth.height, u, v, depth.channels, 0));
    data[p * 4 + 1] = byte(toReef[p]);
    data[p * 4 + 2] = byte(toShore[p]);
  }
  for (let j = 0; j < size; j++) {
    let run = Infinity;
    for (let i = 0; i < size; i++) {
      const p = j * size + i;
      run = land[p] ? 0 : run + cell;
      data[p * 4 + 3] = run === Infinity ? 255 : Math.min(254, Math.round((run / FETCH_MAX) * 255));
    }
  }
  return { data, size, half, depthMax: spot.manifest.depth.max, distanceMax: DISTANCE_MAX, fetchMax: FETCH_MAX, floor: LAGOON_FLOOR };
}

// The browser's decoder, keeping the files' raw values (no colour management).
export async function decodeInBrowser(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes]), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, channels: 4, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

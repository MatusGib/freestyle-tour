// A real-world spot's files (mods/venues/spots/<id>/, written by
// tools/spot.mjs) as samplers in the game frame: heights in metres (the
// seabed under water), depth, ground type and land. fetchBytes(url) →
// Uint8Array; decodeImage(bytes) → { width, height, channels, data }.
import { bilinear, fillPolygons } from "./raster.js";

const LAGOON_FLOOR = 0.8; // the colour method can't resolve Lac Bay's floor (PR #2)
const LAND_CELL = 2; // metres
const SHORE = 8; // metres either side of the shoreline that are shaped by it
const SHORE_SLOPE = 0.2; // rise of the beach and the shallows, m per m

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
  // (even-odd), 2 in the mangroves, which often stand in the water beyond.
  const landSize = (2 * detail.half) / LAND_CELL;
  const land = fillPolygons(features.shoreline, detail.half, landSize);
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
    heightAt,
    depthAt: (x, z) => (isLand(x, z) ? 0 : Math.max(rawDepth(x, z), inDetail(x, z) ? LAGOON_FLOOR : 0)),
    groundAt: (x, z) => {
      if (!inDetail(x, z)) return heightAt(x, z) > 0 ? manifest.ground.scrubSoil : manifest.ground.water;
      const i = Math.floor(((x + detail.half) * groundType.width) / (2 * detail.half)), j = Math.floor(((z + detail.half) * groundType.height) / (2 * detail.half));
      return groundType.data[(Math.min(groundType.height - 1, j) * groundType.width + Math.min(groundType.width - 1, i)) * groundType.channels];
    },
  };
}

// The browser's decoder, keeping the files' raw values (no colour management).
export async function decodeInBrowser(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes]), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, channels: 4, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

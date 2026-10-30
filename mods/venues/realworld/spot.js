// A real-world spot's files (mods/venues/spots/<id>/, written by
// tools/spot.mjs) as samplers in the game frame: heights in metres (the
// seabed under water), depth, ground type and land. fetchBytes(url) →
// Uint8Array; decodeImage(bytes) → { width, height, channels, data }.
import { bilinear, fillPolygons } from "./raster.js";

const LAGOON_FLOOR = 0.8; // the colour method can't resolve Lac Bay's floor (PR #2)
const LAND_CELL = 2; // metres

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
  const heightAt = (x, z) => (inDetail(x, z) ? sampleGrid(terrain, detail, x, z) : sampleGrid(horizon, far, x, z));
  // Land at 2 m over the detail area, from the shoreline rings (even-odd),
  // and the mangroves, which often stand in the water beyond them.
  const landSize = (2 * detail.half) / LAND_CELL;
  const land = fillPolygons(features.shoreline, detail.half, landSize);
  const mangroves = fillPolygons(features.mangroves, detail.half, landSize);
  for (let k = 0; k < land.length; k++) land[k] |= mangroves[k];
  const isLand = (x, z) => {
    if (!inDetail(x, z)) return false;
    const i = Math.floor((x + detail.half) / LAND_CELL), j = Math.floor((z + detail.half) / LAND_CELL);
    return land[Math.min(landSize - 1, j) * landSize + Math.min(landSize - 1, i)] === 1;
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

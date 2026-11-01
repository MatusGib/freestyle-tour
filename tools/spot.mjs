// Builds a real-world spot's files from open map data:
//   node tools/spot.mjs <id>              lists what it would download, or builds from the cache
//   node tools/spot.mjs <id> --download   downloads what is missing (each source once), then builds
//   node tools/spot.mjs <id> --where=x,z  prints the latitude and longitude of a game point (the = keeps a negative x working)
// Reads tour/spots/<id>.json; writes mods/venues/spots/<id>/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { decodeWms, resampleColour, wmsUrl } from "./spot/colour.mjs";
import { DEPTH_MAX, depthImage, fitDepth, logRatio } from "./spot/depth.mjs";
import { beachHeight, terrainSampler, terrainUrls } from "./spot/elevation.mjs";
import { createFetcher } from "./spot/fetcher.mjs";
import { latLonBox, localFrame } from "./spot/frame.mjs";
import { GROUND, groundType } from "./spot/ground.mjs";
import { OVERPASS, featuresFrom, overpassQuery } from "./spot/osm.mjs";
import { courseProblems, credits, drawLines, picture } from "./spot/output.mjs";
import { decodePng, encodePng } from "./spot/png.mjs";
import { bilinear, distanceTransform, fillPolygons, gridPoint } from "./spot/raster.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const IMAGE = { detail: 512, horizon: 1024 };
const STEP = { detail: 5, horizon: 50 };
const ZOOM = { detail: 14, horizon: 12 };

const { values, positionals: [id] } = parseArgs({ allowPositionals: true, options: { download: { type: "boolean", default: false }, where: { type: "string" } } });
const spot = JSON.parse(readFileSync(join(ROOT, "tour", "spots", `${id}.json`), "utf8"));
const frame = localFrame(spot.centre, spot.windFrom);
if (values.where) {
  const [x, z] = values.where.split(",").map(Number);
  console.log(frame.toLatLon(x, z));
  process.exit(0);
}

const fetcher = createFetcher({ cacheDir: join(ROOT, "cache", "spots", id), download: values.download });
const boxes = { detail: latLonBox(frame, spot.detail), horizon: latLonBox(frame, spot.horizon) };
const query = `data=${encodeURIComponent(overpassQuery(boxes.detail, spot.island))}`;
const tiles = { detail: terrainUrls(boxes.detail, ZOOM.detail), horizon: terrainUrls(boxes.horizon, ZOOM.horizon) };
const wms = { detail: wmsUrl(boxes.detail, 1024, spot.layer), horizon: wmsUrl(boxes.horizon, 2048, spot.layer) };
fetcher.need(OVERPASS, "OpenStreetMap (Overpass, a few MB)", query);
for (const t of [...tiles.detail, ...tiles.horizon]) fetcher.need(t.url, "Terrain Tiles (about 100 KB each)");
for (const url of Object.values(wms)) fetcher.need(url, "EOX Sentinel-2 cloudless (a few MB each)");
const missing = fetcher.missing();
if (missing.length && !values.download) {
  console.log(`To build ${id}, these downloads are needed:\n${missing.map((m) => `  ${m.count} × ${m.source}`).join("\n")}\nRun again with --download once they are OK'd.`);
  process.exit(2);
}

const osm = JSON.parse((await fetcher.get(OVERPASS, { source: "OpenStreetMap", body: query })).toString("utf8"));
const features = featuresFrom(osm.elements, frame);
if (features.openCoastline) console.warn(`${features.openCoastline} coastline pieces did not close; widen "island".`);

async function build(part) {
  const half = spot[part], size = IMAGE[part];
  const decoded = await Promise.all(tiles[part].map(async (t) => ({ ...t, image: decodePng(await fetcher.get(t.url, { source: "Terrain Tiles" })) })));
  const heightAt = terrainSampler(decoded);
  const colour = resampleColour(decodeWms(await fetcher.get(wms[part], { source: "EOX" })), boxes[part], frame, half, size);
  // beachesAreLand: mapped beaches beyond the coastline are dry too, as
  // Prasonisi's sandbar is all summer although the coastline leaves it open.
  const land = fillPolygons(features.shoreline, half, size);
  if (spot.beachesAreLand) fillPolygons(features.beaches, half, size).forEach((v, p) => { land[p] |= v; });
  const water = Uint8Array.from(land, (v) => 1 - v);
  const cell = 2 * half / size, toLand = distanceTransform(land, size, size), toWater = distanceTransform(water, size, size);
  const shore = Float32Array.from(land, (v, p) => (v ? toWater[p] : -toLand[p]) * cell);
  return { half, size, heightAt, colour, land, shore };
}

const detail = await build("detail"), horizon = await build("horizon");
const out = join(ROOT, "mods", "venues", "spots", id);
mkdirSync(out, { recursive: true });
const write = (name, bytes) => writeFileSync(join(out, name), bytes);

// The comparison first: it is what the calibration points are picked from.
const compare = structuredClone(detail.colour);
drawLines(compare, detail.half, features.shoreline, [255, 60, 60]);
drawLines(compare, detail.half, features.reefs, [255, 220, 0]);
drawLines(compare, detail.half, features.buildings.map((b) => b.footprint), [255, 255, 255]);
drawLines(compare, detail.half, [[[-110, -210], [110, -210], [110, 210], [-110, 210], [-110, -210]]], [0, 255, 255]);
write("compare.png", encodePng(compare));
if (new Set(spot.calibration.map((p) => p.depth)).size < 2) {
  console.log(`Wrote ${join(out, "compare.png")}. Add calibration points to the spot file (see the plan), then run again.`);
  process.exit(3);
}

// Depth: calibrated on the detail colour at the spot's calibration points.
const ratioAt = ({ lat, lon }) => {
  const { x, z } = frame.toGame(lat, lon), s = detail.size / (2 * detail.half);
  const u = (x + detail.half) * s - 0.5, v = (z + detail.half) * s - 0.5;
  const rgb = [0, 1, 2].map((c) => bilinear(detail.colour.data, detail.size, detail.size, u, v, 3, c));
  return logRatio(...rgb);
};
const depthOf = fitDepth(spot.calibration.map((p) => ({ ratio: ratioAt(p), depth: p.depth })));
const depth = { detail: depthImage(detail.colour, detail.land, depthOf), horizon: depthImage(horizon.colour, horizon.land, depthOf) };
const problems = courseProblems(depth.detail, detail.half);
if (problems.length) {
  console.error(`The course would not lie in sailable water:\n${problems.slice(0, 20).join("\n")}`);
  process.exit(1);
}

// Ground types on the detail image.
const polygonMask = (rings) => fillPolygons(rings, detail.half, detail.size);
const masks = { mangrove: polygonMask(features.mangroves), beach: polygonMask(features.beaches), building: polygonMask(features.buildings.map((b) => b.footprint)) };
const ground = { width: detail.size, height: detail.size, channels: 1, data: new Uint8Array(detail.size ** 2) };
for (let p = 0; p < ground.data.length; p++) ground.data[p] = groundType({ land: detail.land[p], shore: detail.shore[p], colour: [...detail.colour.data.subarray(p * 3, p * 3 + 3)], mangrove: masks.mangrove[p], beach: masks.beach[p], building: masks.building[p] });

// Heights on each part's grid, in decimetres.
function heights(part, src) {
  const step = STEP[part], n = (2 * src.half) / step + 1, out = new Int16Array(n * n), s = src.size / (2 * src.half);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const { x, z } = gridPoint(i, j, src.half, step), { lat, lon } = frame.toLatLon(x, z);
    const u = (x + src.half) * s - 0.5, v = (z + src.half) * s - 0.5;
    const shoreAt = bilinear(src.shore, src.size, src.size, u, v);
    const metres = (bilinear(depth[part].data, src.size, src.size, u, v) / 255) * DEPTH_MAX;
    out[j * n + i] = Math.round(beachHeight(shoreAt, src.heightAt(lat, lon), spot.beach, metres) * 10);
  }
  return { n, data: out };
}
const terrain = heights("detail", detail), far = heights("horizon", horizon);

// Write the rest.
write("terrain.bin", Buffer.from(terrain.data.buffer));
write("horizon.bin", Buffer.from(far.data.buffer));
write("ground.png", encodePng(detail.colour));
write("horizon.png", encodePng(horizon.colour));
write("depth.png", encodePng(depth.detail));
write("horizon-depth.png", encodePng(depth.horizon));
write("ground-type.png", encodePng(ground));
write("features.json", `${JSON.stringify(features)}\n`);
write("picture.png", encodePng(picture(detail.colour, detail.half)));
write("CREDITS.md", credits(spot));
write("spot.json", `${JSON.stringify({
  version: 1, id, name: spot.name, centre: spot.centre, windFrom: spot.windFrom, ...(spot.beachesAreLand ? { beachesAreLand: true } : {}),
  detail: { half: detail.half, step: STEP.detail, n: terrain.n, image: IMAGE.detail },
  horizon: { half: horizon.half, step: STEP.horizon, n: far.n, image: IMAGE.horizon },
  depth: { max: DEPTH_MAX, slope: depthOf.slope, intercept: depthOf.intercept },
  ground: GROUND,
}, null, 2)}\n`);
console.log(`Wrote ${out}: ${features.buildings.length} buildings, ${features.shoreline.length} shoreline rings, ${features.mangroves.length} mangrove areas.`);

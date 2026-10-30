# Spot data tool Implementation Plan (real-world spots, plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `node tools/spot.mjs sorobon-bonaire` turns open map data into Sorobon's files in game coordinates: terrain heights, true colours, seabed depth, ground types, map features, a comparison image, a chooser picture and credits.

**Architecture:** Small Node modules under `tools/spot/`, each pure and tested on synthetic data: a PNG codec, the local game frame, a consent-gated download cache, OpenStreetMap features and land rasters, elevation from Terrain Tiles, colour from EOX's Sentinel-2 cloudless WMS, depth from colour, ground types, and the writers. A CLI wires them for one spot file in `tour/spots/`.

**Tech Stack:** Node 22, `node:zlib` and `node:test`, no dependencies. Sources: Overpass API (OpenStreetMap), AWS Terrain Tiles (terrarium PNG), EOX WMS (`s2cloudless-2024`, PNG).

Spec: `docs/superpowers/specs/2026-10-30-real-world-spots-design.md`. Plan 2 (building the spot in the game) is written once these files exist.

---

## Conventions used by every task

- **Game frame:** metres around the spot's `centre`, turned so the wind blows along +x, never mirrored. Up is +y; the ground plane is x, z.
- **Height grids:** `n = 2·half/step + 1` points per side; point `(i, j)` is at `x = −half + i·step`, `z = −half + j·step`; stored row-major (`j·n + i`), Int16 little-endian, decimetres.
- **Images:** `size × size` pixels over the same square; pixel `(i, j)` is centred at `x = −half + (i + 0.5)·2·half/size`, `z = −half + (j + 0.5)·2·half/size`; row 0 is at −z.
- **Ground types:** 0 water, 1 dry sand, 2 wet sand, 3 coral rubble, 4 scrub soil, 5 rock, 6 mangrove, 7 built-up.
- **The course:** the game's heat area is 220 m along the wind (x) by 420 m across it (z), centred on the origin. The AI overshoots its ends by up to 43 m.

Run one test file with `node --test test/<file>.test.mjs`, all with `npm test`.

## Files

| File | Responsibility |
|---|---|
| `tools/spot/png.mjs` | Decode and encode 8-bit PNG |
| `tools/spot/frame.mjs` | The game frame, lat/lon boxes, Web Mercator tiles |
| `tools/spot/fetcher.mjs` | Cached downloads that never happen without `--download` |
| `tools/spot/osm.mjs` | The Overpass query, coastline rings, features in game coordinates |
| `tools/spot/raster.mjs` | Polygon fill, distance transform, bilinear sampling, grids |
| `tools/spot/elevation.mjs` | Terrain Tiles: URLs, decoding, heights with the beach rebuilt |
| `tools/spot/colour.mjs` | EOX WMS URLs and resampling into the game frame |
| `tools/spot/depth.mjs` | Depth from colour, calibrated |
| `tools/spot/ground.mjs` | Ground types |
| `tools/spot/output.mjs` | The course check, comparison image, picture, credits, manifest |
| `tools/spot.mjs` | The CLI |
| `tour/spots/sorobon-bonaire.json` | Sorobon's spot file |
| `mods/venues/spots/sorobon-bonaire/` | The tool's output, committed |
| `test/spot-*.test.mjs` | Tests |
| `.gitignore` | `cache/` already covers `cache/spots/` |

---

### Task 1: PNG codec

**Files:** Create `tools/spot/png.mjs`, `test/spot-png.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// The tool's PNG codec: 8-bit grey, RGB, RGBA and palette images, all five
// row filters.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { chunk, decodePng, encodePng } from "../tools/spot/png.mjs";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = (w, h, type) => { const b = Buffer.alloc(13); b.writeUInt32BE(w, 0); b.writeUInt32BE(h, 4); b[8] = 8; b[9] = type; return b; };
const png = (w, h, type, raw, extra = []) => Buffer.concat([SIGNATURE, chunk("IHDR", ihdr(w, h, type)), ...extra, chunk("IDAT", deflateSync(Buffer.from(raw))), chunk("IEND", Buffer.alloc(0))]);

test("an image comes back as it was encoded", () => {
  for (const channels of [1, 3, 4]) {
    const data = Uint8Array.from({ length: 5 * 3 * channels }, (_, i) => (i * 37) & 255);
    assert.deepEqual(decodePng(encodePng({ width: 5, height: 3, channels, data })), { width: 5, height: 3, channels, data });
  }
});

test("all five row filters are undone", () => {
  // A 2 × 2 grey image, rows [10, 20] and [30, 45], each row filtered differently.
  const rows = (f0, r0, f1, r1) => [f0, ...r0, f1, ...r1];
  const expect = Uint8Array.from([10, 20, 30, 45]);
  assert.deepEqual(decodePng(png(2, 2, 0, rows(0, [10, 20], 2, [20, 25]))).data, expect, "none, up");
  assert.deepEqual(decodePng(png(2, 2, 0, rows(1, [10, 10], 3, [25, 20]))).data, expect, "sub, average");
  // Paeth on the second row: for x0, a=0 b=10 c=0 → predictor b=10; for x1, a=30 b=20 c=10 → p=40, nearest a=30.
  assert.deepEqual(decodePng(png(2, 2, 0, rows(0, [10, 20], 4, [20, 15]))).data, expect, "paeth");
});

test("a palette image is expanded to RGB", () => {
  const plte = chunk("PLTE", Buffer.from([255, 0, 0, 0, 0, 255]));
  const out = decodePng(png(2, 1, 3, [0, 0, 1], [plte]));
  assert.deepEqual(out, { width: 2, height: 1, channels: 3, data: Uint8Array.from([255, 0, 0, 0, 0, 255]) });
});

test("unsupported images are refused with the reason", () => {
  assert.throws(() => decodePng(Buffer.from("nope")), /not a PNG/);
  const b = ihdr(1, 1, 0); b[8] = 16;
  assert.throws(() => decodePng(Buffer.concat([SIGNATURE, chunk("IHDR", b), chunk("IEND", Buffer.alloc(0))])), /bit depth 16/);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/spot-png.test.mjs` — Expected: FAIL, module not found.

- [ ] **Step 3: Write `tools/spot/png.mjs`**

```js
// 8-bit PNG decoding and encoding for the spot tool, on node:zlib alone:
// grey, RGB, RGBA and palette images, not interlaced.
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const COLOUR_TYPE = { 1: 0, 2: 4, 3: 2, 4: 6 };
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

export function chunk(kind, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(kind, 4, "latin1");
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

// { width, height, channels, data: Uint8Array } (palette images come back RGB).
export function decodePng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let width, height, depth, type, interlace, palette = null;
  const idat = [];
  for (let at = 8; at < buffer.length;) {
    const length = buffer.readUInt32BE(at);
    const kind = buffer.toString("latin1", at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (kind === "IHDR") [width, height, depth, type, interlace] = [body.readUInt32BE(0), body.readUInt32BE(4), body[8], body[9], body[12]];
    else if (kind === "PLTE") palette = body;
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    at += 12 + length;
  }
  if (depth !== 8 || interlace !== 0 || !(type in CHANNELS)) throw new Error(`unsupported PNG: bit depth ${depth}, colour type ${type}, interlace ${interlace}`);
  const bpp = CHANNELS[type], stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[row + i - bpp] : 0, b = y ? out[row - stride + i] : 0, c = i >= bpp && y ? out[row - stride + i - bpp] : 0;
      const x = raw[src + i];
      const v = filter === 0 ? x : filter === 1 ? x + a : filter === 2 ? x + b : filter === 3 ? x + ((a + b) >> 1) : filter === 4 ? x + paeth(a, b, c) : NaN;
      if (Number.isNaN(v)) throw new Error(`bad PNG filter ${filter}`);
      out[row + i] = v & 255;
    }
  }
  if (type !== 3) return { width, height, channels: bpp, data: out };
  const rgb = new Uint8Array(width * height * 3);
  for (let p = 0; p < out.length; p++) rgb.set(palette.subarray(out[p] * 3, out[p] * 3 + 3), p * 3);
  return { width, height, channels: 3, data: rgb };
}

export function encodePng({ width, height, channels, data }) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8;
  head[9] = COLOUR_TYPE[channels];
  const stride = width * channels, raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk("IHDR", head), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
```

- [ ] **Step 4: Run to see them pass** — `node --test test/spot-png.test.mjs`: PASS (4 tests).
- [ ] **Step 5: Commit** — `git add tools/spot/png.mjs test/spot-png.test.mjs && git commit -m "Decode and encode PNG for the spot tool"`

---

### Task 2: The game frame and map tiles

**Files:** Create `tools/spot/frame.mjs`, `test/spot-frame.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run to see them fail** — module not found.
- [ ] **Step 3: Write `tools/spot/frame.mjs`**

```js
// The game frame of a spot: metres around its centre, turned so the wind
// blows along the game's +x, never mirrored. three.js's own top view has x
// east and z south; the frame is that view turned about y, so left and right
// stay true.
const R = 6378137;
const RAD = Math.PI / 180;

// windFrom: the bearing the wind comes from, degrees clockwise from north.
export function localFrame({ lat, lon }, windFrom) {
  const kx = R * RAD * Math.cos(lat * RAD), ky = R * RAD;
  const phi = (windFrom + 90) * RAD, c = Math.cos(phi), s = Math.sin(phi);
  return {
    centre: { lat, lon },
    windFrom,
    toGame(la, lo) {
      const sx = (lo - lon) * kx, sz = -(la - lat) * ky;
      return { x: sx * c + sz * s, z: -sx * s + sz * c };
    },
    toLatLon(x, z) {
      const sx = x * c - z * s, sz = x * s + z * c;
      return { lat: lat - sz / ky, lon: lon + sx / kx };
    },
  };
}

// The latitude/longitude box holding the game square [-half, half]².
export function latLonBox(frame, half) {
  const corners = [[-half, -half], [half, -half], [-half, half], [half, half]].map(([x, z]) => frame.toLatLon(x, z));
  return { south: Math.min(...corners.map((p) => p.lat)), north: Math.max(...corners.map((p) => p.lat)), west: Math.min(...corners.map((p) => p.lon)), east: Math.max(...corners.map((p) => p.lon)) };
}

// Fractional Web Mercator tile coordinates at zoom z.
export function tileOf(lat, lon, z) {
  const n = 2 ** z, la = lat * RAD;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n };
}
```

- [ ] **Step 4: Run to see them pass** — PASS (4 tests).
- [ ] **Step 5: Commit** — `git commit -m "Place a spot in the game frame, turned to the wind and never mirrored"` (with both files added).

---

### Task 3: Downloads only with consent

**Files:** Create `tools/spot/fetcher.mjs`, `test/spot-fetcher.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFetcher } from "../tools/spot/fetcher.mjs";
import { tempDir } from "./helpers.mjs";

const fakeFetch = (calls) => async (url) => { calls.push(url); return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(`body of ${url}`) }; };

test("without consent nothing is downloaded; what is missing is listed", async (t) => {
  const calls = [];
  const fetcher = createFetcher({ cacheDir: tempDir(t), download: false, fetch: fakeFetch(calls) });
  fetcher.need("https://a.test/1", "Terrain Tiles");
  fetcher.need("https://a.test/2", "Terrain Tiles");
  assert.deepEqual(fetcher.missing(), [{ source: "Terrain Tiles", count: 2 }]);
  await assert.rejects(() => fetcher.get("https://a.test/1"), /not downloaded yet/);
  assert.deepEqual(calls, []);
});

test("with consent each URL is downloaded once, then read from the cache", async (t) => {
  const calls = [], cacheDir = tempDir(t);
  const fetcher = createFetcher({ cacheDir, download: true, fetch: fakeFetch(calls) });
  assert.equal((await fetcher.get("https://a.test/1")).toString(), "body of https://a.test/1");
  await fetcher.get("https://a.test/1");
  assert.equal(calls.length, 1);
  const offline = createFetcher({ cacheDir, download: false, fetch: fakeFetch(calls) });
  offline.need("https://a.test/1", "x");
  assert.deepEqual(offline.missing(), []);
  assert.equal((await offline.get("https://a.test/1")).toString(), "body of https://a.test/1");
});

test("a failed download names its source", async (t) => {
  const fetcher = createFetcher({ cacheDir: tempDir(t), download: true, fetch: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(() => fetcher.get("https://a.test/1", { source: "EOX" }), /EOX: https:\/\/a.test\/1 answered 503/);
});
```

- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Write `tools/spot/fetcher.mjs`**

```js
// Downloads for the spot tool, through a cache (cache/spots/<id>/), and never
// without consent: a run without --download only lists what it would fetch.
// A request is identified by its URL and, for POSTs, its body.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const USER_AGENT = "freestyle-tour-spots/1.0 (private, non-commercial)";

export function createFetcher({ cacheDir, download = false, fetch = globalThis.fetch }) {
  const fileFor = (url, body = "") => join(cacheDir, `${createHash("sha256").update(url + body).digest("hex").slice(0, 32)}.bin`);
  const needed = new Map(); // source → count of uncached requests
  return {
    // Notes a request the run will make, so missing() can list it first.
    need(url, source, body) {
      if (!existsSync(fileFor(url, body))) needed.set(source, (needed.get(source) ?? 0) + 1);
    },
    missing: () => [...needed].map(([source, count]) => ({ source, count })),
    async get(url, { source = "download", body } = {}) {
      const file = fileFor(url, body);
      if (existsSync(file)) return readFileSync(file);
      if (!download) throw new Error(`${source}: ${url} is not downloaded yet; run again with --download`);
      const res = await fetch(url, body ? { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT } } : { headers: { "user-agent": USER_AGENT } });
      if (!res.ok) throw new Error(`${source}: ${url} answered ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(file, bytes);
      return bytes;
    },
  };
}
```

- [ ] **Step 4: Run to see them pass** — PASS (3 tests).
- [ ] **Step 5: Commit** — `git commit -m "Download spot data only with consent, through a cache"`

---

### Task 4: Rasters: polygons, distances, sampling

**Files:** Create `tools/spot/raster.mjs`, `test/spot-raster.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { bilinear, distanceTransform, fillPolygons, gridPoint, imagePoint } from "../tools/spot/raster.mjs";

test("grid points and image pixels sit where the conventions say", () => {
  assert.deepEqual(gridPoint(0, 0, 100, 50), { x: -100, z: -100 });
  assert.deepEqual(gridPoint(4, 2, 100, 50), { x: 100, z: 0 });
  assert.deepEqual(imagePoint(0, 0, 100, 4), { x: -75, z: -75 });
});

test("polygons fill by even-odd, so a hole stays empty", () => {
  const outer = [[-80, -80], [80, -80], [80, 80], [-80, 80]], hole = [[-30, -30], [30, -30], [30, 30], [-30, 30]];
  const mask = fillPolygons([outer, hole], 100, 10); // 10 × 10 pixels of 20 m
  assert.equal(mask[5 * 10 + 5], 0, "the hole");
  assert.equal(mask[5 * 10 + 1], 1, "inside the outer ring");
  assert.equal(mask[0], 0, "outside");
});

test("the distance transform measures to the nearest marked cell", () => {
  const mask = new Uint8Array(25); mask[12] = 1; // the centre of 5 × 5
  const d = distanceTransform(mask, 5, 5);
  assert.equal(d[12], 0); assert.equal(d[13], 1); assert.equal(d[0], Math.SQRT2 * 2);
});

test("bilinear sampling blends the four neighbours and clamps at the edges", () => {
  const values = Float32Array.from([0, 10, 20, 30]); // 2 × 2
  assert.equal(bilinear(values, 2, 2, 0.5, 0.5), 15);
  assert.equal(bilinear(values, 2, 2, -3, 9), 20);
});
```

- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Write `tools/spot/raster.mjs`**

```js
// Raster helpers for the spot tool, in the game frame's conventions: height
// grids have points at -half + i·step, images have pixel centres at
// -half + (i + 0.5)·cell.

export const gridPoint = (i, j, half, step) => ({ x: -half + i * step, z: -half + j * step });
export const imagePoint = (i, j, half, size) => ({ x: -half + (i + 0.5) * (2 * half / size), z: -half + (j + 0.5) * (2 * half / size) });

// 1 where the pixel centre is inside the rings (even-odd, so holes and islands
// in lakes work), else 0. rings: [[x, z], ...] closed or not.
export function fillPolygons(rings, half, size) {
  const mask = new Uint8Array(size * size), cell = 2 * half / size;
  for (let j = 0; j < size; j++) {
    const z = -half + (j + 0.5) * cell, xs = [];
    for (const ring of rings) {
      for (let k = 0, n = ring.length; k < n; k++) {
        const [x1, z1] = ring[k], [x2, z2] = ring[(k + 1) % n];
        if ((z1 <= z) !== (z2 <= z)) xs.push(x1 + ((z - z1) / (z2 - z1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] + half) / cell - 0.5)), to = Math.min(size - 1, Math.floor((xs[k + 1] + half) / cell - 0.5));
      for (let i = from; i <= to; i++) mask[j * size + i] = 1;
    }
  }
  return mask;
}

// Felzenszwalb and Huttenlocher's exact Euclidean distance transform: for
// each cell, the distance in cells to the nearest cell where mask is 1.
export function distanceTransform(mask, width, height) {
  const INF = 1e20, f = new Float64Array(Math.max(width, height)), d = new Float64Array(width * height);
  for (let p = 0; p < d.length; p++) d[p] = mask[p] ? 0 : INF;
  const pass = (n, get, set) => {
    const v = new Int32Array(n), zz = new Float64Array(n + 1);
    for (let q = 0; q < n; q++) f[q] = get(q);
    let k = 0; v[0] = 0; zz[0] = -INF; zz[1] = INF;
    for (let q = 1; q < n; q++) {
      let s;
      while ((s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])) <= zz[k]) k--;
      k++; v[k] = q; zz[k] = s; zz[k + 1] = INF;
    }
    for (let q = 0, kk = 0; q < n; q++) {
      while (zz[kk + 1] < q) kk++;
      set(q, (q - v[kk]) ** 2 + f[v[kk]]);
    }
  };
  for (let i = 0; i < width; i++) pass(height, (q) => d[q * width + i], (q, value) => (d[q * width + i] = value));
  for (let j = 0; j < height; j++) pass(width, (q) => d[j * width + q], (q, value) => (d[j * width + q] = value));
  return Float32Array.from(d, Math.sqrt);
}

// The value at fractional pixel (u, v), pixel centres at integers, clamped.
export function bilinear(values, width, height, u, v, channels = 1, channel = 0) {
  const cu = Math.min(Math.max(u, 0), width - 1), cv = Math.min(Math.max(v, 0), height - 1);
  const i = Math.min(Math.floor(cu), width - 2), j = Math.min(Math.floor(cv), height - 2), fu = cu - i, fv = cv - j;
  const at = (a, b) => values[(b * width + a) * channels + channel];
  return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
}
```

(For a 1-pixel-wide image, `width - 2` is −1; spot images are always at least 2 × 2.)

- [ ] **Step 4: Run to see them pass** — PASS (4 tests). If the distance transform's corner value differs by floating error, compare with a tolerance of 1e-9.
- [ ] **Step 5: Commit** — `git commit -m "Fill polygons, measure distances and sample rasters for the spot tool"`

---

### Task 5: OpenStreetMap features

**Files:** Create `tools/spot/osm.mjs`, `test/spot-osm.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { featuresFrom, overpassQuery, stitchRings } from "../tools/spot/osm.mjs";

const way = (id, nodes, tags = {}, geometry) => ({ type: "way", id, nodes, tags, geometry: geometry ?? nodes.map((n) => ({ lat: n / 1000, lon: n / 1000 })) });

test("coastline ways are stitched into closed rings; open ends are reported", () => {
  const { rings, open } = stitchRings([way(1, [1, 2, 3]), way(2, [3, 4, 1]), way(3, [7, 8])]);
  assert.deepEqual(rings.map((r) => r.map((p) => p.lat * 1000)), [[1, 2, 3, 4, 1]]);
  assert.equal(open, 1);
});

test("features come out in game coordinates, with building heights", () => {
  const frame = { toGame: (lat, lon) => ({ x: lon * 1000, z: lat * 1000 }) };
  const elements = [
    way(1, [1, 2, 3, 1], { natural: "coastline" }),
    way(10, [5, 6, 7, 5], { building: "yes", "building:levels": "2" }),
    way(11, [5, 6, 7, 5], { building: "yes", height: "7.5 m" }),
    way(12, [5, 6, 7, 5], { building: "hut" }),
    way(13, [5, 6], { natural: "reef" }),
    way(14, [5, 6, 7, 5], { natural: "wetland", wetland: "mangrove" }),
    way(15, [5, 6, 7, 5], { natural: "beach" }),
    way(16, [5, 6], { highway: "track" }),
    way(17, [5, 6], { man_made: "pier" }),
  ];
  const f = featuresFrom(elements, frame);
  assert.equal(f.shoreline.length, 1);
  assert.deepEqual(f.buildings.map((b) => b.height), [6, 7.5, 4]);
  assert.deepEqual([f.reefs.length, f.mangroves.length, f.beaches.length, f.roads[0].kind, f.piers.length], [1, 1, 1, "track", 1]);
  assert.deepEqual(f.buildings[0].footprint[0], [5, 5]);
});

test("the query asks for the island's whole coastline and the detail area's features", () => {
  const q = overpassQuery({ south: 1, west: 2, north: 3, east: 4 }, { south: 0, west: 0, north: 9, east: 9 });
  assert.match(q, /way\["natural"="coastline"\]\(0,0,9,9\)/);
  assert.match(q, /way\["building"\]\(1,2,3,4\)/);
  assert.match(q, /out geom;/);
});
```

- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Write `tools/spot/osm.mjs`**

```js
// OpenStreetMap data for a spot, from the Overpass API: the whole island's
// coastline (so its rings close) and the detail area's features, converted to
// the game frame. Data © OpenStreetMap contributors, ODbL.

export const OVERPASS = "https://overpass-api.de/api/interpreter";
const bbox = (b) => `(${b.south},${b.west},${b.north},${b.east})`;

export function overpassQuery(detail, island) {
  const d = bbox(detail);
  return `[out:json][timeout:180];
(
  way["natural"="coastline"]${bbox(island)};
  way["natural"~"^(beach|reef|sand|bare_rock|scrub|wetland)$"]${d};
  relation["natural"~"^(beach|reef|wetland)$"]${d};
  way["building"]${d};
  way["highway"]${d};
  way["man_made"="pier"]${d};
);
out geom;`;
}

// Coastline ways joined end to end into closed rings of { lat, lon }. Ways
// that never close (the query cut them) are counted in `open`.
export function stitchRings(ways) {
  const byStart = new Map(ways.map((w) => [w.nodes[0], w]));
  const used = new Set(), rings = [];
  let open = 0;
  for (const first of ways) {
    if (used.has(first)) continue;
    const ring = [];
    let w = first;
    while (w && !used.has(w)) {
      used.add(w);
      ring.push(...(ring.length ? w.geometry.slice(1) : w.geometry));
      w = byStart.get(w.nodes.at(-1));
    }
    if (w === first) rings.push(ring);
    else open += 1;
  }
  return { rings, open };
}

const levelsHeight = (tags) => {
  const height = parseFloat(tags.height);
  if (Number.isFinite(height)) return height;
  const levels = parseFloat(tags["building:levels"]);
  return Number.isFinite(levels) ? levels * 3 : 4;
};

// The features a spot uses, as [x, z] lines and rings in the game frame.
export function featuresFrom(elements, frame) {
  const toGame = (points) => points.map(({ lat, lon }) => { const { x, z } = frame.toGame(lat, lon); return [Math.round(x * 10) / 10, Math.round(z * 10) / 10]; });
  const ways = elements.filter((e) => e.type === "way" && e.geometry);
  const outerRings = (e) => (e.type === "way" ? [e.geometry] : (e.members ?? []).filter((m) => m.role === "outer" && m.geometry).map((m) => m.geometry));
  const polygonsOf = (test) => elements.filter((e) => e.tags && test(e.tags)).flatMap(outerRings).map(toGame);
  const { rings, open } = stitchRings(ways.filter((w) => w.tags?.natural === "coastline"));
  return {
    shoreline: rings.map(toGame),
    openCoastline: open,
    mangroves: polygonsOf((t) => t.natural === "wetland" && t.wetland === "mangrove"),
    beaches: polygonsOf((t) => t.natural === "beach" || t.natural === "sand"),
    reefs: polygonsOf((t) => t.natural === "reef"),
    buildings: ways.filter((w) => w.tags?.building).map((w) => ({ footprint: toGame(w.geometry), height: levelsHeight(w.tags), kind: w.tags.building })),
    roads: ways.filter((w) => w.tags?.highway).map((w) => ({ kind: w.tags.highway, line: toGame(w.geometry) })),
    piers: ways.filter((w) => w.tags?.man_made === "pier").map((w) => toGame(w.geometry)),
  };
}
```

- [ ] **Step 4: Run to see them pass** — PASS (3 tests).
- [ ] **Step 5: Commit** — `git commit -m "Read OpenStreetMap features into the game frame, closing the coastline"`

---

### Task 6: Elevation with the beach rebuilt

**Files:** Create `tools/spot/elevation.mjs`, `test/spot-elevation.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Write `tools/spot/elevation.mjs`**

```js
// Heights for a spot: AWS Terrain Tiles (terrarium PNG, open data on AWS;
// SRTM-class, about 30 m) sampled into the game frame, with the shore rebuilt
// from the coastline, since 30 m cells can't hold a beach, and the seabed from
// the depth map.
import { tileOf } from "./frame.mjs";

export const TERRAIN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
export const terrariumHeight = (r, g, b) => r * 256 + g + b / 256 - 32768;

export function terrainUrls(box, z) {
  const a = tileOf(box.north, box.west, z), b = tileOf(box.south, box.east, z), urls = [];
  for (let y = Math.floor(a.y); y <= Math.floor(b.y); y++) for (let x = Math.floor(a.x); x <= Math.floor(b.x); x++) urls.push({ z, x, y, url: `${TERRAIN}/${z}/${x}/${y}.png` });
  return urls;
}

// A sampler over decoded tiles ({ z, x, y, image }): height at a lat/lon.
export function terrainSampler(tiles) {
  const byKey = new Map(tiles.map((t) => [`${t.x}/${t.y}`, t])), z = tiles[0].z;
  return (lat, lon) => {
    const p = tileOf(lat, lon, z), tx = Math.floor(p.x), ty = Math.floor(p.y), t = byKey.get(`${tx}/${ty}`);
    if (!t) return 0;
    const px = Math.min(255, Math.max(0, Math.floor((p.x - tx) * 256))), py = Math.min(255, Math.max(0, Math.floor((p.y - ty) * 256)));
    const k = (py * 256 + px) * t.image.channels, d = t.image.data;
    return terrariumHeight(d[k], d[k + 1], d[k + 2]);
  };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The height at signed distance `shore` from the shoreline (metres, land
// positive), given the coarse elevation there and, under water, the depth.
// beach: { top: height at the water's edge, slope, width: where the profile
// hands over to the elevation }.
export function beachHeight(shore, elevation, beach, depth = 0) {
  if (shore < 0) return -depth;
  const profile = beach.top + beach.slope * shore;
  const blend = smooth(beach.width * 0.5, beach.width * 1.5, shore);
  return Math.round(((1 - blend) * profile + blend * Math.max(elevation, profile)) * 10) / 10;
}
```

- [ ] **Step 4: Run to see them pass** — PASS (3 tests). (`beachHeight(5, 0, …)` = 0.4 + 0.1 = 0.5; blend 0 below 40 m.)
- [ ] **Step 5: Commit** — `git commit -m "Sample Terrain Tiles and rebuild the beach from the shoreline"`

---

### Task 7: Colour from Sentinel-2 cloudless

**Files:** Create `tools/spot/colour.mjs`, `test/spot-colour.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
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
```

(The first pixel, at x = z = −25, maps to latitude 0.75, longitude 0.25, which is image pixel (0, 0): red.)

- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Write `tools/spot/colour.mjs`**

```js
// True colour for a spot from EOX's Sentinel-2 cloudless WMS (PNG), resampled
// into the game frame. "Sentinel-2 cloudless - https://s2maps.eu by EOX IT
// Services GmbH (Contains modified Copernicus Sentinel data 2024)",
// CC BY-NC-SA 4.0.
import { bilinear, imagePoint } from "./raster.mjs";

export const WMS = "https://tiles.maps.eox.at/wms";

export function wmsUrl(box, size, layer) {
  const q = new URLSearchParams({ service: "WMS", request: "GetMap", version: "1.1.1", layers: layer, styles: "", srs: "EPSG:4326", bbox: `${box.west},${box.south},${box.east},${box.north}`, width: String(size), height: String(size), format: "image/png" });
  return `${WMS}?${q}`;
}

// An RGB image ({ width, height, channels, data }) of the game square
// [-half, half]², size pixels a side, from a WMS image over `box`.
export function resampleColour(image, box, frame, half, size) {
  const data = new Uint8Array(size * size * 3);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const { x, z } = imagePoint(i, j, half, size), { lat, lon } = frame.toLatLon(x, z);
      const u = ((lon - box.west) / (box.east - box.west)) * image.width - 0.5, v = ((box.north - lat) / (box.north - box.south)) * image.height - 0.5;
      for (let c = 0; c < 3; c++) data[(j * size + i) * 3 + c] = Math.round(bilinear(image.data, image.width, image.height, u, v, image.channels, c));
    }
  }
  return { width: size, height: size, channels: 3, data };
}
```

- [ ] **Step 4: Run to see them pass** — PASS (2 tests).
- [ ] **Step 5: Commit** — `git commit -m "Resample Sentinel-2 cloudless colour into the game frame"`

---

### Task 8: Depth from colour

**Files:** Create `tools/spot/depth.mjs`, `test/spot-depth.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEPTH_MAX, depthImage, fitDepth, logRatio } from "../tools/spot/depth.mjs";

test("deeper clear water has a higher blue-over-green log ratio", () => {
  assert.ok(logRatio(60, 200, 210) < logRatio(20, 90, 160));
});

test("the fit returns the calibration depths and clamps to 0..DEPTH_MAX", () => {
  const depth = fitDepth([{ ratio: 1.0, depth: 1 }, { ratio: 1.2, depth: 11 }]);
  assert.ok(Math.abs(depth(1.0) - 1) < 1e-9);
  assert.ok(Math.abs(depth(1.2) - 11) < 1e-9);
  assert.equal(depth(0.5), 0);
  assert.equal(depth(9), DEPTH_MAX);
  assert.throws(() => fitDepth([{ ratio: 1, depth: 1 }]), /two calibration depths/);
});

test("land has no depth, and the image stores depth in 0..255", () => {
  const colour = { width: 2, height: 1, channels: 3, data: Uint8Array.from([60, 200, 210, 20, 90, 160]) };
  const out = depthImage(colour, Uint8Array.from([1, 0]), () => 10);
  assert.deepEqual([...out.data], [0, Math.round((10 / DEPTH_MAX) * 255)]);
});
```

- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Write `tools/spot/depth.mjs`**

```js
// Seabed depth from colour, for clear shallow water over a bright bottom: the
// log-ratio method (Stumpf, Holderied and Sinclair 2003), ln(n·blue) over
// ln(n·green) rising about linearly with depth, fitted to a spot's
// calibration points. Visual only: the game never reads the depth.
export const DEPTH_MAX = 20;
const N = 1000;

export const logRatio = (r, g, b) => Math.log(N * Math.max(b, 1) / 255) / Math.log(N * Math.max(g, 1) / 255);

// samples: [{ ratio, depth }], at least two different depths. A least-squares
// line, clamped to 0..DEPTH_MAX.
export function fitDepth(samples) {
  if (new Set(samples.map((s) => s.depth)).size < 2) throw new Error("the depth fit needs at least two calibration depths");
  const n = samples.length, mx = samples.reduce((a, s) => a + s.ratio, 0) / n, my = samples.reduce((a, s) => a + s.depth, 0) / n;
  const slope = samples.reduce((a, s) => a + (s.ratio - mx) * (s.depth - my), 0) / samples.reduce((a, s) => a + (s.ratio - mx) ** 2, 0);
  const fit = (ratio) => Math.min(DEPTH_MAX, Math.max(0, my + slope * (ratio - mx)));
  return Object.assign(fit, { slope, intercept: my - slope * mx });
}

// A one-channel image: 0 on land, else depth scaled to 0..255.
export function depthImage(colour, land, depthOf) {
  const data = new Uint8Array(colour.width * colour.height);
  for (let p = 0; p < data.length; p++) {
    if (land[p]) continue;
    const [r, g, b] = colour.data.subarray(p * 3, p * 3 + 3);
    data[p] = Math.round((depthOf(logRatio(r, g, b)) / DEPTH_MAX) * 255);
  }
  return { width: colour.width, height: colour.height, channels: 1, data };
}
```

- [ ] **Step 4: Run to see them pass** — PASS (3 tests).
- [ ] **Step 5: Commit** — `git commit -m "Estimate seabed depth from colour, calibrated per spot"`

---

### Task 9: Ground types

**Files:** Create `tools/spot/ground.mjs`, `test/spot-ground.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUND, groundType } from "../tools/spot/ground.mjs";

test("map polygons decide first, then the shore, then the colour", () => {
  const at = (over) => groundType({ land: 1, shore: 200, colour: [150, 140, 120], mangrove: 0, beach: 0, building: 0, ...over });
  assert.equal(at({ land: 0 }), GROUND.water);
  assert.equal(at({ mangrove: 1 }), GROUND.mangrove);
  assert.equal(at({ building: 1 }), GROUND.builtUp);
  assert.equal(at({ beach: 1, shore: 30 }), GROUND.drySand);
  assert.equal(at({ shore: 4 }), GROUND.wetSand);
  assert.equal(at({ colour: [120, 140, 90] }), GROUND.scrubSoil, "green");
  assert.equal(at({ colour: [225, 220, 205], shore: 60 }), GROUND.drySand, "bright near the shore");
  assert.equal(at({ colour: [225, 220, 205], shore: 400 }), GROUND.rock, "bright inland: limestone");
  assert.equal(at({ colour: [160, 155, 145], shore: 30 }), GROUND.coralRubble);
  assert.equal(at({ colour: [80, 75, 70] }), GROUND.rock);
});
```

- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Write `tools/spot/ground.mjs`**

```js
// What the ground is, per pixel: from map polygons first, then the distance
// to the shore, then the satellite colour. Plan 2 textures and plants follow it.
export const GROUND = { water: 0, drySand: 1, wetSand: 2, coralRubble: 3, scrubSoil: 4, rock: 5, mangrove: 6, builtUp: 7 };

// cell: { land, shore (metres from the shoreline), colour: [r, g, b], mangrove, beach, building }.
export function groundType({ land, shore, colour: [r, g, b], mangrove, beach, building }) {
  if (mangrove) return GROUND.mangrove;
  if (!land) return GROUND.water;
  if (building) return GROUND.builtUp;
  if (shore < 8) return GROUND.wetSand;
  if (beach) return GROUND.drySand;
  const light = (r + g + b) / 3, green = g - (r + b) / 2;
  if (green > 8) return GROUND.scrubSoil;
  if (light > 170) return shore < 120 ? GROUND.drySand : GROUND.rock;
  if (light > 110) return shore < 60 ? GROUND.coralRubble : GROUND.scrubSoil;
  return GROUND.rock;
}
```

- [ ] **Step 4: Run to see it pass** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "Classify each spot pixel's ground"`

---

### Task 10: The course check, comparison, picture, credits

**Files:** Create `tools/spot/output.mjs`, `test/spot-output.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { COURSE, courseProblems, credits, drawLines, picture } from "../tools/spot/output.mjs";

test("the course needs sailable water under it and around its ends", () => {
  const size = 20, half = 500; // 50 m pixels
  const deep = { width: size, height: size, channels: 1, data: new Uint8Array(size * size).fill(30) };
  assert.deepEqual(courseProblems(deep, half), []);
  const shallow = structuredClone(deep);
  shallow.data[10 * size + 10] = 0;
  assert.equal(courseProblems(shallow, half).length, 1);
  assert.match(courseProblems(shallow, half)[0], /at x 25, z 25: 0\.0 m deep/);
  assert.deepEqual(COURSE, { x: 110, z: 210 + 43 });
});

test("lines are drawn into an RGB image in the game frame", () => {
  const image = { width: 4, height: 4, channels: 3, data: new Uint8Array(48) };
  drawLines(image, 100, [[[-75, -75], [75, -75]]], [255, 0, 0]);
  assert.deepEqual([...image.data.subarray(0, 3)], [255, 0, 0]);
  assert.deepEqual([...image.data.subarray(9, 12)], [255, 0, 0]);
  assert.deepEqual([...image.data.subarray(12, 15)], [0, 0, 0]);
});

test("the picture is a 384 × 256 crop around the course", () => {
  const colour = { width: 8, height: 8, channels: 3, data: new Uint8Array(192).fill(100) };
  const p = picture(colour, 2500);
  assert.deepEqual([p.width, p.height, p.channels], [384, 256, 3]);
});

test("credits list every source with its licence", () => {
  const text = credits({ name: "Sorobon", sources: [{ name: "OpenStreetMap", licence: "ODbL", credit: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" }] });
  assert.match(text, /# Sorobon: data credits/);
  assert.match(text, /OpenStreetMap.*ODbL/s);
});
```

- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Write `tools/spot/output.mjs`**

```js
// The tool's checks and side outputs: the course must lie in sailable water,
// a comparison image of the built features over the satellite colour, the
// chooser's picture, and the credits.
import { bilinear } from "./raster.mjs";
import { DEPTH_MAX } from "./depth.mjs";

// Half-extents of the water the course and the AI's overshoot need.
export const COURSE = { x: 110, z: 210 + 43 };
const MIN_DEPTH = 0.5;

// One line per depth pixel inside the course box shallower than MIN_DEPTH.
export function courseProblems(depth, half) {
  const cell = 2 * half / depth.width, problems = [];
  for (let j = 0; j < depth.height; j++) for (let i = 0; i < depth.width; i++) {
    const x = -half + (i + 0.5) * cell, z = -half + (j + 0.5) * cell;
    if (Math.abs(x) > COURSE.x + cell / 2 || Math.abs(z) > COURSE.z + cell / 2) continue;
    const metres = (depth.data[j * depth.width + i] / 255) * DEPTH_MAX;
    if (metres < MIN_DEPTH) problems.push(`at x ${Math.round(x)}, z ${Math.round(z)}: ${metres.toFixed(1)} m deep`);
  }
  return problems;
}

// Draws polylines ([[x, z], ...] in the game frame) into an RGB image of the
// square [-half, half]².
export function drawLines(image, half, lines, [r, g, b]) {
  const scale = image.width / (2 * half), plot = (i, j) => {
    if (i < 0 || j < 0 || i >= image.width || j >= image.height) return;
    image.data.set([r, g, b], (j * image.width + i) * 3);
  };
  for (const line of lines) for (let k = 0; k + 1 < line.length; k++) {
    const [x1, z1] = line[k], [x2, z2] = line[k + 1];
    const a = [(x1 + half) * scale - 0.5, (z1 + half) * scale - 0.5], b2 = [(x2 + half) * scale - 0.5, (z2 + half) * scale - 0.5];
    const steps = Math.max(1, Math.ceil(Math.hypot(b2[0] - a[0], b2[1] - a[1])));
    for (let s = 0; s <= steps; s++) plot(Math.round(a[0] + ((b2[0] - a[0]) * s) / steps), Math.round(a[1] + ((b2[1] - a[1]) * s) / steps));
  }
  return image;
}

// 384 × 256 of the colour image around the course: 1200 m along the wind
// (x, left to right) by 800 m across it (z).
export function picture(colour, half) {
  const width = 384, height = 256, data = new Uint8Array(width * height * 3), scale = colour.width / (2 * half);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const x = -600 + (i + 0.5) * (1200 / width), z = -400 + (j + 0.5) * (800 / height);
    for (let c = 0; c < 3; c++) data[(j * width + i) * 3 + c] = Math.round(bilinear(colour.data, colour.width, colour.height, (x + half) * scale - 0.5, (z + half) * scale - 0.5, 3, c));
  }
  return { width, height, channels: 3, data };
}

export function credits(spot) {
  return `# ${spot.name}: data credits\n\n${spot.sources.map((s) => `- **${s.name}** (${s.licence}): ${s.credit}. ${s.url}`).join("\n")}\n`;
}
```

- [ ] **Step 4: Run to see them pass** — PASS (4 tests).
- [ ] **Step 5: Commit** — `git commit -m "Check the course's water and draw the spot's comparison, picture and credits"`

---

### Task 11: The CLI

**Files:** Create `tools/spot.mjs`, `tour/spots/sorobon-bonaire.json`

- [ ] **Step 1: The spot file** — `tour/spots/sorobon-bonaire.json`, its centre provisional until Task 12:

```json
{
  "id": "sorobon-bonaire",
  "name": "Sorobon, Bonaire",
  "centre": { "lat": 12.0785, "lon": -68.2275 },
  "windFrom": 90,
  "detail": 2500,
  "horizon": 12500,
  "island": { "south": 11.98, "west": -68.45, "north": 12.33, "east": -68.18 },
  "beach": { "top": 0.4, "slope": 0.02, "width": 80 },
  "layer": "s2cloudless-2024",
  "calibration": [],
  "sources": [
    { "name": "OpenStreetMap", "licence": "ODbL 1.0", "credit": "© OpenStreetMap contributors", "url": "https://www.openstreetmap.org/copyright" },
    { "name": "Sentinel-2 cloudless 2024", "licence": "CC BY-NC-SA 4.0", "credit": "Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)", "url": "https://s2maps.eu" },
    { "name": "Terrain Tiles", "licence": "open data, attribution required", "credit": "Terrain Tiles on AWS Open Data (Mapzen and the sources it lists, including SRTM)", "url": "https://registry.opendata.aws/terrain-tiles/" }
  ]
}
```

- [ ] **Step 2: Write `tools/spot.mjs`**

```js
// Builds a real-world spot's files from open map data:
//   node tools/spot.mjs <id>              lists what it would download, or builds from the cache
//   node tools/spot.mjs <id> --download   downloads what is missing (each source once), then builds
//   node tools/spot.mjs <id> --where x,z  prints the latitude and longitude of a game point
// Reads tour/spots/<id>.json; writes mods/venues/spots/<id>/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { resampleColour, wmsUrl } from "./spot/colour.mjs";
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
  const colour = resampleColour(decodePng(await fetcher.get(wms[part], { source: "EOX" })), boxes[part], frame, half, size);
  const land = fillPolygons(features.shoreline, half, size);
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
  version: 1, id, name: spot.name, centre: spot.centre, windFrom: spot.windFrom,
  detail: { half: detail.half, step: STEP.detail, n: terrain.n, image: IMAGE.detail },
  horizon: { half: horizon.half, step: STEP.horizon, n: far.n, image: IMAGE.horizon },
  depth: { max: DEPTH_MAX, slope: depthOf.slope, intercept: depthOf.intercept },
  ground: GROUND,
}, null, 2)}\n`);
console.log(`Wrote ${out}: ${features.buildings.length} buildings, ${features.shoreline.length} shoreline rings, ${features.mangroves.length} mangrove areas.`);
```

- [ ] **Step 3: Check it runs without downloading**

Run: `node tools/spot.mjs sorobon-bonaire`
Expected: exit code 2 and the list: 1 × OpenStreetMap, about 40–60 × Terrain Tiles, 2 × EOX. Nothing is downloaded.

- [ ] **Step 4: Commit** — `git add tools/spot.mjs tour/spots/sorobon-bonaire.json && git commit -m "Add the spot tool's CLI and Sorobon's spot file"`

---

### Task 12: Build Sorobon

**Files:** Modify `tour/spots/sorobon-bonaire.json`; create `mods/venues/spots/sorobon-bonaire/*`

- [ ] **Step 1: Ask the user to OK the downloads**, quoting Step 3 of Task 11's list (counts and sizes). Do not continue without a yes in chat.

- [ ] **Step 2: Download** — `node tools/spot.mjs sorobon-bonaire --download`. With `calibration` still empty it stops after writing `compare.png` (exit code 3): expected.

- [ ] **Step 3: Fix the centre.** Look at the cached Overpass answer for the windsurf centres:

```bash
node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1]));for(const e of d.elements)if(/jibe|sorobon|windsurf|dunkerbeck/i.test(JSON.stringify(e.tags??{})))console.log(e.tags.name??e.tags.building,e.geometry?.[0])" <cache file>
```

(the cache file is the largest `.bin` in `cache/spots/sorobon-bonaire/`). Put the course centre in the lagoon off those centres, where the heats were sailed (about 250–350 m off the beach, inside the reef), and set `centre` to it.

- [ ] **Step 4: Pick the calibration points** from `compare.png` (rerun `node tools/spot.mjs sorobon-bonaire` after moving the centre to redraw it):
  - three lagoon points on bright sand near the course: `depth` 1.0 (Lac Bay is waist deep);
  - two points on the reef crest (on OpenStreetMap's reef line): `depth` 0.2;
  - two points about 1 km beyond the reef in dark blue water: `depth` 20.

Each entry: `{ "lat": …, "lon": …, "depth": …, "note": "lagoon sand off Jibe City" }`. Use `node tools/spot.mjs sorobon-bonaire --where x,z` to turn game points read off `compare.png` (512 px over 5 km: about 9.8 m per pixel, centre at pixel 256, 256) into latitude and longitude.

- [ ] **Step 5: Build** — `node tools/spot.mjs sorobon-bonaire`. If the course check fails, move `centre` deeper into the lagoon and rerun.

- [ ] **Step 6: Check the result by eye**
  - `compare.png`: the red shoreline follows the beach and the mangrove edges within about one pixel (10 m); the yellow reef line sits on the white surf; the cyan course box is in the lagoon. If the frame looks mirrored (Sorobon's beach on the wrong side of the bay compared with a map), stop: the frame test in Task 2 has a gap.
  - `depth.png`: the lagoon light grey (shallow), the reef nearly black, the open sea bright.
  - `ground-type.png` (values 0–7, view with contrast stretched): mangroves along the bay's edges, sand at Sorobon, scrub inland.
  - Sizes: everything together under 10 MB.

- [ ] **Step 7: Run all tests** — `npm test`: PASS.

- [ ] **Step 8: Commit**

```bash
git add tour/spots/sorobon-bonaire.json mods/venues/spots/sorobon-bonaire
git commit -m "Build Sorobon's terrain, colour, depth, ground types and features from map data"
```

---

### Task 13: Update the spec for what changed

**Files:** Modify `docs/superpowers/specs/2026-10-30-real-world-spots-design.md`

- [ ] **Step 1:** In "The tool", change the elevation source to "AWS Terrain Tiles (terrarium PNG, SRTM-class ~30 m, open data on AWS); chosen over Copernicus GeoTIFFs because PNG needs no TIFF reader", the grid steps to 5 m (detail) and 50 m (horizon), the colour and picture files to PNG (`ground.png`, `horizon.png`, `picture.png`), and add `calibration` points to the spot file. Note the measured sizes of the written files.
- [ ] **Step 2: Commit** — `git commit -m "Bring the real-world spots spec up to date with the data tool"`

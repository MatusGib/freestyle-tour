# Sorobon in the game Implementation Plan (real-world spots, plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Choosing Sorobon in the venue chooser puts the rider in Lac Bay built from its map data, the true way round: real terrain and colours, photo-scanned ground up close, mangroves, scrub with kadushi cacti and divi-divi trees, Sorobon's buildings and beach landmarks, the lagoon's colours from the real depth, surf on the real reef, and collision with the real shore.

**Architecture:** A browser loader reads the spot's files (from plan 1) into samplers in the game frame. Shared modules in `mods/venues/realworld/` build terrain, plants and buildings from them, using three.js classes the `Game` patch hands over. The water shader patch gains a depth-map path for real-world spots. Sotavento and Sylt keep their analytic coasts; `scenery.js` is split so each venue has its own builder.

**Tech Stack:** Browser ES modules on the game's three.js (classes handed over by a serve-time patch), the vendored three.js r185 core for geometry helpers, `node:test` for the pure modules.

Spec: `docs/superpowers/specs/2026-10-30-real-world-spots-design.md`. Plan 1: `docs/superpowers/plans/2026-10-30-spot-data-tool.md` (PR MatusGib/freestyle-tour#2). Handoff notes: `docs/superpowers/handoff/2026-10-30-real-world-spots.md`.

**Start only once PR #2 is merged into main:** this plan reads `mods/venues/spots/sorobon-bonaire/` and moves helpers out of `tools/spot/raster.mjs`.

---

## What plan 1 produced (`mods/venues/spots/sorobon-bonaire/`)

| File | Contents |
|---|---|
| `spot.json` | `centre` 12.0960, −68.2342; `windFrom` 90; `detail` {half 2500, step 5, n 1001, image 512}; `horizon` {half 12500, step 50, n 501, image 1024}; `depth` {max 20, slope, intercept}; `ground` type codes |
| `terrain.bin`, `horizon.bin` | Int16 LE decimetres, row-major `j·n + i`, point `(i, j)` at `x = −half + i·step`, `z = −half + j·step`. Under water: the seabed (−depth) |
| `ground.png`, `horizon.png` | RGB true colour, 512² and 1024², pixel `(i, j)` centred at `−half + (i + 0.5)·2·half/size`; row 0 at −z |
| `depth.png`, `horizon-depth.png` | Grey 0–255 = 0–20 m; land 0 |
| `ground-type.png` | Grey codes: 0 water, 1 dry sand, 2 wet sand (never present at 9.8 m), 3 coral rubble, 4 scrub soil, 5 rock, 6 mangrove, 7 built-up |
| `features.json` | `shoreline` (4 rings), `mangroves` (63), `beaches` (4), `reefs` (1 line), `buildings` (108, `{ footprint, height, kind }`), `roads` (81, `{ kind, line }`), `piers` (6); all `[x, z]` in metres |
| `picture.png` | 384 × 256 chooser picture |
| `CREDITS.md` | OpenStreetMap (ODbL), Sentinel-2 cloudless 2024 (CC BY-NC-SA 4.0), Terrain Tiles |

Facts from building it (PR #2):
- **Layout:** the wind (from the east) blows from the open sea across the reef and the lagoon towards Sorobon. In game coordinates, +x is downwind (west) and +z is north. Sorobon beach and its buildings lie at about x 200–260, z −280…−420, about 117 m beyond the heat area.
- **The lagoon's depth is unreliable:** the colour method can't resolve it, and dark floor patches read 0 m. Treat the lagoon (water inside the reef) as at least 0.8 m and draw the surf from the reef line, not from the depth.
- **No wet sand:** at 9.8 m pixels, ground types never show wet sand. Draw the beach band from the shoreline and `features.beaches`.

## The game's limits (from the 2026-10-24 snapshot)

- **Camera:** `PerspectiveCamera(43, aspect, 0.1, 1800)`. Nothing beyond 1800 m is drawn unless a venue raises `camera.far`.
- **Fog:** `FogExp2`, density 0.0035 (the game's own); the venues set `look.landHaze`. At 0.0035, land is about 95% fogged at 500 m.
- **three.js classes:** the game's own classes are reachable only through the `Game` patch (`ve.three = { CanvasTexture: f }` in `mods/venues/patches.mjs`) or from existing objects' constructors (as `scenery.js` does with `game.areaArrow.group.constructor` and the buoy's mesh and material).

## Files

| File | Change | Responsibility |
|---|---|---|
| `mods/venues/realworld/raster.js` | Create (moved) | `fillPolygons`, `distanceTransform`, `bilinear`, `gridPoint`, `imagePoint`, shared with the tool |
| `tools/spot/raster.mjs` | Modify | Re-export from the shared module |
| `mods/venues/realworld/spot.js` | Create | Load a spot's files; height, depth and ground samplers |
| `mods/venues/realworld/collision.js` | Create | Stop the rider at the real shore and mangroves |
| `mods/venues/realworld/terrain.js` | Create | Terrain meshes (three rings) and their material |
| `mods/venues/realworld/plants.js` | Create | Generated mangroves, kadushi cacti, divi-divi trees, scrub |
| `mods/venues/realworld/scatter.js` | Create | Where plants go, deterministic |
| `mods/venues/realworld/buildings.js` | Create | OpenStreetMap footprints raised to their heights |
| `mods/venues/realworld/mount.js` | Create | Builds a real-world spot into the scene; far plane and fog |
| `mods/venues/sites/sotavento-fuerteventura.js`, `sites/westerland-sylt.js` | Create (moved) | The existing builders, unchanged |
| `mods/venues/sites/sorobon-bonaire.js` | Create | Sorobon's hand-built landmarks |
| `mods/venues/scenery.js` | Modify | Shared helpers only; builders from a table |
| `mods/venues/patches.mjs` | Modify | Hand over more three.js classes; the water's depth-map path |
| `mods/venues/water.js`, `waves.js` | Modify | Sorobon's look; waves sheltered by the reef |
| `mods/venues/index.js` | Modify | Mount real-world spots; their collision |
| `mods/venues/assets/textures/` | Create | CC0 detail textures and `CREDITS.md` |
| `server/venues.mjs` | Modify | `scenery` and `picture` for venues with spot files |
| `test/realworld-*.test.mjs`, `test/venues-*.test.mjs` | Create/modify | Tests |

---

### Task 1: Find out what the game allows (a spike, no commit of code)

- [ ] **Step 1:** Start the preview (see the handoff notes for the port). Choose Sotavento, start practice, and in the page run:

```js
const { findGame } = await import("/__mods/lib/game.js");
const g = findGame();
({ camera: g.camera && { far: g.camera.far, near: g.camera.near, fov: g.camera.fov }, sky: g.scene.getObjectByName("sky")?.geometry?.boundingSphere ?? g.scene.getObjectByName("sky")?.scale, water: g.water && { size: g.water.mesh?.geometry?.parameters ?? g.water.geometry?.parameters, followsCamera: "check by moving" }, maxTexture: g.renderer?.capabilities?.maxTextureSize, keys: Object.keys(g).slice(0, 80) })
```

Record: where the camera lives on the game object, the sky dome's radius, the water mesh's size and whether it moves with the camera, and the renderer's `maxTextureSize`.

- [ ] **Step 2:** In `vendor/<snapshot>/_next/static/chunks/scene-*.js`, find the minified names of the three.js classes plan 2 needs, next to the existing hand-over `export{ve as Game}`: `InstancedMesh`, `Mesh`, `BufferGeometry`, `BufferAttribute`, `InstancedBufferAttribute`, `DataTexture`, `MeshStandardMaterial` (or the buoy material's class), `Matrix4`, `Color`, and the constants `RepeatWrapping`, `NearestFilter`, `LinearMipmapLinearFilter`, `SRGBColorSpace`. Classes are found by their distinctive strings, for example `isInstancedMesh=!0`, `isDataTexture=!0`, `isMeshStandardMaterial=!0`. Note any class the bundle doesn't contain (three is tree-shaken). For those, plan 2 uses the vendored r185 core (`mods/venues/lib/three.core.min.js`) and checks that the game's renderer accepts its objects. Geometry and textures are usually fine; materials are not.

- [ ] **Step 3:** Write the findings into this plan, under "Findings" at the end, and adjust Tasks 6–10 where they assume something the game doesn't allow.

### Task 2: Hand over the classes

**Files:** `mods/venues/patches.mjs`, `test/venues-patch-snapshot.test.mjs`

- [ ] **Step 1:** Extend the snapshot test, which already checks the `Game` hand-over, so the patched scene module exposes each class found in Task 1. It's skipped without a snapshot:

```js
for (const name of ["CanvasTexture", "InstancedMesh", "Mesh", "BufferGeometry", "BufferAttribute", "InstancedBufferAttribute", "DataTexture", "MeshStandardMaterial", "Matrix4", "Color"]) {
  assert.match(patchedScene, new RegExp(`${name}:`), `the Game hands over ${name}`);
}
```

- [ ] **Step 2:** Run to see it fail.
- [ ] **Step 3:** Change the hand-over patch's replacement to `ve.three={CanvasTexture:f,InstancedMesh:<name>,…,RepeatWrapping:<value>}` with the names from Task 1. Keep `expect: 1`.
- [ ] **Step 4:** `npm test`: PASS. Commit: "Hand the venues more of the game's three.js classes".

### Task 3: Share the raster helpers with the game

**Files:** Create `mods/venues/realworld/raster.js`; modify `tools/spot/raster.mjs`

- [ ] **Step 1:** Move the body of `tools/spot/raster.mjs` (`gridPoint`, `imagePoint`, `fillPolygons`, `distanceTransform`, `bilinear` and their comment) into `mods/venues/realworld/raster.js` unchanged (`.js`, no Node imports). Replace `tools/spot/raster.mjs` with:

```js
// The spot tool's raster helpers live with the game's real-world modules,
// which use them too.
export { bilinear, distanceTransform, fillPolygons, gridPoint, imagePoint } from "../../mods/venues/realworld/raster.js";
```

- [ ] **Step 2:** `npm test`: the existing `test/spot-raster.test.mjs` still passes. Commit: "Share the spot raster helpers with the venues mod".

### Task 4: Load a spot

**Files:** Create `mods/venues/realworld/spot.js`, `test/realworld-spot.test.mjs`

- [ ] **Step 1: Write the failing tests** (against the real Sorobon files, decoded with the tool's PNG codec):

```js
// A real-world spot's files as samplers in the game frame.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSpot } from "../mods/venues/realworld/spot.js";
import { decodePng } from "../tools/spot/png.mjs";
import { ROOT } from "./helpers.mjs";

const fetchBytes = async (url) => new Uint8Array(readFileSync(join(ROOT, "mods", url.replace("/__mods/", ""))));
const decodeImage = async (bytes) => decodePng(Buffer.from(bytes));

test("Sorobon loads, with the course in water and the beach on land", async () => {
  const spot = await loadSpot("sorobon-bonaire", { fetchBytes, decodeImage });
  assert.equal(spot.manifest.id, "sorobon-bonaire");
  assert.ok(spot.heightAt(0, 0) < 0, "the course is over the seabed");
  assert.ok(spot.depthAt(0, 0) >= 0.8, "the lagoon is at least 0.8 m deep");
  assert.equal(spot.groundAt(0, 0), 0, "water");
  assert.ok(spot.isLand(240, -330), "Sorobon's buildings stand on land");
  assert.ok(spot.heightAt(240, -330) > 0);
  assert.equal(typeof spot.heightAt(9000, 9000), "number", "beyond the detail grid, the horizon grid");
});

test("the lagoon inside the reef is never read shallower than 0.8 m", async () => {
  const spot = await loadSpot("sorobon-bonaire", { fetchBytes, decodeImage });
  for (let x = -100; x <= 100; x += 25) for (let z = -200; z <= 200; z += 50) assert.ok(spot.depthAt(x, z) >= 0.8, `${x}, ${z}`);
});
```

- [ ] **Step 2:** Run to see them fail.
- [ ] **Step 3: Write `mods/venues/realworld/spot.js`**

```js
// A real-world spot's files (mods/venues/spots/<id>/, written by
// tools/spot.mjs) as samplers in the game frame: heights in metres (the
// seabed under water), depth, ground type and land. fetchBytes(url) →
// Uint8Array; decodeImage(bytes) → { width, height, channels, data }.
import { bilinear, fillPolygons } from "./raster.js";

const LAGOON_FLOOR = 0.8; // the colour method can't resolve Lac Bay's floor (PR #2)

export async function loadSpot(id, { fetchBytes, decodeImage }) {
  const base = `/__mods/venues/spots/${id}/`;
  const text = async (name) => JSON.parse(new TextDecoder().decode(await fetchBytes(base + name)));
  const heights = async (name) => { const b = await fetchBytes(base + name); return new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2); };
  const image = async (name) => decodeImage(await fetchBytes(base + name));
  const manifest = await text("spot.json");
  const [features, terrain, horizon, ground, horizonColour, depth, horizonDepth, groundType] = await Promise.all([
    text("features.json"), heights("terrain.bin"), heights("horizon.bin"), image("ground.png"), image("horizon.png"), image("depth.png"), image("horizon-depth.png"), image("ground-type.png"),
  ]);
  const { detail, horizon: far } = manifest;
  const sampleGrid = (grid, part, x, z) => bilinear(grid, part.n, part.n, (x + part.half) / part.step, (z + part.half) / part.step) / 10;
  const pixel = (img, half, x, z) => [((x + half) * img.width) / (2 * half) - 0.5, ((z + half) * img.height) / (2 * half) - 0.5];
  const inDetail = (x, z) => Math.abs(x) <= detail.half && Math.abs(z) <= detail.half;
  // Land at 2 m over the detail area, from the shoreline rings (even-odd).
  const LAND_CELL = 2, landSize = (2 * detail.half) / LAND_CELL;
  const land = fillPolygons(features.shoreline, detail.half, landSize);
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
    heightAt: (x, z) => (inDetail(x, z) ? sampleGrid(terrain, detail, x, z) : sampleGrid(horizon, far, x, z)),
    depthAt: (x, z) => (isLand(x, z) ? 0 : Math.max(rawDepth(x, z), inDetail(x, z) ? LAGOON_FLOOR : 0)),
    groundAt: (x, z) => {
      if (!inDetail(x, z)) return isLand(x, z) ? 4 : 0;
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
```

Note: `LAGOON_FLOOR` applies to all water in the detail area. That's acceptable at Sorobon, because outside the reef the measured depth is already deep. If a later spot needs it, make it a field of `spot.json`.

- [ ] **Step 4:** Run to see them pass. If "Sorobon's buildings stand on land" fails, print `spot.features.buildings[0].footprint[0]` and use a building's own point. Commit: "Load a real-world spot's files as samplers".

### Task 5: Collision with the real shore

**Files:** Create `mods/venues/realworld/collision.js`, `test/realworld-collision.test.mjs`; modify `mods/venues/index.js`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSpotCollision } from "../mods/venues/realworld/collision.js";

// Land is x > 100 here.
const spot = { isLand: (x) => x > 100 };
const state = (x, vx) => ({ x, z: 0, vx, vz: 0, heading: Math.PI / 2, air: false, height: 0 });

test("a rider driving onto land is stopped at the water's edge", () => {
  const s = state(100.5, 5);
  resolveSpotCollision(s, { power: 1 }, spot);
  assert.ok(s.x <= 100, `x ${s.x}`);
  assert.ok(s.vx <= 0);
});

test("a rider in open water, or sailing away from the shore, is left alone", () => {
  const a = state(0, 5), b = state(99, -5);
  resolveSpotCollision(a, {}, spot); resolveSpotCollision(b, {}, spot);
  assert.deepEqual([a.x, a.vx, b.x, b.vx], [0, 5, 99, -5]);
});
```

- [ ] **Step 2:** Run to see them fail.
- [ ] **Step 3: Write `mods/venues/realworld/collision.js`**

```js
// Stops the rider at a real-world spot's shore: inside land, the rider goes
// back towards the water along the land's slope, and loses the speed that
// carried them in. spot.isLand(x, z) from loadSpot.
const PROBE = 2; // metres

const landNormal = (spot, x, z) => {
  const gx = (spot.isLand(x + PROBE, z) ? 1 : 0) - (spot.isLand(x - PROBE, z) ? 1 : 0);
  const gz = (spot.isLand(x, z + PROBE) ? 1 : 0) - (spot.isLand(x, z - PROBE) ? 1 : 0);
  const length = Math.hypot(gx, gz);
  return length ? { x: gx / length, z: gz / length } : null;
};

export function resolveSpotCollision(state, input, spot) {
  if (!state || !spot || !spot.isLand(state.x, state.z)) return;
  const n = landNormal(spot, state.x, state.z) ?? { x: Math.sign(state.vx) || 1, z: Math.sign(state.vz) };
  for (let step = 0; step < 40 && spot.isLand(state.x, state.z); step++) {
    state.x -= n.x * 0.25;
    state.z -= n.z * 0.25;
  }
  const into = state.vx * n.x + state.vz * n.z;
  if (into > 0) {
    state.vx -= into * n.x;
    state.vz -= into * n.z;
  }
}
```

The test's state has no `z` variation, so `landNormal` gives (1, 0); the rider is walked back to x ≤ 100 and `vx` goes to 0.

- [ ] **Step 4:** Run to see them pass.
- [ ] **Step 5:** In `mods/venues/index.js`, the step hook calls `resolveVenueCollision(state, input, game?.__venueSceneryVenueId)`. Make it call `resolveSpotCollision(state, input, game.__venueSpot)` when `game.__venueSpot` is set (Task 11 sets it), else the old function.
- [ ] **Step 6:** `npm test`, commit: "Stop the rider at a real-world spot's shore".

### Task 6: Terrain

**Files:** Create `mods/venues/realworld/terrain.js`, `test/realworld-terrain.test.mjs`

The geometry is pure (arrays), so it can be tested; the meshes and material use the handed-over classes.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { ringGeometry } from "../mods/venues/realworld/terrain.js";

test("a terrain ring covers its square, leaves the inner square open, and samples heights", () => {
  const heightAt = (x, z) => x + z;
  const g = ringGeometry({ outer: 100, inner: 40, step: 20, heightAt, skirt: 5 });
  assert.equal(g.positions.length % 3, 0);
  const xs = [], ys = [];
  for (let k = 0; k < g.positions.length; k += 3) { xs.push(g.positions[k]); ys.push(g.positions[k + 1]); }
  assert.equal(Math.min(...xs), -100); assert.equal(Math.max(...xs), 100);
  for (let t = 0; t < g.indices.length; t += 3) {
    const cx = [0, 1, 2].reduce((a, v) => a + g.positions[g.indices[t + v] * 3], 0) / 3, cz = [0, 1, 2].reduce((a, v) => a + g.positions[g.indices[t + v] * 3 + 2], 0) / 3;
    assert.ok(Math.max(Math.abs(cx), Math.abs(cz)) > 40 - 1e-9, "no triangle inside the inner square");
  }
  assert.equal(g.positions[1], heightAt(-100, -100), "heights come from heightAt");
});
```

- [ ] **Step 2:** Run to see it fail.
- [ ] **Step 3: Write `ringGeometry` and the mesh builder** in `mods/venues/realworld/terrain.js`:

```js
// A real-world spot's land and seabed as three square rings of decreasing
// detail: inner (±1200 m, 5 m), middle (±2500 m, 20 m), horizon (±12500 m,
// 100 m). Each ring leaves its inner square open; skirts hang below the edges
// to hide cracks.

export const RINGS = [{ outer: 1200, inner: 0, step: 5 }, { outer: 2500, inner: 1200, step: 20 }, { outer: 12500, inner: 2500, step: 100 }];

// Positions (x, y, z), uvs over the spot's detail or horizon square, and
// indices for the ring between `inner` and `outer`.
export function ringGeometry({ outer, inner, step, heightAt, skirt = 3, uvHalf = outer }) {
  const n = Math.round((2 * outer) / step) + 1, positions = [], uvs = [], indices = [], index = new Int32Array(n * n).fill(-1);
  const inside = (x, z) => Math.max(Math.abs(x), Math.abs(z)) < inner - 1e-9;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -outer + i * step, z = -outer + j * step;
    index[j * n + i] = positions.length / 3;
    positions.push(x, heightAt(x, z), z);
    uvs.push((x + uvHalf) / (2 * uvHalf), (z + uvHalf) / (2 * uvHalf));
  }
  for (let j = 0; j + 1 < n; j++) for (let i = 0; i + 1 < n; i++) {
    const x = -outer + (i + 0.5) * step, z = -outer + (j + 0.5) * step;
    if (inside(x, z)) continue;
    const a = index[j * n + i], b = index[j * n + i + 1], c = index[(j + 1) * n + i], d = index[(j + 1) * n + i + 1];
    indices.push(a, c, b, b, c, d);
  }
  // Skirts: along the inner edge, a strip dropping `skirt` metres.
  if (inner > 0) {
    for (const edge of [[-inner, -inner, inner, -inner], [inner, -inner, inner, inner], [inner, inner, -inner, inner], [-inner, inner, -inner, -inner]]) {
      const [x1, z1, x2, z2] = edge, count = Math.round(Math.hypot(x2 - x1, z2 - z1) / step);
      for (let k = 0; k < count; k++) {
        const ax = x1 + ((x2 - x1) * k) / count, az = z1 + ((z2 - z1) * k) / count, bx = x1 + ((x2 - x1) * (k + 1)) / count, bz = z1 + ((z2 - z1) * (k + 1)) / count;
        const base = positions.length / 3;
        for (const [x, z, drop] of [[ax, az, 0], [bx, bz, 0], [ax, az, skirt], [bx, bz, skirt]]) {
          positions.push(x, heightAt(x, z) - drop, z);
          uvs.push((x + uvHalf) / (2 * uvHalf), (z + uvHalf) / (2 * uvHalf));
        }
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
  }
  return { positions: Float32Array.from(positions), uvs: Float32Array.from(uvs), indices: Uint32Array.from(indices) };
}
```

- [ ] **Step 4:** Run to see it pass.
- [ ] **Step 5: The meshes.** Add `buildTerrain(three, spot, textures)`. For each ring it makes a `three.BufferGeometry` with `position`, `uv` and normals (`computeVertexNormals`) and a material cloned from the template the existing scenery uses. The inner and middle rings use `ground.png` (uv over ±2500); the horizon ring uses `horizon.png` (uv over ±12500). Its `onBeforeCompile`:
  - samples the colour texture for the base colour, converted from sRGB;
  - samples `ground-type.png` (`NearestFilter`) and blends the CC0 detail texture of that type (Task 7) at two scales (about 1.5 m and 9 m per repeat), with a noise mask against tiling. The detail fades out beyond about 300 m, so far terrain is the satellite colour;
  - under water (y < 0) keeps the seabed colour from `ground.png`, so plan B's refraction will show the real floor.

  Set `matrixAutoUpdate = false`. Don't cast shadows.
- [ ] **Step 6:** Commit: "Build a real-world spot's terrain in three rings".

### Task 7: CC0 detail textures

**Files:** Create `mods/venues/assets/textures/` and `mods/venues/assets/textures/CREDITS.md`

- [ ] **Step 1:** Browse ambientCG and Poly Haven (both CC0) for a 1K colour map (plus a normal map where it's cheap) of each type: dry white coral sand, wet sand, coral rubble, dry scrub soil (reddish-brown with pebbles), weathered limestone, mangrove mud. Prefer 1K JPG, under about 600 KB each.
- [ ] **Step 2:** **Ask the user to OK the download**, listing each file's name, source URL and size. Don't download without a yes.
- [ ] **Step 3:** Download into `mods/venues/assets/textures/<type>.jpg` (and `<type>-normal.jpg`). Write `CREDITS.md`: each file's source page, author where given, and "CC0 1.0".
- [ ] **Step 4:** Commit: "Add CC0 detail textures for real-world ground".

### Task 8: The water reads the real depth

**Files:** `mods/venues/patches.mjs`, `water.js`, `waves.js`; tests in `test/venues.test.mjs` and `test/venues-patch-snapshot.test.mjs`

- [ ] **Step 1:** Read how the water patch computes shallows today: the uniforms `uShore`, `uCurve` and `uBar`, `shoreOff()` in `SHORE_GLSL`, and the shallow colour and surf terms. Then add a depth-map path:
  - uniforms `uSpotDepth` (sampler2D, `depth.png` as a `CanvasTexture`, linear filtering), `uSpotBox` (vec4: half extent, enabled 0/1), `uSpotReef` (sampler2D: distance to the reef line, 0–255 = 0–80 m, made at load with `distanceTransform` over the reef line rasterised by `fillPolygons` on a thin buffer polygon), and `uLagoonFloor` (0.8);
  - when `uSpotBox.y > 0.5`: depth = max(sampled depth, `uLagoonFloor`) on water. Shallows colour by depth (white sand showing through below about 2 m), surf foam where the reef distance is under about 12 m and the swell is up, calmer chop inside the reef;
  - otherwise exactly today's analytic code, so Sotavento and Sylt don't change (the existing snapshot tests must stay green).
- [ ] **Step 2:** In `waves.js`, scale the wave height by depth on the same switch: full in open water, about 15% inside the reef, 0 on land. The CPU height function and the vertex shader must match, as now.
- [ ] **Step 3:** In `water.js`, add Sorobon's look:
  - deep Caribbean blue outside;
  - bright turquoise over sand;
  - dark green-blue over the lagoon floor's dark patches;
  - high, white trade-wind cumulus (`cloud` about 0.25);
  - clear haze.
- [ ] **Step 4:** Tests:
  - a snapshot test that the patched water shader contains the new uniforms and the old path;
  - a unit test that `applyVenueLook` sets `uSpotBox.y` to 1 only for a real-world spot.
- [ ] **Step 5:** Commit: "Draw a real-world spot's water from its depth, with surf on the reef".

### Task 9: Plants

**Files:** Create `mods/venues/realworld/plants.js`, `scatter.js`, `test/realworld-scatter.test.mjs`

- [ ] **Step 1: Scatter, test first:**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { scatter } from "../mods/venues/realworld/scatter.js";

test("plants go only on their ground, at their density, the same every time", () => {
  const spot = { groundAt: (x) => (x < 0 ? 6 : 4), heightAt: () => 1 };
  const rules = { mangrove: { ground: [6], perHectare: 400 }, kadushi: { ground: [4], perHectare: 30 } };
  const a = scatter(spot, rules, { half: 200, seed: 7 }), b = scatter(spot, rules, { half: 200, seed: 7 });
  assert.deepEqual(a, b);
  assert.ok(a.mangrove.every((p) => p.x < 0) && a.kadushi.every((p) => p.x >= 0));
  const ratio = a.mangrove.length / a.kadushi.length;
  assert.ok(ratio > 8 && ratio < 18, `mangrove/kadushi ${ratio}`);
});
```

- [ ] **Step 2: `scatter.js`** — jittered-grid placement per kind:
  - for each kind, a grid of cells sized for its density;
  - a jittered point per cell (seeded random), kept if its ground is one of the kind's ground types;
  - each kept point gets a seeded scale (0.7–1.3), yaw and variant (0–3), and `y = heightAt`.
  - Returns `{ kind: [{ x, y, z, scale, yaw, variant }] }`. Commit after the test passes.
- [ ] **Step 3: `plants.js`** — generators returning geometry arrays (positions, normals, colours) per variant, built from the vendored r185 geometry helpers the way `props.js` does:
  - **mangrove** (*Rhizophora*): 6–12 arching prop roots from a trunk at about 0.6 m, a dense rounded canopy 3–5 m across of a few merged, displaced spheres, dark glossy green;
  - **kadushi** (*Stenocereus griseus*): 3–8 m ribbed columns (8 ribs), 2–5 arms curving up, grey-green;
  - **divi-divi** (*Libidibia coriaria*): a short trunk leaning about 35° downwind (+x), a flat crown streaming downwind;
  - **scrub**: low, irregular grey-green bushes 1–2 m.

  Each variant stays under about 1500 triangles; mangroves get a level-of-detail variant (a single blob) beyond about 400 m.
- [ ] **Step 4:** In `mount.js` (Task 11), one `InstancedMesh` per kind and variant, using the scatter's transforms.
  - Densities to start from, tuned by eye against `ground.png`: mangroves 400/ha on mangrove ground, kadushi 25/ha and divi-divi 6/ha and scrub 150/ha on scrub soil.
  - Drop instances farther than 2.5 km from the course.
- [ ] **Step 5:** Commit: "Generate and scatter Bonaire's plants".

### Task 10: Buildings

**Files:** Create `mods/venues/realworld/buildings.js`, `test/realworld-buildings.test.mjs`

- [ ] **Step 1: Test first** (`test/realworld-buildings.test.mjs`):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { extrudeFootprint } from "../mods/venues/realworld/buildings.js";

test("a footprint becomes outward-facing walls to its height and a roof, on its lowest ground", () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  for (const ring of [square, [...square].reverse()]) {
    const g = extrudeFootprint(ring, 4, (x) => (x > 5 ? 1 : 0.5));
    const ys = [];
    for (let k = 1; k < g.positions.length; k += 3) ys.push(g.positions[k]);
    assert.equal(Math.min(...ys), 0.5);
    assert.equal(Math.max(...ys), 4.5);
    for (let k = 0; k < g.normals.length; k += 3) {
      if (Math.abs(g.normals[k + 1]) > 0.9) continue; // the roof
      assert.ok((g.positions[k] - 5) * g.normals[k] + (g.positions[k + 2] - 5) * g.normals[k + 2] > 0, "walls face out");
    }
    assert.equal(g.roofTriangles, 2);
  }
});
```

- [ ] **Step 2: Write `mods/venues/realworld/buildings.js`**

```js
// OpenStreetMap footprints raised to their heights: walls facing out and a
// flat roof, standing on the lowest ground under the footprint. Footprints
// are [x, z] rings, closed or not, in either direction.
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

// Ear clipping for a ring with positive area; returns index triples.
function earClip(pts) {
  const idx = pts.map((_, i) => i), tris = [];
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  while (idx.length > 3) {
    let clipped = false;
    for (let k = 0; k < idx.length && !clipped; k++) {
      const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
      if (cross(pts[ia], pts[ib], pts[ic]) <= 0) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(pts[j], pts[ia], pts[ib], pts[ic]))) continue;
      tris.push(ia, ib, ic);
      idx.splice(k, 1);
      clipped = true;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push(...idx);
  return tris;
}

export function extrudeFootprint(ring, height, heightAt) {
  let pts = ring.at(-1)[0] === ring[0][0] && ring.at(-1)[1] === ring[0][1] ? ring.slice(0, -1) : ring.slice();
  const area = pts.reduce((sum, [x1, z1], k) => { const [x2, z2] = pts[(k + 1) % pts.length]; return sum + x1 * z2 - x2 * z1; }, 0);
  if (area < 0) pts = pts.reverse();
  const base = Math.min(...pts.map(([x, z]) => heightAt(x, z))), top = base + height;
  const positions = [], normals = [], uvs = [];
  const vertex = (x, y, z, nx, ny, nz, u, v) => { positions.push(x, y, z); normals.push(nx, ny, nz); uvs.push(u, v); };
  let along = 0;
  for (let k = 0; k < pts.length; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % pts.length], length = Math.hypot(bx - ax, bz - az);
    const nx = (bz - az) / length, nz = -(bx - ax) / length, u0 = along / 3, u1 = (along + length) / 3, v1 = height / 3;
    vertex(ax, base, az, nx, 0, nz, u0, 0); vertex(bx, base, bz, nx, 0, nz, u1, 0); vertex(bx, top, bz, nx, 0, nz, u1, v1);
    vertex(ax, base, az, nx, 0, nz, u0, 0); vertex(bx, top, bz, nx, 0, nz, u1, v1); vertex(ax, top, az, nx, 0, nz, u0, v1);
    along += length;
  }
  const roof = earClip(pts);
  for (const i of roof) vertex(pts[i][0], top, pts[i][1], 0, 1, 0, pts[i][0] / 10, pts[i][1] / 10);
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), uvs: Float32Array.from(uvs), roofTriangles: roof.length / 3 };
}
```

The geometry is non-indexed. Use the material with `side: DoubleSide` if the walls' winding shows them inside out in the browser.
- [ ] **Step 3:** In `mount.js`, merge every building within 2.5 km into one mesh with one material:
  - walls in the island's colours (white, ochre, pastel), chosen by a hash of the footprint;
  - roofs light grey, or terracotta for `house`;
  - one wall texture, generated on a canvas once: plaster with windows and doors, scaled per 3 m.
- [ ] **Step 4:** Commit: "Raise OpenStreetMap buildings at real-world spots".

### Task 11: Mount the spot; Sorobon's landmarks

**Files:** Create `mods/venues/realworld/mount.js`, `mods/venues/sites/*.js`; modify `mods/venues/scenery.js`, `index.js`, `server/venues.mjs`

- [ ] **Step 1: Split `scenery.js`.** Move `buildSotavento` and `buildSylt` into `sites/sotavento-fuerteventura.js` and `sites/westerland-sylt.js`, exporting `build(group, template, textures)` and importing the shared helpers from `scenery.js`. `mountVenueScenery` picks the builder from a table `{ id: build }`. `npm test` and the browser: Sotavento and Sylt look exactly as before. Commit: "Give each venue its own builder file".
- [ ] **Step 2: `mount.js`** — `mountSpot(game, venue, three)`:
  - loads the spot with `decodeInBrowser`;
  - builds the terrain, plants and buildings into one group named `spot:<id>`;
  - calls the site file's landmarks (`sites/<id>.js` `landmarks(kit, spot)`);
  - sets `game.__venueSpot = spot`;
  - raises `camera.far` to 14 000 and narrows the haze (`fog.density` about 0.00012), restoring both on unmount;
  - shows a "Loading Sorobon…" note on the venue chip until it's ready. On any failure, logs, unmounts and falls back to the game's own scene.

  `showVenue` in `index.js` uses it for venues whose catalog entry has spot files.
- [ ] **Step 3: `sites/sorobon-bonaire.js` landmarks**, from photos of Sorobon. Search for "Jibe City Bonaire", "Bonaire Windsurf Place" and "Sorobon beach"; keep only facts, no copied images.
  - wooden windsurf centres with rig racks along the beach front: place them at the `features.buildings` footprints nearest the beach, which are Jibe City and its neighbours;
  - the beach bar's palapa roofs, thatched umbrellas, a jetty if `features.piers` has one there;
  - rigs and boards on the sand (`props.js` `addRig`);
  - flags blowing downwind (+x);
  - a few palms by the bars;
  - people on the beach (`addPerson`).
- [ ] **Step 4: Catalog and picture.**
  - `publicVenue` reports `scenery: true` for a venue whose `mods/venues/spots/<id>/spot.json` exists. Read it once at catalog load in `server/venues.mjs`, and add `spotFiles: true` so the mod knows to use `mountSpot`.
  - The chooser and event card show `/__mods/venues/spots/<id>/picture.png` for such venues.
  - Update the tests in `test/venues.test.mjs` that list which venues have scenery.
- [ ] **Step 5:** `npm test`. Commit: "Mount Sorobon from its map data, with its beach landmarks".

### Task 12: Check it in the game

- [ ] **Step 1:** Preview (see the handoff notes for the port). Choose Sorobon:
  - the bay builds the true way round: the reef and open sea upwind (−x), Sorobon beach downwind and to −z, mangroves around the bay;
  - the lagoon is turquoise with darker patches;
  - surf breaks along the reef;
  - there are no seams between terrain rings;
  - up close the sand shows grain and there's no tiling;
  - plants and buildings stand on the ground, not floating or sunk.
- [ ] **Step 2:** Sail into the beach: the rider stops at the water's edge. Sail into the mangroves: the same.
- [ ] **Step 3:** Measure the frame time with the game's GPU timer (its diagnostics), at the game's high and standard quality.
  - **Target:** 16.7 ms at high on the development machine.
  - **If over:** cut plant density and the inner ring's reach first.
- [ ] **Step 4:** Race a 2014 Bonaire rider: the challenge sails at Sorobon in the event's wind.
- [ ] **Step 5:** Screenshots of the beach, the reef and the course for the PR. Commit any tuning.

### Task 13: Documentation

- [ ] Add Sorobon to `README.md`'s venues paragraph (real-world spot built from map data, credits in `mods/venues/spots/sorobon-bonaire/CREDITS.md` and `mods/venues/assets/textures/CREDITS.md`).
- [ ] Mark the spec's success criteria met in `docs/venues-roadmap.md`. Commit.

---

## Findings

(Filled in by Task 1.)

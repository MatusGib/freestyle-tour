// Venue environments use BufferGeometry and lit materials taken from the
// running game. No external renderer or remote assets are loaded. Each coast
// lies where coast.js puts it, and all props remain stationary in world space
// while the rider and camera move. Land is shaped with three.js's simplex
// noise and props with its geometry (props.js), both vendored in lib/.
// Each venue's builder is in sites/; these are the parts they share.
import { SITE_LAYOUTS, shorelineAt, shorelineBase, shorelineOffset } from "./coast.js";
import { SimplexNoise } from "./lib/SimplexNoise.js";
import { seeded } from "./props.js";
import { build as buildSotavento } from "./sites/sotavento-fuerteventura.js";
import { build as buildSylt } from "./sites/westerland-sylt.js";

const BUILDERS = { "sotavento-fuerteventura": buildSotavento, "westerland-sylt": buildSylt };
const LAND_CLEARANCE_D = 1.5;
export const SHORE_HALF_LENGTH = 4200;
const SHORE_COLS = 1200;
const pendingBatches = new WeakMap();

// The coast being built (its frame); point() places (s, d, height) on it.
let building = null;
export const point = (s, d, y = 0) => [building.rightX * s + building.inX * d, y, building.rightZ * s + building.inZ * d];

function writeLocalPosition(state, frame, s, d) {
  state.x = frame.rightX * s + frame.inX * d;
  state.z = frame.rightZ * s + frame.inZ * d;
}

function stopLocalVelocity(state, input, frame, axis, direction) {
  const x = axis === "s" ? frame.rightX : frame.inX;
  const z = axis === "s" ? frame.rightZ : frame.inZ;
  const velocity = state.vx * x + state.vz * z;
  if (direction * velocity < 0) {
    state.vx -= x * velocity;
    state.vz -= z * velocity;
    state.speed = Math.hypot(state.vx, state.vz);
  }
  const forward = axis === "s"
    ? Math.sin(state.heading) * frame.rightX - Math.cos(state.heading) * frame.rightZ
    : Math.sin(state.heading) * frame.inX - Math.cos(state.heading) * frame.inZ;
  if (input && direction * forward < 0 && input.power > 0) input.power = 0;
}

export function resolveVenueCollision(state, input, venueId) {
  const layout = SITE_LAYOUTS[venueId];
  if (!state || !layout) return;
  const frame = layout.frame;
  const s = frame.rightX * state.x + frame.rightZ * state.z;
  const d = frame.inX * state.x + frame.inZ * state.z;
  const vd = frame.inX * state.vx + frame.inZ * state.vz;
  const dt = 1 / 120;
  const landStopD = shorelineAt(venueId, s) - LAND_CLEARANCE_D;
  const headingD = Math.sin(state.heading) * frame.inX - Math.cos(state.heading) * frame.inZ;
  const drivingInland = (input?.power ?? 0) > 0 && headingD > .08;
  const insideLand = d >= landStopD;
  const approachingShore = d > landStopD - .2 && (vd > .05 || drivingInland || d + Math.max(0, vd) * dt >= landStopD);
  if (insideLand || approachingShore) {
    if (insideLand) writeLocalPosition(state, frame, s, landStopD);
    stopLocalVelocity(state, input, frame, "d", -1);
  }

  if (venueId !== "westerland-sylt" || (state.air && state.height >= 1.05)) return;
  const playerS = frame.rightX * state.x + frame.rightZ * state.z;
  const playerD = frame.inX * state.x + frame.inZ * state.z;
  const playerVs = frame.rightX * state.vx + frame.rightZ * state.vz;
  const playerVd = frame.inX * state.vx + frame.inZ * state.vz;
  const nearestGroynes = Math.round(playerS / 140) * 140;
  const halfWidth = 1.12;
  const boardRadius = .6;
  for (let offset = -1; offset <= 1; offset++) {
    const groyneS = nearestGroynes + offset * 140;
    if (Math.abs(groyneS) > SHORE_HALF_LENGTH) continue;
    const nextS = playerS + playerVs * dt;
    const nextD = playerD + playerVd * dt;
    const groyneStart = shorelineAt(venueId, groyneS) - 20;
    const groyneEnd = shorelineAt(venueId, groyneS);
    const overlapsCoast = Math.max(playerD, nextD) >= groyneStart - .7 && Math.min(playerD, nextD) <= Math.min(groyneEnd, landStopD);
    const overlapsGroyne = Math.max(Math.min(playerS, nextS), groyneS - halfWidth - boardRadius) <=
      Math.min(Math.max(playerS, nextS), groyneS + halfWidth + boardRadius);
    if (!overlapsCoast || !overlapsGroyne) continue;
    const headingS = Math.sin(state.heading) * frame.rightX - Math.cos(state.heading) * frame.rightZ;
    const preferredSide = Math.sign(playerVs) || Math.sign(headingS) || -1;
    const side = playerS < groyneS ? -1 : playerS > groyneS ? 1 : preferredSide;
    const boundary = groyneS + side * (halfWidth + boardRadius);
    if (Math.abs(playerS - groyneS) <= halfWidth + boardRadius) writeLocalPosition(state, frame, boundary, playerD);
    stopLocalVelocity(state, input, frame, "s", side);
    break;
  }
}

export function addMesh(group, template, positions, indices, color, options = {}) {
  const key = [options.colors ? "vertex" : color, options.map?.uuid ?? "", Boolean(options.colors), Boolean(options.transparent), options.opacity ?? 1, options.depthWrite ?? !options.transparent, options.roughness ?? .94, options.metalness ?? 0].join(":");
  const batches = pendingBatches.get(group);
  let batch = batches.get(key);
  if (!batch) {
    const material = template.material.clone();
    material.color.set(options.colors ? 0xffffff : color);
    material.vertexColors = Boolean(options.colors);
    material.transparent = Boolean(options.transparent);
    material.opacity = options.opacity ?? 1;
    material.depthWrite = options.depthWrite ?? !options.transparent;
    material.depthTest = true;
    material.side = 2;
    material.roughness = options.roughness ?? .94;
    material.metalness = options.metalness ?? 0;
    material.emissive?.set(0x000000);
    material.emissiveIntensity = 0;
    material.map = options.map ?? null;
    material.needsUpdate = true;
    batch = { material, positions: [], colors: [], uvs: [], indices: [], hasColors: Boolean(options.colors), hasUvs: Boolean(options.uvs) };
    batches.set(key, batch);
  }
  const offset = batch.positions.length / 3;
  // Scene terrain can exceed the argument limit of push(...largeArray).
  // Append by index so the biggest dune mesh mounts without a stack overflow.
  for (let i = 0; i < positions.length; i++) batch.positions.push(positions[i]);
  if (options.colors) for (let i = 0; i < options.colors.length; i++) batch.colors.push(options.colors[i]);
  if (options.uvs) for (let i = 0; i < options.uvs.length; i++) batch.uvs.push(options.uvs[i]);
  for (const index of indices) batch.indices.push(offset + index);
}

function finishBatches(group, template) {
  const batches = pendingBatches.get(group);
  const base = template.__venueBufferGeometry;
  const Attribute = base.getAttribute("position").constructor;
  for (const batch of batches.values()) {
    const geometry = new base.constructor();
    geometry.setAttribute("position", new Attribute(new Float32Array(batch.positions), 3));
    if (batch.hasColors) geometry.setAttribute("color", new Attribute(new Float32Array(batch.colors), 3));
    if (batch.hasUvs) geometry.setAttribute("uv", new Attribute(new Float32Array(batch.uvs), 2));
    geometry.setIndex(batch.indices);
    geometry.computeVertexNormals();
    group.add(new template.constructor(geometry, batch.material));
  }
  pendingBatches.delete(group);
}

function quad(positions, indices, corners) {
  const offset = positions.length / 3;
  for (const [s, d, y] of corners) positions.push(...point(s, d, y));
  indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
}

export function addBox(group, template, s, d, width, depth, height, color, rotation = 0, baseY = 0) {
  const c = Math.cos(rotation), sn = Math.sin(rotation);
  const local = (x, y, z) => [s + x * c - z * sn, d + x * sn + z * c, y + baseY];
  const corners = [
    local(-width / 2, 0, -depth / 2), local(width / 2, 0, -depth / 2),
    local(width / 2, height, -depth / 2), local(-width / 2, height, -depth / 2),
    local(-width / 2, 0, depth / 2), local(width / 2, 0, depth / 2),
    local(width / 2, height, depth / 2), local(-width / 2, height, depth / 2),
  ];
  const faces = [[0, 3, 2, 1], [5, 6, 7, 4], [4, 7, 3, 0], [1, 2, 6, 5], [3, 7, 6, 2], [4, 0, 1, 5]];
  const positions = [], indices = [];
  for (const face of faces) quad(positions, indices, face.map((i) => corners[i]));
  return addMesh(group, template, positions, indices, color);
}

export function addCylinder(group, template, s, d, y, radiusBottom, radiusTop, height, color, segments = 20) {
  const positions = [], indices = [];
  for (let ring = 0; ring < 2; ring++) {
    const radius = ring ? radiusTop : radiusBottom;
    const level = y + (ring ? height : 0);
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      positions.push(...point(s + Math.cos(angle) * radius, d + Math.sin(angle) * radius, level));
    }
  }
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    indices.push(i, j, segments + j, i, segments + j, segments + i);
  }
  const bottomCenter = positions.length / 3;
  positions.push(...point(s, d, y));
  const topCenter = positions.length / 3;
  positions.push(...point(s, d, y + height));
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    indices.push(bottomCenter, j, i, topCenter, segments + i, segments + j);
  }
  return addMesh(group, template, positions, indices, color);
}

export function addSurface(group, template, s0, s1, d0, d1, rows, cols, heightAt, colorAt, options = {}) {
  const positions = [], colors = [], uvs = [], indices = [];
  const { coastOffset, coastOffsetEnd, ...meshOptions } = options;
  const vertexColor = new template.material.color.constructor();
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const s = s0 + (s1 - s0) * col / cols;
      const blend = 1 - row / rows;
      const d = d0 + (d1 - d0) * row / rows + (coastOffset?.(s) ?? 0) * blend + (coastOffsetEnd?.(s) ?? 0) * (1 - blend);
      const y = heightAt(s, d);
      positions.push(...point(s, d, y));
      uvs.push(s / 18, d / 18);
      const shade = colorAt(s, d);
      vertexColor.set(shade.color ?? shade);
      const factor = shade.factor ?? 1;
      colors.push(vertexColor.r * factor, vertexColor.g * factor, vertexColor.b * factor);
      if (row < rows && col < cols) {
        const a = row * (cols + 1) + col, b = a + 1, c = a + cols + 1, e = c + 1;
        indices.push(a, c, b, b, c, e);
      }
    }
  }
  return addMesh(group, template, positions, indices, "#ffffff", { ...meshOptions, colors, uvs });
}

// The wet foreshore slopes from the beach (top, at the shoreline) to 0.7 m
// under the water 14 m out, so the swash runs up and down the sand.
export function addForeshore(group, template, venueId, layout, top, color) {
  const coastOffset = (s) => shorelineOffset(s, layout);
  const shore = shorelineBase(layout);
  addSurface(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, shore - 14, shore, 4, SHORE_COLS,
    (s, d) => top + (top + .7) * (d - shorelineAt(venueId, s)) / 14,
    (s, d) => ({ color, factor: .94 + .06 * Math.sin(s * .09 + d * .3) }),
    { coastOffset, coastOffsetEnd: coastOffset },
  );
}

// What props.js needs to place geometry on the coast being built.
export const kitFor = (group, template) => ({ point, add: (positions, indices, color, options) => addMesh(group, template, positions, indices, color, options) });

// The yaw that turns a prop's local +x (along the shore) onto the wind (+x in
// the world).
export const windYaw = () => Math.atan2(-building.inX, building.rightX);

export const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Fractal simplex noise (-1 to 1) and its ridged form (0 to 1; sharpness 2
// gives knife-edge crests, about 1 worn, rounded ridges), for dunes and
// mountains that don't repeat like sums of sines.
export function landNoise(seed) {
  const simplex = new SimplexNoise({ random: seeded(seed) });
  const fbm = (x, y, octaves = 4) => {
    let value = 0, amplitude = .5, frequency = 1;
    for (let i = 0; i < octaves; i++) {
      value += amplitude * simplex.noise(x * frequency, y * frequency);
      amplitude *= .5;
      frequency *= 2.03;
    }
    return value;
  };
  const ridged = (x, y, octaves = 5, sharpness = 2) => {
    let value = 0, amplitude = .5, frequency = 1;
    for (let i = 0; i < octaves; i++) {
      value += amplitude * (1 - Math.abs(simplex.noise(x * frequency, y * frequency))) ** sharpness;
      amplitude *= .5;
      frequency *= 2.1;
    }
    return value;
  };
  return { fbm, ridged };
}

// The three terrain strips every coast has: the beach, the dunes and the land
// behind, all on one groundAt so their edges meet.
export function addLand(group, template, venueId, layout, textures, groundAt, colorAt) {
  const shore = shorelineBase(layout);
  const coastOffset = (s) => shorelineOffset(s, layout);
  addSurface(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, shore, shore + 90, 18, SHORE_COLS, groundAt, colorAt, { map: textures.sand, coastOffset });
  addSurface(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, shore + 90, shore + 520, 64, SHORE_COLS, groundAt, colorAt, { map: textures.sand });
  addSurface(group, template, -4600, 4600, shore + 520, shore + 2400, 90, 900, groundAt, colorAt);
}

function makeSandTexture(CanvasTexture) {
  if (!CanvasTexture || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d", { alpha: false });
  const image = context.createImageData(512, 512);
  let seed = 1729;
  for (let pixel = 0; pixel < 512 * 512; pixel++) {
    seed = (seed * 16807) % 2147483647;
    const grain = (seed / 2147483647 - .5) * 30;
    const x = pixel % 512, y = Math.floor(pixel / 512);
    const ripple = Math.sin(y * .08 + Math.sin(x * .017) * 1.8) * 6 + Math.sin(y * .023 + x * .012) * 4;
    const i = pixel * 4;
    image.data[i] = Math.max(0, Math.min(255, 205 + grain + ripple));
    image.data[i + 1] = Math.max(0, Math.min(255, 184 + grain + ripple * .78));
    image.data[i + 2] = Math.max(0, Math.min(255, 148 + grain * .8 + ripple * .5));
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  context.globalAlpha = .13;
  for (let i = 0; i < 1200; i++) {
    seed = (seed * 16807) % 2147483647;
    const x = seed / 2147483647 * 512;
    seed = (seed * 16807) % 2147483647;
    const y = seed / 2147483647 * 512;
    context.fillStyle = i % 4 ? "#f7e8c7" : "#665e50";
    context.fillRect(x, y, .5 + i % 2, .5 + i % 2);
  }
  context.globalAlpha = 1;
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = 1000; // Three.js RepeatWrapping
  texture.colorSpace = "srgb";
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// A façade of 4 window bays by 4 floors, for props.js's addBlock: tinted glass
// with a light reflection, white frames and a balcony rail under each floor.
function makeWindowTexture(CanvasTexture) {
  if (!CanvasTexture || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 256, 256);
  for (let floor = 0; floor < 4; floor++) {
    for (let bay = 0; bay < 4; bay++) {
      const x = bay * 64 + 12, y = floor * 64 + 14;
      const glass = context.createLinearGradient(x, y, x + 40, y + 34);
      glass.addColorStop(0, "#6f8ea0");
      glass.addColorStop(.55, "#3d5566");
      glass.addColorStop(1, "#4d6b7c");
      context.fillStyle = "#d9d6cf";
      context.fillRect(x - 3, y - 3, 46, 40);
      context.fillStyle = glass;
      context.fillRect(x, y, 40, 34);
      context.fillStyle = "#c7c3ba";
      context.fillRect(bay * 64, floor * 64 + 54, 64, 4);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = 1000; // Three.js RepeatWrapping
  texture.colorSpace = "srgb";
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createVenueTextures(CanvasTexture) {
  return { sand: makeSandTexture(CanvasTexture), windows: makeWindowTexture(CanvasTexture) };
}

export function mountVenueScenery(game, venue, textures = { sand: null, windows: null }) {
  if (game.__venueSceneryVenueId === venue?.id && game.__venueScenery) return;
  if (game.__venueScenery) {
    game.__venueScenery.parent?.remove(game.__venueScenery);
    game.__venueScenery.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose();
    });
  }
  game.__venueScenery = null;
  game.__venueSceneryVenueId = null;
  if (!SITE_LAYOUTS[venue?.id] || !game.scene || !game.areaArrow?.fill || !game.areaArrow?.group || !game.buoys?.buoys?.length) return;

  const template = game.buoys.buoys[0].buoy.children.find((object) => object.isMesh);
  if (!template?.material?.color || !template.material.clone) return;
  template.__venueBufferGeometry = game.areaArrow.fill.geometry;
  const group = new game.areaArrow.group.constructor();
  group.name = `venue:${venue.id}`;
  pendingBatches.set(group, new Map());
  building = SITE_LAYOUTS[venue.id].frame;
  try {
    BUILDERS[venue.id](group, template, textures);
    finishBatches(group, template);
  } catch (error) {
    for (const batch of pendingBatches.get(group)?.values() ?? []) batch.material.dispose();
    group.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose();
    });
    pendingBatches.delete(group);
    delete template.__venueBufferGeometry;
    console.error(`[venues] Could not build ${venue.id} scenery; leaving the sailing scene usable`, error);
    return;
  } finally {
    building = null;
  }
  delete template.__venueBufferGeometry;
  game.scene.add(group);
  game.__venueScenery = group;
  game.__venueSceneryVenueId = venue.id;
}

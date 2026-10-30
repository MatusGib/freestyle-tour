// Venue environments use BufferGeometry and lit materials taken from the
// running game. No external renderer or remote assets are loaded. The game's
// wind always blows along +x and its heat area never moves, so a venue turns
// its coast around the course instead: the beach lies at the venue's angle to
// the wind, beyond the course and the water AI riders sail. All props remain
// stationary in world space while the rider and camera move. Land is shaped
// with three.js's simplex noise and props with its geometry (props.js), both
// vendored in lib/.
import { SimplexNoise } from "./lib/SimplexNoise.js";
import { addBlock, addBush, addFeatherFlag, addPagoda, addPalm, addPerson, addRig, seeded } from "./props.js";

// The game's heat area: depth along the wind (x), length across it (z).
const COURSE = { depth: 220, length: 420 };
const LAND_CLEARANCE_D = 1.5;
const SHORE_HALF_LENGTH = 4200;
const SHORE_COLS = 1200;
const pendingBatches = new WeakMap();

// inland: the direction from the water to the beach, measured from the wind:
// 0 is onshore, ±90° side-shore, beyond ±90° a little offshore. Negative
// angles put the beach on the far side of the course from the camera, so the
// coast is in view. That mirrors both venues: there the wind comes from the
// left as you look out to sea, here from the right.
export const SITE_LAYOUTS = {
  "sotavento-fuerteventura": {
    inland: -100 * Math.PI / 180, // side-shore, slightly offshore
    shoreBuffer: 90,
    sandbarOffshore: 280,
    curveAmplitude: 5.5,
    curveFrequency: .0036,
    curveSecondary: 2.4,
    curveSecondaryFrequency: .011,
  },
  "westerland-sylt": {
    inland: -45 * Math.PI / 180, // side-onshore
    shoreBuffer: 100,
    sandbarOffshore: 400,
    curveAmplitude: 3.2,
    curveFrequency: .0045,
    curveSecondary: 1.8,
    curveSecondaryFrequency: .013,
  },
};
// s runs along the shore, d inland from the water.
for (const layout of Object.values(SITE_LAYOUTS)) {
  const inX = Math.cos(layout.inland), inZ = Math.sin(layout.inland);
  layout.frame = { rightX: -inZ, rightZ: inX, inX, inZ };
}

// The coast being built (its frame); point() places (s, d, height) on it.
let building = null;
const point = (s, d, y = 0) => [building.rightX * s + building.inX * d, y, building.rightZ * s + building.inZ * d];

// The shoreline sits shoreBuffer beyond the course's corner nearest the beach.
function shorelineBase(layout) {
  const { inX, inZ } = layout.frame;
  return COURSE.depth / 2 * Math.abs(inX) + COURSE.length / 2 * Math.abs(inZ) + layout.shoreBuffer;
}
function shorelineOffset(s, layout) {
  return Math.sin(s * layout.curveFrequency) * layout.curveAmplitude +
    Math.sin(s * layout.curveSecondaryFrequency + .7) * layout.curveSecondary;
}
export function shorelineAt(venueId, s) {
  const layout = SITE_LAYOUTS[venueId];
  return layout ? shorelineBase(layout) + shorelineOffset(s, layout) : 0;
}

// Where the water shader draws a venue's shallows and calms its waves: the
// inland direction, the straight shoreline's distance from the course centre,
// its bends (as shorelineOffset: [a1, f1, a2, f2]) and the sandbar's distance
// out from it.
export function coastFor(venueId) {
  const layout = SITE_LAYOUTS[venueId];
  if (!layout) return null;
  const { curveAmplitude, curveFrequency, curveSecondary, curveSecondaryFrequency } = layout;
  return {
    inX: layout.frame.inX, inZ: layout.frame.inZ, shoreline: shorelineBase(layout), sandbar: layout.sandbarOffshore,
    curve: [curveAmplitude, curveFrequency, curveSecondary, curveSecondaryFrequency],
  };
}

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

function addMesh(group, template, positions, indices, color, options = {}) {
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

function addBox(group, template, s, d, width, depth, height, color, rotation = 0, baseY = 0) {
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

function addCylinder(group, template, s, d, y, radiusBottom, radiusTop, height, color, segments = 20) {
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

function addRock(group, template, s, d, width, depth, height, color, baseY = -.32, seed = 1) {
  const positions = [], indices = [];
  const sides = 7;
  let random = Math.abs(Math.floor(seed * 997 + s * 13 + d * 7)) % 2147483647 || 1;
  const rnd = () => ((random = (random * 16807) % 2147483647) - 1) / 2147483646;
  const rings = [[.78, 0], [1, .42], [.48, .84]];
  const radii = Array.from({ length: sides }, () => .76 + rnd() * .42);
  for (const [radius, rise] of rings) {
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const jitter = radii[i];
      positions.push(...point(
        s + Math.cos(angle) * width * .5 * radius * jitter,
        d + Math.sin(angle) * depth * .5 * radius * jitter,
        baseY + height * rise,
      ));
    }
  }
  const bottom = positions.length / 3;
  positions.push(...point(s, d, baseY));
  const top = positions.length / 3;
  positions.push(...point(s + (rnd() - .5) * width * .12, d + (rnd() - .5) * depth * .12, baseY + height));
  for (let ring = 0; ring < 2; ring++) {
    const a = ring * sides, b = (ring + 1) * sides;
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      indices.push(a + i, a + j, b + j, a + i, b + j, b + i);
    }
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    indices.push(bottom, j, i, top, 2 * sides + i, 2 * sides + j);
  }
  addMesh(group, template, positions, indices, color, { roughness: .98 });
}

function addJudgeTower(group, template, s, d, baseY = 0) {
  for (const x of [-3.1, 3.1]) {
    for (const z of [-2.2, 2.2]) addBox(group, template, s + x, d + z, .32, .32, 5.8, "#d9d4c8", 0, baseY);
  }
  addBox(group, template, s, d, 7.2, 5.5, .34, "#9e7954", 0, baseY + 5.35);
  addBox(group, template, s, d, 6.2, 4.1, 2.6, "#eee8db", 0, baseY + 5.7);
  addBox(group, template, s, d - 2.3, 7.5, .32, 2.9, "#f7f3eb", 0, baseY + 5.65);
  addBox(group, template, s, d, 7.8, 6, .25, "#b85d49", 0, baseY + 8.35);
  for (const x of [-3, 3]) addBox(group, template, s + x, d - 2.78, .12, .12, .75, "#f4f0e7", 0, baseY + 5.9);
}

function addMusicShell(group, template, s, d, baseY = 0) {
  addCylinder(group, template, s, d, baseY + .18, 8, 8, .24, "#c9c7bd", 24);
  for (let i = 0; i < 7; i++) {
    const angle = Math.PI * (.12 + i * .126);
    const x = s + Math.cos(angle) * 6.5;
    const z = d + Math.sin(angle) * 6.5;
    addCylinder(group, template, x, z, baseY + .4, .16, .13, 3.3, "#eee8dc", 8);
  }
  const positions = [], indices = [];
  const arc = [];
  for (let i = 0; i <= 12; i++) {
    const angle = Math.PI * (.08 + i * .07);
    arc.push([s + Math.cos(angle) * 7.2, d + Math.sin(angle) * 7.2, baseY + 4.2 + Math.sin(angle) * 1.8]);
  }
  const center = [s, d - 1, baseY + 4.7];
  for (let i = 0; i < arc.length - 1; i++) {
    const offset = positions.length / 3;
    positions.push(...point(...center), ...point(...arc[i]), ...point(...arc[i + 1]));
    indices.push(offset, offset + 1, offset + 2);
  }
  addMesh(group, template, positions, indices, "#f2eee3");
}

function addSurface(group, template, s0, s1, d0, d1, rows, cols, heightAt, colorAt, options = {}) {
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
function addForeshore(group, template, venueId, layout, top, color) {
  const coastOffset = (s) => shorelineOffset(s, layout);
  const shore = shorelineBase(layout);
  addSurface(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, shore - 14, shore, 4, SHORE_COLS,
    (s, d) => top + (top + .7) * (d - shorelineAt(venueId, s)) / 14,
    (s, d) => ({ color, factor: .94 + .06 * Math.sin(s * .09 + d * .3) }),
    { coastOffset, coastOffsetEnd: coastOffset },
  );
}

function addGrass(group, template, placements, color, seed = 1, groundAt = () => 0) {
  const positions = [], indices = [];
  let random = seed;
  const rnd = () => ((random = (random * 16807) % 2147483647) - 1) / 2147483646;
  for (const [s0, d0, count, height] of placements) {
    for (let i = 0; i < count; i++) {
      const s = s0 + (rnd() - .5) * 13, d = d0 + (rnd() - .5) * 9;
      const h = height * (.55 + rnd() * .8), w = .12 + rnd() * .2, lean = (rnd() - .5) * .9;
      const baseY = groundAt(s, d);
      for (let blade = 0; blade < 3; blade++) {
        const a = blade * Math.PI / 3, dx = Math.cos(a) * w, dz = Math.sin(a) * w;
        const offset = positions.length / 3;
        positions.push(...point(s - dx, d - dz, baseY), ...point(s + dx, d + dz, baseY), ...point(s + lean + dx * .2, d + lean * .2, baseY + h));
        indices.push(offset, offset + 1, offset + 2);
      }
    }
  }
  return addMesh(group, template, positions, indices, color, { flatShading: true });
}

function addBeachBasket(group, template, s, d, baseY = 0) {
  addBox(group, template, s, d, 2.7, 2, 1.25, "#477f91", 0, baseY);
  for (let i = -2; i <= 2; i++) {
    if (i % 2 === 0) addBox(group, template, s + i * .43, d - .96, .24, .12, 1.05, "#f3ecdf", 0, baseY);
  }
  addBox(group, template, s, d - .1, 2.8, 2.1, .12, "#786655", 0, baseY);
  addBox(group, template, s - 1.05, d + .55, .08, .08, .75, "#786655", 0, baseY);
  addBox(group, template, s + 1.05, d + .55, .08, .08, .75, "#786655", 0, baseY);
}

// What props.js needs to place geometry on the coast being built.
const kitFor = (group, template) => ({ point, add: (positions, indices, color, options) => addMesh(group, template, positions, indices, color, options) });

// The yaw that turns a prop's local +x (along the shore) onto the wind (+x in
// the world).
const windYaw = () => Math.atan2(-building.inX, building.rightX);

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Fractal simplex noise (-1 to 1) and its ridged form (0 to 1; sharpness 2
// gives knife-edge crests, about 1 worn, rounded ridges), for dunes and
// mountains that don't repeat like sums of sines.
function landNoise(seed) {
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
function addLand(group, template, venueId, layout, textures, groundAt, colorAt) {
  const shore = shorelineBase(layout);
  const coastOffset = (s) => shorelineOffset(s, layout);
  addSurface(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, shore, shore + 90, 18, SHORE_COLS, groundAt, colorAt, { map: textures.sand, coastOffset });
  addSurface(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, shore + 90, shore + 520, 64, SHORE_COLS, groundAt, colorAt, { map: textures.sand });
  addSurface(group, template, -4600, 4600, shore + 520, shore + 2400, 90, 900, groundAt, colorAt);
}

function buildSotavento(group, template, textures) {
  const venueId = "sotavento-fuerteventura";
  const layout = SITE_LAYOUTS[venueId];
  const shore = shorelineBase(layout);
  const kit = kitFor(group, template);
  const wind = windYaw();
  const random = seeded(1993);
  const { fbm, ridged } = landNoise(28);
  const inlandOf = (s, d) => d - shorelineAt(venueId, s);
  // A wide, gently rising beach; foredunes behind it; then the Jandía massif:
  // old, worn volcanic ridges cut by gullies, rising to about 200 m inland.
  const groundAt = (s, d) => {
    const inland = inlandOf(s, d);
    const beach = .12 + .3 * Math.min(inland, 90) / 90 + Math.max(0, inland - 90) * .012;
    const dunes = smooth(70, 150, inland) * (1 - smooth(420, 560, inland)) * (6 * Math.max(0, fbm(s * .011, inland * .018) + .25) + 1.2 * fbm(s * .05, inland * .06));
    const hills = smooth(500, 1500, inland) * (1 + inland / 2400) * (150 * ridged(s * .0009 + 3, inland * .0011, 4, 1.15) + 18 * fbm(s * .005, inland * .005));
    return beach + Math.max(0, dunes) + hills;
  };
  const colorAt = (s, d) => {
    const inland = inlandOf(s, d);
    const shade = .93 + .07 * fbm(s * .08, inland * .08, 2);
    if (inland < 90) return { color: "#dcc493", factor: shade };
    if (inland < 520) return { color: fbm(s * .03, inland * .03, 2) > .18 ? "#a8a06c" : "#e2ca96", factor: shade };
    const height = groundAt(s, d);
    return { color: height > 120 ? "#86644f" : height > 40 ? "#9c7757" : "#b48d63", factor: .88 + .12 * fbm(s * .01, inland * .01, 3) };
  };
  addForeshore(group, template, venueId, layout, .12, "#a38e68");
  addLand(group, template, venueId, layout, textures, groundAt, colorAt);
  const at = (s, inland) => [s, shore + inland, groundAt(s, shore + inland)];

  // Playa Barca's judging tower and the event village: pagodas, a banner
  // fence and a line of sponsors' feather flags along the beach front.
  addJudgeTower(group, template, 0, shore + 22, groundAt(0, shore + 22));
  const trims = ["#d23c3c", "#1d6fd1", "#f2c230", "#20262e"];
  for (let i = 0; i < 12; i++) {
    const [s, d, y] = at(-250 + i * 46, 46 + (i % 2) * 7);
    addPagoda(kit, s, d, y, { trim: trims[i % trims.length], width: i % 4 === 0 ? 7 : 5 });
  }
  for (let s = -150; s <= 150; s += 6.5) {
    const [, d, y] = at(s, 31);
    addBox(group, template, s, d, 6, .12, 1.1, ["#e8412d", "#1d6fd1", "#f4f2ec", "#20262e"][Math.round(s / 6.5) & 3], 0, y);
  }
  for (let s = -170; s <= 170; s += 8.5) {
    const [, d, y] = at(s, 15 + (Math.round(s / 8.5) % 2) * 2);
    addFeatherFlag(kit, s, d, y, ["#e8412d", "#1d9bd1", "#f2c230", "#20262e", "#e9ecef"][Math.round(s / 8.5 + 20) % 5], wind);
  }
  // The rigging areas either side of the village, and spectators along the
  // water's edge and around the tower.
  for (let i = 0; i < 46; i++) {
    const side = i % 2 ? 1 : -1;
    const [s, d, y] = at(side * (120 + random() * 170), 8 + random() * 26);
    addRig(kit, s, d, y, random, wind);
  }
  for (let i = 0; i < 170; i++) {
    const near = i < 70;
    const [s, d, y] = at(near ? (random() - .5) * 90 : (random() - .5) * 420, near ? 6 + random() * 22 : 2 + random() * 7);
    addPerson(kit, s, d, y, random);
  }

  // The René Egli centre and the low Meliá resort wings among palms, with
  // bushes holding the dunes.
  addBlock(kit, 20, shore + 129, groundAt(20, shore + 129), 56, 21, 4.4, { windows: textures.windows });
  addBox(group, template, 20, shore + 117.8, 50, .42, 2.1, "#73aeb0", 0, groundAt(20, shore + 129) + 1.1);
  for (const [s, inland, width, depth, floors] of [[-118, 180, 70, 36, 3], [-150, 222, 60, 30, 4], [105, 190, 86, 40, 4], [150, 236, 64, 30, 5]]) {
    const [, d, y] = at(s, inland);
    for (let step = 0; step < floors; step++) {
      addBlock(kit, s, d + step * 6, y + step * 3, width - step * 4, depth - step * 6, 3, { windows: textures.windows, roof: "#c9b9a0" });
    }
  }
  for (let i = 0; i < 26; i++) {
    const [s, d, y] = at(-200 + random() * 400, 140 + random() * 70);
    addPalm(kit, s, d, y, random);
  }
  for (let i = 0; i < 160; i++) {
    const [s, d, y] = at((random() - .5) * 1400, 120 + random() * 380);
    addBush(kit, s, d, y, random, random() < .5 ? "#8b8f58" : "#9d9466");
  }
}

function buildSylt(group, template, textures) {
  const venueId = "westerland-sylt";
  const layout = SITE_LAYOUTS[venueId];
  const shore = shorelineBase(layout);
  const kit = kitFor(group, template);
  const wind = windYaw();
  const random = seeded(2023);
  const { fbm } = landNoise(54);
  const inlandOf = (s, d) => d - shorelineAt(venueId, s);
  // A beach rising to the sea wall, the promenade and the flat town behind
  // it; beyond the town, Sylt's high grey dunes.
  const groundAt = (s, d) => {
    const inland = inlandOf(s, d);
    const town = 1 - smooth(380, 900, Math.abs(s));
    const beach = .16 + .94 * Math.min(inland, 112) / 112 + 1.4 * smooth(112, 132, inland);
    const dunes = smooth(120, 220, inland) * (1 - town * .9) * (11 * Math.max(0, fbm(s * .008, inland * .012) + .35) + 2 * fbm(s * .04, inland * .04));
    return beach + Math.max(0, dunes);
  };
  const colorAt = (s, d) => {
    const inland = inlandOf(s, d);
    const shade = .92 + .08 * fbm(s * .09, inland * .09, 2);
    if (inland < 112) return { color: "#cdbfa2", factor: shade };
    const town = 1 - smooth(380, 900, Math.abs(s));
    if (town > .5 && inland < 600) return { color: "#a9a79c", factor: shade };
    return { color: fbm(s * .02, inland * .02, 2) > -.1 ? "#7f8c63" : "#c9bc9c", factor: shade };
  };
  addForeshore(group, template, venueId, layout, .16, "#8d8774");
  addLand(group, template, venueId, layout, textures, groundAt, colorAt);
  const at = (s, inland) => [s, shore + inland, groundAt(s, shore + inland)];
  // A raised, paved promenade and sea wall back the central contest beach.
  addSurface(group, template, -370, 370, shore + 114, shore + 130, 2, 180, () => 2.35, () => ({ color: "#aaa99f", factor: .98 }));
  addBox(group, template, 0, shore + 111.8, 720, 3.8, 1.25, "#a7a59b", 0, 1.1);
  addBox(group, template, 0, shore + 111.8, 720, 4.1, .22, "#d6d2c5", 0, 2.35);
  addMusicShell(group, template, -14, shore + 121, 2.35);

  // Sylt's north-south rock groynes reach about 20 m into the sea and repeat
  // every 100–200 m. At high tide, marked heads can be the only visible cue.
  const markerSpacing = 140;
  for (let s = -SHORE_HALF_LENGTH; s <= SHORE_HALF_LENGTH; s += markerSpacing) {
    for (let d = shore - 19; d < shore - .2; d += 1.55) {
      const variation = Math.sin(s * .17 + d * .71);
      const width = 1.7 + .45 * variation;
      const height = .64 + .16 * Math.sin(s * .13 + d * .44);
      const stone = Math.sin(s * .07 + d * .11) > .25 ? "#565c5c" : "#73746c";
      addRock(group, template, s + variation * .32, d, width, 1.85, height, stone, -.38, s + d);
    }
    const signD = shore + 3.4, signBase = groundAt(s, signD) + 1.95;
    addBox(group, template, s, signD, .16, .16, 2.25, "#514f47", 0, groundAt(s, signD));
    addBox(group, template, s, signD, 1.2, .22, 1.05, "#e9c23e", 0, signBase);
    const markerD = signD - .13, y0 = signBase + .1, y1 = signBase + .93, half = .34, thick = .07;
    for (const sign of [-1, 1]) {
      const positions = [], indices = [];
      positions.push(...point(s - half, markerD, sign < 0 ? y0 : y1), ...point(s - half + thick, markerD, sign < 0 ? y0 : y1),
        ...point(s + half, markerD, sign < 0 ? y1 : y0), ...point(s + half - thick, markerD, sign < 0 ? y1 : y0));
      indices.push(0, 1, 2, 0, 2, 3);
      addMesh(group, template, positions, indices, "#343831");
    }
  }

  // The World Cup village on Brandenburger Strand: pagodas, feather flags,
  // the rigging area, spectators, and the blue-and-white beach baskets.
  const trims = ["#1d6fd1", "#e8412d", "#20262e", "#f2c230"];
  for (let i = 0; i < 11; i++) {
    const [s, d, y] = at(-225 + i * 45, 43 + (i % 2) * 5);
    addPagoda(kit, s, d, y, { trim: trims[i % trims.length], width: i % 3 === 0 ? 7 : 5 });
  }
  for (let s = -160; s <= 160; s += 9) {
    const [, d, y] = at(s, 18);
    addFeatherFlag(kit, s, d, y, ["#1d6fd1", "#e8412d", "#f2c230", "#e9ecef", "#20262e"][Math.round(s / 9 + 20) % 5], wind);
  }
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? 1 : -1;
    const [s, d, y] = at(side * (110 + random() * 160), 10 + random() * 24);
    addRig(kit, s, d, y, random, wind);
  }
  for (let i = 0; i < 150; i++) {
    const [s, d, y] = at((random() - .5) * 360, i < 90 ? 4 + random() * 10 : 100 + random() * 12);
    addPerson(kit, s, d, y, random);
  }
  for (let s = -420; s <= 420; s += 42) {
    const basketS = s + (Math.round(s / 42) % 2) * 7;
    const [, basketD, y] = at(basketS, 24 + (Math.abs(s) % 3) * 6);
    addBeachBasket(group, template, basketS, basketD, y);
  }

  // Westerland's waterfront: hotels along the promenade and, behind them, the
  // tall slabs of the Kurzentrum that mark the town from the sea.
  for (const [s, inland, width, depth, height] of [
    [-330, 150, 26, 16, 15], [-280, 156, 30, 18, 18], [-200, 150, 34, 16, 12], [-110, 152, 28, 16, 15],
    [60, 152, 30, 16, 15], [130, 150, 34, 18, 18], [215, 154, 28, 16, 12], [300, 150, 30, 16, 15], [370, 156, 26, 14, 12],
  ]) {
    const [, d, y] = at(s, inland);
    addBlock(kit, s, d, y, width, depth, height, { windows: textures.windows, wall: "#efe9dd", roof: "#8f5a4c" });
  }
  for (const [s, inland, width, height] of [[-70, 320, 48, 30], [30, 350, 44, 38], [140, 330, 36, 27]]) {
    const [, d, y] = at(s, inland);
    addBlock(kit, s, d, y, width, 16, height, { windows: textures.windows, wall: "#e6e2d8", roof: "#9a9a96" });
  }
  // Marram grass holds the dunes either side of the town.
  const tufts = Array.from({ length: 120 }, () => [(random() < .5 ? -1 : 1) * (420 + random() * 1400), shore + 150 + random() * 300, 36, 1.2 + random() * .5]);
  addGrass(group, template, tufts, "#75844b", 937, groundAt);
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
    if (venue.id === "sotavento-fuerteventura") buildSotavento(group, template, textures);
    if (venue.id === "westerland-sylt") buildSylt(group, template, textures);
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

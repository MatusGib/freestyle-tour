// Venue environments use BufferGeometry and lit materials taken from the
// running game. No external renderer or remote assets are loaded. The shore
// runs across the camera's default sightline, but all props remain stationary
// in world space while the rider and camera move.

const SHORE = { rightX: 0.802, rightZ: -0.597, inX: -0.597, inZ: -0.802 };
const COURSE_DEPTH = 220;
const COURSE_LENGTH = 420;
const LAND_CLEARANCE_D = 1.5;
const SHORE_HALF_LENGTH = 4200;
const SHORE_COLS = 1200;
const point = (s, d, y = 0) => [SHORE.rightX * s + SHORE.inX * d, y, SHORE.rightZ * s + SHORE.inZ * d];
const pendingBatches = new WeakMap();

const SITE_LAYOUTS = {
  "sotavento-fuerteventura": {
    courseWindOffset: .42,
    shoreBuffer: 80,
    sandbarOffshore: 280,
    curveAmplitude: 5.5,
    curveFrequency: .0036,
    curveSecondary: 2.4,
    curveSecondaryFrequency: .011,
  },
  "westerland-sylt": {
    courseWindOffset: 0,
    shoreBuffer: 100,
    sandbarOffshore: 400,
    curveAmplitude: 3.2,
    curveFrequency: .0045,
    curveSecondary: 1.8,
    curveSecondaryFrequency: .013,
  },
};

const shoreAngle = () => Math.atan2(SHORE.inZ, SHORE.inX);
const courseAngle = (layout) => shoreAngle() + layout.courseWindOffset;
function courseInlandExtent(angle) {
  const along = SHORE.inX * Math.cos(angle) + SHORE.inZ * Math.sin(angle);
  const across = -SHORE.inX * Math.sin(angle) + SHORE.inZ * Math.cos(angle);
  return COURSE_DEPTH / 2 * Math.abs(along) + COURSE_LENGTH / 2 * Math.abs(across);
}
function shorelineBase(layout) {
  return courseInlandExtent(courseAngle(layout)) + layout.shoreBuffer;
}
function shorelineOffset(s, layout) {
  return Math.sin(s * layout.curveFrequency) * layout.curveAmplitude +
    Math.sin(s * layout.curveSecondaryFrequency + .7) * layout.curveSecondary;
}
function shorelineAt(venueId, s) {
  const layout = SITE_LAYOUTS[venueId];
  return layout ? shorelineBase(layout) + shorelineOffset(s, layout) : 0;
}
export function applyVenueCourse(engine, venue) {
  const course = engine?.course;
  if (!course || typeof course !== "object") return false;
  if (!engine.__venueOriginalCourse) engine.__venueOriginalCourse = { ...course };
  const layout = SITE_LAYOUTS[venue?.id];
  if (layout) course.angle = courseAngle(layout);
  else Object.assign(course, engine.__venueOriginalCourse);
  return true;
}

function setVenueWaterline(game, venue) {
  const water = game.water;
  if (!water || typeof water.fragmentShader !== "string") return;
  if (game.__venueOriginalWaterShader === undefined) game.__venueOriginalWaterShader = water.fragmentShader;
  const original = game.__venueOriginalWaterShader;
  // Keep the shipped fragment shader intact. Venue water character is built
  // from shallow scene bands; editing this runtime shader could blank every
  // water fragment on a graphics driver that rejects the patched GLSL.
  if (water.fragmentShader !== original) {
    water.fragmentShader = original;
    water.needsUpdate = true;
  }
  game.__venueWaterVenueId = venue?.id ?? null;
  game.__venueWaterPatchError = null;
}

function writeLocalPosition(state, s, d) {
  state.x = SHORE.rightX * s + SHORE.inX * d;
  state.z = SHORE.rightZ * s + SHORE.inZ * d;
}

function stopLocalVelocity(state, input, axis, direction) {
  const x = axis === "s" ? SHORE.rightX : SHORE.inX;
  const z = axis === "s" ? SHORE.rightZ : SHORE.inZ;
  const velocity = state.vx * x + state.vz * z;
  if (direction * velocity < 0) {
    state.vx -= x * velocity;
    state.vz -= z * velocity;
    state.speed = Math.hypot(state.vx, state.vz);
  }
  const forward = axis === "s"
    ? Math.sin(state.heading) * SHORE.rightX - Math.cos(state.heading) * SHORE.rightZ
    : Math.sin(state.heading) * SHORE.inX - Math.cos(state.heading) * SHORE.inZ;
  if (input && direction * forward < 0 && input.power > 0) input.power = 0;
}

export function resolveVenueCollision(state, input, venueId) {
  if (!state || !SITE_LAYOUTS[venueId]) return;
  const s = SHORE.rightX * state.x + SHORE.rightZ * state.z;
  const d = SHORE.inX * state.x + SHORE.inZ * state.z;
  const vs = SHORE.rightX * state.vx + SHORE.rightZ * state.vz;
  const vd = SHORE.inX * state.vx + SHORE.inZ * state.vz;
  const dt = 1 / 120;
  const landStopD = shorelineAt(venueId, s) - LAND_CLEARANCE_D;
  const headingD = Math.sin(state.heading) * SHORE.inX - Math.cos(state.heading) * SHORE.inZ;
  const drivingInland = (input?.power ?? 0) > 0 && headingD > .08;
  const insideLand = d >= landStopD;
  const approachingShore = d > landStopD - .2 && (vd > .05 || drivingInland || d + Math.max(0, vd) * dt >= landStopD);
  if (insideLand || approachingShore) {
    if (insideLand) writeLocalPosition(state, s, landStopD);
    stopLocalVelocity(state, input, "d", -1);
  }

  if (venueId !== "westerland-sylt" || (state.air && state.height >= 1.05)) return;
  const playerS = SHORE.rightX * state.x + SHORE.rightZ * state.z;
  const playerD = SHORE.inX * state.x + SHORE.inZ * state.z;
  const playerVs = SHORE.rightX * state.vx + SHORE.rightZ * state.vz;
  const playerVd = SHORE.inX * state.vx + SHORE.inZ * state.vz;
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
    const headingS = Math.sin(state.heading) * SHORE.rightX - Math.cos(state.heading) * SHORE.rightZ;
    const preferredSide = Math.sign(playerVs) || Math.sign(headingS) || -1;
    const side = playerS < groyneS ? -1 : playerS > groyneS ? 1 : preferredSide;
    const boundary = groyneS + side * (halfWidth + boardRadius);
    if (Math.abs(playerS - groyneS) <= halfWidth + boardRadius) writeLocalPosition(state, boundary, playerD);
    stopLocalVelocity(state, input, "s", side);
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

function addWaterBand(group, template, s0, s1, d0, d1, color, opacity = .38, options = {}) {
  const { height = .05, cols = 800, ...surfaceOptions } = options;
  return addSurface(group, template, s0, s1, d0, d1, 2, cols,
    (s, d) => height + .015 * Math.sin(s * .045 + d * .08),
    (s, d) => ({ color, factor: .96 + .04 * Math.sin(s * .13 + d * .19) }),
    { transparent: true, opacity, depthWrite: false, ...surfaceOptions },
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

function addTent(group, template, s, d, scale = 1, baseY = 0) {
  addBox(group, template, s, d, 8 * scale, 5 * scale, 2.3 * scale, "#eee9df", 0, baseY);
  // Tall A-frame canopy: an extruded triangular roof, set on the box below.
  const positions = [], indices = [];
  const half = 4 * scale, deep = 2.5 * scale, peak = 4.6 * scale;
  const a = [[s - half, d - deep, 2.2 * scale + baseY], [s + half, d - deep, 2.2 * scale + baseY], [s, d - deep, peak + baseY]];
  const b = a.map(([x, z, y]) => [x, d + deep, y]);
  for (const face of [[a[0], a[1], a[2]], [b[1], b[0], b[2]], [a[0], b[0], b[1], a[1]], [a[1], b[1], b[2], a[2]], [b[2], a[0], a[2]]]) {
    const offset = positions.length / 3;
    face.forEach(([x, z, y]) => positions.push(...point(x, z, y)));
    for (let i = 1; i < face.length - 1; i++) indices.push(offset, offset + i, offset + i + 1);
  }
  addMesh(group, template, positions, indices, "#fffdf7");
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

function buildSotavento(group, template, textures) {
  const venueId = "sotavento-fuerteventura";
  const layout = SITE_LAYOUTS["sotavento-fuerteventura"];
  const shore = shorelineBase(layout);
  const coastOffset = (s) => shorelineOffset(s, layout);
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const groundAt = (s, d) => {
    const inland = d - shorelineAt(venueId, s);
    const shoreRipple = Math.sin(s * .021 + inland * .04) * .035 + Math.sin(s * .071) * .018;
    if (inland <= 88) return .12 + .22 * Math.max(0, inland / 88) + shoreRipple * Math.max(0, inland / 88);
    const duneT = Math.max(0, Math.min(1, (inland - 88) / 172));
    const duneEdge = .34 + 8.8 + .5 * Math.sin(s * .018) + .25 * Math.sin(s * .057);
    if (inland <= 260) {
      return .34 + 8.8 * Math.pow(duneT, 1.35) +
        (.5 * Math.sin(s * .018) + .25 * Math.sin(s * .057)) * duneT +
        1.55 * Math.sin(s * .025 + inland * .03) * Math.sin(Math.PI * duneT);
    }
    const inlandDistance = inland - 260;
    const far = Math.max(.08, 1 - inlandDistance / 1100);
    const ridge = Math.max(0,
      Math.sin(s * .0105 + .7) * 20 + Math.sin(s * .024 + 1.8) * 13 + Math.sin(s * .052) * 7,
    );
    const shoulder = Math.max(0, 17 - Math.abs(s + 125) * .075) + Math.max(0, 14 - Math.abs(s - 180) * .07);
    return duneEdge + smooth(0, 145, inlandDistance) * far *
      (ridge + shoulder + 3.5 * Math.sin(inland * .018 + s * .016));
  };
  const sandColor = (s, d) => {
    const inland = d - shorelineAt(venueId, s);
    const color = inland < 14 ? "#bba982" : inland < 88 ? "#d6bd83" : inland < 260 ? "#c6a36e" : "#a47753";
    return { color, factor: .93 + .07 * Math.sin(s * .071 + d * .12) };
  };

  // A shallow overlay gives Playa Barca's lagoon a turquoise read without
  // changing the game's shared shader; both edges follow the curved sandbar.
  addWaterBand(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, shore - layout.sandbarOffshore + 8, shore,
    "#43c8c0", .26, { height: .045, coastOffset, coastOffsetEnd: coastOffset });
  addWaterBand(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, shore - layout.sandbarOffshore - 5, shore - layout.sandbarOffshore + 5,
    "#d7e1d1", .22, { height: .05, coastOffset, coastOffsetEnd: coastOffset });
  addSurface(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, shore, shore + 88, 16, SHORE_COLS,
    groundAt,
    sandColor,
    { map: textures.sand, coastOffset },
  );
  addSurface(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, shore + 88, shore + 260, 40, SHORE_COLS,
    groundAt,
    sandColor,
    { map: textures.sand },
  );
  // The inland terrain continues the foredune ridge into the Jandía hills;
  // matched edge elevations keep the long shoreline from ending in a cliff.
  addSurface(group, template, -4600, 4600, shore + 260, shore + 1450, 84, 800,
    groundAt,
    (s, d) => ({ color: d - shorelineAt(venueId, s) > 760 ? "#795d4d" : "#a47753", factor: .87 + .13 * Math.sin(s * .031 + d * .011) }),
  );

  // Playa Barca's PWA judging tower and event village sit on the dry beach,
  // behind the lagoon-side heat field.
  addJudgeTower(group, template, 0, shore + 22, groundAt(0, shore + 22));
  addBox(group, template, -18, shore + 23, 23, 1.2, .42, "#9c7955", 0, groundAt(-18, shore + 23));
  for (let i = 0; i < 9; i++) {
    const s = -220 + i * 55, d = shore + 43 + (i % 2) * 8;
    addTent(group, template, s, d, .92, groundAt(s, d));
  }
  addBox(group, template, -250, shore + 62, 44, 18, 4.5, "#f0e8d5", 0, groundAt(-250, shore + 62));
  addBox(group, template, -250, shore + 52.8, 43, .4, 2.1, "#c65347", 0, groundAt(-250, shore + 52.8));

  // The René Egli base and the low Meliá resort wings sit behind the open
  // beach. Keep them subordinate to the dunes and distant Jandía relief.
  addBox(group, template, 20, shore + 129, 56, 21, 4.2, "#ece7da", 0, groundAt(20, shore + 129));
  addBox(group, template, 20, shore + 117.8, 50, .42, 2.1, "#73aeb0", 0, groundAt(20, shore + 129) + 1.1);
  addBox(group, template, 58, shore + 136, 18, 14, 3.4, "#f3eee4", 0, groundAt(58, shore + 136));
  for (const [s, d, width, depth, height, color] of [
    [-112, shore + 180, 76, 44, 15, "#eee9df"],
    [112, shore + 192, 94, 52, 18, "#e7e0d5"],
  ]) {
    const baseY = groundAt(s, d);
    addBox(group, template, s, d, width, depth, height, color, 0, baseY);
    addBox(group, template, s, d - depth / 2 - .2, width + 1, .4, .55, "#8e6651", 0, baseY + .9);
    const floors = Math.floor(height / 3.3);
    for (let floor = 0; floor < floors; floor++) {
      for (let bay = 0; bay < Math.max(2, Math.floor(width / 5)); bay++) {
        addBox(group, template, s - width / 2 + 3 + bay * 4.3, d - depth / 2 - .42, .9, .12, 1.15, "#789092", 0, baseY + 2 + floor * 3.15);
      }
    }
  }
  for (let i = 0; i < 7; i++) {
    const s = -42 + i * 14;
    const d = shore + 86 + (i % 2) * 4;
    const height = 7 + (i % 3) * .8;
    addCylinder(group, template, s, d, groundAt(s, d), .055, .04, height, "#e8dfc9", 8);
    const positions = [], indices = [];
    const mastD = d - .16;
    const offset = positions.length / 3;
    positions.push(...point(s, mastD, groundAt(s, d)), ...point(s + 4.2, mastD, groundAt(s, d)), ...point(s + 3.5, mastD - .06, groundAt(s, d) + height));
    indices.push(offset, offset + 1, offset + 2);
    addMesh(group, template, positions, indices, ["#c45a46", "#e6cf69", "#4d8790", "#edede3", "#426c88", "#d78955", "#4d7b52"][i]);
  }
  addGrass(group, template, [[-360, shore + 148, 170, 1.2], [-220, shore + 218, 150, 1.4], [25, shore + 225, 130, 1.2], [285, shore + 170, 170, 1.1]], "#89944c", 812, groundAt);
}

function buildSylt(group, template, textures) {
  const venueId = "westerland-sylt";
  const layout = SITE_LAYOUTS["westerland-sylt"];
  const shore = shorelineBase(layout);
  const reef = shore - layout.sandbarOffshore;
  const coastOffset = (s) => shorelineOffset(s, layout);
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const groundAt = (s, d) => {
    const inland = d - shorelineAt(venueId, s);
    if (inland <= 112) {
      const t = Math.max(0, inland / 112);
      return .16 + .94 * t + (.035 * Math.sin(s * .024 + inland * .06) + .025 * Math.sin(s * .081)) * t;
    }
    if (inland <= 188) {
      const t = (inland - 112) / 76;
      const urban = 1 - smooth(320, 900, Math.abs(s));
      const beachEdgeRipple = .035 * Math.sin(s * .024 + 112 * .06) + .025 * Math.sin(s * .081);
      const lowRelief = (1.1 * Math.sin(s * .025 + inland * .022) + .4 * Math.sin(s * .063)) * t * (1 - urban * .8);
      return 1.1 + beachEdgeRipple + 1.55 * t + lowRelief;
    }
    const inlandDistance = inland - 188;
    const urban = 1 - smooth(320, 920, Math.abs(s));
    const far = Math.max(.1, 1 - inlandDistance / 1050);
    const dune = Math.sin(s * .021 + inland * .037) * 3.4 + Math.sin(s * .065 - inland * .058) * 1.3;
    const ramp = smooth(0, 150, inlandDistance);
    const edgeRelief = (1.1 * Math.sin(s * .025 + 188 * .022) + .4 * Math.sin(s * .063)) * (1 - urban * .8);
    return 2.65 + edgeRelief + ramp * far * dune * (1 - urban * .72);
  };
  const sandColor = (s, d) => {
    const inland = d - shorelineAt(venueId, s);
    const color = inland < 18 ? "#99988d" : inland < 112 ? "#c6bba4" : inland < 188 ? "#b1a78e" : "#8b917e";
    return { color, factor: .92 + .08 * Math.sin(s * .1 + d * .12) };
  };

  // Westerland faces the open North Sea. A long submerged sand ridge sits
  // roughly 400 m out; a shallow trough and the steep shorebreak lie inshore.
  addWaterBand(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, reef - 30, reef + 26, "#cbd4cf", .2);
  addWaterBand(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, reef + 26, shore - 122, "#35545e", .13);
  addWaterBand(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, shore - 76, shore - 8, "#d8e0dc", .24);
  addSurface(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, shore, shore + 112, 24, SHORE_COLS,
    groundAt,
    sandColor,
    { map: textures.sand, coastOffset },
  );
  addSurface(group, template, -SHORE_HALF_LENGTH, SHORE_HALF_LENGTH, shore + 112, shore + 188, 24, SHORE_COLS,
    groundAt,
    sandColor,
  );
  addSurface(group, template, -4600, 4600, shore + 188, shore + 1320, 42, 800,
    groundAt,
    (s, d) => ({ color: d - shorelineAt(venueId, s) > 330 ? "#758b82" : "#969b87", factor: .9 + .1 * Math.sin(s * .05) }),
  );
  // A raised, paved promenade and sea wall back the central contest beach.
  addSurface(group, template, -370, 370, shore + 114, shore + 130, 2, 180,
    () => 2.35,
    () => ({ color: "#aaa99f", factor: .98 }),
  );

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
      const a = positions.length / 3;
      positions.push(...point(s - half, markerD, sign < 0 ? y0 : y1), ...point(s - half + thick, markerD, sign < 0 ? y0 : y1),
        ...point(s + half, markerD, sign < 0 ? y1 : y0), ...point(s + half - thick, markerD, sign < 0 ? y1 : y0));
      indices.push(a, a + 1, a + 2, a, a + 2, a + 3);
      addMesh(group, template, positions, indices, "#343831");
    }
  }

  // The World Cup festival occupies a 500 m stretch of Brandenburger Strand.
  for (let s = -225; s <= 225; s += 45) {
    const d = shore + 43 + (Math.round(s / 45) % 2) * 5;
    addTent(group, template, s, d, .98, groundAt(s, d));
    if (s % 90 === 0) addBox(group, template, s, shore + 51, 11, 6, 4.2, "#e9e3d6", 0, groundAt(s, shore + 51));
  }
  for (let s = -420; s <= 420; s += 42) {
    const basketS = s + (Math.round(s / 42) % 2) * 7;
    const basketD = shore + 24 + (Math.abs(s) % 3) * 6;
    addBeachBasket(group, template, basketS, basketD, groundAt(basketS, basketD));
  }

  // Westerland's promenade, sea wall and Musikmuschel back the competition
  // beach; dunes and the pale resort skyline continue behind the waterfront.
  addBox(group, template, 0, shore + 111.8, 720, 3.8, 1.25, "#a7a59b", 0, 1.1);
  addBox(group, template, 0, shore + 111.8, 720, 4.1, .22, "#d6d2c5", 0, 2.35);
  addMusicShell(group, template, -14, shore + 121, 2.35);
  addBox(group, template, 182, shore + 234, 74, 36, 18, "#e8e2d6", 0, groundAt(182, shore + 234));
  addBox(group, template, 182, shore + 215.7, 75, .6, 1.2, "#7b9694", 0, groundAt(182, shore + 234) + 1.4);
  addBox(group, template, -162, shore + 202, 68, 31, 17, "#e0ddd4", 0, groundAt(-162, shore + 202));
  addBox(group, template, -162, shore + 186.1, 66, .55, 1.2, "#9b6354", 0, groundAt(-162, shore + 202) + 1.4);
  for (const [s, d, w, dep, h, color] of [
    [-330, shore + 190, 25, 14, 17, "#e7dfd1"], [-278, shore + 222, 30, 17, 19, "#eee7da"],
    [-100, shore + 242, 34, 16, 21, "#e6e0d5"], [30, shore + 220, 28, 14, 18, "#f0eadf"],
    [315, shore + 202, 32, 16, 18, "#e4ded1"], [370, shore + 235, 25, 14, 17, "#ece5d8"],
  ]) {
    const baseY = groundAt(s, d);
    addBox(group, template, s, d, w, dep, h, color, 0, baseY);
    addBox(group, template, s, d - dep / 2 - .15, w + .8, .4, .55, "#985c4f", 0, baseY + .8);
    for (let floor = 0; floor < Math.floor(h / 3.6); floor++) {
      for (let bay = 0; bay < Math.max(2, Math.floor(w / 4)); bay++) {
        addBox(group, template, s - w / 2 + 2 + bay * 3.2, d - dep / 2 - .4, .85, .12, 1.05, "#738b8d", 0, baseY + 1.45 + floor * 3.5);
      }
    }
  }
  addGrass(group, template, [[-1200, shore + 133, 360, 1.4], [-720, shore + 151, 380, 1.7], [-180, shore + 144, 330, 1.4], [480, shore + 158, 390, 1.7], [1050, shore + 139, 370, 1.5]], "#75844b", 937, groundAt);
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

export function createVenueTextures(CanvasTexture) {
  return { sand: makeSandTexture(CanvasTexture) };
}

export function mountVenueScenery(game, venue, textures = { sand: null }) {
  setVenueWaterline(game, venue);
  if (game.__venueSceneryVenueId === venue?.id && game.__venueScenery) return;
  if (!game.__venueOriginalAtmosphere) {
    const color = game.scene?.fog?.color;
    if (color && game.renderer?.getClearColor) {
      game.__venueOriginalAtmosphere = {
        fog: color.clone(),
        clear: game.renderer.getClearColor(new color.constructor()).clone(),
        alpha: game.renderer.getClearAlpha?.() ?? 1,
      };
    }
  }
  if (venue && game.scene?.fog?.color && game.renderer?.setClearColor) {
    const tone = venue.id === "sotavento-fuerteventura" ? "#e8c999" : "#b9d0d5";
    game.scene.fog.color.set(tone);
    game.renderer.setClearColor(tone, 1);
  } else if (!venue && game.__venueOriginalAtmosphere) {
    game.scene.fog.color.copy(game.__venueOriginalAtmosphere.fog);
    game.renderer.setClearColor(game.__venueOriginalAtmosphere.clear, game.__venueOriginalAtmosphere.alpha);
  }
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
  if (!venue || !game.scene || !game.areaArrow?.fill || !game.areaArrow?.group || !game.buoys?.buoys?.length) return;

  const template = game.buoys.buoys[0].buoy.children.find((object) => object.isMesh);
  if (!template?.material?.color || !template.material.clone) return;
  template.__venueBufferGeometry = game.areaArrow.fill.geometry;
  const group = new game.areaArrow.group.constructor();
  group.name = `venue:${venue.id}`;
  pendingBatches.set(group, new Map());
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
  }
  delete template.__venueBufferGeometry;
  game.scene.add(group);
  game.__venueScenery = group;
  game.__venueSceneryVenueId = venue.id;
}

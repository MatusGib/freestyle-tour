// Prasonisi, Rhodes: what the map data doesn't carry, modelled from the
// centres' own photos (prasonisi.com) and placed from aerial imagery read on
// 2026-11-01, in the spot's game frame (+x downwind, the beach upwind at -x):
// - ProCenter Christof Kirschner: a 49 m row of open sheds at the foot of the
//   hill, under cream canvas gables, with blue containers, wooden shelves of
//   JP boards and a canvas veranda, a staircase up to a look-out deck at its
//   north-east end, a line of tall flags, and its NeilPryde rigs in rows on
//   the sand in front. Its sunbeds and white parasols stand in three rows by
//   the water from z -254 to -334; its spotting tower, a scaffold with canvas
//   sides and four flags, 15 m from the water at z -231; its orange rescue
//   RIB rides off the beach. The aerial's waterline is another day's and
//   lies 10-30 m off the map's, so what stands by the water is placed by its
//   distance from the map's shoreline.
// - A second station 210 m along the beach, by the water at (-345…-312,
//   -136…-80): four white gazebos, a long tent, two huts, a crowd of rigs at
//   the water's edge and a grey RIB. The aerial shows it; whose it is, it
//   doesn't (Wind4Fun's and Prasonisi Center's houses are up by the road).
// - Cars and camper vans only in the mapped car parks, in rows.
// - Tamarisks by the buildings; the lighthouse (1890) on the islet's southern
//   cliff, its tower at (-1086, 2206).
// Upwind across the sandbar the meltemi's waves break 30-100 m off the wave
// side's beach. Props turn by WIND to face the wind.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CapsuleGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, ExtrudeGeometry, PlaneGeometry,
  Shape, ShapeGeometry, SphereGeometry, TorusGeometry, TubeGeometry, Vector3,
} from "../lib/three.core.min.js";
import { addShape, seeded } from "../props.js";
import { AEGEAN } from "../realworld/plants-aegean.js";
import { extrudeFootprint } from "../realworld/buildings.js";

const WIND = 0;
const LIGHTHOUSE = [-1086, 2206];
// ProCenter's shed row, along the centreline of its mapped footprint.
export const PROCENTER = { from: [-349.5, -308.5], to: [-325.5, -351], depth: 6 };
export const STATION = [-330, -118];

// Rocky shores take the rock texture: there is no coral on Rhodes.
export const textures = { coralRubble: "rock", mangroveMud: "scrub-soil" };
export const ground = { sand: "#e3cfa6" };
// Whitewashed walls, a few cream and stone; flat concrete roofs; blue
// shutters. The lighthouse and ProCenter's sheds are modelled here instead.
export const buildings = {
  walls: ["#f5f2ea", "#f5f2ea", "#f1ece0", "#ece3cf", "#e4d6b8", "#f5f2ea", "#d9cbb0"],
  roofs: { flat: "#dcd6ca", roof: "#b39463" },
  shutter: "#2c5f9e",
  except: [[...LIGHTHOUSE, 30], [-337, -330, 28]],
};

const range = (a, b, step) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, k) => a + k * step);
const pick = (list, random) => list[Math.floor(random() * list.length)];
// The world point of (a along, b across) from (x, z) turned by yaw: local +x
// runs along (cos yaw, -sin yaw), local +z along (sin yaw, cos yaw).
const local = (x, z, yaw, a, b) => [x + a * Math.cos(yaw) + b * Math.sin(yaw), z - a * Math.sin(yaw) + b * Math.cos(yaw)];
const yawAlong = ([ux, uz]) => Math.atan2(-uz, ux);

// Where the beach meets the bay along z, coming from the land (-x).
function eastEdge(spot, z, from = -700) {
  let x = from;
  while (x < 400 && !(spot.isLand(x, z) && !spot.isLand(x + 0.5, z))) x += 0.5;
  return x;
}
// The spotting tower's place: 15 m up the beach from the water at z -231.
export const towerAt = (spot) => [eastEdge(spot, -231) - 15, -231];

// Where the land begins along z, coming from the open sea upwind (-x).
function westEdge(spot, z, from = -2000) {
  let x = from;
  while (x < 0 && !spot.isLand(x, z)) x += 1;
  return x < 0 ? x : null;
}

// The breaking waves: an outer and an inner line off the sandbar's west
// beach, and the swell bursting on the islet's west shore.
export function surfLines(spot) {
  const line = (zs, out, from) => zs.map((z) => [westEdge(spot, z, from), z]).filter(([x]) => x !== null).map(([x, z]) => [x - out, z]);
  return [line(range(-110, 470, 10), 75, -1000), line(range(-110, 470, 10), 32, -1000), line(range(640, 1780, 20), 10, -2000)];
}

const inside = (ring, x, z) => {
  let hit = false;
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
    const [xi, zi] = ring[k], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
};
const inBuilding = (spot, x, z) => spot.features.buildings.some(({ footprint }) => inside(footprint, x, z));
const toSegment = (x, z, [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
};
const DRIVEN = new Set(["service", "tertiary", "unclassified", "track", "residential", "secondary"]);
const nearRoad = (spot, x, z, metres) => spot.features.roads.some(({ kind, line }) => DRIVEN.has(kind) && line.some((p, k) => k > 0 && toSegment(x, z, line[k - 1], p) < metres));

// Tamarisks by the centres, along the road down to the beach, and around the
// tavernas and rooms; kept off the buildings and the water.
const TAMARISKS = [
  [-372, -300], [-374, -352], [-362, -372], [-312, -366], [-405, -286], [-438, -272], [-470, -262], [-505, -238], [-560, -232],
  [-598, -252], [-628, -296], [-640, -228], [-702, -262], [-760, -300], [-700, -385], [-755, -205], [-590, -330], [-520, -300],
];
// The beach's sand flat, low and level between the hills and the water,
// bears no scrub: lower than 8 m and sloping under 1 in 14.
const sandFlat = (spot, x, z) => {
  if (spot.heightAt(x, z) >= 8) return false;
  const sx = spot.heightAt(x + 4, z) - spot.heightAt(x - 4, z), sz = spot.heightAt(x, z + 4) - spot.heightAt(x, z - 4);
  return Math.hypot(sx, sz) / 8 < 0.07;
};
export const flora = {
  ...AEGEAN,
  rules: Object.fromEntries(Object.entries(AEGEAN.rules).map(([kind, rule]) => [kind, {
    ...rule, density: (spot, x, z) => (sandFlat(spot, x, z) ? 0 : rule.density ? rule.density(spot, x, z) : 1),
  }])),
  fixed: (spot) => ({ tamarisk: TAMARISKS.filter(([x, z]) => spot.heightAt(x, z) > 0.5 && !inBuilding(spot, x, z)) }),
};

// Windsurfers out on a summer day, as the photos show the bay, kept 80 m and
// more clear of the heat: freestylers on short runs off ProCenter's launch,
// riders blasting through the jet by the islet and downwind of the course.
// realworld/sailors.js sails them.
export const sailors = () => [
  { from: [-60, -300], to: [-60, -370], count: 1, speed: 7 },
  { from: [40, -300], to: [40, -370], count: 1, speed: 7.5 },
  { from: [150, -300], to: [150, -375], count: 1, speed: 8 },
  { from: [260, -300], to: [260, -440], count: 2, speed: 9 },
  { from: [-250, 300], to: [-250, 460], count: 1, speed: 10 },
  { from: [-130, 300], to: [-130, 470], count: 2, speed: 10.5 },
  { from: [-10, 300], to: [-10, 470], count: 1, speed: 9.5 },
  { from: [110, 300], to: [110, 470], count: 2, speed: 10 },
  { from: [230, 300], to: [230, 460], count: 1, speed: 9 },
  { from: [220, -220], to: [220, 220], count: 2, speed: 9.5 },
  { from: [350, -240], to: [350, 240], count: 2, speed: 10 },
  { from: [480, -230], to: [480, 230], count: 1, speed: 10 },
];

// Where cars and camper vans stand: in rows across each mapped car park,
// along its longest side, clear of its driveways and the buildings; where a
// driveway runs through it, in the rows along the driveway, as the aerial
// shows them; about one place in six taken. [{ x, z, yaw, camper }]
export function vehicleSpots(spot, seed = 31) {
  const random = seeded(seed), spots = [];
  for (const ring of spot.features.parking) {
    if (!ring.some(([x, z]) => Math.hypot(x, z) < 1500)) continue;
    let axis = [1, 0], longest = 0;
    ring.forEach(([ax, az], k) => {
      if (!k) return;
      const [bx, bz] = ring[k - 1], length = Math.hypot(ax - bx, az - bz);
      if (length > longest) [longest, axis] = [length, [(ax - bx) / length, (az - bz) / length]];
    });
    const yaw = yawAlong(axis), [cx, cz] = ring[0];
    const driveway = ring.some(([x, z]) => nearRoad(spot, x, z, 30));
    for (let a = -400; a <= 400; a += 2.7) for (let b = -400; b <= 400; b += 6) {
      const [x, z] = local(cx, cz, yaw, a, b);
      if (!inside(ring, x, z) || random() > 0.17) continue;
      if (nearRoad(spot, x, z, 4) || (driveway && !nearRoad(spot, x, z, 11)) || inBuilding(spot, x, z) || !spot.isLand(x, z) || spot.heightAt(x, z) < 0.5) continue;
      spots.push({ x, z, yaw: yaw + Math.PI / 2 + (random() < 0.5 ? Math.PI : 0) + (random() - 0.5) * 0.12, camper: random() < 0.07 });
    }
  }
  return spots;
}

// ---- Things on the beach ----

// A gable roof over a bay, ridge running front to back: width across, depth
// front to back, from eave height up to the ridge; centred, its front at +z.
function gableRoof(width, depth, eave, ridge) {
  const w = width / 2, d = depth / 2;
  const p = [[-w, eave, -d], [-w, eave, d], [0, ridge, d], [0, ridge, -d], [w, eave, -d], [w, eave, d]];
  const positions = [], tri = (...k) => k.forEach((i) => positions.push(...p[i]));
  tri(0, 1, 2); tri(0, 2, 3); tri(4, 3, 2); tri(4, 2, 5); tri(1, 5, 2); tri(0, 3, 4);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  return g;
}

// A flag on its pole, streaming downwind in folds: the cloth starts at the
// pole and its far edge flutters most.
function addFlag(kit, x, z, y, height, cloth, emblem, random) {
  addShape(kit, new CylinderGeometry(0.035, 0.05, height, 6), "#b9bcbf", x, z, y + height / 2);
  addShape(kit, new SphereGeometry(0.06, 6, 4), "#d8d8d8", x, z, y + height + 0.03);
  const width = 1.9, tall = 1.25, g = new PlaneGeometry(width, tall, 10, 1).translate(width / 2, 0, 0), p = g.getAttribute("position"), phase = random() * 6;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 3.1 + phase) * 0.16 * (p.getX(i) / width + 0.2));
  addShape(kit, g, cloth, x, z, y + height - tall / 2 - 0.1, { yaw: WIND });
  if (!emblem) return;
  const ring = new TorusGeometry(0.3, 0.07, 4, 16);
  addShape(kit, ring, emblem, x + 0.85, z + Math.sin(0.85 * 3.1 + phase) * 0.15 + 0.01, y + height - tall / 2 - 0.1);
}

const SAILS = [["#ff5a1f", "#ffd23f"], ["#1aa3d9", "#f2f2ee"], ["#c6e03b", "#22262b"], ["#e8322f", "#22262b"], ["#f2f2ee", "#79cfe3"], ["#ff8a00", "#e8322f"], ["#22262b", "#ff5a1f"]];
const BOARDS = ["#f4f4f1", "#f4f4f1", "#2f7fd0", "#f4f4f1", "#ff7a1a", "#2f7fd0"];

// A sail's outline, luff up the mast (y), clew out at the boom (x).
function sailShape(scale = 1) {
  const s = new Shape();
  s.moveTo(0, 0.3 * scale);
  s.lineTo(0, 4.5 * scale);
  s.quadraticCurveTo(1.5 * scale, 3.3 * scale, 2.15 * scale, 1.4 * scale);
  s.quadraticCurveTo(1.2 * scale, 0.3 * scale, 0, 0.3 * scale);
  return s;
}
function panelShape() {
  const s = new Shape();
  s.moveTo(0.1, 2.3);
  s.lineTo(0.1, 3.8);
  s.quadraticCurveTo(1, 3, 1.35, 2);
  s.lineTo(0.1, 2.3);
  return s;
}

// A windsurf board seen as a long, flat, pointed shape: deck colour, a dark
// deck pad near the tail and a fin hanging under.
function addBoard(kit, x, z, y, yaw, colour, { fin = true } = {}) {
  const outline = new Shape();
  outline.moveTo(-1.15, -0.3);
  outline.lineTo(0.6, -0.33);
  outline.quadraticCurveTo(1.2, -0.2, 1.3, 0);
  outline.quadraticCurveTo(1.2, 0.2, 0.6, 0.33);
  outline.lineTo(-1.15, 0.3);
  outline.lineTo(-1.15, -0.3);
  const hull = new ExtrudeGeometry(outline, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 1, curveSegments: 6 }).rotateX(-Math.PI / 2);
  addShape(kit, hull, colour, x, z, y + 0.03, { yaw });
  addShape(kit, new BoxGeometry(0.75, 0.02, 0.5), "#24272b", ...local(x, z, yaw, -0.65, 0), y + 0.16, { yaw });
  if (fin) addShape(kit, new BoxGeometry(0.22, 0.4, 0.02), "#1d1f22", ...local(x, z, yaw, -1.05, 0), y - 0.15, { yaw });
}

// A rigged sail lying on the sand, mast across the wind on its upwind side
// and the sail flat downwind of it, so the wind holds it down; its board
// beside it now and then.
function addRigOnSand(kit, x, z, y, random, withBoard = random() < 0.45) {
  const [main, panel] = pick(SAILS, random), turn = (random() - 0.5) * 0.35;
  // Laid down, the luff runs along -z on the sand and the clew points
  // downwind, the leech riding up on the battens and boom (TILT about the mast).
  const lie = { yaw: WIND + turn, pitch: -Math.PI / 2 }, TILT = -0.28;
  addShape(kit, new ShapeGeometry(sailShape(), 8).rotateY(TILT), main, x, z, y + 0.1, lie);
  addShape(kit, new ShapeGeometry(panelShape(), 4).rotateY(TILT).translate(0, 0, 0.02), panel, x, z, y + 0.1, lie);
  addShape(kit, new CylinderGeometry(0.025, 0.03, 4.7, 5).translate(0, 2.35, 0), "#25282c", x, z, y + 0.12, lie);
  addShape(kit, new CapsuleGeometry(0.02, 1.9, 2, 4), "#cfd3d6", ...local(x, z, lie.yaw, 1, -1.3), y + 0.42, { yaw: lie.yaw, roll: Math.PI / 2 - 0.28 });
  if (withBoard) addBoard(kit, ...local(x, z, WIND, -1.8, 1.2 + random()), y, WIND + Math.PI / 2 + (random() - 0.5) * 0.3, pick(BOARDS, random));
}

// ProCenter's shed row, from its photos: per 6 m bay a blue container at the
// back, open, sails and wetsuits hanging inside, under a cream canvas gable
// on timber; in front a continuous canvas veranda on poles, shelves of
// boards between the bays; a staircase to a deck on the last bay.
function addProCenter(kit, spot, random) {
  const [ax, az] = PROCENTER.from, [bx, bz] = PROCENTER.to, length = Math.hypot(bx - ax, bz - az);
  const u = [(bx - ax) / length, (bz - az) / length], yaw = yawAlong(u), bays = Math.floor(length / 6);
  const along = (s, out) => local(ax, az, yaw, s, out);
  const base = Math.min(...range(0, length, 3).map((s) => spot.heightAt(...along(s, 0))));
  const y = base + 0.05;
  for (let k = 0; k < bays; k++) {
    const s = 3 + k * 6, open = k % 3 !== 1;
    addShape(kit, new BoxGeometry(5.9, 2.6, 2.44), "#2459a8", ...along(s, -1.9), y + 1.3, { yaw });
    for (let r = -2.6; r <= 2.6; r += 0.65) addShape(kit, new BoxGeometry(0.06, 2.4, 0.04), "#1d4a8f", ...along(s + r, -0.66), y + 1.3, { yaw });
    if (open) {
      addShape(kit, new BoxGeometry(5.1, 2.3, 0.05), "#141a22", ...along(s, -0.64), y + 1.25, { yaw });
      for (let j = 0; j < 5; j++) {
        const [main] = pick(SAILS, random);
        addShape(kit, new ShapeGeometry(sailShape(0.48), 4), main, ...along(s - 2.1 + j * 0.95, -0.58), y + 0.05, { yaw });
      }
      for (const side of [-2.7, 2.7]) for (let j = 0; j < 3; j++) addShape(kit, new CapsuleGeometry(0.16, 0.95, 2, 6), "#1a1c20", ...along(s + side + (j - 1) * 0.3 * Math.sign(side), 0.2), y + 1.35, { yaw });
    } else {
      addShape(kit, new BoxGeometry(1.1, 2.1, 0.05), "#1a3f7c", ...along(s - 1.4, -0.63), y + 1.1, { yaw });
    }
    // The canvas gable on its timber frame, front open over the veranda.
    addShape(kit, gableRoof(6.2, PROCENTER.depth + 0.6, 2.75, 3.75), "#f1ebdc", ...along(s, -0.2), y, { yaw });
    addShape(kit, new BoxGeometry(6.2, 0.14, 0.14), "#8a6a48", ...along(s, -0.2 + PROCENTER.depth / 2 + 0.3), y + 2.72, { yaw });
    for (const side of [-3, 3]) addShape(kit, new BoxGeometry(0.12, 2.75, 0.12), "#8a6a48", ...along(s + side, -0.2 + PROCENTER.depth / 2 + 0.3), y + 1.37, { yaw });
    // Shelves of boards between the bays, under the veranda.
    if (k % 2 === 0 && k < bays - 1) {
      const rack = along(s + 3, 1.6);
      for (const post of [[-0.75, -0.7], [0.75, -0.7], [-0.75, 0.7], [0.75, 0.7]]) addShape(kit, new BoxGeometry(0.09, 1.9, 0.09), "#8b8478", ...local(...rack, yaw, ...post), y + 0.95, { yaw });
      for (let level = 0; level < 4; level++) {
        addShape(kit, new BoxGeometry(1.6, 0.06, 1.5), "#9a9286", ...rack, y + 0.3 + level * 0.48, { yaw });
        addBoard(kit, ...local(...rack, yaw, 0, 0), y + 0.36 + level * 0.48, yaw + Math.PI / 2, level % 3 === 2 ? "#ff7a1a" : "#2f7fd0", { fin: true });
      }
    }
  }
  // The veranda, on poles along its front edge.
  addShape(kit, new BoxGeometry(length, 0.05, 3.2), "#f6f2e7", ...along(length / 2, PROCENTER.depth / 2 + 1.9), y + 2.55, { yaw, pitch: 0.08 });
  for (let s = 0; s <= length + 0.1; s += 6) addShape(kit, new CylinderGeometry(0.045, 0.045, 2.45, 6), "#c8ccd0", ...along(s, PROCENTER.depth / 2 + 3.4), y + 1.22);
  // The staircase up to the look-out deck on the north-east bay.
  const deck = along(length - 3, -0.6);
  addShape(kit, new BoxGeometry(6, 0.18, 5), "#a39a8b", ...deck, y + 3.9, { yaw });
  for (const [a, b, w, d] of [[0, 2.45, 6, 0.06], [0, -2.45, 6, 0.06], [2.95, 0, 0.06, 5], [-2.95, 0, 0.06, 5]]) addShape(kit, new BoxGeometry(w, 1, d), "#c8ccd0", ...local(...deck, yaw, a, b), y + 4.5, { yaw });
  for (let step = 0; step < 13; step++) addShape(kit, new BoxGeometry(0.28, 0.06, 1.1), "#9aa0a6", ...along(length + 4.3 - step * 0.28, -0.6), y + 0.3 * step + 0.2, { yaw });
  for (const side of [-1.15, -0.05]) addShape(kit, new BoxGeometry(4.95, 0.06, 0.05), "#c8ccd0", ...along(length + 2.6, side), y + 2.9, { yaw, roll: -0.81 });
  // A line of tall flags in front, NeilPryde blue and JP white.
  for (let k = 0; k < 7; k++) {
    const [x, z] = along(3 + k * 7, PROCENTER.depth / 2 + 8);
    addFlag(kit, x, z, spot.heightAt(x, z), 7.5, k % 2 ? "#f4f4f1" : "#1f56a8", k % 2 ? "#2a2d33" : "#f5d22a", random);
  }
  // Its rigs in rows on the sand in front, ready to go.
  for (let row = 0; row < 3; row++) for (let s = 3 + row; s < length; s += 2.7) {
    const [x, z] = along(s + (random() - 0.5) * 0.8, PROCENTER.depth / 2 + 13 + row * 5.5 + (random() - 0.5));
    addRigOnSand(kit, x, z, spot.heightAt(x, z), random, false);
  }
  // A few boards on the sand by the rigs.
  for (let k = 0; k < 14; k++) {
    const [x, z] = along(2 + random() * length, PROCENTER.depth / 2 + 30 + random() * 5);
    addBoard(kit, x, z, spot.heightAt(x, z), WIND + Math.PI / 2 + (random() - 0.5) * 0.4, pick(BOARDS, random));
  }
}

// The spotting tower: a galvanised scaffold, the deck 3.6 m up behind
// canvas sides, a flat shade roof, a flag at each corner, a ladder at the
// back and a look-out with binoculars.
function addTower(kit, spot, random) {
  const [x, z] = towerAt(spot), y = spot.heightAt(x, z), deck = 3.6, half = 1.25;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    addShape(kit, new CylinderGeometry(0.05, 0.05, deck + 2.6, 6), "#a9aeb2", x + a * half, z + b * half, y + (deck + 2.6) / 2 - 0.3);
    addShape(kit, new BoxGeometry(0.3, 0.05, 0.3), "#7d8286", x + a * half, z + b * half, y + 0.02);
  }
  for (const h of [0.9, 2.2]) for (const [a, b, w, d] of [[0, -1, 2.5, 0.05], [0, 1, 2.5, 0.05], [-1, 0, 0.05, 2.5], [1, 0, 0.05, 2.5]]) addShape(kit, new BoxGeometry(w, 0.05, d), "#a9aeb2", x + a * half, z + b * half, y + h);
  for (const [a, b, r] of [[0, -1, 0.95], [0, 1, -0.95], [-1, 0, 0.95], [1, 0, -0.95]]) addShape(kit, new BoxGeometry(a ? 0.04 : 2.5, 0.04, a ? 2.5 : 0.04), "#a9aeb2", x + a * half, z + b * half, y + 1.55, { [a ? "pitch" : "roll"]: r * 0.48 });
  addShape(kit, new BoxGeometry(2.7, 0.12, 2.7), "#8d8a82", x, z, y + deck);
  for (const [a, b, w, d] of [[0, -1, 2.6, 0.04], [0, 1, 2.6, 0.04], [1, 0, 0.04, 2.6]]) addShape(kit, new BoxGeometry(w, 0.95, d), "#f6f6f2", x + a * (half + 0.02), z + b * (half + 0.02), y + deck + 0.55);
  addShape(kit, new BoxGeometry(3, 0.06, 3), "#f6f6f2", x, z, y + deck + 2.25);
  for (let k = 0; k < 14; k++) addShape(kit, new BoxGeometry(0.5, 0.04, 0.04), "#a9aeb2", x - half - 0.15, z, y + 0.25 + k * 0.26);
  const corners = [["#2bb39b", "#f4f4f1"], ["#f4f4f1", "#2a2d33"], ["#2bb39b", "#f4f4f1"], ["#f4f4f1", "#2a2d33"]];
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b], k) => addFlag(kit, x + a * half, z + b * half, y + deck + 2.2, 1.9, corners[k][0], corners[k][1], random));
  // The look-out, binoculars up.
  addShape(kit, new CapsuleGeometry(0.16, 0.5, 2, 8), "#e94b3c", x + 0.2, z, y + deck + 0.75);
  addShape(kit, new SphereGeometry(0.11, 8, 6), "#c99876", x + 0.2, z, y + deck + 1.22);
  addShape(kit, new BoxGeometry(0.12, 0.08, 0.18), "#1a1a1a", x + 0.34, z, y + deck + 1.22);
}

// A rescue RIB at its mooring, bow into the wind: a collar of tubes bent
// round the bow, a grey rubbing strake, a white hull and deck, a console with
// its screen and wheel, the outboard on the transom, a towing post.
function addRib(kit, x, z, collar) {
  const curve = new CatmullRomCurve3([[2.4, 0.95], [0.4, 0.95], [-1.5, 0.92], [-2.45, 0.5], [-2.65, 0], [-2.45, -0.5], [-1.5, -0.92], [0.4, -0.95], [2.4, -0.95]].map(([a, b]) => new Vector3(a, 0, b)));
  addShape(kit, new TubeGeometry(curve, 28, 0.3, 10, false), collar, x, z, 0.3);
  addShape(kit, new TubeGeometry(curve, 28, 0.06, 5, false), "#3a3d42", x, z, 0.12);
  for (const side of [-0.95, 0.95]) addShape(kit, new SphereGeometry(0.3, 10, 6), collar, x + 2.4, z + side, 0.3);
  const hullPlan = new Shape();
  hullPlan.moveTo(2.4, -0.85);
  hullPlan.lineTo(-1.5, -0.85);
  hullPlan.quadraticCurveTo(-2.5, -0.6, -2.55, 0);
  hullPlan.quadraticCurveTo(-2.5, 0.6, -1.5, 0.85);
  hullPlan.lineTo(2.4, 0.85);
  hullPlan.lineTo(2.4, -0.85);
  addShape(kit, new ExtrudeGeometry(hullPlan, { depth: 0.35, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2), "#e7e7e2", x, z, -0.1);
  addShape(kit, new BoxGeometry(0.65, 0.95, 0.6), "#f4f4f0", x - 0.2, z, 0.72);
  addShape(kit, new BoxGeometry(0.06, 0.4, 0.62), "#2e3c45", x - 0.55, z, 1.32, { roll: 0.5 });
  addShape(kit, new TorusGeometry(0.15, 0.025, 4, 12), "#1c1e21", x - 0.02, z, 1.18, { yaw: Math.PI / 2, roll: 0.6 });
  addShape(kit, new BoxGeometry(0.6, 0.35, 0.9), "#3a3d42", x + 0.65, z, 0.42);
  addShape(kit, new BoxGeometry(0.5, 0.55, 0.42), "#202326", x + 2.55, z, 0.62);
  addShape(kit, new CylinderGeometry(0.06, 0.06, 0.7, 6), "#202326", x + 2.6, z, 0.1);
  addShape(kit, new CylinderGeometry(0.035, 0.035, 1.3, 6), "#c9cdd1", x + 1.6, z, 1.0);
}

// A white pop-up gazebo: legs, a pyramid roof and its valance.
function addGazebo(kit, x, z, y, yaw, size = 5.8) {
  const h = size / 2 - 0.1;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addShape(kit, new BoxGeometry(0.06, 2.2, 0.06), "#c9cdd1", ...local(x, z, yaw, a * h, b * h), y + 1.1, { yaw });
  addShape(kit, new BoxGeometry(size, 0.26, size), "#f6f6f2", x, z, y + 2.1, { yaw });
  addShape(kit, new ConeGeometry(size * 0.71, 1.1, 4, 1), "#fafaf6", x, z, y + 2.75, { yaw: yaw + Math.PI / 4 });
}

// The second station by the water: four gazebos in a row, the long tent,
// a box and a shaded deck, two huts nearer the water, and its rigs in a crowd
// at the water's edge with boards in the shallows.
function addStation(kit, spot, random) {
  const yaw = yawAlong([0.34, 0.94]), at = (x, z) => [x, z, spot.heightAt(x, z)];
  for (let k = 0; k < 4; k++) {
    const [x, z, y] = at(-350.9 + k * 2.1, -131.1 + k * 5.9);
    addGazebo(kit, x, z, y, yaw);
    for (let j = 0; j < 4; j++) addRigOnSand(kit, ...local(x, z, yaw, -1.5 + j, -4.5), y, random, false);
  }
  const [tx, tz, ty] = at(-325, -128.9), tent = yawAlong([0.16, 0.99]);
  addShape(kit, new BoxGeometry(15, 2.2, 3), "#2c3b4c", tx, tz, ty + 1.1, { yaw: tent });
  addShape(kit, gableRoof(3.4, 15.4, 2.2, 3), "#f4f3ee", tx, tz, ty, { yaw: tent + Math.PI / 2 });
  const [cx, cz, cy] = at(-318.4, -124.1);
  addShape(kit, new BoxGeometry(5.8, 2.5, 4.6), "#f2f2ee", cx, cz, cy + 1.25, { yaw: tent });
  const [dx, dz, dy] = at(-312.4, -123.5);
  addShape(kit, new BoxGeometry(7.6, 0.25, 6.6), "#a88f6c", dx, dz, dy + 0.12, { yaw: tent });
  for (const [a, b] of [[-3.6, -3.1], [3.6, -3.1], [-3.6, 3.1], [3.6, 3.1]]) addShape(kit, new CylinderGeometry(0.06, 0.06, 2.6, 6), "#8a6a48", ...local(dx, dz, tent, a, b), dy + 1.4);
  addShape(kit, new BoxGeometry(7.9, 0.06, 6.9), "#f1ebdc", dx, dz, dy + 2.7, { yaw: tent, pitch: -0.07 });
  for (const [hx, hz, w, d] of [[-327.4, -80.6, 8, 3], [-321.4, -90.2, 6.5, 5.5]]) {
    const [x, z, y] = at(hx, hz);
    addShape(kit, new BoxGeometry(w, 2.4, d), "#b89466", x, z, y + 1.2, { yaw: tent });
    addShape(kit, new BoxGeometry(w + 0.8, 0.12, d + 0.8), "#f4f3ee", x, z, y + 2.5, { yaw: tent });
  }
  for (const [fx, fz, colour] of [[-337, -140, "#ff7a1a"], [-333, -106, "#f4f4f1"], [-306, -112, "#ff7a1a"]]) addFlag(kit, fx, fz, spot.heightAt(fx, fz), 6.5, colour, null, random);
  // The rigs at the water's edge: a crowd on the sand, a few boards afloat.
  for (let k = 0; k < 34; k++) {
    const z = -124 + random() * 28, x = eastEdge(spot, z) - 2 - random() * 16;
    addRigOnSand(kit, x, z, spot.heightAt(x, z), random);
  }
  for (let k = 0; k < 6; k++) {
    const z = -122 + random() * 24, x = eastEdge(spot, z) + 2 + random() * 5;
    addBoard(kit, x, z, 0.02, WIND + Math.PI / 2 + (random() - 0.5) * 0.6, pick(BOARDS, random), { fin: false });
  }
}

// ProCenter's sunbeds and white parasols in three rows along the water,
// 12 m up the beach and back, facing the sea.
function addSunbeds(kit, spot, random) {
  for (let row = 0; row < 3; row++) for (let z = -256; z >= -334; z -= 4.6) {
    const edge = eastEdge(spot, z), x = edge - 12 - row * 5, y = spot.heightAt(x, z);
    // Along the shore, so each bed's local +z faces the sea.
    const dx = eastEdge(spot, z - 4) - edge, yaw = yawAlong([dx / Math.hypot(dx, 4), -4 / Math.hypot(dx, 4)]);
    if (y < 0.15) continue;
    addShape(kit, new CylinderGeometry(0.025, 0.03, 2.35, 6), "#dcdcd6", x, z, y + 1.17);
    addShape(kit, new ConeGeometry(1.15, 0.38, 8, 1, true), "#f7f6f1", x, z, y + 2.3);
    addShape(kit, new ConeGeometry(1.16, 0.06, 8, 1, true), "#d9d6cc", x, z, y + 2.1);
    for (const side of [-0.85, 0.85]) {
      const [sx, sz] = local(x, z, yaw, side, 0.6);
      addShape(kit, new BoxGeometry(0.62, 0.08, 1.9), "#f2f1ec", sx, sz, y + 0.32, { yaw });
      addShape(kit, new BoxGeometry(0.6, 0.08, 0.7), "#f2f1ec", ...local(sx, sz, yaw, 0, -0.95), y + 0.55, { yaw, pitch: 0.6 });
      if (random() < 0.55) addShape(kit, new BoxGeometry(0.55, 0.03, 1.5), pick(["#2d6cdf", "#e94b3c", "#f2c230", "#3aa76d", "#ff8fab", "#f5f5f0"], random), sx, sz, y + 0.38, { yaw });
    }
    if (random() < 0.12) addShape(kit, new BoxGeometry(0.6, 0.04, 0.6), "#4a4f55", x, z, y + 0.12, { yaw });
  }
}

// A car: a rounded body, its glasshouse, wheels and lights.
function addCar(kit, x, z, y, yaw, random) {
  const colour = pick(["#f1f1ee", "#c7c9cc", "#22262b", "#9b2b25", "#2f4f7a", "#6d6f72", "#f1f1ee", "#c7c9cc"], random);
  addShape(kit, new CapsuleGeometry(0.62, 3.1, 4, 10), colour, x, z, y + 0.66, { yaw, roll: Math.PI / 2, scale: [1, 1, 1.38] });
  addShape(kit, new CapsuleGeometry(0.5, 1.5, 4, 8), "#26303a", ...local(x, z, yaw, -0.25, 0), y + 1.16, { yaw, roll: Math.PI / 2, scale: [0.95, 1, 1.5] });
  for (const [a, b] of [[1.3, 0.78], [1.3, -0.78], [-1.3, 0.78], [-1.3, -0.78]]) addShape(kit, new CylinderGeometry(0.31, 0.31, 0.22, 12), "#17191c", ...local(x, z, yaw, a, b), y + 0.31, { yaw, pitch: Math.PI / 2 });
  for (const b of [-0.55, 0.55]) addShape(kit, new BoxGeometry(0.05, 0.1, 0.3), "#f4f1d8", ...local(x, z, yaw, 2.17, b), y + 0.72, { yaw });
}

// A white camper van: the box, the cab, a window band, wheels.
function addCamper(kit, x, z, y, yaw, random) {
  const body = pick(["#f2f1ec", "#f4f4f0", "#e9e6dc"], random), stripe = pick(["#8a8f96", "#b0453a", "#2d5c8a", "#6b7a48"], random);
  addShape(kit, new BoxGeometry(5.4, 2.35, 2.3), body, ...local(x, z, yaw, -0.6, 0), y + 0.45 + 1.18, { yaw });
  addShape(kit, new BoxGeometry(1.5, 1.45, 2.2), body, ...local(x, z, yaw, 2.8, 0), y + 0.45 + 0.72, { yaw });
  addShape(kit, new BoxGeometry(1.3, 0.75, 2.24), "#2b3640", ...local(x, z, yaw, 2.9, 0), y + 1.6, { yaw, roll: -0.25 });
  addShape(kit, new BoxGeometry(3.6, 0.5, 2.34), "#3a4652", ...local(x, z, yaw, -0.9, 0), y + 2.05, { yaw });
  addShape(kit, new BoxGeometry(5.42, 0.16, 2.33), stripe, ...local(x, z, yaw, -0.6, 0), y + 1.0, { yaw });
  for (const [a, b] of [[2.6, 1.05], [2.6, -1.05], [-2.1, 1.05], [-2.1, -1.05]]) addShape(kit, new CylinderGeometry(0.38, 0.38, 0.26, 12), "#17191c", ...local(x, z, yaw, a, b), y + 0.38, { yaw, pitch: Math.PI / 2 });
}

// Someone on the beach, about 1.75 m: legs, shorts or a swimsuit, a bare
// back or a shirt, arms, a head and hair, standing a little turned.
const SKIN = ["#e9c2a0", "#d9a982", "#c99876", "#8d5a3b", "#f1d3b8"];
function addBather(kit, x, z, y, random, { wetsuit = false } = {}) {
  const skin = pick(SKIN, random), tall = 0.92 + random() * 0.16, yaw = random() * Math.PI * 2;
  const shorts = wetsuit ? "#16181b" : pick(["#20262e", "#2d6cdf", "#e94b3c", "#f2c230", "#3aa76d", "#ff8fab", "#f5f5f0"], random);
  const top = wetsuit ? "#16181b" : random() < 0.5 ? skin : pick(["#f5f5f0", "#20262e", "#e94b3c", "#2d6cdf", "#7a5cfa"], random);
  const legs = wetsuit ? "#16181b" : skin, at = (a, b) => local(x, z, yaw, a, b);
  for (const side of [-0.1, 0.1]) addShape(kit, new CapsuleGeometry(0.065, 0.62, 2, 6), legs, ...at(0, side), y + 0.4 * tall, { yaw, scale: [1, tall, 1] });
  addShape(kit, new BoxGeometry(0.22, 0.24, 0.36), shorts, ...at(0, 0), y + 0.86 * tall, { yaw });
  addShape(kit, new CapsuleGeometry(0.15, 0.34, 2, 8), top, ...at(0, 0), y + 1.18 * tall, { yaw, scale: [0.8, 1, 1.15] });
  for (const side of [-1, 1]) addShape(kit, new CapsuleGeometry(0.045, 0.5, 2, 5), wetsuit ? "#16181b" : skin, ...at(0, side * 0.24), y + 1.12 * tall, { yaw, roll: side * 0.12 });
  addShape(kit, new SphereGeometry(0.11, 8, 6), skin, ...at(0, 0), y + 1.6 * tall);
  addShape(kit, new SphereGeometry(0.115, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), pick(["#2a2018", "#4a3424", "#8a6a3a", "#d9c08a", "#1a1a1a"], random), ...at(-0.01, 0), y + 1.62 * tall);
}

// The lighthouse: its keeper's houses from their footprints in local stone,
// the square tower to 9 m, then the gallery, the glazed lantern and its dome.
function addLighthouse(kit, spot) {
  const near = spot.features.buildings.filter(({ footprint }) => footprint.every(([x, z]) => Math.hypot(x - LIGHTHOUSE[0], z - LIGHTHOUSE[1]) <= 30));
  const add = (g, colour) => kit.add(Array.from(g.positions), Array.from({ length: g.positions.length / 3 }, (_, k) => k), colour);
  for (const { footprint, height } of near) {
    const tower = footprint.every(([x, z]) => Math.hypot(x - LIGHTHOUSE[0], z - LIGHTHOUSE[1]) < 5);
    add(extrudeFootprint(footprint, tower ? 9 : Math.max(3.4, height), spot.heightAt), tower ? "#d8cdb6" : "#c4b498");
  }
  const [x, z] = LIGHTHOUSE, top = Math.min(...[[-2, -2], [2, -2], [-2, 2], [2, 2]].map(([a, b]) => spot.heightAt(x + a, z + b))) + 9;
  addShape(kit, new BoxGeometry(5.6, 0.3, 5.6), "#e9e6de", x, z, top + 0.15);
  addShape(kit, new TorusGeometry(1.75, 0.04, 4, 24), "#2d3136", x, z, top + 1.1, { pitch: Math.PI / 2 });
  for (let k = 0; k < 12; k++) addShape(kit, new CylinderGeometry(0.025, 0.025, 1, 4), "#2d3136", x + Math.cos(k * 0.52) * 1.75, z + Math.sin(k * 0.52) * 1.75, top + 0.8);
  addShape(kit, new CylinderGeometry(1.25, 1.25, 0.6, 16), "#e9e6de", x, z, top + 0.6);
  addShape(kit, new CylinderGeometry(1.15, 1.15, 1.7, 16), "#41545f", x, z, top + 1.75);
  addShape(kit, new SphereGeometry(1.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#f1efe9", x, z, top + 2.6);
  addShape(kit, new CylinderGeometry(0.05, 0.12, 0.7, 6), "#2d3136", x, z, top + 4.1);
}

// The centres up by the road: flags, a container, boards leaning on a rail.
function addRoadCentres(kit, spot, random) {
  for (const [x, z, colours] of [[-458, -306, ["#e8322f", "#f4f4f1", "#e8322f"]], [-522, -272, ["#ffd23f", "#22262b", "#ffd23f"]]]) {
    colours.forEach((colour, k) => {
      const [fx, fz] = [x + k * 4, z + k * 2.5];
      addFlag(kit, fx, fz, spot.heightAt(fx, fz), 6.5, colour, null, random);
    });
    const [cx, cz] = [x - 6, z + 10];
    if (!inBuilding(spot, cx, cz)) addShape(kit, new BoxGeometry(6, 2.6, 2.44), "#f2f2ee", cx, cz, spot.heightAt(cx, cz) + 1.3, { yaw: 0.4 });
    for (let k = 0; k < 6; k++) {
      const [bx, bz] = [x + 4 + k * 0.7, z + 12];
      addShape(kit, new BoxGeometry(0.1, 2.45, 0.6), pick(BOARDS, random), bx, bz, spot.heightAt(bx, bz) + 1.2, { roll: 0.25 });
    }
  }
}

export function landmarks(kit, spot) {
  const random = seeded(1890);
  addProCenter(kit, spot, random);
  addSunbeds(kit, spot, random);
  addTower(kit, spot, random);
  addStation(kit, spot, random);
  addRoadCentres(kit, spot, random);
  // The rescue boats, moored off each station.
  addRib(kit, eastEdge(spot, -238) + 34, -238, "#ee5d1f");
  addRib(kit, eastEdge(spot, -108) + 38, -108, "#40454c");
  for (const { x, z, yaw, camper } of vehicleSpots(spot)) (camper ? addCamper : addCar)(kit, x, z, spot.heightAt(x, z), yaw, random);
  // People: at ProCenter's rigs in wetsuits, on the sunbeds' beach, at the
  // second station and along the water's edge.
  const [ax, az] = PROCENTER.from, [bx, bz] = PROCENTER.to;
  for (let k = 0; k < 24; k++) {
    const t = random(), x = ax + (bx - ax) * t + 12 + random() * 22, z = az + (bz - az) * t + 6 + random() * 10;
    addBather(kit, x, z, spot.heightAt(x, z), random, { wetsuit: random() < 0.7 });
  }
  for (let k = 0; k < 40; k++) {
    const z = -340 + random() * 95, x = eastEdge(spot, z) - 2 - random() * 22;
    addBather(kit, x, z, spot.heightAt(x, z), random);
  }
  for (let k = 0; k < 22; k++) {
    const z = -140 + random() * 60, x = eastEdge(spot, z) - 1 - random() * 30;
    addBather(kit, x, z, spot.heightAt(x, z), random, { wetsuit: random() < 0.6 });
  }
  addLighthouse(kit, spot);
}

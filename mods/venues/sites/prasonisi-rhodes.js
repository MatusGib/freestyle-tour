// Prasonisi, Rhodes: what the map data doesn't carry, placed by the named
// OpenStreetMap features. Surfcenter Kirschner at about (-338, -330) and
// Wind4Fun at (-533, -259) stand at the foot of the hill; downwind of them
// (+x) their rigs lie on the flat-water beach, boards on racks, flags
// streaming out over the bay, and the safety boats ride at their moorings
// off it. The swimming beach with its sunbeds and straw parasols is at the
// north-east end; camper vans park on the sandbar; tamarisks shade the
// buildings. On the islet's southern cliff stands the lighthouse (1890), its
// tower at (-1086, 2206) with the light 61 m above the sea. Upwind across the
// sandbar the meltemi's waves break 30-100 m off the wave side's beach.
// The game frame's +x is downwind, so props turn by WIND to face it.
import { BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from "../lib/three.core.min.js";
import { addFeatherFlag, addRig, addShape, seeded } from "../props.js";
import { AEGEAN } from "../realworld/plants-aegean.js";
import { extrudeFootprint } from "../realworld/buildings.js";

const WIND = 0;
const LIGHTHOUSE = [-1086, 2206];

// Rocky shores take the rock texture: there is no coral on Rhodes.
export const textures = { coralRubble: "rock", mangroveMud: "scrub-soil" };
export const ground = { sand: "#e3cfa6" };
// Whitewashed walls, a few cream and stone; flat concrete roofs; blue shutters.
export const buildings = {
  walls: ["#f5f2ea", "#f5f2ea", "#f1ece0", "#ece3cf", "#e4d6b8", "#f5f2ea", "#d9cbb0"],
  roofs: { flat: "#dcd6ca", roof: "#b39463" },
  shutter: "#2c5f9e",
  except: [[...LIGHTHOUSE, 30]],
};

// Where the beach meets the bay along z, coming from the land (-x).
function eastEdge(spot, z, from = -700) {
  let x = from;
  while (x < 400 && !(spot.isLand(x, z) && !spot.isLand(x + 0.5, z))) x += 0.5;
  return x;
}
// Where the land begins along z, coming from the open sea upwind (-x).
function westEdge(spot, z, from = -2000) {
  let x = from;
  while (x < 0 && !spot.isLand(x, z)) x += 1;
  return x < 0 ? x : null;
}
const range = (a, b, step) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, k) => a + k * step);

// The breaking waves: an outer and an inner line off the sandbar's west
// beach, and the swell bursting on the islet's west shore.
export function surfLines(spot) {
  const line = (zs, out, from) => zs.map((z) => [westEdge(spot, z, from), z]).filter(([x]) => x !== null).map(([x, z]) => [x - out, z]);
  return [line(range(-110, 470, 10), 75, -1000), line(range(-110, 470, 10), 32, -1000), line(range(640, 1780, 20), 10, -2000)];
}

const inBuilding = (spot, x, z) => spot.features.buildings.some(({ footprint }) => {
  let inside = false;
  for (let k = 0, j = footprint.length - 1; k < footprint.length; j = k++) {
    const [xi, zi] = footprint[k], [xj, zj] = footprint[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
});

// Tamarisks by the centres, along the road down to the beach, and around the
// tavernas and rooms; kept off the buildings, the roads' sand and the water.
const TAMARISKS = [
  [-372, -300], [-374, -352], [-362, -372], [-312, -366], [-405, -286], [-438, -272], [-470, -262], [-505, -238], [-560, -232],
  [-598, -252], [-628, -296], [-640, -228], [-702, -262], [-760, -300], [-700, -385], [-755, -205], [-590, -330], [-520, -300],
];
export const flora = {
  ...AEGEAN,
  fixed: (spot) => ({ tamarisk: TAMARISKS.filter(([x, z]) => spot.heightAt(x, z) > 0.5 && !inBuilding(spot, x, z)) }),
};

const pick = (list, random) => list[Math.floor(random() * list.length)];
// The world point of the local (a along, b across) of something at (x, z) turned by yaw.
const local = (x, z, yaw, a, b) => [x + a * Math.cos(yaw) + b * Math.sin(yaw), z - a * Math.sin(yaw) + b * Math.cos(yaw)];

// A board rack: two wooden A-frames with a dozen boards lying flat across
// them, two side by side on each shelf.
function addBoardRack(kit, x, z, y, random) {
  for (const b of [-0.8, 0.8]) for (const lean of [-0.25, 0.25]) addShape(kit, new BoxGeometry(0.1, 2.2, 0.1), "#8a7154", x, z + b, y + 1.05, { roll: lean });
  for (let k = 0; k < 6; k++) {
    for (const side of [-1, 1]) {
      const colour = random() < 0.55 ? "#f3f3ee" : pick(["#e8412d", "#1d9bd1", "#20262e", "#f2c230", "#2ab673"], random);
      addShape(kit, new CapsuleGeometry(0.3, 1.7, 3, 8), colour, x + side * 0.34, z, y + 0.35 + k * 0.3, { pitch: Math.PI / 2, scale: [1, 1, 0.2] });
    }
  }
}

// A shade sail: a white canopy on six poles, its downwind edge lower.
function addShade(kit, x, z, y, width, depth) {
  for (const a of [-width / 2, 0, width / 2]) for (const b of [-depth / 2, depth / 2]) addShape(kit, new CylinderGeometry(0.06, 0.07, 2.8, 6), "#9a9a96", x + a, z + b, y + 1.4);
  addShape(kit, new BoxGeometry(width + 0.4, 0.06, depth + 0.4), "#f7f6f1", x, z, y + 2.75, { roll: -0.06 });
}

// A sunbed with its cushion, facing the sea (+x), and a straw parasol.
function addSunbed(kit, x, z, y, cushion) {
  addShape(kit, new BoxGeometry(1.9, 0.08, 0.66), "#f2f0ea", x, z, y + 0.32);
  for (const [a, b] of [[-0.85, -0.28], [-0.85, 0.28], [0.85, -0.28], [0.85, 0.28]]) addShape(kit, new BoxGeometry(0.05, 0.3, 0.05), "#d8d6d0", x + a, z + b, y + 0.15);
  addShape(kit, new BoxGeometry(1.2, 0.07, 0.6), cushion, x + 0.3, z, y + 0.39);
  addShape(kit, new BoxGeometry(0.7, 0.07, 0.6), cushion, x - 0.62, z, y + 0.58, { roll: -0.55 });
}
function addParasol(kit, x, z, y) {
  addShape(kit, new CylinderGeometry(0.04, 0.05, 2.4, 6), "#8d7552", x, z, y + 1.2);
  addShape(kit, new ConeGeometry(1.3, 0.6, 12, 1), "#c9a865", x, z, y + 2.5);
  addShape(kit, new ConeGeometry(1.32, 0.12, 12, 1, true), "#a98a4f", x, z, y + 2.2);
}

// A white camper van, its cab towards yaw, with a window band and wheels.
function addCamper(kit, x, z, y, yaw, random) {
  const body = pick(["#f2f1ec", "#f4f4f0", "#e9e6dc"], random), stripe = pick(["#8a8f96", "#b0453a", "#2d5c8a", "#6b7a48"], random);
  addShape(kit, new BoxGeometry(5.4, 2.35, 2.3), body, ...local(x, z, yaw, -0.6, 0), y + 0.45 + 1.18, { yaw });
  addShape(kit, new BoxGeometry(1.5, 1.45, 2.2), body, ...local(x, z, yaw, 2.8, 0), y + 0.45 + 0.72, { yaw });
  addShape(kit, new BoxGeometry(1.3, 0.75, 2.24), "#2b3640", ...local(x, z, yaw, 2.9, 0), y + 1.6, { yaw, roll: -0.25 });
  addShape(kit, new BoxGeometry(3.6, 0.5, 2.34), "#3a4652", ...local(x, z, yaw, -0.9, 0), y + 2.05, { yaw });
  addShape(kit, new BoxGeometry(5.42, 0.16, 2.33), stripe, ...local(x, z, yaw, -0.6, 0), y + 1.0, { yaw });
  for (const [a, b] of [[2.6, 1.05], [2.6, -1.05], [-2.1, 1.05], [-2.1, -1.05]]) addShape(kit, new CylinderGeometry(0.38, 0.38, 0.26, 10), "#1d1f22", ...local(x, z, yaw, a, b), y + 0.38, { yaw, pitch: Math.PI / 2 });
}

// A car: a body, its cabin and four wheels.
function addCar(kit, x, z, y, yaw, random) {
  const colour = pick(["#f1f1ee", "#c7c9cc", "#22262b", "#9b2b25", "#2f4f7a", "#6d6f72"], random);
  addShape(kit, new BoxGeometry(4.2, 0.75, 1.75), colour, x, z, y + 0.68, { yaw });
  addShape(kit, new BoxGeometry(2.1, 0.6, 1.6), "#2b3640", ...local(x, z, yaw, -0.2, 0), y + 1.33, { yaw });
  for (const [a, b] of [[1.3, 0.8], [1.3, -0.8], [-1.3, 0.8], [-1.3, -0.8]]) addShape(kit, new CylinderGeometry(0.32, 0.32, 0.2, 10), "#1d1f22", ...local(x, z, yaw, a, b), y + 0.32, { yaw, pitch: Math.PI / 2 });
}

// A safety RIB at its mooring, bow upwind: tubes, a console, an outboard.
function addRib(kit, x, z, tubes) {
  for (const b of [-0.8, 0.8]) addShape(kit, new CapsuleGeometry(0.28, 4.4, 4, 10), tubes, x, z + b, 0.22, { roll: Math.PI / 2 });
  addShape(kit, new BoxGeometry(5, 0.2, 1.4), "#e9e9e4", x, z, 0.12);
  addShape(kit, new BoxGeometry(0.7, 0.9, 0.8), "#f4f4f0", x - 0.2, z, 0.65);
  addShape(kit, new BoxGeometry(0.45, 0.9, 0.35), "#1c1e21", x + 2.7, z, 0.55);
  addShape(kit, new CylinderGeometry(0.02, 0.02, 2.4, 4), "#3a3a3a", x - 2.4, z, 0.2, { roll: 1.2 });
}

// Someone on the beach, about 1.75 m: legs, shorts or a swimsuit, a bare
// back or a shirt, arms, a head and hair, standing a little turned.
const SKIN = ["#e9c2a0", "#d9a982", "#c99876", "#8d5a3b", "#f1d3b8"];
function addBather(kit, x, z, y, random) {
  const skin = pick(SKIN, random), tall = 0.92 + random() * 0.16, yaw = random() * Math.PI * 2;
  const shorts = pick(["#20262e", "#2d6cdf", "#e94b3c", "#f2c230", "#3aa76d", "#ff8fab", "#f5f5f0"], random);
  const top = random() < 0.5 ? skin : pick(["#f5f5f0", "#20262e", "#e94b3c", "#2d6cdf", "#7a5cfa"], random);
  const at = (a, b) => local(x, z, yaw, a, b);
  for (const side of [-0.1, 0.1]) addShape(kit, new CapsuleGeometry(0.065, 0.62, 2, 6), skin, ...at(0, side), y + 0.4 * tall, { yaw, scale: [1, tall, 1] });
  addShape(kit, new BoxGeometry(0.22, 0.24, 0.36), shorts, ...at(0, 0), y + 0.86 * tall, { yaw });
  addShape(kit, new CapsuleGeometry(0.15, 0.34, 2, 8), top, ...at(0, 0), y + 1.18 * tall, { yaw, scale: [0.8, 1, 1.15] });
  for (const side of [-1, 1]) addShape(kit, new CapsuleGeometry(0.045, 0.5, 2, 5), skin, ...at(0, side * 0.24), y + 1.12 * tall, { yaw, roll: side * 0.12 });
  addShape(kit, new SphereGeometry(0.11, 8, 6), skin, ...at(0, 0), y + 1.6 * tall);
  addShape(kit, new SphereGeometry(0.115, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), pick(["#2a2018", "#4a3424", "#8a6a3a", "#d9c08a", "#1a1a1a"], random), ...at(-0.01, 0), y + 1.62 * tall);
}

// A centre's building dressed for the beach: a white parapet round its roof
// terrace with parasols on it, and a striped awning on its side to the sea.
function dressCentre(kit, spot, near, stripe, random) {
  for (const { footprint, height } of spot.features.buildings.filter(({ footprint }) => footprint.every(([x, z]) => Math.hypot(x - near[0], z - near[1]) < 40))) {
    const ring = footprint.at(-1)[0] === footprint[0][0] && footprint.at(-1)[1] === footprint[0][1] ? footprint.slice(0, -1) : footprint;
    const top = Math.min(...ring.map(([x, z]) => spot.heightAt(x, z))) + height;
    let seaward = null;
    ring.forEach(([ax, az], k) => {
      const [bx, bz] = ring[(k + 1) % ring.length], length = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(-(bz - az), bx - ax);
      addShape(kit, new BoxGeometry(length + 0.2, 0.9, 0.2), "#f7f5ef", (ax + bx) / 2, (az + bz) / 2, top + 0.45, { yaw });
      if (length > 6 && (!seaward || ax + bx > seaward.mid)) seaward = { mid: ax + bx, ax, az, bx, bz, length, yaw };
    });
    if (!seaward) continue;
    const { ax, az, bx, bz, length, yaw } = seaward, out = [Math.sin(yaw), Math.cos(yaw)];
    const side = out[0] >= 0 ? 1 : -1;
    for (let s = 0.5; s < length - 0.5; s += 1.2) {
      const t = s / length, px = ax + (bx - ax) * t + side * out[0] * 1.3, pz = az + (bz - az) * t + side * out[1] * 1.3;
      addShape(kit, new BoxGeometry(1.2, 0.05, 2.6), Math.round(s / 1.2) % 2 ? "#f7f5ef" : stripe, px, pz, top - 1.1, { yaw, pitch: -side * 0.25 });
    }
    for (let k = 0; k < 3; k++) {
      const t = 0.25 + k * 0.25, px = ax + (bx - ax) * t - side * out[0] * 3, pz = az + (bz - az) * t - side * out[1] * 3;
      addShape(kit, new CylinderGeometry(0.03, 0.03, 2.2, 5), "#d8d6d0", px, pz, top + 1.1);
      addShape(kit, new ConeGeometry(1.2, 0.45, 8, 1), random() < 0.5 ? stripe : "#f7f5ef", px, pz, top + 2.3);
    }
  }
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

export function landmarks(kit, spot) {
  const random = seeded(1890);
  const sand = (z, back) => {
    const x = eastEdge(spot, z) - back;
    return [x, z, spot.heightAt(x, z)];
  };
  // The centres' beach: rigs on the sand nearer the water, boards on racks
  // and the shade further back, flags along the front.
  for (const [from, to, count] of [[-350, -262, 46], [-205, -140, 24]]) {
    for (let k = 0; k < count; k++) addRig(kit, ...sand(from + random() * (to - from), 6 + random() * 22), random, WIND);
    for (let z = from + 6; z < to; z += 13) addBoardRack(kit, ...sand(z, 40 + random() * 4), random);
    for (let k = 0; k < 4; k++) addFeatherFlag(kit, ...sand(from + 8 + k * ((to - from - 16) / 3), 34), pick(["#e8412d", "#1d9bd1", "#f2c230", "#20262e"], random), WIND);
  }
  addShade(kit, ...sand(-300, 52), 9, 6);
  addShade(kit, ...sand(-170, 50), 7, 5);
  // The safety boats, moored off the beach.
  addRib(kit, eastEdge(spot, -320) + 34, -320, "#e8641e");
  addRib(kit, eastEdge(spot, -240) + 40, -240, "#3c3f44");
  addRib(kit, eastEdge(spot, -165) + 36, -165, "#3c3f44");
  // The swimming beach: sunbeds and parasols in two rows.
  for (let z = -455; z <= -385; z += 5.5) {
    for (const [back, cushion] of [[9, "#2f6fb0"], [16, "#f2f0ea"]]) {
      const [x, , y] = sand(z, back);
      addSunbed(kit, x, z - 1.1, y, cushion);
      addSunbed(kit, x, z + 1.1, y, cushion);
      addParasol(kit, x - 1, z, y);
    }
  }
  // Camper vans and cars on the sandbar, in loose rows along its track.
  for (let k = 0; k < 18; k++) {
    const z = -40 + random() * 280, west = westEdge(spot, z, -1000) ?? -600, east = eastEdge(spot, z);
    const x = west + 30 + random() * Math.max(10, east - west - 60), yaw = Math.PI / 2 + 0.35 + (random() - 0.5) * 0.5;
    if (spot.heightAt(x, z) > 0.3) addCamper(kit, x, z, spot.heightAt(x, z), yaw, random);
  }
  for (let k = 0; k < 26; k++) {
    const z = -200 + random() * 120, x = -460 + random() * 120;
    if (spot.heightAt(x, z) > 0.3 && !inBuilding(spot, x, z)) addCar(kit, x, z, spot.heightAt(x, z), Math.PI / 2 + (random() - 0.5) * 0.6, random);
  }
  // People: on the centres' beach, at the water's edge, on the sunbeds' beach.
  for (let k = 0; k < 70; k++) {
    const z = k < 45 ? -350 + random() * 210 : -460 + random() * 80;
    const [x, , y] = sand(z, k % 3 ? 3 + random() * 40 : random() * 4);
    addBather(kit, x, z, y, random);
  }
  dressCentre(kit, spot, [-340, -315], "#1d6fb8", random);
  dressCentre(kit, spot, [-533, -259], "#e8641e", random);
  addLighthouse(kit, spot);
}

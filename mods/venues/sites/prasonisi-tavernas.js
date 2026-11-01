// Prasonisi's three tavernas on the road down to the beach, modelled from
// their photos and placed from aerial imagery read on 2026-11-01 (Google Maps
// puts Zanetos at 35.89132, 27.77288, the Lighthouse Tavern at 35.89126,
// 27.77330 and Oasis at 35.89136, 27.77364; the aerial shows each building):
// - Zanetos: rooms in a whitewashed two-storey block of arches behind a taverna
//   under a flat reed-thatched roof with reed fringes, log pergolas either
//   side, a stone terrace with built benches, a lawn to the east and the name
//   on a stone wall; it faces the car park (south).
// - The Lighthouse Tavern: an open terrace under a long yellow fascia painted
//   COFFEE, SNACKS, FOOD, DRINKS round its front and side, a pediment with the
//   lighthouse, white columns banded blue, awnings, blue-and-white tables and
//   chairs, a blue-railed ramp, a Greek flag, palms; it faces the car park.
// - Oasis: an open restaurant under a plank fascia with "oasis" in blue and a
//   blue RESTAURANT TAVERNA CAFE board, reed fringes, white posts, wooden
//   tables, potted plants and a tall date palm behind; it faces the road (west).
// Each faces along its yaw: local +x across its front, local +z out of it.
import { BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, Shape, ShapeGeometry } from "../lib/three.core.min.js";
import { addPalm, addShape } from "../props.js";
import { fitFont } from "../realworld/signs.js";

// Where each stands, its yaw (south is pi/4 in the spot's frame, west -pi/4)
// and the mapped buildings it takes the place of ([x, z, metres]).
export const TAVERNAS = {
  zanetos: { at: [-706, -217], yaw: Math.PI / 4, replaces: [-710, -225, 18] },
  lighthouse: { at: [-660, -229], yaw: Math.PI / 4, replaces: [-672, -247, 18] },
  oasis: { at: [-646, -261], yaw: -Math.PI / 4, replaces: [-658, -260, 10] },
};

const local = (x, z, yaw, a, b) => [x + a * Math.cos(yaw) + b * Math.sin(yaw), z - a * Math.sin(yaw) + b * Math.cos(yaw)];
const WHITE = "#f4f2ec", REED = "#b99a62", THATCH = "#d6c39a", LOG = "#9b7a55", STONE = "#cdb995", PAVING = "#a6a9a6";

// A frame for one taverna: at(a, b) is the world point; base its floor, at
// the highest ground under it, low the lowest.
function frame(spot, { at: [x, z], yaw }, half) {
  const at = (a, b) => local(x, z, yaw, a, b);
  const heights = [[-half, -half], [half, -half], [-half, half], [half, half], [0, 0]].map(([a, b]) => spot.heightAt(...at(a, b)));
  return { at, yaw, base: Math.max(...heights), low: Math.min(...heights) };
}

// A floor on the slope: a stone plinth from below the lowest ground up to the
// floor, its top in the floor's colour.
function slab(kit, f, a, b, width, depth, top) {
  const bottom = f.low - 0.4, height = f.base - bottom;
  addShape(kit, new BoxGeometry(width, height, depth), STONE, ...f.at(a, b), bottom + height / 2, { yaw: f.yaw });
  addShape(kit, new BoxGeometry(width, 0.12, depth), top, ...f.at(a, b), f.base + 0.06, { yaw: f.yaw });
}

// A reed fringe hanging under an edge, length along the frame's x or z.
function fringe(kit, f, a, b, length, y, alongZ = false) {
  addShape(kit, new BoxGeometry(alongZ ? 0.08 : length, 0.55, alongZ ? length : 0.08), REED, ...f.at(a, b), y - 0.27, { yaw: f.yaw });
}

// A table with its chairs round it, or a bench along it.
function addTable(kit, f, a, b, y, { top, chair, round = false }) {
  const table = round ? new CylinderGeometry(0.4, 0.4, 0.05, 10) : new BoxGeometry(0.8, 0.05, 0.8);
  addShape(kit, table, top, ...f.at(a, b), y + 0.74, { yaw: f.yaw });
  addShape(kit, new CylinderGeometry(0.05, 0.06, 0.72, 6), "#4a4f55", ...f.at(a, b), y + 0.36);
  for (const [da, db] of [[0, 0.7], [0, -0.7], [0.7, 0], [-0.7, 0]]) {
    addShape(kit, new BoxGeometry(0.42, 0.05, 0.42), chair, ...f.at(a + da, b + db), y + 0.45, { yaw: f.yaw });
    addShape(kit, new BoxGeometry(da ? 0.05 : 0.42, 0.45, da ? 0.42 : 0.05), chair, ...f.at(a + da * 1.3, b + db * 1.3), y + 0.68, { yaw: f.yaw });
  }
}

function addPot(kit, f, a, b, y, plant = "#5f8a4a") {
  addShape(kit, new CylinderGeometry(0.3, 0.22, 0.5, 10), "#b5643a", ...f.at(a, b), y + 0.25);
  for (let k = 0; k < 6; k++) addShape(kit, new ConeGeometry(0.06, 0.8, 4), plant, ...f.at(a + Math.cos(k) * 0.12, b + Math.sin(k) * 0.12), y + 0.85, { pitch: Math.cos(k * 2.1) * 0.5, roll: Math.sin(k * 2.1) * 0.5 });
}

// An arch's outline, an opening w wide and h tall to the crown.
function archShape(w, h) {
  const s = new Shape(), r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.lineTo(-r, 0);
  return s;
}

function addZanetos(kit, spot, random) {
  const f = frame(spot, TAVERNAS.zanetos, 9), y = f.base;
  // The rooms: a whitewashed block of two storeys, an arcade of arches on
  // each floor between stone pilasters, solar heaters on the roof, and
  // bougainvillea on its front.
  const [rx, rz] = f.at(4, -16), rooms = { at: [rx, rz], yaw: f.yaw };
  const r = frame(spot, rooms, 11), ry = r.low;
  addShape(kit, new BoxGeometry(22, 6.6, 9), WHITE, ...r.at(0, 0), ry + 3.3, { yaw: f.yaw });
  for (let k = 0; k <= 6; k++) addShape(kit, new BoxGeometry(0.6, 6.6, 0.2), "#d9c7a4", ...r.at(-10.8 + k * 3.6, 4.55), ry + 3.3, { yaw: f.yaw });
  for (const floor of [0, 3.2]) {
    for (let k = 0; k < 6; k++) addShape(kit, new ShapeGeometry(archShape(2.6, 2.7), 6), "#e3ddd2", ...r.at(-9 + k * 3.6, 4.62), ry + floor + 0.1, { yaw: f.yaw });
    addShape(kit, new BoxGeometry(22, 0.2, 0.3), "#d9c7a4", ...r.at(0, 4.6), ry + floor + 3.1, { yaw: f.yaw });
  }
  addShape(kit, new BoxGeometry(22, 0.9, 0.12), WHITE, ...r.at(0, 4.75), ry + 3.75, { yaw: f.yaw });
  for (let k = 0; k < 5; k++) {
    const [sx, sz] = r.at(-8 + k * 4, -1);
    addShape(kit, new BoxGeometry(1.8, 0.06, 1.1), "#2b3a5a", sx, sz, ry + 7.1, { yaw: f.yaw, pitch: -0.6 });
    addShape(kit, new CylinderGeometry(0.28, 0.28, 1.6, 8), "#e8e8e4", ...r.at(-8 + k * 4, -2), ry + 7.3, { yaw: f.yaw, roll: Math.PI / 2 });
  }
  for (let k = 0; k < 18; k++) addShape(kit, new IcosahedronGeometry(0.45 + random() * 0.3, 0), k % 3 ? "#c2185b" : "#3f6b33", ...r.at(3 + random() * 8, 4.9), ry + 0.8 + random() * 3, { yaw: random() * 6 });
  // The taverna: a flat thatched roof on timber posts with reed fringes, its
  // back closed, its front open to the terrace.
  addShape(kit, new BoxGeometry(14, 0.3, 9), THATCH, ...f.at(0, -1), y + 3.4, { yaw: f.yaw });
  fringe(kit, f, 0, 3.5, 14, 3.25);
  for (const a of [-7, 7]) fringe(kit, f, a, -1, 9, 3.25, true);
  for (let a = -7; a <= 7; a += 3.5) addShape(kit, new CylinderGeometry(0.12, 0.14, 3.3, 8), LOG, ...f.at(a, 3.4), y + 1.65);
  addShape(kit, new BoxGeometry(14, 3.2, 0.3), "#e9e4d8", ...f.at(0, -5.4), y + 1.6, { yaw: f.yaw });
  addShape(kit, new BoxGeometry(4, 1.1, 0.8), "#8a6a48", ...f.at(0, -4.4), y + 0.55, { yaw: f.yaw });
  // Two log pergolas fringed with reed, either side of the front.
  for (const side of [-1, 1]) {
    const a0 = side * 10;
    for (const [a, b] of [[-2.8, 2.5], [2.8, 2.5], [-2.8, -2.5], [2.8, -2.5]]) addShape(kit, new CylinderGeometry(0.1, 0.12, 2.8, 7), LOG, ...f.at(a0 + a, 1 + b), y + 1.4);
    for (let k = 0; k < 9; k++) addShape(kit, new CylinderGeometry(0.06, 0.06, 6, 6), LOG, ...f.at(a0 - 2.8 + k * 0.7, 1), y + 2.85, { yaw: f.yaw, pitch: Math.PI / 2 });
    fringe(kit, f, a0, 3.6, 6.2, 2.85);
    addShape(kit, new BoxGeometry(5, 0.45, 0.6), STONE, ...f.at(a0, -1.2), y + 0.45, { yaw: f.yaw });
    addShape(kit, new BoxGeometry(5, 0.08, 0.6), "#b48a5a", ...f.at(a0, -1.2), y + 0.7, { yaw: f.yaw });
    addTable(kit, f, a0, 1.6, y + 0.15, { top: "#9b7a55", chair: "#8a6a48", round: true });
  }
  // The stone terrace, its steps, the planter, the lawn and the name wall.
  slab(kit, f, 0, 1, 27, 11, PAVING);
  addShape(kit, new BoxGeometry(5, y - f.low + 0.4, 1.2), STONE, ...f.at(0, 7), (y + f.low - 0.4) / 2, { yaw: f.yaw });
  addShape(kit, new BoxGeometry(3, 0.5, 1.4), STONE, ...f.at(0, 3.2), y + 0.4, { yaw: f.yaw });
  for (let k = 0; k < 4; k++) addPot(kit, f, -1 + k * 0.7, 3.2, y + 0.65);
  slab(kit, f, 21, -4, 13, 18, "#5d9440");
  addShape(kit, new BoxGeometry(8, y + 1.2 - f.low + 0.4, 0.5), STONE, ...f.at(16, 6.6), (y + 1.2 + f.low - 0.4) / 2, { yaw: f.yaw });
  for (let k = 0; k < 5; k++) addPot(kit, f, 12.5 + k * 1.5, 5.8, y + 0.12, "#6b8f5c");
}

function addLighthouseTavern(kit, spot, random) {
  const f = frame(spot, TAVERNAS.lighthouse, 12), y = f.base;
  // The white floor of the terrace, the house behind with its blue arches.
  slab(kit, f, 0, 1, 26, 16, "#efeee8");
  addShape(kit, new BoxGeometry(22, 3.3, 5), WHITE, ...f.at(0, -5.5), y + 1.65, { yaw: f.yaw });
  for (let k = 0; k < 4; k++) addShape(kit, new ShapeGeometry(archShape(2.4, 2.8), 6), "#1d4fa3", ...f.at(-7.5 + k * 5, -2.95), y + 0.1, { yaw: f.yaw });
  addShape(kit, new BoxGeometry(14, 6.2, 9), WHITE, ...f.at(4, -14), y + 3.1, { yaw: f.yaw });
  // The terrace roof on white columns banded blue, its beams and awnings.
  addShape(kit, new BoxGeometry(22, 0.25, 9), "#f1efe8", ...f.at(0, 0.5), y + 3.45, { yaw: f.yaw });
  for (let a = -10.5; a <= 10.5; a += 3.5) {
    addShape(kit, new CylinderGeometry(0.17, 0.17, 3.4, 10), WHITE, ...f.at(a, 4.8), y + 1.7);
    addShape(kit, new CylinderGeometry(0.18, 0.18, 0.12, 10), "#1d4fa3", ...f.at(a, 4.8), y + 0.9);
    addShape(kit, new BoxGeometry(3.3, 0.04, 1.6), "#f3eedb", ...f.at(a + 1.75, 5.5), y + 2.9, { yaw: f.yaw, pitch: 0.3 });
  }
  for (let a = -10; a <= 10; a += 1.2) addShape(kit, new BoxGeometry(0.12, 0.2, 9.4), "#f6f4ee", ...f.at(a, 0.5), y + 3.25, { yaw: f.yaw });
  // The fascia's blue top edge (its painted face is a sign).
  addShape(kit, new BoxGeometry(22.4, 0.15, 0.2), "#1d4fa3", ...f.at(0, 5.05), y + 4.82, { yaw: f.yaw });
  addShape(kit, new BoxGeometry(22.2, 1.4, 0.12), "#efc84a", ...f.at(0, 4.92), y + 4.1, { yaw: f.yaw });
  addShape(kit, new BoxGeometry(0.12, 1.4, 9.2), "#efc84a", ...f.at(11.1, 0.5), y + 4.1, { yaw: f.yaw });
  // Blue-and-white tables and chairs, blue benches along the back.
  for (let k = 0; k < 10; k++) addTable(kit, f, -9 + (k % 5) * 4.3, 1 + Math.floor(k / 5) * 2.6 - (k % 2) * 0.4, y + 0.15, { top: "#1d4fa3", chair: "#f4f4f1" });
  for (const a of [-6, 2]) addShape(kit, new BoxGeometry(4.5, 0.7, 0.8), "#1d4fa3", ...f.at(a, -2.4), y + 0.5, { yaw: f.yaw });
  // The ramp on the east side, its white balusters under a blue rail.
  for (let k = 0; k <= 12; k++) addShape(kit, new BoxGeometry(0.05, 0.9, 0.05), WHITE, ...f.at(12.4, 4.5 - k * 0.7), y + 0.55 + k * 0.04);
  addShape(kit, new BoxGeometry(0.08, 0.08, 8.6), "#1d4fa3", ...f.at(12.4, 0.3), y + 1.25, { yaw: f.yaw, pitch: -0.06 });
  addShape(kit, new BoxGeometry(1.6, 0.25, 9), "#bfc3c4", ...f.at(13.2, 0.3), y + 0.15, { yaw: f.yaw });
  // The flagpole, the blue menu stand at the corner, the palms.
  addShape(kit, new CylinderGeometry(0.05, 0.07, 9, 8), WHITE, ...f.at(8, -8), y + 4.5);
  addShape(kit, new BoxGeometry(0.5, 1.2, 0.3), "#1d4fa3", ...f.at(-12.3, 6.5), y + 0.6, { yaw: f.yaw });
  for (const [a, b] of [[-9, -9], [-1, -9.5], [10, -10]]) addPalm(kit, ...f.at(a, b), y, random);
}

function addOasis(kit, spot, random) {
  const f = frame(spot, TAVERNAS.oasis, 8), y = f.base;
  slab(kit, f, 0, 1, 18, 16, "#d3d4cf");
  // The restaurant: white posts and roof, a closed back, the fascia board.
  addShape(kit, new BoxGeometry(10, 0.25, 9), WHITE, ...f.at(-1, -1), y + 3.3, { yaw: f.yaw });
  for (const a of [-6, 4]) addShape(kit, new BoxGeometry(0.25, 3.3, 0.25), WHITE, ...f.at(a, 3.4), y + 1.65, { yaw: f.yaw });
  addShape(kit, new BoxGeometry(10, 3.2, 0.25), "#e6e1d6", ...f.at(-1, -5.4), y + 1.6, { yaw: f.yaw });
  addShape(kit, new BoxGeometry(10.6, 2.4, 0.3), "#c9a26c", ...f.at(-1, 3.5), y + 4.5, { yaw: f.yaw });
  for (const a of [-6.4, 4.4]) fringe(kit, f, a, 1, 5, 4, true);
  // The side canopy with its reed fringe, south of the restaurant.
  addShape(kit, new BoxGeometry(7, 0.12, 8), "#f1efe8", ...f.at(8, 0), y + 3.0, { yaw: f.yaw, roll: 0.05 });
  for (const [a, b] of [[4.6, 3.8], [11.4, 3.8], [11.4, -3.8]]) addShape(kit, new BoxGeometry(0.15, 3, 0.15), WHITE, ...f.at(a, b), y + 1.5, { yaw: f.yaw });
  fringe(kit, f, 8, 4, 7, 2.95);
  // Wooden tables and chairs, potted plants, the lamps of woven cane.
  for (let k = 0; k < 8; k++) addTable(kit, f, -4.5 + (k % 4) * 3, Math.floor(k / 4) * 2.6 - 0.5, y + 0.15, { top: "#8a5a3a", chair: "#6d4a33" });
  for (let k = 0; k < 5; k++) addShape(kit, new ConeGeometry(0.35, 0.5, 10, 1, true), "#c8a46a", ...f.at(-5 + k * 2.4, 0), y + 2.8);
  for (const [a, b] of [[-6.5, 5.5], [-5, 6], [5, 6], [6.5, 5.5], [12, 4.6]]) addPot(kit, f, a, b, y + 0.15, "#4f7f43");
  // The tall date palm behind, and two more.
  for (const [a, b, s] of [[-1, -8, 1.4], [-8, -6, 1], [9, -7, 1]]) {
    const [px, pz] = f.at(a, b);
    addPalm(kit, px, pz, spot.heightAt(px, pz) + (s - 1) * 4, random);
    if (s > 1) addShape(kit, new CylinderGeometry(0.2, 0.26, 4, 7), "#8b7255", px, pz, spot.heightAt(px, pz) + 2);
  }
}

export function addTavernas(kit, spot, random) {
  addZanetos(kit, spot, random);
  addLighthouseTavern(kit, spot, random);
  addOasis(kit, spot, random);
}

// ---- Their painted signs ----

function greekKey(ctx, x, y, w, size, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1, size / 6);
  for (let k = x; k < x + w - size; k += size * 1.2) {
    ctx.beginPath();
    ctx.moveTo(k, y + size);
    ctx.lineTo(k, y);
    ctx.lineTo(k + size, y);
    ctx.lineTo(k + size, y + size * 0.7);
    ctx.lineTo(k + size * 0.35, y + size * 0.7);
    ctx.lineTo(k + size * 0.35, y + size * 0.35);
    ctx.stroke();
  }
}

function drawLighthouseFascia(words, small) {
  return (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#f7e889");
    g.addColorStop(1, "#ecc246");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    greekKey(ctx, 0, h * 0.04, w, h * 0.1, "#b08a2e");
    greekKey(ctx, 0, h * 0.84, w, h * 0.1, "#b08a2e");
    ctx.fillStyle = "#c8202a";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    words.forEach((word, k) => {
      fitFont(ctx, word, (w / words.length) * 0.86, Math.round(h * (small ? 0.42 : 0.56)), 'Impact, "Arial Black", sans-serif');
      ctx.fillText(word, ((k + 0.5) / words.length) * w, h * 0.5);
    });
  };
}

function drawLighthousePediment(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = "#f4e7b0";
  ctx.fill();
  ctx.lineWidth = h * 0.05;
  ctx.strokeStyle = "#1d4fa3";
  ctx.stroke();
  ctx.fillStyle = "#c8202a";
  ctx.fillRect(w * 0.48, h * 0.3, w * 0.04, h * 0.35);
  ctx.fillStyle = "#6b3a1d";
  ctx.fillRect(w * 0.38, h * 0.65, w * 0.24, h * 0.14);
  ctx.fillStyle = "#1d4fa3";
  ctx.textAlign = "center";
  ctx.font = `italic ${Math.round(h * 0.17)}px Georgia, serif`;
  ctx.fillText("Light", w * 0.32, h * 0.55);
  ctx.fillText("House", w * 0.68, h * 0.55);
  ctx.font = `${Math.round(h * 0.1)}px Georgia, serif`;
  ctx.fillText("taverna", w * 0.32, h * 0.72);
  ctx.fillText("cafe bar", w * 0.68, h * 0.72);
}

function drawOasis(ctx, w, h) {
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = k % 2 ? "#d4ad78" : "#c9a26c";
    ctx.fillRect(0, (k / 8) * h, w, h / 8);
    ctx.fillStyle = "rgba(90,60,30,0.35)";
    ctx.fillRect(0, ((k + 1) / 8) * h - 2, w, 2);
  }
  // The palm logo: two trunks, fronds, the sea and the sun.
  const lx = w * 0.13, ly = h * 0.5, s = h * 0.42;
  ctx.fillStyle = "#e8f2f7";
  ctx.beginPath();
  ctx.ellipse(lx, ly + s * 0.65, s * 1.1, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a8ac8";
  ctx.fillRect(lx - s, ly + s * 0.6, s * 2, s * 0.18);
  ctx.fillStyle = "#f6a623";
  ctx.beginPath();
  ctx.arc(lx + s * 0.7, ly + s * 0.35, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  for (const [dx, lean] of [[-0.25, -0.15], [0.15, 0.1]]) {
    ctx.strokeStyle = "#a33a2a";
    ctx.lineWidth = s * 0.12;
    ctx.beginPath();
    ctx.moveTo(lx + dx * s, ly + s * 0.6);
    ctx.quadraticCurveTo(lx + (dx + lean) * s, ly, lx + (dx + lean * 2) * s, ly - s * 0.55);
    ctx.stroke();
    ctx.fillStyle = "#2f9a3a";
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.ellipse(lx + (dx + lean * 2) * s + Math.cos(k * 1.05) * s * 0.28, ly - s * 0.55 + Math.sin(k * 1.05) * s * 0.12, s * 0.3, s * 0.08, k * 1.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#2a63b8";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  fitFont(ctx, "oasis", w * 0.42, Math.round(h * 0.62), '"Comic Sans MS", "Trebuchet MS", sans-serif');
  ctx.fillText("oasis", w * 0.26, h * 0.52);
  ctx.fillStyle = "#2a63b8";
  ctx.fillRect(w * 0.7, h * 0.18, w * 0.28, h * 0.64);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  fitFont(ctx, "RESTAURANT", w * 0.25, Math.round(h * 0.15), "Arial, sans-serif");
  ["RESTAURANT", "TAVERNA", "CAFE"].forEach((word, k) => ctx.fillText(word, w * 0.84, h * (0.32 + k * 0.18)));
}

function drawZanetos(ctx, w, h) {
  ctx.fillStyle = STONE;
  ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < 140; k++) {
    ctx.fillStyle = k % 2 ? "rgba(120,100,70,0.25)" : "rgba(255,250,235,0.25)";
    ctx.fillRect((k * 53) % w, (k * 29) % h, w * 0.06, h * 0.12);
  }
  ctx.fillStyle = "#1c1a18";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitFont(ctx, "Zanetos", w * 0.9, Math.round(h * 0.55), '"Brush Script MT", "Segoe Script", cursive', "italic bold");
  ctx.fillText("Zanetos", w / 2, h * 0.52);
}

function drawGreekFlag(ctx, w, h) {
  for (let k = 0; k < 9; k++) {
    ctx.fillStyle = k % 2 ? "#ffffff" : "#0d5eaf";
    ctx.fillRect(0, (k / 9) * h, w, h / 9 + 1);
  }
  ctx.fillStyle = "#0d5eaf";
  ctx.fillRect(0, 0, (h * 5) / 9, (h * 5) / 9);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect((h * 2) / 9, 0, h / 9, (h * 5) / 9);
  ctx.fillRect(0, (h * 2) / 9, (h * 5) / 9, h / 9);
}

// The signs, each a little proud of its board.
export function tavernaSigns(spot) {
  const signs = [], place = (key, a, b, up, yaw, sign) => {
    const t = TAVERNAS[key], f = frame(spot, t, key === "zanetos" ? 9 : key === "lighthouse" ? 12 : 8), [x, z] = f.at(a, b);
    signs.push({ ...sign, at: [x, f.base + up, z], yaw: f.yaw + yaw });
  };
  place("lighthouse", 0, 5.03, 4.1, 0, { width: 22.2, height: 1.4, draw: drawLighthouseFascia(["COFFEE", "SNACKS", "FOOD", "DRINKS"]) });
  place("lighthouse", 11.17, 0.5, 4.1, Math.PI / 2, { width: 9.2, height: 1.4, draw: drawLighthouseFascia(["COFFEE", "SNACKS", "FOOD", "DRINKS", "SWEETS"], true) });
  place("lighthouse", 0, 5.06, 5.75, 0, { width: 5, height: 1.9, draw: drawLighthousePediment, cutout: true });
  // The Greek flag streams downwind (+x) from the top of its pole.
  const l = frame(spot, TAVERNAS.lighthouse, 12), [px, pz] = l.at(8, -8);
  signs.push({ at: [px + 1, l.base + 8.3, pz], yaw: 0, width: 1.9, height: 1.27, draw: drawGreekFlag, doubleSided: true });
  place("oasis", -1, 3.66, 4.5, 0, { width: 10.6, height: 2.4, draw: drawOasis });
  place("zanetos", 16, 6.86, 0.65, 0, { width: 7.6, height: 1, draw: drawZanetos });
  return signs;
}

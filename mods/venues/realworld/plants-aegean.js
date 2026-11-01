// The plants of Rhodes' dry south, generated in code like Bonaire's (no CC0
// pack has them), each in four variants of a few hundred triangles with its
// foot at the origin:
// - phrygana: the low, rounded, spiny cushions (thorny burnet, thyme,
//   spurge) dotting the hills, grey-green to sun-dried brown in summer;
// - juniper (Juniperus phoenicea): dense, dark shrub-trees combed downwind
//   (+x) by the meltemi;
// - tamarisk (Tamarix): a feathery grey-green crown on a gnarled trunk, the
//   shade by Greek beaches and tavernas; the site places these, not scatter.
// Crowns are clumps that swell and dip smoothly, with normals from their
// centres, so they shade soft rather than faceted.
import { BufferAttribute, CylinderGeometry, IcosahedronGeometry, OctahedronGeometry, Vector3 } from "../lib/three.core.min.js";
import { place, stem } from "./plants.js";

const v = new Vector3();

function clump(radius, detail, random, rough = 0.18) {
  const g = new IcosahedronGeometry(radius, detail), p = g.getAttribute("position"), normals = new Float32Array(p.count * 3);
  const a = random() * 6, b = random() * 6;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    normals.set([v.x, v.y, v.z], i * 3);
    const k = radius * (1 + rough * Math.sin(v.x * 5 + a) * Math.sin(v.y * 4 + b) * Math.sin(v.z * 6 + a + b));
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.setAttribute("normal", new BufferAttribute(normals, 3));
  return g;
}

const pick = (list, random) => list[Math.floor(random() * list.length)];
const PHRYGANA = ["#7f8a63", "#8c8562", "#9a9a74", "#6f7a58", "#a08b5e"];
const JUNIPER = ["#33492c", "#3d5634", "#2f4228"];
const TAMARISK = ["#8a9b80", "#7f9177", "#97a68a"];
const BARK = "#5e5246";

function phrygana(random, far) {
  // Far off, thousands of these are a dot or two each: eight faces will do.
  if (far) return [[new OctahedronGeometry(0.55), PHRYGANA[0], place(0, 0.22, 0, { scale: [1.2, 0.7, 1.1] })]];
  const parts = [], clumps = 1 + Math.floor(random() * 3);
  for (let k = 0; k < clumps; k++) {
    const r = 0.3 + random() * 0.25, a = random() * Math.PI * 2, d = k ? 0.35 + random() * 0.3 : 0;
    // Small enough that 20 faces, shaded round, pass for a cushion.
    parts.push([clump(r, 0, random, 0.22), pick(PHRYGANA, random), place(Math.cos(a) * d, r * 0.35, Math.sin(a) * d, { yaw: random() * 6, scale: [1.15, 0.75, 1.05] })]);
  }
  return parts;
}

function juniper(random, far) {
  const height = 1.6 + random() * 1.6;
  if (far) return [[stem(0.12, 1, 4), BARK, place(0, 0.5, 0)], [new IcosahedronGeometry(1.2, 0), JUNIPER[0], place(0.3, height * 0.6, 0, { scale: [1.3, height / 2.6, 1.1] })]];
  const parts = [], trunks = 2 + Math.floor(random() * 2);
  for (let k = 0; k < trunks; k++) {
    const tall = height * (0.45 + random() * 0.2);
    parts.push([new CylinderGeometry(0.05, 0.1, tall, 5).translate(0, tall / 2, 0), BARK, place((random() - 0.5) * 0.3, 0, (random() - 0.5) * 0.3, { yaw: random() * 6, roll: -0.15 - random() * 0.25 })]);
  }
  const clumps = 4 + Math.floor(random() * 3);
  for (let k = 0; k < clumps; k++) {
    const t = k / (clumps - 1), r = 0.85 - 0.35 * t + random() * 0.15;
    // Rising to the top, and streaming downwind as it goes.
    parts.push([clump(r, 1, random), pick(JUNIPER, random), place(0.15 + t * 0.7 + (random() - 0.5) * 0.4, 0.55 + t * (height - 1.1), (random() - 0.5) * 0.8, { yaw: random() * 6, scale: [1.25, 0.9, 1] })]);
  }
  return parts;
}

function tamarisk(random, far) {
  const trunk = 1.8 + random() * 0.7;
  if (far) return [[stem(0.16, trunk, 4), BARK, place(0, trunk / 2, 0)], [new IcosahedronGeometry(2, 0), TAMARISK[0], place(0, trunk + 1, 0, { scale: [1.3, 0.6, 1.2] })]];
  const lean = (random() - 0.5) * 0.3, top = [Math.sin(-lean) * trunk, Math.cos(lean) * trunk];
  const parts = [[new CylinderGeometry(0.13, 0.24, trunk, 7).translate(0, trunk / 2, 0), BARK, place(0, 0, 0, { roll: lean })]];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + random(), length = 1.2 + random() * 0.6;
    parts.push([new CylinderGeometry(0.05, 0.1, length, 5).translate(0, length / 2, 0), BARK, place(top[0], top[1] - 0.2, 0, { yaw: a, roll: 0.7 })]);
  }
  const clumps = 6 + Math.floor(random() * 3);
  for (let k = 0; k < clumps; k++) {
    const a = random() * Math.PI * 2, d = k ? 0.8 + random() * 1.2 : 0, r = 0.9 + random() * 0.5;
    parts.push([clump(r, 1, random, 0.25), pick(TAMARISK, random), place(top[0] + Math.cos(a) * d, top[1] + 0.9 + random() * 0.9 - d * 0.25, Math.sin(a) * d, { yaw: random() * 6, scale: [1.2, 0.62, 1.2] })]);
  }
  return parts;
}

// How much of the ground is green scrub, 0–1, from the satellite's colour:
// at 10 m a pixel can't show a bush, but the slopes thick with junipers and
// lentisk read darker (lightness under about 90) than bare soil and sand
// (130–150).
export const scrubCover = (spot, x, z) => {
  const [r, g, b] = spot.colourAt(x, z);
  return Math.min(1, Math.max(0, (135 - (0.3 * r + 0.59 * g + 0.11 * b)) / 45));
};

// Densities tuned by eye against the satellite's dotted hills and photos of
// the slopes behind the beach; the kinds' ground codes are spot.json's (3 the
// rocky shore, 4 scrub soil, 5 rock).
export const AEGEAN = {
  kinds: { phrygana, juniper, tamarisk },
  rules: {
    phrygana: { ground: [3, 4, 5], perHectare: 80 },
    juniper: { ground: [4, 5], perHectare: 45, downwind: true, density: scrubCover },
  },
};

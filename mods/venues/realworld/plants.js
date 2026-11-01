// Bonaire's plants, generated in code since no CC0 pack has them, each in
// four variants of a few hundred triangles with its foot at the origin:
// - mangrove (Rhizophora mangle): arching prop roots under a dense, rounded,
//   dark glossy canopy; far off, a single blob;
// - kadushi (Stenocereus griseus): a ribbed grey-green column with arms
//   curving up;
// - divi-divi (Libidibia coriaria): a short trunk leaning downwind (+x) under
//   a flat crown streaming the same way, as the trades shape them;
// - scrub: low, irregular grey-green bushes.
// buildPlants scatters them, or a spot's own (plants-aegean.js), over its
// ground as instanced meshes: thousands of plants for a few draw calls.
// Vendored three.js r185 geometry.
import {
  BufferAttribute, BufferGeometry, Color, CylinderGeometry, Euler, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion,
  QuadraticBezierCurve3, TubeGeometry, Vector3,
} from "../lib/three.core.min.js";
import { seeded } from "../props.js";
import { fillPolygons } from "./raster.js";
import { scatter } from "./scatter.js";

const matrix = new Matrix4(), rotation = new Quaternion(), euler = new Euler(), at = new Vector3(), size = new Vector3();
export const place = (x, y, z, { yaw = 0, pitch = 0, roll = 0, scale = [1, 1, 1] } = {}) =>
  new Matrix4().compose(at.set(x, y, z), rotation.setFromEuler(euler.set(pitch, yaw, roll, "YXZ")), size.set(...scale));

// One non-indexed geometry with vertex colours from parts: [geometry,
// colour, matrix]. Each part's colour varies a little in lightness.
export function merge(parts, random) {
  const positions = [], normals = [], colours = [], colour = new Color();
  for (const [geometry, hex, transform] of parts) {
    const g = (geometry.index ? geometry.toNonIndexed() : geometry).applyMatrix4(transform);
    colour.set(hex).multiplyScalar(0.88 + 0.24 * random());
    const p = g.getAttribute("position"), n = g.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colours.push(colour.r, colour.g, colour.b);
    }
    geometry.dispose();
  }
  const merged = new BufferGeometry();
  merged.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  merged.setAttribute("normal", new BufferAttribute(Float32Array.from(normals), 3));
  merged.setAttribute("color", new BufferAttribute(Float32Array.from(colours), 3));
  return merged;
}

const CANOPY = ["#2c5426", "#335f2b", "#284d24"];

// Far off (each kind's `far` shape), a few dozen triangles: open cylinders
// for trunks and stems, single-facet blobs for crowns.
export const stem = (radius, height, sides = 6) => new CylinderGeometry(radius * 0.9, radius, height, sides, 1, true);

function mangrove(random, far) {
  if (far) return [[stem(0.18, 1.6, 4), "#5b4a3c", place(0, 0.8, 0)], [new IcosahedronGeometry(2.4, 0), CANOPY[0], place(0, 2.8, 0, { scale: [1.25, 0.7, 1.25] })]];
  const parts = [[new CylinderGeometry(0.12, 0.18, 1.6, 6), "#5b4a3c", place(0, 1.2, 0)]];
  const roots = 6 + Math.floor(random() * 4);
  for (let k = 0; k < roots; k++) {
    const a = (k / roots) * Math.PI * 2 + random() * 0.4, r = 1.1 + random() * 0.8;
    const curve = new QuadraticBezierCurve3(new Vector3(0, 1.3, 0), new Vector3(Math.cos(a) * r * 0.55, 1.5, Math.sin(a) * r * 0.55), new Vector3(Math.cos(a) * r, -0.4, Math.sin(a) * r));
    parts.push([new TubeGeometry(curve, 5, 0.045, 3, false), "#6a5847", new Matrix4()]);
  }
  const blobs = 4 + Math.floor(random() * 3);
  for (let k = 0; k < blobs; k++) {
    const a = random() * Math.PI * 2, d = k ? 0.6 + random() * 0.9 : 0, r = 1.1 + random() * 0.7;
    parts.push([new IcosahedronGeometry(r, k < 3 ? 1 : 0), CANOPY[k % 3], place(Math.cos(a) * d, 2.7 + random() * 0.7 - d * 0.3, Math.sin(a) * d, { yaw: random() * 6, scale: [1, 0.72, 1] })]);
  }
  return parts;
}

// A ribbed column: the cylinder's radius swells and dips eight times around.
function ribbed(radius, height, segments) {
  const g = new CylinderGeometry(radius * 0.92, radius, height, 16, segments);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const k = 1 + 0.12 * Math.cos(8 * Math.atan2(p.getZ(i), p.getX(i)));
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function kadushi(random, far) {
  const height = 3.5 + random() * 3, colour = "#6d8862";
  if (far) return [[stem(0.26, height), colour, place(0, height / 2, 0)], ...[0, 2.6].map((a) => [stem(0.18, 1.8, 5), colour, place(Math.cos(a) * 0.62, height * 0.45 + 0.9, Math.sin(a) * 0.62)])];
  const parts = [[ribbed(0.24, height, 3), colour, place(0, height / 2, 0)]];
  const arms = 2 + Math.floor(random() * 3);
  for (let k = 0; k < arms; k++) {
    const a = random() * Math.PI * 2, from = height * (0.3 + random() * 0.3), up = 1.2 + random() * 1.6;
    parts.push([new CylinderGeometry(0.15, 0.17, 0.55, 8), colour, place(Math.cos(a) * 0.38, from, Math.sin(a) * 0.38, { yaw: -a, roll: Math.PI / 2 })]);
    parts.push([ribbed(0.17, up, 1), colour, place(Math.cos(a) * 0.66, from + up / 2 - 0.08, Math.sin(a) * 0.66)]);
  }
  return parts;
}

function diviDivi(random, far) {
  const lean = 0.55 + random() * 0.15, trunk = 2 + random() * 0.8;
  const top = [Math.sin(lean) * trunk, Math.cos(lean) * trunk];
  if (far) return [[stem(0.16, trunk, 4).translate(0, trunk / 2, 0), "#5a4a3a", place(0, 0, 0, { roll: -lean })], [new IcosahedronGeometry(1.3, 0), "#587c33", place(top[0] + 1, top[1], 0, { scale: [2.2, 0.45, 1.3] })]];
  const parts = [[new CylinderGeometry(0.1, 0.18, trunk, 6).translate(0, trunk / 2, 0), "#5a4a3a", place(0, 0, 0, { roll: -lean })]];
  const blobs = 3 + Math.floor(random() * 2);
  for (let k = 0; k < blobs; k++) {
    parts.push([new IcosahedronGeometry(0.9 + random() * 0.4, 1), k % 2 ? "#587c33" : "#4f7230",
      place(top[0] - 0.3 + k * 0.85 + random() * 0.3, top[1] + 0.1 - k * 0.12, (random() - 0.5) * 0.9, { scale: [1.7, 0.42, 1.2] })]);
  }
  return parts;
}

function scrub(random, far) {
  if (far) return [[new IcosahedronGeometry(0.8, 0), "#737f5a", place(0, 0.44, 0, { scale: [1.3, 0.75, 1.2] })]];
  const parts = [], blobs = 2 + Math.floor(random() * 2);
  for (let k = 0; k < blobs; k++) {
    const r = 0.55 + random() * 0.45;
    parts.push([new IcosahedronGeometry(r, 0), k % 2 ? "#6c7a50" : "#7c8564", place((random() - 0.5) * 1.2, r * 0.55, (random() - 0.5) * 1.2, { yaw: random() * 6, scale: [1.2, 0.75, 1.1] })]);
  }
  return parts;
}

const KINDS = { mangrove, kadushi, diviDivi, scrub };

// The geometry of a plant's variant (0–3); { far } for its far shape;
// kinds: the generators to take it from (Bonaire's by default).
export function plantGeometry(kind, variant, { far = false, kinds = KINDS } = {}) {
  const random = seeded(1 + variant * 97 + Object.keys(kinds).indexOf(kind) * 13);
  return merge(kinds[kind](random, far), random);
}

// Densities tuned by eye against the satellite colours, and down for the
// frame time on the development machine.
const RULES = {
  mangrove: { ground: [6], perHectare: 60 },
  kadushi: { ground: [4, 5], perHectare: 15 },
  diviDivi: { ground: [4], perHectare: 6, downwind: true },
  scrub: { ground: [4], perHectare: 25 },
};
const NEAR = 600; // metres from the course within which plants show their detail
const SHORE_CLEAR = 0.3; // metres above the water a land plant needs

// The spot's plants within radius of the course, as instanced meshes in one
// group. The beaches and buildings stay clear; mangroves grow in their
// polygons, standing in the water where those reach into it. flora: { kinds,
// rules, fixed } for a spot with plants of its own, Bonaire's by default;
// fixed(spot) gives { kind: [[x, z], ...] }, plants its site places itself.
export function buildPlants(spot, { radius = 1500, seed = 2026, flora = { kinds: KINDS, rules: RULES } } = {}) {
  const { half } = spot.manifest.detail, cells = 1250, cell = (2 * half) / cells;
  const clear = fillPolygons([...spot.features.beaches, ...spot.features.buildings.map((b) => b.footprint)], half, cells);
  const { drySand, mangrove: mangroveGround } = spot.manifest.ground;
  const ground = {
    heightAt: spot.heightAt,
    colourAt: spot.colourAt,
    groundAt: (x, z) => {
      if (spot.isMangrove(x, z)) return mangroveGround;
      const i = Math.floor((x + half) / cell), j = Math.floor((z + half) / cell);
      if (clear[j * cells + i] || spot.heightAt(x, z) < SHORE_CLEAR) return drySand;
      return spot.groundAt(x, z);
    },
  };
  const placed = scatter(ground, flora.rules, { half: radius, seed });
  for (const [kind, at] of Object.entries(flora.fixed?.(spot) ?? {})) {
    const random = seeded(seed + kind.length);
    placed[kind] = [...(placed[kind] ?? []), ...at.map(([x, z]) => ({ x, y: spot.heightAt(x, z), z, scale: 0.85 + 0.3 * random(), yaw: random() * Math.PI * 2, variant: Math.floor(random() * 4) }))];
  }
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const group = new Group();
  group.name = "plants";
  const random = seeded(seed), tint = new Color();
  const add = (kind, geometry, points) => {
    if (!points.length) return geometry.dispose();
    const mesh = new InstancedMesh(geometry, material, points.length);
    points.forEach((p, k) => {
      mesh.setMatrixAt(k, place(p.x, p.y - 0.15 * p.scale, p.z, { yaw: p.yaw, scale: [p.scale, p.scale, p.scale] }));
      mesh.setColorAt(k, tint.setScalar(0.85 + 0.25 * random()));
    });
    mesh.matrixAutoUpdate = false;
    mesh.computeBoundingSphere();
    mesh.userData.kind = kind;
    group.add(mesh);
  };
  for (const [kind, all] of Object.entries(placed)) {
    // Plants shaped by the wind keep their lean downwind; the others turn any way.
    const points = all.filter((p) => Math.hypot(p.x, p.z) <= radius).map((p) => (flora.rules[kind]?.downwind ? { ...p, yaw: (p.yaw - Math.PI) * 0.08 } : p));
    const near = points.filter((p) => Math.hypot(p.x, p.z) <= NEAR);
    for (let variant = 0; variant < 4; variant++) add(kind, plantGeometry(kind, variant, { kinds: flora.kinds }), near.filter((p) => p.variant === variant));
    add(kind, plantGeometry(kind, 0, { far: true, kinds: flora.kinds }), points.filter((p) => Math.hypot(p.x, p.z) > NEAR));
  }
  return group;
}

// OpenStreetMap footprints raised to their heights: walls facing out and a
// flat roof, standing on the lowest ground under the footprint. Footprints
// are [x, z] rings, closed or not, in either direction.
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from "../lib/three.core.min.js";

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
    vertex(ax, base, az, nx, 0, nz, u0, 0); vertex(bx, top, bz, nx, 0, nz, u1, v1); vertex(bx, base, bz, nx, 0, nz, u1, 0);
    vertex(ax, base, az, nx, 0, nz, u0, 0); vertex(ax, top, az, nx, 0, nz, u0, v1); vertex(bx, top, bz, nx, 0, nz, u1, v1);
    along += length;
  }
  // The ear clipping winds counter-clockwise in (x, z), which is clockwise
  // seen from above, so each roof triangle is laid down the other way round.
  const roof = earClip(pts);
  for (let t = roof.length - 1; t >= 0; t--) vertex(pts[roof[t]][0], top, pts[roof[t]][1], 0, 1, 0, pts[roof[t]][0] / 10, pts[roof[t]][1] / 10);
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), uvs: Float32Array.from(uvs), roofTriangles: roof.length / 3 };
}

// One 3 m bay of plastered wall with a shuttered window.
function wallTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 900; k++) {
    context.fillStyle = k % 2 ? "rgba(0,0,0,.035)" : "rgba(255,255,255,.05)";
    context.fillRect((k * 37) % 128, (k * 59) % 128, 2, 2);
  }
  context.fillStyle = "#3f4b52";
  context.fillRect(44, 36, 40, 46);
  context.fillStyle = "#5f8f9a";
  context.fillRect(36, 36, 8, 46);
  context.fillRect(84, 36, 8, 46);
  context.fillStyle = "rgba(0,0,0,.18)";
  context.fillRect(0, 124, 128, 4);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// The island's walls: white, ochre and pastels; grey roofs, terracotta on
// houses; the beach's open shade roofs, kind "roof", stand on posts.
const WALLS = ["#f3efe6", "#f3efe6", "#e9c46a", "#f2b880", "#a8d8dc", "#f1e3c6", "#e5a3a6", "#cfe3b8"];
const ROOFS = { house: "#b5543a", roof: "#a88c5f" };
const SHADE = 2.6; // metres up to a shade roof
const POST = new Color("#7a6347");

// A square wooden post, 0.16 m across, from y0 to y1 at (x, z).
function post(x, z, y0, y1, out) {
  const r = 0.08;
  for (const [nx, nz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const ax = x + (nx - nz) * r, az = z + (nz + nx) * r, bx = x + (nx + nz) * r, bz = z + (nz - nx) * r;
    for (const [px, py, pz] of [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y0, az], [bx, y1, bz], [ax, y1, az]]) {
      out.positions.push(px, py, pz);
      out.normals.push(nx, 0, nz);
      out.uvs.push(0, 0);
      out.colours.push(POST.r, POST.g, POST.b);
    }
  }
}

// Every building within radius of the course, in one mesh: the walls with
// their windows, and everything plain (roofs, shade roofs, posts) apart, so
// the far roofs don't take the windows' colour as the texture shrinks.
export function buildBuildings(spot, { radius = 2500 } = {}) {
  const walls = { positions: [], normals: [], uvs: [], colours: [] }, plain = { positions: [], normals: [], uvs: [], colours: [] };
  const wall = new Color(), roofColour = new Color();
  for (const { footprint, height, kind } of spot.features.buildings) {
    if (!footprint.some(([x, z]) => Math.hypot(x, z) <= radius)) continue;
    const shade = kind === "roof", g = extrudeFootprint(footprint, shade ? 0.3 : height, spot.heightAt);
    const hash = Math.abs(Math.round(footprint[0][0] * 7 + footprint[0][1] * 13));
    wall.set(shade ? ROOFS.roof : WALLS[hash % WALLS.length]);
    roofColour.set(ROOFS[kind] ?? "#c9c5bc");
    const roofStart = g.positions.length / 3 - g.roofTriangles * 3;
    for (let i = 0; i < g.positions.length / 3; i++) {
      const isRoof = i >= roofStart, c = isRoof ? roofColour : wall, out = isRoof || shade ? plain : walls;
      out.positions.push(g.positions[i * 3], g.positions[i * 3 + 1] + (shade ? SHADE : 0), g.positions[i * 3 + 2]);
      out.normals.push(g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]);
      out.uvs.push(g.uvs[i * 2], g.uvs[i * 2 + 1]);
      out.colours.push(c.r, c.g, c.b);
    }
    if (shade) for (const [x, z] of footprint.slice(0, -1)) post(x, z, spot.heightAt(x, z) - 0.2, g.positions[1] + SHADE, plain);
  }
  const geometry = new BufferGeometry(), all = (name) => Float32Array.from([...walls[name], ...plain[name]]);
  geometry.setAttribute("position", new BufferAttribute(all("positions"), 3));
  geometry.setAttribute("normal", new BufferAttribute(all("normals"), 3));
  geometry.setAttribute("uv", new BufferAttribute(all("uvs"), 2));
  geometry.setAttribute("color", new BufferAttribute(all("colours"), 3));
  const wallCount = walls.positions.length / 3;
  geometry.addGroup(0, wallCount, 0);
  geometry.addGroup(wallCount, plain.positions.length / 3, 1);
  const material = (map) => new MeshStandardMaterial({ vertexColors: true, map, roughness: 0.9, metalness: 0, side: DoubleSide });
  const mesh = new Mesh(geometry, [material(typeof document === "undefined" ? null : wallTexture()), material(null)]);
  mesh.name = "buildings";
  mesh.matrixAutoUpdate = false;
  return mesh;
}

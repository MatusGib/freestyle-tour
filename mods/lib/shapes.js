// Building low-poly animals from three.js's own geometry (the venues mod's
// copy of the r185 the game runs).
import {
  BufferGeometry, Color, Euler, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial,
  Quaternion, Vector3,
} from "../venues/lib/three.core.min.js";

const matrix = new Matrix4(), rotation = new Quaternion(), euler = new Euler(), at = new Vector3(), size = new Vector3();
const colour = new Color();

// A smooth body along x: a ring at each station [x, half height, half width,
// raise], closed at both ends; rings of `around` points.
export function bodyGeometry(stations, around = 12) {
  const positions = [], index = [];
  for (const [x, high, wide, raise] of stations) {
    for (let j = 0; j < around; j++) {
      const angle = j / around * Math.PI * 2;
      positions.push(x, raise + high * Math.sin(angle), wide * Math.cos(angle));
    }
  }
  const rings = stations.length, nose = rings * around, tail = nose + 1;
  const [first, last] = [stations[0], stations[rings - 1]];
  positions.push(first[0] + first[1] * .5, first[3], 0, last[0] - last[1] * .5, last[3], 0);
  const at = (ring, j) => ring * around + (j % around);
  for (let ring = 0; ring < rings - 1; ring++) {
    for (let j = 0; j < around; j++) {
      index.push(at(ring, j), at(ring + 1, j + 1), at(ring + 1, j), at(ring, j), at(ring, j + 1), at(ring + 1, j + 1));
    }
  }
  for (let j = 0; j < around; j++) index.push(nose, at(0, j + 1), at(0, j), tail, at(rings - 1, j), at(rings - 1, j + 1));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

const next = new Color();
// The colour at height y between shade's stops, [[y, colour], ...] from low to high.
function shadeAt(shade, y) {
  if (y <= shade[0][0]) return colour.set(shade[0][1]);
  for (let i = 1; i < shade.length; i++) {
    const [[low, from], [high, to]] = [shade[i - 1], shade[i]];
    if (y <= high) return colour.set(from).lerp(next.set(to), (y - low) / (high - low));
  }
  return colour.set(shade.at(-1)[1]);
}

// Bakes parts into one geometry coloured by its vertices. Each part is scaled,
// turned and moved; with under, its faces lower than split below its middle
// take that colour, for a pale belly. With shade instead, each corner takes
// the colour at its height, blending smoothly, as an animal's countershading.
export function bake(parts) {
  const positions = [], colours = [];
  for (const { geometry, fill, under = fill, split = 0, shade, move = [0, 0, 0], turn = [0, 0, 0], scale = [1, 1, 1] } of parts) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    flat.applyMatrix4(matrix.compose(at.set(...move), rotation.setFromEuler(euler.set(...turn)), size.set(...scale)));
    const position = flat.getAttribute("position");
    for (let i = 0; i < position.count; i += 3) {
      const low = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3 < move[1] + split;
      for (let corner = 0; corner < 3; corner++) {
        const { r, g, b } = shade ? shadeAt(shade, position.getY(i + corner)) : colour.set(low ? under : fill);
        colours.push(r, g, b);
      }
    }
    positions.push(...position.array);
    geometry.dispose();
    flat.dispose();
  }
  const baked = new BufferGeometry();
  baked.setAttribute("position", new Float32BufferAttribute(positions, 3));
  baked.setAttribute("color", new Float32BufferAttribute(colours, 3));
  baked.computeVertexNormals();
  return baked;
}

export const bakedMaterial = () => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .45 });

// White droplets for splashes, placed one by one each frame. They move
// about, so three.js mustn't cull them by where they first were.
export function makeDroplets(count) {
  const drops = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ color: "#f4fbff", roughness: .2 }), count);
  drops.frustumCulled = false;
  drops.count = 0;
  return drops;
}

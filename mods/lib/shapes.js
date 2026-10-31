// Building low-poly animals from three.js's own geometry (the venues mod's
// copy of the r185 the game runs).
import {
  BufferGeometry, Color, Euler, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial,
  Quaternion, Vector3,
} from "../venues/lib/three.core.min.js";

const matrix = new Matrix4(), rotation = new Quaternion(), euler = new Euler(), at = new Vector3(), size = new Vector3();
const colour = new Color();

// Bakes parts into one geometry coloured by its vertices. Each part is scaled,
// turned and moved; with under, its faces lower than split below its middle
// take that colour, for a pale belly.
export function bake(parts) {
  const positions = [], colours = [];
  for (const { geometry, fill, under = fill, split = 0, move = [0, 0, 0], turn = [0, 0, 0], scale = [1, 1, 1] } of parts) {
    const flat = geometry.toNonIndexed();
    flat.applyMatrix4(matrix.compose(at.set(...move), rotation.setFromEuler(euler.set(...turn)), size.set(...scale)));
    const position = flat.getAttribute("position");
    for (let i = 0; i < position.count; i += 3) {
      const low = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3 < move[1] + split;
      colour.set(low ? under : fill);
      for (let corner = 0; corner < 3; corner++) colours.push(colour.r, colour.g, colour.b);
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

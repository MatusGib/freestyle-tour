// The fish and the splash droplets, built with three.js's own geometry (the
// venues mod's copy of the r185 the game runs). A fish is 0.75 m long, nose
// on +x: one flat-shaded mesh coloured by its vertices, and its tail apart so
// it can wag.
import {
  BufferGeometry, Color, ConeGeometry, Euler, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh,
  Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3,
} from "../venues/lib/three.core.min.js";

const matrix = new Matrix4(), rotation = new Quaternion(), euler = new Euler(), at = new Vector3(), size = new Vector3();
const colour = new Color();

// Bakes parts into one geometry coloured by its vertices. Each part is scaled,
// turned and moved; with under, its faces lower than split below its middle
// take that colour, for a fish's pale belly.
function bake(parts) {
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

export const fishMaterial = () => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .45 });

// A round little fish with big eyes, a fin on its back and one on each side.
// colours: body, belly, fins.
export function makeFish([body, belly, fins], material) {
  const eyes = [1, -1].flatMap((side) => [
    { geometry: new SphereGeometry(.075, 8, 6), fill: "#ffffff", move: [.2, .07, .125 * side] },
    { geometry: new SphereGeometry(.045, 8, 6), fill: "#1d1d2b", move: [.235, .075, .165 * side] },
    { geometry: new SphereGeometry(.016, 6, 4), fill: "#ffffff", move: [.255, .1, .2 * side] },
  ]);
  const sideFins = [1, -1].map((side) => ({
    geometry: new ConeGeometry(.07, .17, 3), fill: fins, move: [.06, -.1, .15 * side], turn: [0, .5 * side, 2], scale: [1, 1, .35],
  }));
  const fish = new Group();
  fish.add(new Mesh(bake([
    { geometry: new IcosahedronGeometry(1, 1), fill: body, under: belly, split: -.07, scale: [.36, .25, .18] },
    { geometry: new ConeGeometry(.13, .22, 3), fill: fins, move: [-.04, .27, 0], turn: [0, 0, .5], scale: [1, 1, .3] },
    ...sideFins,
    ...eyes,
  ]), material));
  const tail = new Mesh(bake([
    { geometry: new ConeGeometry(.17, .28, 4), fill: fins, move: [-.14, 0, 0], turn: [0, 0, -Math.PI / 2], scale: [1, 1, .25] },
  ]), material);
  tail.position.x = -.3;
  fish.add(tail);
  return { fish, tail };
}

// White droplets for the splashes, placed one by one each frame. They move
// about, so three.js mustn't cull them by where they first were.
export function makeDroplets(count) {
  const drops = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ color: "#f4fbff", roughness: .2 }), count);
  drops.frustumCulled = false;
  drops.count = 0;
  return drops;
}

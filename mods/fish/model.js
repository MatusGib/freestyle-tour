// The fish, built with three.js's own geometry (the venues mod's copy of the
// r185 the game runs). A fish is 0.75 m long, nose on +x: one flat-shaded
// mesh coloured by its vertices, and its tail apart so it can wag.
import { ConeGeometry, Group, IcosahedronGeometry, Mesh, SphereGeometry } from "../venues/lib/three.core.min.js";
import { bake } from "../lib/shapes.js";

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

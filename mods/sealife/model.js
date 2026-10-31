// The dolphins and the whale, built with three.js's own geometry (the venues
// mod's copy of the r185 the game runs), nose on +x: one flat-shaded mesh
// coloured by its vertices each, and the tail flukes apart so they can beat.
import { ConeGeometry, Group, IcosahedronGeometry, Mesh, SphereGeometry } from "../venues/lib/three.core.min.js";
import { bake } from "../lib/shapes.js";

// Dark eyes of radius r at (x, y, ±z), each with a glint.
const eyes = (x, y, z, r) => [1, -1].flatMap((side) => [
  { geometry: new SphereGeometry(r, 8, 6), fill: "#1d1d2b", move: [x, y, z * side] },
  { geometry: new SphereGeometry(r * .35, 6, 4), fill: "#ffffff", move: [x + r * .4, y + r * .45, (z + r * .75) * side] },
]);

// Flat flukes spreading sideways from x = 0 back to -length.
const flukes = (span, length, fill, material) => new Mesh(bake([
  { geometry: new ConeGeometry(span, length, 4), fill, move: [-length / 2, 0, 0], turn: [0, 0, -Math.PI / 2], scale: [.25, 1, 1] },
]), material);

// A bottlenose dolphin, 2.2 m long: grey-blue with a pale belly, a beak, a
// curved back fin and two flippers.
export function makeDolphin(material) {
  const body = "#7b8ea6", belly = "#e3eaf1";
  const flippers = [1, -1].map((side) => ({
    geometry: new ConeGeometry(.09, .34, 3), fill: body, move: [.3, -.2, .26 * side], turn: [0, .6 * side, 2.1], scale: [1, 1, .3],
  }));
  const dolphin = new Group();
  dolphin.add(new Mesh(bake([
    { geometry: new IcosahedronGeometry(1, 1), fill: body, under: belly, split: -.06, scale: [1, .32, .3] },
    { geometry: new ConeGeometry(.11, .34, 6), fill: body, under: belly, move: [1.08, -.05, 0], turn: [0, 0, -Math.PI / 2] },
    { geometry: new ConeGeometry(.2, .52, 6), fill: body, move: [-1.1, 0, 0], turn: [0, 0, Math.PI / 2], scale: [1, 1, .7] },
    { geometry: new ConeGeometry(.15, .42, 3), fill: body, move: [-.1, .4, 0], turn: [0, 0, .6], scale: [1, 1, .3] },
    ...flippers,
    ...eyes(.7, .06, .19, .045),
  ]), material));
  const tail = flukes(.32, .3, body, material);
  tail.position.x = -1.3;
  dolphin.add(tail);
  return { animal: dolphin, flukes: tail };
}

// A humpback, about 13 m long: slate with a white belly, long white flippers
// and a small hump on its back.
export function makeWhale(material) {
  const body = "#3d4b5f", belly = "#eef2f5";
  const flippers = [1, -1].map((side) => ({
    geometry: new ConeGeometry(.45, 3.4, 4), fill: belly, move: [1.4, -.7, 1.8 * side], turn: [0, .5 * side, 2], scale: [1, 1, .25],
  }));
  const whale = new Group();
  whale.add(new Mesh(bake([
    { geometry: new IcosahedronGeometry(1, 2), fill: body, under: belly, split: -.4, scale: [5, 1.5, 1.7] },
    { geometry: new ConeGeometry(.8, 2.4, 8), fill: body, move: [-5.4, 0, 0], turn: [0, 0, Math.PI / 2], scale: [1, 1, .9] },
    { geometry: new ConeGeometry(.35, .7, 4), fill: body, move: [-2.4, 1.4, 0], turn: [0, 0, .6], scale: [1, 1, .5] },
    ...flippers,
    ...eyes(3.3, .1, 1.18, .13),
  ]), material));
  const tail = flukes(2, 1.6, body, material);
  tail.position.x = -6.4;
  whale.add(tail);
  return { animal: whale, flukes: tail };
}

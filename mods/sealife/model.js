// The dolphins and the whale, built with three.js's own geometry (the venues
// mod's copy of the r185 the game runs), nose on +x: one flat-shaded mesh
// coloured by its vertices each, and the tail flukes apart so they can beat.
import { ConeGeometry, ExtrudeGeometry, Group, IcosahedronGeometry, Mesh, Shape, SphereGeometry } from "../venues/lib/three.core.min.js";
import { bake, bodyGeometry } from "../lib/shapes.js";

// Dark eyes of radius r at (x, y, ±z), each with a glint.
const eyes = (x, y, z, r) => [1, -1].flatMap((side) => [
  { geometry: new SphereGeometry(r, 8, 6), fill: "#1d1d2b", move: [x, y, z * side] },
  { geometry: new SphereGeometry(r * .35, 6, 4), fill: "#ffffff", move: [x + r * .4, y + r * .45, (z + r * .75) * side] },
]);

// Flat flukes spreading sideways from x = 0 back to -length.
const flukes = (span, length, fill, material) => new Mesh(bake([
  { geometry: new ConeGeometry(span, length, 4), fill, move: [-length / 2, 0, 0], turn: [0, 0, -Math.PI / 2], scale: [.25, 1, 1] },
]), material);

// A thin cut-out of a shape drawn in x (forward) and y, depth thick, centred.
const cutOut = (draw, depth) => {
  const shape = new Shape();
  draw(shape);
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -depth / 2);
};

// A bottlenose dolphin's shape, nose to tail, 2.5 m: a short beak, the
// rounded melon above it, thickest a third of the way back, then a long taper
// to a narrow tail stock, taller than it is wide. [x, half height, half width,
// raise]
const DOLPHIN_BODY = [
  [1.25, .025, .025, -.06], [1.17, .045, .045, -.055], [1.07, .06, .06, -.05], [1.02, .1, .09, -.01],
  [.95, .17, .15, .03], [.82, .23, .2, .03], [.6, .28, .25, .02], [.35, .31, .27, .01], [.1, .31, .27, 0],
  [-.2, .28, .23, 0], [-.5, .22, .16, 0], [-.75, .15, .09, 0], [-.95, .1, .05, 0], [-1.12, .055, .03, 0],
  [-1.22, .03, .02, 0],
];

// A bottlenose dolphin, 2.5 m long: shaded from a dark grey back through grey
// sides to a pale belly, with a hooked back fin, swept-back flippers and
// crescent flukes.
export function makeDolphin(material) {
  const back = "#424b55";
  const flippers = [1, -1].map((side) => ({
    geometry: cutOut((s) => s.moveTo(.07, 0).quadraticCurveTo(.02, -.16, -.2, -.26).quadraticCurveTo(-.08, -.1, -.07, 0).lineTo(.07, 0), .025),
    fill: back, move: [.55, -.17, .2 * side], turn: [-.7 * side, 0, .15],
  }));
  const dolphin = new Group();
  dolphin.add(new Mesh(bake([
    { geometry: bodyGeometry(DOLPHIN_BODY, 12), shade: [[-.17, "#e4e8eb"], [-.09, "#a9b2bb"], [0, "#69737e"], [.12, back]] },
    { geometry: cutOut((s) => s.moveTo(.2, 0).quadraticCurveTo(.1, .3, -.18, .36).quadraticCurveTo(-.1, .16, -.2, 0).lineTo(.2, 0), .035), fill: back, move: [-.05, .25, 0] },
    ...flippers,
    ...eyes(.88, 0, .165, .022),
  ]), material));
  const tail = new Mesh(bake([{
    geometry: cutOut((s) => s.moveTo(0, .05).quadraticCurveTo(-.1, .22, -.26, .4).quadraticCurveTo(-.24, .18, -.34, .05).lineTo(-.3, 0)
      .lineTo(-.34, -.05).quadraticCurveTo(-.24, -.18, -.26, -.4).quadraticCurveTo(-.1, -.22, 0, -.05).lineTo(0, .05), .03),
    fill: back, turn: [Math.PI / 2, 0, 0],
  }]), material);
  tail.position.x = -1.2;
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
    { geometry: new IcosahedronGeometry(1, 2), shade: [[-.9, belly], [-.3, "#8e9aa8"], [.3, body]], scale: [5, 1.5, 1.7] },
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

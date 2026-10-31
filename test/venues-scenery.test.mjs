// The analytic coasts' scenery, built against stand-ins for the game's
// objects: it stays exactly what it was when each venue got its own builder
// file (mods/venues/sites/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene } from "../mods/venues/lib/three.core.min.js";
import { mountVenueScenery } from "../mods/venues/scenery.js";

function build(id) {
  const template = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
  const game = { scene: new Scene(), areaArrow: { fill: { geometry: new BoxGeometry(1, 1, 1) }, group: new Group() }, buoys: { buoys: [{ buoy: { children: [template] } }] } };
  mountVenueScenery(game, { id }, { sand: null, windows: null });
  let vertices = 0, sum = 0;
  for (const mesh of game.__venueScenery.children) {
    const p = mesh.geometry.getAttribute("position");
    vertices += p.count;
    for (let i = 0; i < p.array.length; i += 7) sum += p.array[i] * ((i % 13) + 1);
  }
  return [game.__venueScenery.children.length, vertices, sum.toFixed(1)];
}

test("Sotavento and Sylt build the same scenery as before their builders moved", () => {
  assert.deepEqual(build("sotavento-fuerteventura"), [40, 226006, "-244480069.3"]);
  assert.deepEqual(build("westerland-sylt"), [42, 273713, "-1167322.3"]);
});

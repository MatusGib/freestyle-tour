// The plants of Rhodes' dry south, generated in code, and a spot choosing
// its own plants.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AEGEAN } from "../mods/venues/realworld/plants-aegean.js";
import { buildPlants, plantGeometry } from "../mods/venues/realworld/plants.js";

const bounds = (g) => {
  g.computeBoundingBox();
  return g.boundingBox;
};
const HEIGHTS = { phrygana: [0.25, 1.2], juniper: [1.4, 4.5], tamarisk: [3, 7.5] };

test("each Aegean plant comes in four variants, coloured, under 1500 triangles, at its height", () => {
  for (const [kind, [low, high]] of Object.entries(HEIGHTS)) for (let variant = 0; variant < 4; variant++) {
    const g = plantGeometry(kind, variant, { kinds: AEGEAN.kinds }), triangles = g.getAttribute("position").count / 3;
    assert.ok(triangles > 10 && triangles < 1500, `${kind} ${variant}: ${triangles} triangles`);
    assert.equal(g.getAttribute("color").count, g.getAttribute("position").count);
    const box = bounds(g);
    assert.ok(box.min.y >= -0.6 && box.min.y <= 0.1, `${kind} ${variant} starts at its foot: ${box.min.y}`);
    assert.ok(box.max.y > low && box.max.y < high, `${kind} ${variant} height ${box.max.y}`);
  }
});

test("far off, each Aegean plant is a few dozen triangles", () => {
  for (const kind of Object.keys(HEIGHTS)) {
    const g = plantGeometry(kind, 0, { far: true, kinds: AEGEAN.kinds }), box = bounds(g);
    assert.ok(g.getAttribute("position").count / 3 <= 40, `${kind}: ${g.getAttribute("position").count / 3} triangles`);
    assert.ok(box.min.y <= 0.1 && box.max.y > 0.25, `${kind} from ${box.min.y} to ${box.max.y}`);
  }
});

test("a spot's own plants grow by its rules on its ground", () => {
  const spot = {
    manifest: { detail: { half: 200 }, ground: { drySand: 1, mangrove: 6 } },
    features: { beaches: [], buildings: [] },
    heightAt: () => 5, isMangrove: () => false, colourAt: (x) => (x < 0 ? [70, 80, 50] : [150, 135, 100]),
    groundAt: (x) => (x < 0 ? 4 : 5),
  };
  const group = buildPlants(spot, { radius: 150, flora: AEGEAN });
  const counts = Object.fromEntries(Object.keys(HEIGHTS).map((k) => [k, 0]));
  for (const mesh of group.children) counts[mesh.userData.kind] += mesh.count;
  assert.ok(counts.phrygana > 100, `phrygana: ${counts.phrygana}`);
  assert.ok(counts.juniper > 50 && counts.juniper < counts.phrygana, `juniper: ${counts.juniper}`);
  const juniperX = group.children.filter((m) => m.userData.kind === "juniper").flatMap((m) => Array.from({ length: m.count }, (_, k) => m.instanceMatrix.array[k * 16 + 12]));
  assert.ok(juniperX.every((x) => x < 0), "junipers grow where the satellite reads dark scrub, not on the light bare ground");
  assert.equal(counts.tamarisk, 0, "tamarisks are placed by the site, not scattered");
});

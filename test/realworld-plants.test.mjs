// Bonaire's plants, generated in code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { plantGeometry } from "../mods/venues/realworld/plants.js";

const bounds = (g) => {
  g.computeBoundingBox();
  return g.boundingBox;
};

test("each plant comes in four variants, coloured, under 1500 triangles, standing at its foot", () => {
  for (const kind of ["mangrove", "kadushi", "diviDivi", "scrub"]) for (let variant = 0; variant < 4; variant++) {
    const g = plantGeometry(kind, variant), triangles = g.getAttribute("position").count / 3;
    assert.ok(triangles > 10 && triangles < 1500, `${kind} ${variant}: ${triangles} triangles`);
    assert.equal(g.getAttribute("color").count, g.getAttribute("position").count);
    const box = bounds(g);
    assert.ok(box.min.y >= -1 && box.min.y <= 0.1, `${kind} ${variant} starts at its foot: ${box.min.y}`);
    assert.ok(box.max.y > 0.8 && box.max.y < 9, `${kind} ${variant} height ${box.max.y}`);
  }
});

test("a divi-divi leans and streams downwind (+x)", () => {
  for (let variant = 0; variant < 4; variant++) {
    const box = bounds(plantGeometry("diviDivi", variant));
    assert.ok(box.max.x > -box.min.x + 1.5, `variant ${variant}: ${box.min.x} to ${box.max.x}`);
  }
});

test("far off, each plant is a simple shape of a few dozen triangles, still standing at its foot", () => {
  for (const kind of ["mangrove", "kadushi", "diviDivi", "scrub"]) {
    const g = plantGeometry(kind, 0, { far: true }), box = bounds(g);
    assert.ok(g.getAttribute("position").count / 3 <= 40, `${kind}: ${g.getAttribute("position").count / 3} triangles`);
    assert.ok(box.min.y <= 0.1 && box.max.y > 0.8, `${kind} from ${box.min.y} to ${box.max.y}`);
  }
});

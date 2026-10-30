import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUND, groundType } from "../tools/spot/ground.mjs";

test("map polygons decide first, then the shore, then the colour", () => {
  const at = (over) => groundType({ land: 1, shore: 200, colour: [150, 140, 120], mangrove: 0, beach: 0, building: 0, ...over });
  assert.equal(at({ land: 0 }), GROUND.water);
  assert.equal(at({ mangrove: 1 }), GROUND.mangrove);
  assert.equal(at({ building: 1 }), GROUND.builtUp);
  assert.equal(at({ beach: 1, shore: 30 }), GROUND.drySand);
  assert.equal(at({ shore: 4 }), GROUND.wetSand);
  assert.equal(at({ colour: [120, 140, 90] }), GROUND.scrubSoil, "green");
  assert.equal(at({ colour: [225, 220, 205], shore: 60 }), GROUND.drySand, "bright near the shore");
  assert.equal(at({ colour: [225, 220, 205], shore: 400 }), GROUND.rock, "bright inland: limestone");
  assert.equal(at({ colour: [160, 155, 145], shore: 30 }), GROUND.coralRubble);
  assert.equal(at({ colour: [80, 75, 70] }), GROUND.rock);
});

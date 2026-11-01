// A site's landmarks go into one mesh, coloured by its vertices.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BoxGeometry } from "../mods/venues/lib/three.core.min.js";
import { addShape } from "../mods/venues/props.js";
import { landmarkKit } from "../mods/venues/realworld/mount.js";

test("landmarks of many colours make one mesh, one draw call, each shape keeping its colour and normals", () => {
  const { kit, finish } = landmarkKit();
  addShape(kit, new BoxGeometry(1, 1, 1), "#ff0000", 0, 0, 0);
  addShape(kit, new BoxGeometry(1, 1, 1), "#0000ff", 5, 0, 0);
  const group = finish(), meshes = group.children;
  assert.equal(meshes.length, 1);
  const g = meshes[0].geometry, colour = g.getAttribute("color"), position = g.getAttribute("position"), normal = g.getAttribute("normal");
  assert.equal(position.count, 72, "two boxes of 36 corners");
  assert.ok(meshes[0].material.vertexColors);
  assert.ok(colour.getX(0) > 0.9 && colour.getZ(0) < 0.01, "the first box is red");
  assert.ok(colour.getZ(71) > 0.9 && colour.getX(71) < 0.01, "the second blue");
  assert.ok(Math.abs(Math.hypot(normal.getX(0), normal.getY(0), normal.getZ(0)) - 1) < 1e-6);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyGeometry } from "../mods/lib/shapes.js";

test("bodyGeometry's faces all face outward, so three.js draws the body the right way out", () => {
  const geometry = bodyGeometry([[1, .1, .1, 0], [.6, .3, .25, .02], [0, .35, .3, 0], [-.6, .2, .15, 0], [-1, .05, .04, 0]], 10);
  const position = geometry.getAttribute("position"), index = geometry.index.array;
  const point = (i) => [position.getX(i), position.getY(i), position.getZ(i)];
  const minus = (a, b) => a.map((v, i) => v - b[i]);
  assert.equal(index.length / 3, (5 - 1) * 10 * 2 + 10 * 2);
  for (let f = 0; f < index.length; f += 3) {
    const [a, b, c] = [point(index[f]), point(index[f + 1]), point(index[f + 2])];
    const [u, v] = [minus(b, a), minus(c, a)];
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const middle = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const outward = minus(middle, [middle[0] * .5, 0, 0]);
    assert.ok(normal.reduce((sum, n, i) => sum + n * outward[i], 0) > 0, `face ${f / 3} faces in`);
  }
});

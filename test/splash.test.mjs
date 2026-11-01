import { test } from "node:test";
import assert from "node:assert/strict";
import { SPLASH, droplet } from "../mods/lib/splash.js";

test("a splash's droplets fly up and out in a ring, fall back and shrink away", () => {
  const start = droplet(0, 8, 0), mid = droplet(0, 8, SPLASH * .3), end = droplet(0, 8, SPLASH);
  assert.ok(Math.hypot(start.x, start.y, start.z) < 1e-9);
  assert.ok(mid.y > .3 && Math.hypot(mid.x, mid.z) > .2);
  assert.ok(end.y < 0 && end.size === 0);
  const ring = Array.from({ length: 8 }, (_, i) => droplet(i, 8, SPLASH * .3));
  assert.ok(Math.abs(ring.reduce((sum, d) => sum + d.x, 0)) < 1e-9 && Math.abs(ring.reduce((sum, d) => sum + d.z, 0)) < 1e-9);
});

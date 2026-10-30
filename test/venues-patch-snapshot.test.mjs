// The venues patches apply to the game's snapshot, the patched modules still
// parse, and the new uniforms start at the game's own colours. Skipped when no
// snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileFor, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { loadPatches, patchSnapshot } from "../server/patches.mjs";
import { GAME_COLOURS } from "../mods/venues/patches.mjs";
import { ROOT, tempDir } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("the venues patches give the water and sky uniforms and hand over CanvasTexture, and both modules still parse", { skip }, async (t) => {
  const errors = [];
  const patched = patchSnapshot(snapshot, await loadPatches(join(ROOT, "mods"), ["venues"]), (line) => errors.push(line));
  assert.deepEqual(errors, []);
  assert.equal(patched.size, 2);
  const water = [...patched.values()].find((p) => p.text.includes("uniform vec3 uDeep;")).text;
  const scene = patched.get(snapshot.manifest.parts.scene).text;
  assert.ok(scene.includes("ve.three={CanvasTexture:f};export{ve as Game}"));
  for (const uniform of ["uKnots", "uDeep", "uLight", "uShallow", "uSky", "uHaze", "uChop", "uCaps", "uSurf", "uShore", "uBar"]) {
    assert.ok(water.includes(`${uniform}:{value:`), `${uniform} has a starting value`);
  }
  assert.ok(water.includes("r.uKnots.value=n.knots"), "the water gets the heat's wind");
  assert.ok(water.includes("uSkyLow:{value:") && water.includes('e.name="sky"'), "the sky can be found and tinted");
  const dir = tempDir(t);
  for (const [name, text] of [["water.mjs", water], ["scene.mjs", scene]]) {
    writeFileSync(join(dir, name), text);
    const check = spawnSync(process.execPath, ["--check", join(dir, name)], { encoding: "utf8" });
    assert.equal(check.status, 0, `${name}: ${check.stderr}`);
  }
});

test("the new uniforms start at the colours the game's shaders had, so the game looks the same until a venue is chosen", { skip }, async () => {
  const patched = patchSnapshot(snapshot, await loadPatches(join(ROOT, "mods"), ["venues"]), () => {});
  const [path, { text }] = [...patched.entries()].find(([, p]) => p.text.includes("uniform vec3 uDeep;"));
  const original = readFileSync(join(snapshot.dir, fileFor(path)), "utf8");
  for (const [name, colour, literal] of [
    ["uDeep", "deep", "vec3(.035,.43,.49)"], ["uLight", "light", "vec3(.18,.70,.68)"],
    ["uSky", "sky", "vec3(.72,.85,.75)"], ["uHaze", "haze", "vec3(.73,.85,.76)"],
    ["uSkyLow", "skyLow", "vec3(.77,.87,.78)"], ["uSkyHigh", "skyHigh", "vec3(.91,.94,.81)"],
  ]) {
    assert.ok(original.includes(literal), `the game's shader has ${literal}`);
    assert.deepEqual(literal.slice(5, -1).split(",").map(Number), GAME_COLOURS[colour]);
    assert.ok(text.includes(`${name}:{value:[${GAME_COLOURS[colour].join(",")}]}`), `${name} starts at ${literal}`);
  }
  for (const zero of ["uChop:{value:0}", "uCaps:{value:0}", "uSurf:{value:0}", "uShore:{value:[0,0,0,0]}"]) assert.ok(text.includes(zero));
});

// The sea life mod hands the game's own wipe-out to mods: the engine, loaded
// with the mod's patch as the server serves it, exports it, and it knocks the
// rider over as a failed landing does. Skipped when no snapshot has been
// taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileFor, loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { loadPatches, patchImports, patchSnapshot } from "../server/patches.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";
const mods = join(ROOT, "mods");

test("the sea life patch changes the game's engine and nothing else", { skip }, async () => {
  const errors = [];
  const patched = patchSnapshot(snapshot, await loadPatches(mods, ["sealife"]), (line) => errors.push(line));
  assert.deepEqual(errors, []);
  assert.deepEqual([...patched.keys()], [snapshot.manifest.parts.engine]);
});

test("the patched engine hands over its wipe-out, which knocks the rider over", { skip }, async () => {
  patchImports(snapshot, await loadPatches(mods, ["sealife"]), mods);
  const engine = await loadGame(snapshot, ["engine"]);
  const { __seaWipeOut } = await import(pathToFileURL(join(snapshot.dir, fileFor(snapshot.manifest.parts.engine))).href);
  const state = engine.initState();
  Object.assign(state, { vx: 9, vz: 0, speed: 9 });
  __seaWipeOut(state, false);
  assert.equal(state.crashTime, 4.8);
  assert.equal(state.waterStartProgress, 0);
  assert.ok(Math.abs(state.vx - 9 * .23) < 1e-9);
  assert.match(state.notice, /^Wipeout/);
});

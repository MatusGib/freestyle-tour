// The Champion's challenge patches apply to the game's snapshot, and the
// patched modules still parse. Skipped when no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tryOpenSnapshot } from "../lib/snapshot.mjs";
import { loadPatches, patchSnapshot } from "../server/patches.mjs";
import { ROOT, tempDir } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("the Champion's challenge patches change the 1v1 room wind, the look editor's lists and the 3D rider, and all still parse", { skip }, async (t) => {
  const errors = [];
  const patched = patchSnapshot(snapshot, await loadPatches(join(ROOT, "mods"), ["champion"]), (line) => errors.push(line));
  assert.deepEqual(errors, []);
  const texts = [...patched.values()].map((p) => p.text);
  assert.equal(texts.length, 3);
  const page = texts.find((text) => text.includes("function p(e){return __championRoomWind(e,__championRoomConditions(e))}"));
  const appearance = texts.find((text) => text.includes("{value:`redbull`,label:`Red Bull helmet`}"));
  const rider = texts.find((text) => text.includes("if(e===`redbull`)__championParts(t,"));
  assert.ok(page.includes('import{roomWind as __championRoomWind}from"/__mods/champion/wind.js"'), "the champion's rooms get his wind");
  assert.ok(appearance.includes("e===`helmet`&&!__championHelmetWon()?c.helmet.filter("), "the editor lists it only once won");
  assert.ok(rider.includes("e===`redbull`?__championNavy:2438200"), "the shell is navy");
  const dir = tempDir(t);
  for (const [name, text] of [["page.mjs", page], ["appearance.mjs", appearance], ["rider.mjs", rider]]) {
    assert.ok(text.includes('from"/__mods/champion/'));
    writeFileSync(join(dir, name), text);
    const check = spawnSync(process.execPath, ["--check", join(dir, name)], { encoding: "utf8" });
    assert.equal(check.status, 0, `${name}: ${check.stderr}`);
  }
});

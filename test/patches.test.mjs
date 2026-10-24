import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyPatches, loadPatches, patchSnapshot } from "../server/patches.mjs";
import { makeSnapshot, tempDir } from "./helpers.mjs";

const parts = { engine: "/e.js" };
const rule = (fields) => ({ mod: "m", replace: "B", expect: 1, ...fields });

test("a part rule changes only that part's module", () => {
  const rules = [rule({ part: "engine", find: "a", expect: 2 })];
  assert.equal(applyPatches("/e.js", "aXa", parts, rules), "BXB");
  assert.equal(applyPatches("/other.js", "aXa", parts, rules), "aXa");
});

test("a marker rule changes only modules containing the marker", () => {
  const rules = [rule({ marker: "MARK", find: "a" })];
  assert.equal(applyPatches("/x.js", "MARK a", parts, rules), "MARK B");
  assert.equal(applyPatches("/y.js", "plain a", parts, rules), "plain a");
});

test("find can be a global pattern", () => {
  const rules = [rule({ part: "engine", find: /a\d/g, expect: 2 })];
  assert.equal(applyPatches("/e.js", "a1 a2 b3", parts, rules), "B B b3");
});

test("a wrong match count fails with the mod's name", () => {
  const rules = [rule({ part: "engine", find: "zzz" })];
  assert.throws(() => applyPatches("/e.js", "abc", parts, rules), /Patch from mod "m" expected 1 match\(es\) of "zzz" in \/e\.js, found 0/);
});

test("loadPatches reads patches.mjs from enabled mods and checks each rule", async (t) => {
  const mods = tempDir(t);
  mkdirSync(join(mods, "a"));
  writeFileSync(join(mods, "a", "patches.mjs"), `export const patches = [{ part: "engine", find: "x", replace: "y", expect: 1 }];`);
  mkdirSync(join(mods, "b"));
  assert.deepEqual(await loadPatches(mods, ["a", "b"]), [{ part: "engine", find: "x", replace: "y", expect: 1, mod: "a" }]);
  mkdirSync(join(mods, "bad"));
  writeFileSync(join(mods, "bad", "patches.mjs"), `export const patches = [{ part: "engine", marker: "m", find: "x", replace: "y", expect: 1 }];`);
  await assert.rejects(loadPatches(mods, ["bad"]), /needs exactly one of part or marker/);
});

test("patchSnapshot patches a snapshot, recording failures and rules that target nothing", (t) => {
  const snapshot = makeSnapshot(tempDir(t), "s", {
    "/": "<html><head></head></html>",
    "/_next/static/chunks/e.js": "engine a",
    "/_next/static/chunks/p.js": "page MARK",
  }, { engine: "/_next/static/chunks/e.js" });
  const logs = [];
  const result = patchSnapshot(snapshot, [
    rule({ mod: "good", part: "engine", find: "a" }),
    rule({ mod: "bad", marker: "MARK", find: "missing" }),
    rule({ mod: "lost", marker: "NOWHERE", find: "x" }),
  ], (message) => logs.push(message));
  assert.deepEqual(result.get("/_next/static/chunks/e.js"), { text: "engine B" });
  assert.match(result.get("/_next/static/chunks/p.js").error, /mod "bad"/);
  assert.equal(result.size, 2);
  assert.ok(logs.some((m) => /mod "lost" targets 0 modules/.test(m)));
  assert.ok(logs.some((m) => /mod "bad" expected 1/.test(m)));
});

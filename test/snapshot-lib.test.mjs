import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { PART_MARKERS, fileFor, findParts, openSnapshot, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { makeSnapshot, tempDir } from "./helpers.mjs";

const pathFor = (part) => `/_next/static/chunks/${part}.js`;
const moduleSet = () => new Map(Object.entries(PART_MARKERS).map(([part, marker]) => [pathFor(part), `x${marker}y`]));

test("findParts maps each part to the one module holding its marker", () => {
  const modules = moduleSet();
  modules.set("/_next/static/chunks/other.js", "nothing here");
  assert.deepEqual(findParts(modules), Object.fromEntries(Object.keys(PART_MARKERS).map((part) => [part, pathFor(part)])));
});

test("findParts fails when a marker is missing", () => {
  const modules = moduleSet();
  modules.delete(pathFor("week"));
  assert.throws(() => findParts(modules), /"Europe\/Warsaw" \(week\), found 0/);
});

test("findParts fails when a marker is in two modules", () => {
  const modules = moduleSet();
  modules.set("/_next/static/chunks/copy.js", PART_MARKERS.engine);
  assert.throws(() => findParts(modules), /\(engine\), found 2/);
});

test("fileFor stores the page as index.html and other paths as they are", () => {
  assert.equal(fileFor("/"), "index.html");
  assert.equal(fileFor("/_next/static/chunks/a.js"), "_next/static/chunks/a.js");
});

test("openSnapshot opens the current snapshot, or a named one", (t) => {
  const root = tempDir(t);
  makeSnapshot(root, "s1", { "/": "<html><head></head></html>" }, {});
  assert.equal(openSnapshot(root).name, "s1");
  assert.equal(openSnapshot(root, "s1").dir, join(root, "vendor", "s1"));
  assert.equal(openSnapshot(root).manifest.files[0].path, "/");
});

test("without a snapshot, openSnapshot explains what to run and tryOpenSnapshot returns null", (t) => {
  const root = tempDir(t);
  assert.throws(() => openSnapshot(root), /run `npm run snapshot` first/);
  assert.equal(tryOpenSnapshot(root), null);
});

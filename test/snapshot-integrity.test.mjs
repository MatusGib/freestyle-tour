// Checks the current snapshot on disk against its manifest. Skipped when no
// snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PART_MARKERS, fileFor, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("every manifest entry exists with a matching SHA-256", { skip }, () => {
  for (const entry of snapshot.manifest.files) {
    const file = join(snapshot.dir, fileFor(entry.path));
    assert.ok(existsSync(file), `${entry.path} is missing`);
    const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
    assert.equal(sha, entry.sha256, `${entry.path} changed since the snapshot was taken`);
  }
});

test("the manifest names a listed module for every part", { skip }, () => {
  assert.deepEqual(Object.keys(snapshot.manifest.parts).sort(), Object.keys(PART_MARKERS).sort());
  const listed = new Set(snapshot.manifest.files.map((f) => f.path));
  for (const path of Object.values(snapshot.manifest.parts)) assert.ok(listed.has(path), `${path} is not in the manifest`);
});

test("the page has the head tags the server relies on", { skip }, () => {
  const html = readFileSync(join(snapshot.dir, "index.html"), "utf8");
  assert.ok(html.includes("<head>"), "no <head>");
  assert.ok(html.includes("</head>"), "no </head>");
});

// The proof mod's patch must apply cleanly to the current snapshot. Skipped
// when no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tryOpenSnapshot } from "../lib/snapshot.mjs";
import { loadPatches, patchSnapshot } from "../server/patches.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("the local-badge patch changes exactly one module", { skip }, async () => {
  const logs = [];
  const patched = patchSnapshot(snapshot, await loadPatches(join(ROOT, "mods"), ["local-badge"]), (m) => logs.push(m));
  assert.deepEqual(logs, []);
  const changed = [...patched.values()];
  assert.equal(changed.length, 1);
  assert.ok(changed[0].text.includes("Same keys in the air · local"));
});

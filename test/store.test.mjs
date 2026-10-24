import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createStore } from "../server/store.mjs";
import { tempDir } from "./helpers.mjs";

test("a new store starts empty", (t) => {
  const store = createStore(join(tempDir(t), "data", "db.json"));
  assert.deepEqual(store.data, { riders: [], heats: [], feedback: [] });
});

test("updates are saved to the file and survive a reload", (t) => {
  const file = join(tempDir(t), "data", "db.json");
  const store = createStore(file);
  const result = store.update((data) => {
    data.riders.push({ key: "k1" });
    return "done";
  });
  assert.equal(result, "done");
  assert.deepEqual(store.data.riders, [{ key: "k1" }]);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).riders, [{ key: "k1" }]);
  assert.deepEqual(createStore(file).data.riders, [{ key: "k1" }]);
  assert.equal(existsSync(`${file}.tmp`), false);
});

test("a failed update leaves the data unchanged", (t) => {
  const store = createStore(join(tempDir(t), "db.json"));
  assert.throws(() => store.update((data) => {
    data.riders.push({ key: "half" });
    throw new Error("boom");
  }), /boom/);
  assert.deepEqual(store.data.riders, []);
});

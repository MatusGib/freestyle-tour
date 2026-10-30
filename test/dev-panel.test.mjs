// The developer panel's helpers: a draft holds only changed values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { changeCount, fileValue, shownValue, valueAt, withChange } from "../mods/dev/dev.js";

const files = {
  eventWinds: { version: 1, events: [{ event: 378, knots: 18, gustKnots: 6 }] },
  venues: { version: 2, venues: [{ id: "sylt", gameConditions: { knots: 17, gustKnots: 4 }, windZones: { gain: 2 } }] },
  champion: { target: 45.5, wind: { knots: 21, gustKnots: 6 } },
  tuning: { aiTargetOffset: 0 },
};

test("a field's file value is found by its path", () => {
  assert.equal(fileValue(files, "eventWinds.378.knots"), 18);
  assert.equal(fileValue(files, "eventWinds.375.knots"), undefined);
  assert.equal(fileValue(files, "venues.sylt.windZones.gain"), 2);
  assert.equal(fileValue(files, "champion.wind.knots"), 21);
  assert.equal(fileValue(files, "tuning.aiTargetOffset"), 0);
  assert.equal(valueAt({ a: { b: 1 } }, "a.b"), 1);
});

test("a change goes into the draft, and setting it back to the file's value takes it out", () => {
  const draft = withChange({}, files, "venues.sylt.gameConditions.knots", 20);
  assert.deepEqual(draft, { venues: { sylt: { gameConditions: { knots: 20 } } } });
  assert.equal(shownValue(draft, files, "venues.sylt.gameConditions.knots"), 20);
  assert.equal(shownValue(draft, files, "venues.sylt.gameConditions.gustKnots"), 4);
  assert.deepEqual(withChange(draft, files, "venues.sylt.gameConditions.knots", 17), {});
});

test("the draft's value shows over the file's, even when it is none", () => {
  assert.equal(shownValue({ eventWinds: { 378: { knots: null } } }, files, "eventWinds.378.knots"), null);
});

test("a draft counts its changed values; no wind found counts as one", () => {
  assert.equal(changeCount({}), 0);
  assert.equal(changeCount({ eventWinds: { 378: { knots: null, gustKnots: 0 } }, tuning: { aiTargetOffset: -2 } }), 3);
});

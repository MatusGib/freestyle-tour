// Event winds (tour/event-winds.json): each event's wind from its reports,
// checked against the tour data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkEventWinds, eventWind, indexEventWinds, loadEventWinds } from "../server/event-winds.mjs";
import { loadTour } from "../server/tour.mjs";
import { tempDir, writeTour } from "./helpers.mjs";

const SOURCE = { title: "2025 Sylt report", date: "2025-09-30", url: "https://example.test/report" };
const entry = (over = {}) => ({ event: 378, slug: "e378", knots: 18, gustKnots: 6, reported: "18–25 kt, gusty", confidence: "reported", sources: [SOURCE], ...over });

function setup(t) {
  const dir = tempDir(t);
  writeTour(join(dir, "tour"));
  return { dir, tour: loadTour(join(dir, "tour")) };
}

test("an event's wind is found by its tour id; an entry without a wind gives none", (t) => {
  const { dir, tour } = setup(t);
  const file = join(dir, "event-winds.json");
  writeFileSync(file, JSON.stringify({ version: 1, events: [entry(), { event: 300, slug: "e300", knots: null, reported: "The reports don't give the wind", sources: [SOURCE] }] }));
  const winds = loadEventWinds(file, tour);
  assert.equal(eventWind(winds, 378).knots, 18);
  assert.equal(eventWind(winds, 300), null);
  assert.equal(eventWind(winds, 375), null);
  assert.equal(eventWind(null, 378), null);
});

test("without the file, or without tour data, there are no event winds", (t) => {
  const { dir, tour } = setup(t);
  const logs = [];
  assert.equal(eventWind(loadEventWinds(join(dir, "none.json"), tour, (m) => logs.push(m)), 378), null);
  assert.match(logs[0], /usual wind/);
  assert.equal(eventWind(loadEventWinds(join(dir, "none.json"), null, () => {}), 378), null);
});

test("broken entries are refused with the reason", (t) => {
  const { tour } = setup(t);
  const check = (...events) => () => checkEventWinds({ version: 1, events }, tour);
  assert.throws(check(entry({ knots: 11 })), /knots must be a whole number from 12 to 28/);
  assert.throws(check(entry({ knots: 29 })), /knots must be a whole number from 12 to 28/);
  assert.throws(check(entry({ knots: 18.5 })), /knots must be a whole number from 12 to 28/);
  assert.throws(check(entry({ gustKnots: 1 })), /gusts must be 0 or 2–6 kt/);
  assert.throws(check(entry(), entry()), /listed twice/);
  assert.throws(check(entry({ event: 999 })), /no such event/);
  assert.throws(check(entry({ slug: "e375" })), /slug e375 should be e378/);
  assert.throws(check(entry({ sources: [] })), /needs a source with a URL and a date/);
  assert.throws(check(entry({ confidence: "guess" })), /confidence must be reported, bounded or inferred/);
  assert.throws(check(entry({ reported: "" })), /say what the reports say/);
  assert.throws(() => checkEventWinds({ events: [] }, tour), /not a list of event winds/);
  assert.doesNotThrow(check(entry({ confidence: "inferred", sources: [] })));
});

test("a refused entry names its field, so the developer panel can show the reason there", (t) => {
  const { tour } = setup(t);
  assert.throws(() => checkEventWinds({ version: 1, events: [entry({ gustKnots: 1 })] }, tour), { path: "eventWinds.378.gustKnots" });
  assert.throws(() => checkEventWinds({ version: 1, events: [entry({ knots: 30 })] }, tour), { path: "eventWinds.378.knots" });
});

test("indexing checks nothing and finds entries by event", () => {
  assert.equal(indexEventWinds({ version: 1, events: [entry()] }).byEvent.get(378).knots, 18);
});

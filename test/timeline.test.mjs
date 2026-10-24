import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMERAS,
  MAX_CLIP_STEPS,
  SPEEDS,
  clipAround,
  clipFileName,
  createStepClock,
  extensionFor,
  formatTime,
  moveMarkers,
  normalizeClip,
  pickVideoType,
} from "../mods/replay-viewer/timeline.js";

test("formatTime shows minutes and seconds", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(120 * 75 + 119), "1:15");
});

test("the step clock turns frame times into whole steps and carries the rest", () => {
  const clock = createStepClock();
  assert.equal(clock(1, 1 / 60), 2);
  assert.equal(clock(0.25, 1 / 60), 0);
  assert.equal(clock(0.25, 1 / 60), 1);
  assert.equal(clock(4, 5), 48);
});

test("moveMarkers places each attempt at its start step", () => {
  const attempts = [{ id: 1, startedAt: 5.25, label: "Culo", tack: "port", score: 7.5, status: "landed" }];
  assert.deepEqual(moveMarkers(attempts), [{ id: 1, step: 630, label: "Culo", tack: "port", score: 7.5, status: "landed" }]);
});

test("clips are ordered, inside the heat and at most 60 seconds", () => {
  assert.deepEqual(normalizeClip(500, 100, 1000), { start: 100, end: 500 });
  assert.deepEqual(normalizeClip(-50, 200, 1000), { start: 0, end: 200 });
  assert.deepEqual(normalizeClip(100, 20000, 30000), { start: 100, end: 100 + MAX_CLIP_STEPS });
  assert.deepEqual(normalizeClip(900, 1500, 1000), { start: 900, end: 1000 });
});

test("clipAround runs from 2 s before a move to 8 s after", () => {
  assert.deepEqual(clipAround({ step: 1000 }, 21600), { start: 760, end: 1960 });
  assert.deepEqual(clipAround({ step: 100 }, 1000), { start: 0, end: 1000 });
});

test("clip file names use the rider, date and start time", () => {
  assert.equal(clipFileName("Local Tester!", Date.parse("2026-10-24T10:00:00Z"), 1260, "webm"), "freestyle-tour-local-tester-2026-10-24-11s.webm");
  assert.equal(clipFileName("??", Date.parse("2026-10-24T10:00:00Z"), 0, "mp4"), "freestyle-tour-rider-2026-10-24-0s.mp4");
});

test("the video type is the first one the browser supports", () => {
  assert.equal(pickVideoType((type) => type.startsWith("video/webm")), "video/webm;codecs=vp9");
  assert.equal(pickVideoType(() => false), null);
  assert.equal(extensionFor("video/mp4;codecs=avc1"), "mp4");
  assert.equal(extensionFor("video/webm;codecs=vp9"), "webm");
});

test("speeds and cameras", () => {
  assert.deepEqual(SPEEDS, [0.25, 0.5, 1, 2, 4]);
  assert.deepEqual(Object.keys(CAMERAS), ["Follow", "Side", "High"]);
  assert.deepEqual(CAMERAS.Follow, { distance: 1, azimuth: 0, elevation: 0 });
});

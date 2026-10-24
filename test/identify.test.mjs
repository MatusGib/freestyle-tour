import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGNATURES, identify } from "../mods/lib/identify.js";

const signatures = {
  demo: {
    answer: (v) => v === 42,
    pick: (v) => typeof v === "function" && v.name === "pick",
  },
};
function pick() {}

test("identify returns the one export matching each signature", () => {
  assert.deepEqual(identify({ demo: { a: 1, b: 42, c: pick } }, signatures), { answer: 42, pick });
});

test("identify fails when a signature matches nothing", () => {
  assert.throws(() => identify({ demo: { a: 1, c: pick } }, signatures), /Could not locate demo\.answer \(0 matches\)/);
});

test("identify fails when a signature matches more than once", () => {
  assert.throws(() => identify({ demo: { a: 42, b: 42, c: pick } }, signatures), /Could not locate demo\.answer \(2 matches\)/);
});

test("a signature that throws counts as no match", () => {
  const throwing = { demo: { boom: () => { throw new Error("bad export"); } } };
  assert.throws(() => identify({ demo: { a: 1 } }, throwing), /demo\.boom \(0 matches\)/);
});

test("parts without signatures are ignored", () => {
  assert.deepEqual(identify({ scene: { anything: 1 } }, signatures), {});
});

test("signatures cover the five parts the loader identifies", () => {
  assert.deepEqual(Object.keys(SIGNATURES), ["engine", "wind", "controls", "week", "pose"]);
});

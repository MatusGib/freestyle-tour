// Shared test helpers: temporary folders, a tiny fixture snapshot and a
// stand-in for the game's functions, so most tests run without a real snapshot.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fileFor, openSnapshot } from "../lib/snapshot.mjs";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

export function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "freestyle-tour-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Writes files ({ urlPath: text }) as snapshot root/vendor/<name>, makes it
// current and returns it opened.
export function makeSnapshot(root, name, files, parts) {
  const dir = join(root, "vendor", name);
  const entries = Object.entries(files).map(([path, text]) => {
    const out = join(dir, fileFor(path));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
    return { path, bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") };
  });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ source: "https://game.test", fetchedAt: "2026-10-24T00:00:00.000Z", parts, files: entries, skipped: [] }));
  writeFileSync(join(root, "vendor", "current.json"), JSON.stringify({ snapshot: name }));
  return openSnapshot(root, name);
}

export const WEEK = 7 * 24 * 3600 * 1000;

// Close enough to the game's functions for the fake APIs: weeks are plain
// 7-day blocks, every landed attempt counts, and the wind is fixed.
export const fakeGame = {
  weekStart: (ms) => Math.floor(ms / WEEK) * WEEK,
  nextWeekStart: (ms) => Math.floor(ms / WEEK) * WEEK + WEEK,
  weekConditions: () => ({ seed: 1, knots: 18, gustKnots: 4 }),
  heatTotals: ({ attempts }) => {
    const counting = attempts.filter((a) => a.status === "landed" && a.score > 0);
    return { total: Math.round(counting.reduce((sum, a) => sum + a.score, 0) * 100) / 100, counting };
  },
};

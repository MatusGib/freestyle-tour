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

const tourEntry = (rider, place) => ({ rider, name: `real ${rider}`, sailNumber: "X-1", place, points: 0 });
const tourEvent = (id, name, start, divisions) => ({ id, slug: `e${id}`, name, start, end: start, location: "Somewhere", divisions });

// Writes tour/ data for tests into dir: three events in two seasons, with real
// names in riders.json beside the pseudonyms, as npm run tour-data writes them.
export function writeTour(dir) {
  mkdirSync(join(dir, "seasons"), { recursive: true });
  writeFileSync(join(dir, "riders.json"), JSON.stringify([
    { id: "m:balz-muller", division: "men", name: "Balz Müller", pseudonym: "Balt Möller", sailNumbers: ["SUI-21"] },
    { id: "m:yentel-caers", division: "men", name: "Yentel Caers", pseudonym: "Yenter Ceers", sailNumbers: ["B-16"] },
    { id: "w:sarah-quita-offringa", division: "women", name: "Sarah-Quita Offringa", pseudonym: "Sarah-Quito Uffringa", sailNumbers: ["ARU-91"] },
  ]));
  const rating = (r) => ({ rating: r, rd: 50, volatility: 0.06 });
  writeFileSync(join(dir, "ratings.json"), JSON.stringify({
    events: {
      300: { men: { "m:balz-muller": rating(1700) } },
      378: { men: { "m:balz-muller": rating(1757), "m:yentel-caers": rating(1938) }, women: { "w:sarah-quita-offringa": rating(2212) } },
      375: { men: { "m:yentel-caers": rating(1900) } },
    },
  }));
  writeFileSync(join(dir, "seasons", "2024.json"), JSON.stringify({ season: 2024, events: [tourEvent(300, "2024 Sylt", "2024-09-27", { men: { entries: [tourEntry("m:balz-muller", 1)], ladders: [] } })] }));
  writeFileSync(join(dir, "seasons", "2025.json"), JSON.stringify({
    season: 2025,
    events: [
      tourEvent(375, "2025 Fuerteventura", "2025-07-18", { men: { entries: [tourEntry("m:yentel-caers", 1)], ladders: [] } }),
      tourEvent(378, "2025 Sylt", "2025-09-26", { men: { entries: [tourEntry("m:yentel-caers", 1), tourEntry("m:balz-muller", 9)], ladders: [] }, women: { entries: [tourEntry("w:sarah-quita-offringa", 1)], ladders: [] } }),
    ],
  }));
}

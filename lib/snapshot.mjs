// Shared helpers for the dated snapshots of the original game under vendor/.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { identify } from "../mods/lib/identify.js";

// Text that picks out the game modules we rely on. Each marker must appear in
// exactly one module of a snapshot.
export const PART_MARKERS = {
  engine: "attemptsPerTack:", // physics, tricks and judging
  wind: "Math.sin(r*.17)", // conditions and the wind model
  controls: "syncAir(", // keyboard/touch handler and heat replay recorder
  scene: "areaArrow", // the three.js scene
  week: "Europe/Warsaw", // weekly challenge calendar and its wind
};

// modules: Map of URL path -> module text. Returns { part: URL path }.
export function findParts(modules) {
  const parts = {};
  for (const [part, marker] of Object.entries(PART_MARKERS)) {
    const hits = [...modules].filter(([, text]) => text.includes(marker)).map(([path]) => path);
    if (hits.length !== 1) throw new Error(`Expected one module containing ${JSON.stringify(marker)} (${part}), found ${hits.length}`);
    parts[part] = hits[0];
  }
  return parts;
}

// Where a URL path is stored inside a snapshot folder.
export const fileFor = (urlPath) => (urlPath === "/" ? "index.html" : urlPath.slice(1));

// Opens vendor/<name>, or the snapshot vendor/current.json points at.
export function openSnapshot(root, name) {
  const vendor = join(root, "vendor");
  if (!name) {
    const pointer = join(vendor, "current.json");
    if (!existsSync(pointer)) throw new Error("No snapshot yet: run `npm run snapshot` first");
    name = JSON.parse(readFileSync(pointer, "utf8")).snapshot;
  }
  const dir = join(vendor, name);
  const manifest = join(dir, "manifest.json");
  if (!existsSync(manifest)) throw new Error(`vendor/${name} has no manifest.json`);
  return { name, dir, manifest: JSON.parse(readFileSync(manifest, "utf8")) };
}

export function tryOpenSnapshot(root) {
  try {
    return openSnapshot(root);
  } catch {
    return null;
  }
}

// Imports the given parts of a snapshot in Node and identifies their functions.
export async function loadGame(snapshot, partNames) {
  const modules = {};
  for (const part of partNames) {
    const file = join(snapshot.dir, fileFor(snapshot.manifest.parts[part]));
    modules[part] = await import(pathToFileURL(file).href);
  }
  return identify(modules);
}

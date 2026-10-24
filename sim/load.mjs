// Loads the current snapshot's engine in Node, for headless runs and tests.
import { fileURLToPath } from "node:url";
import { loadGame, openSnapshot } from "../lib/snapshot.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export function loadEngine({ root = ROOT, snapshot } = {}) {
  return loadGame(openSnapshot(root, snapshot), ["engine", "wind", "controls"]);
}

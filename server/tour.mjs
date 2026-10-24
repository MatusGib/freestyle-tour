// The rider and event data in tour/ (built by npm run tour-data), read once
// when the server starts. null when it hasn't been built.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadTour(dir) {
  if (!existsSync(join(dir, "riders.json"))) return null;
  const read = (path) => JSON.parse(readFileSync(join(dir, path), "utf8"));
  const events = new Map();
  for (const file of readdirSync(join(dir, "seasons")).sort()) {
    const { season, events: list } = read(join("seasons", file));
    for (const event of list) events.set(event.id, { ...event, season });
  }
  return { riders: new Map(read("riders.json").map((r) => [r.id, r])), ratings: read("ratings.json"), events };
}

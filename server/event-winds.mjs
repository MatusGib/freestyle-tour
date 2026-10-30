// Each event's wind, read from its reports (tour/event-winds.json). Curated by
// hand, apart from the crawled season files, so a data refresh can't erase it.
// knots is null for an event whose reports were read and give no wind.
import { existsSync, readFileSync } from "node:fs";
import { problem } from "./problem.mjs";

const CONFIDENCE = new Set(["reported", "bounded", "inferred"]);
export const isKnots = (value) => Number.isInteger(value) && value >= 12 && value <= 28;
export const isGusts = (value) => Number.isInteger(value) && (value === 0 || (value >= 2 && value <= 6));

// Throws a problem() naming the first broken field. tour: loadTour()'s, for
// each entry's event and slug.
export function checkEventWinds(winds, tour, name = "tour/event-winds.json") {
  if (!Number.isInteger(winds?.version) || !Array.isArray(winds.events)) throw problem("eventWinds", `${name} is not a list of event winds`);
  const seen = new Set();
  for (const entry of winds.events) {
    const path = `eventWinds.${entry.event}`;
    const where = `${name}, event ${entry.event}`;
    const event = tour?.events.get(entry.event);
    if (!event) throw problem(path, `${where}: no such event in the tour data`);
    if (entry.slug !== event.slug) throw problem(`${path}.slug`, `${where}: slug ${entry.slug} should be ${event.slug}`);
    if (seen.has(entry.event)) throw problem(path, `${where}: listed twice`);
    seen.add(entry.event);
    if (typeof entry.reported !== "string" || !entry.reported.trim()) throw problem(`${path}.reported`, `${where}: say what the reports say in "reported"`);
    if (entry.knots === null) continue;
    if (!isKnots(entry.knots)) throw problem(`${path}.knots`, `${where}: knots must be a whole number from 12 to 28`);
    if (!isGusts(entry.gustKnots)) throw problem(`${path}.gustKnots`, `${where}: gusts must be 0 or 2–6 kt`);
    if (!CONFIDENCE.has(entry.confidence)) throw problem(`${path}.confidence`, `${where}: confidence must be reported, bounded or inferred`);
    if (entry.confidence !== "inferred" && !entry.sources?.some((s) => s.url && s.date)) throw problem(`${path}.sources`, `${where}: a ${entry.confidence} wind needs a source with a URL and a date`);
  }
  return winds;
}

// The winds with a lookup by event id. Checks nothing.
export const indexEventWinds = (winds) => ({ ...winds, byEvent: new Map(winds.events.map((entry) => [entry.event, entry])) });

const NONE = indexEventWinds({ version: 0, events: [] });

// Reads and checks the file; a broken one throws, so the server refuses to
// start. Without the file or the tour data there are no event winds.
export function loadEventWinds(file, tour, log = console.log) {
  if (!tour) return NONE;
  if (!existsSync(file)) {
    log(`No ${file}: events sail in their venue's usual wind.`);
    return NONE;
  }
  return indexEventWinds(checkEventWinds(JSON.parse(readFileSync(file, "utf8")), tour, file));
}

// The event's entry if its reports give a wind, or null.
export function eventWind(winds, eventId) {
  const entry = winds?.byEvent.get(eventId);
  return entry && entry.knots !== null ? entry : null;
}

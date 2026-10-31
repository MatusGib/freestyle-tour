import { existsSync, readFileSync } from "node:fs";
import { coastFor } from "../mods/venues/coast.js";
import { isGusts, isKnots } from "./event-winds.mjs";
import { problem } from "./problem.mjs";

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const between = (value, low, high) => typeof value === "number" && value >= low && value <= high;
const ZONE_RANGES = { gain: [0, 8], from: [0, 1000], over: [1, 1000], lee: [0, 6] };

// Checks a catalog and indexes it by id and by location spelling. Throws a
// problem() naming the first broken field.
export function indexVenueCatalog(catalog, name = "tour/venues.json") {
  if (!Number.isInteger(catalog?.version) || !Array.isArray(catalog.venues)) throw problem("venues", `${name} is not a valid venue catalog`);
  const byId = new Map();
  const byLocation = new Map();
  for (const venue of catalog.venues) {
    const path = `venues.${venue.id}`;
    if (!venue.id || !venue.name || !Array.isArray(venue.locations) || !venue.gameConditions) throw problem(path, `${name} has an incomplete venue`);
    const { knots, gustKnots } = venue.gameConditions;
    if (!isKnots(knots)) throw problem(`${path}.gameConditions.knots`, `${name} has unsupported conditions for ${venue.id}: knots must be a whole number from 12 to 28`);
    if (!isGusts(gustKnots)) throw problem(`${path}.gameConditions.gustKnots`, `${name} has unsupported conditions for ${venue.id}: gusts must be 0 or 2\u20136 kt`);
    for (const [field, [low, high]] of Object.entries(ZONE_RANGES)) {
      if (venue.windZones && !between(venue.windZones[field], low, high)) throw problem(`${path}.windZones.${field}`, `${name} has unsupported wind zones for ${venue.id}: ${field} must be from ${low} to ${high}`);
    }
    if (byId.has(venue.id)) throw problem(path, `${name} repeats venue id ${venue.id}`);
    byId.set(venue.id, venue);
    for (const location of venue.locations) {
      const key = normalize(location);
      const previous = byLocation.get(key);
      if (previous && previous.id !== venue.id) throw problem(path, `${name} maps ${location} to more than one venue`);
      byLocation.set(key, venue);
    }
  }
  return { version: catalog.version, venues: catalog.venues, byId, byLocation };
}

export function loadVenueCatalog(file) {
  if (!existsSync(file)) return null;
  return indexVenueCatalog(JSON.parse(readFileSync(file, "utf8")), file);
}

export function venueForLocation(catalog, location) {
  return catalog?.byLocation.get(normalize(location)) ?? null;
}

// Whether tools/spot.mjs has built a real-world spot's files for a venue id.
const spotFiles = new Map();
const hasSpotFiles = (id) => {
  if (!spotFiles.has(id)) spotFiles.set(id, existsSync(new URL(`../mods/venues/spots/${id}/spot.json`, import.meta.url)));
  return spotFiles.get(id);
};

// What the browser gets of a venue. scenery: whether the venues mod builds
// it, from an analytic coast or, with spotFiles, from a real-world spot's
// map data; picture: its picture for the chooser and the event card. The
// others sail in the game's own scene.
export function publicVenue(venue) {
  if (!venue) return null;
  const { id, name, place, gameConditions, windZones, character, confidence, profileNote, courseNote, landmarks, waterZones, sources } = venue;
  const spot = hasSpotFiles(id), coast = Boolean(coastFor(id));
  const picture = spot ? `/__mods/venues/spots/${id}/picture.png` : coast ? `/__mods/venues/assets/${id}.svg` : null;
  return { id, name, place, gameConditions, windZones, character, confidence, profileNote, courseNote, landmarks, waterZones, sources, scenery: coast || spot, spotFiles: spot, picture };
}

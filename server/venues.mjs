import { existsSync, readFileSync } from "node:fs";
import { coastFor } from "../mods/venues/coast.js";

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function loadVenueCatalog(file) {
  if (!existsSync(file)) return null;
  const catalog = JSON.parse(readFileSync(file, "utf8"));
  if (!Number.isInteger(catalog.version) || !Array.isArray(catalog.venues)) {
    throw new Error(`${file} is not a valid venue catalog`);
  }
  const byId = new Map();
  const byLocation = new Map();
  for (const venue of catalog.venues) {
    if (!venue.id || !venue.name || !Array.isArray(venue.locations) || !venue.gameConditions) {
      throw new Error(`${file} has an incomplete venue`);
    }
    const { knots, gustKnots } = venue.gameConditions;
    if (!Number.isInteger(knots) || knots < 12 || knots > 28 || !Number.isInteger(gustKnots) || (gustKnots !== 0 && gustKnots < 2) || gustKnots > 6) {
      throw new Error(`${file} has unsupported conditions for ${venue.id}`);
    }
    const zones = venue.windZones;
    const between = (value, low, high) => typeof value === "number" && value >= low && value <= high;
    if (zones && !(between(zones.gain, 0, 8) && between(zones.from, 0, 1000) && between(zones.over, 1, 1000) && between(zones.lee, 0, 6))) {
      throw new Error(`${file} has unsupported wind zones for ${venue.id}`);
    }
    if (byId.has(venue.id)) throw new Error(`${file} repeats venue id ${venue.id}`);
    byId.set(venue.id, venue);
    for (const location of venue.locations) {
      const key = normalize(location);
      const previous = byLocation.get(key);
      if (previous && previous.id !== venue.id) throw new Error(`${file} maps ${location} to more than one venue`);
      byLocation.set(key, venue);
    }
  }
  return { version: catalog.version, venues: catalog.venues, byId, byLocation };
}

export function venueForLocation(catalog, location) {
  return catalog?.byLocation.get(normalize(location)) ?? null;
}

// What the browser gets of a venue. scenery: whether the venues mod has a
// coast for it; the others sail in the game's own scene.
export function publicVenue(venue) {
  if (!venue) return null;
  const { id, name, place, gameConditions, windZones, character, confidence, profileNote, courseNote, landmarks, waterZones, sources } = venue;
  return { id, name, place, gameConditions, windZones, character, confidence, profileNote, courseNote, landmarks, waterZones, sources, scenery: Boolean(coastFor(id)) };
}

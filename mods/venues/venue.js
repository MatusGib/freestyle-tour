import { coastFor } from "./coast.js";
import { zonesFor } from "./zones.js";

export const SELECTED_VENUE_KEY = "freestyle-tour.venue.selected.v1";
export const PENDING_HEAT_KEY = "freestyle-tour.venue.pending.v1";

let selectedMemory = null;
let pendingMemory = null;

const readSelected = () => {
  try {
    return localStorage.getItem(SELECTED_VENUE_KEY) ?? selectedMemory;
  } catch {
    return selectedMemory;
  }
};
const readPending = () => {
  try {
    return sessionStorage.getItem(PENDING_HEAT_KEY) ?? pendingMemory;
  } catch {
    return pendingMemory;
  }
};

export function selectedVenueId() {
  return readSelected();
}

export function saveSelectedVenue(id) {
  selectedMemory = id ?? null;
  if (id) {
    try {
      localStorage.setItem(SELECTED_VENUE_KEY, id);
    } catch {
      // The in-memory choice still applies until this page is closed.
    }
  }
  else {
    try {
      localStorage.removeItem(SELECTED_VENUE_KEY);
    } catch {
      // Storage is optional; the UI still reports the choice for this session.
    }
  }
}

export function rememberPlannedHeat(heat) {
  if (!heat?.conditions) return;
  pendingMemory = JSON.stringify({ conditions: heat.conditions, venue: heat.venue ?? null });
  try {
    sessionStorage.setItem(PENDING_HEAT_KEY, pendingMemory);
  } catch {
    // The one-heat override remains available in this page until it starts.
  }
}

export function clearPlannedHeat() {
  pendingMemory = null;
  try {
    sessionStorage.removeItem(PENDING_HEAT_KEY);
  } catch {
    // No pending override is safer than a stale one.
  }
}

// The planned challenge heat, if any, left in place for takePlannedHeat.
export function peekPlannedHeat() {
  const saved = readPending();
  if (!saved) return null;
  try {
    const value = JSON.parse(saved);
    return value?.conditions ? value : null;
  } catch {
    return null;
  }
}

export function takePlannedHeat() {
  const planned = peekPlannedHeat();
  clearPlannedHeat();
  return planned;
}

// The planned challenge heat, taken only by the solo heat it was planned for;
// a practice start (the game's tutorial starts one) leaves it waiting.
export const takePlannedHeatFor = (soloHeat) => (soloHeat ? takePlannedHeat() : null);

// The wind as the game writes it.
export const windText = ({ knots, gustKnots }) => (gustKnots ? `${knots} kt, gusts ${knots + 2}–${knots + gustKnots} kt` : `${knots} kt, steady wind`);

// A venue's wind zones, placed on its coast, for a heat in `knots`, with its
// wind patch, or null.
export function venueZones(venue, knots) {
  const zones = zonesFor(venue?.windZones, coastFor(venue?.id), knots);
  if (!venue?.windPatch) return zones;
  const { x, z, radius, length, gain } = venue.windPatch;
  return { ...zones, patch: { x, z, radius, length, gain } };
}

// A heat at a venue: the room's seed, the wind (an event's own, or the
// venue's usual one), and the venue's wind zones.
export function venueConditions(roomConditions, venue, roomId, wind = venue.gameConditions) {
  const { knots, gustKnots } = wind;
  const zones = venueZones(venue, knots);
  return { ...roomConditions(roomId), knots, gustKnots, ...(zones ? { zones } : {}) };
}

export function venueRoomId(venueId, id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) {
  return `venue:${venueId}:${id}`;
}

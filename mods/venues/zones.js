// A venue's wind zones: where its wind blows harder or lighter than the heat's
// own. They travel inside the heat's conditions (conditions.zones), and the
// game's wind function adds zoneKnots to the wind at the rider's position
// (patched by patches.mjs, in the browser and in the server's AI worker), so
// the player, the AI and every replay feel the same wind. The water shows the
// same zones. Without zones in the conditions nothing changes.
import { shoreOffset } from "./waves.js";

// Bump when the zones change, so cached AI heats are sailed again.
export const ZONE_VERSION = 1;

// windZones (from tour/venues.json): { gain, from, over, lee }. gain knots
// more from `from` metres out from the beach, ramping in over `over` metres;
// lee knots less within 90 m of the beach.
export function zonesFor(windZones, coast) {
  if (!windZones || !coast) return null;
  const { gain, from, over, lee } = windZones;
  return { inX: coast.inX, inZ: coast.inZ, shoreline: coast.shoreline, curve: coast.curve, gain, from, over, lee };
}

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The knots a venue's zones add at (x, z); keep in step with the water
// shader's zoneKnots in patches.mjs.
export function zoneKnots(zones, x, z) {
  if (!zones) return 0;
  const off = shoreOffset(x, z, [zones.inX, zones.inZ, zones.shoreline], zones.curve);
  return zones.gain * smoothstep(zones.from, zones.from + zones.over + 1, off) - zones.lee * (1 - smoothstep(0, 90, off));
}

// The water shader's uZone for these zones.
export const zoneUniform = (zones) => (zones ? [zones.gain, zones.from, zones.over, zones.lee] : [0, 0, 0, 0]);

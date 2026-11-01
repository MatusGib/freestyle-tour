// A venue's wind zones: where its wind blows harder or lighter than the heat's
// own. They travel inside the heat's conditions (conditions.zones), and the
// game's wind function adds zoneKnots to the wind at the rider's position
// (patched by patches.mjs, in the browser and in the server's AI worker), so
// the player, the AI and every replay feel the same wind. The water shows the
// same zones. Without zones in the conditions nothing changes. A real-world
// spot has no analytic coast; it can have a wind patch instead (patch).
import { shoreOffset } from "./waves.js";

// Bump when the zones change, so cached AI heats are sailed again.
export const ZONE_VERSION = 1;

// windZones (from tour/venues.json): { gain, from, over, lee }. gain knots
// more from `from` metres out from the beach, ramping in over `over` metres;
// lee knots less within 90 m of the beach. knots: the heat's wind; the lee is
// cut so it never takes the local wind under the game's lightest, 12 kt.
// There is no cap on top: 28 kt plus a 4 kt zone is under the 34 kt the
// game's own strongest gusts reach.
export function zonesFor(windZones, coast, knots = Infinity) {
  if (!windZones || !coast) return null;
  const { gain, from, over } = windZones;
  const lee = Math.min(windZones.lee, Math.max(0, knots - 12));
  return { inX: coast.inX, inZ: coast.inZ, shoreline: coast.shoreline, curve: coast.curve, gain, from, over, lee };
}

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// A wind patch (windPatch in tour/venues.json): { x, z, radius, length, gain },
// gain knots more where the wind is squeezed, as through a gap, at (x, z) in
// the spot's game frame, carried length metres downwind (+x) and radius
// metres across and upwind, fading out towards its edge. Keep in step with
// the water shader's patchKnots in patches.mjs.
function patchKnots({ x: px, z: pz, radius, length, gain }, x, z) {
  const d = Math.hypot((x - px) / (x > px ? length : radius), (z - pz) / radius);
  return gain * (1 - smoothstep(.4, 1, d));
}

// The knots a venue's zones add at (x, z); keep in step with the water
// shader's zoneKnots in patches.mjs.
export function zoneKnots(zones, x, z) {
  if (!zones) return 0;
  let knots = zones.patch ? patchKnots(zones.patch, x, z) : 0;
  if (zones.inX === undefined) return knots;
  const off = shoreOffset(x, z, [zones.inX, zones.inZ, zones.shoreline], zones.curve);
  knots += zones.gain * smoothstep(zones.from, zones.from + zones.over + 1, off) - zones.lee * (1 - smoothstep(0, 90, off));
  return knots;
}

// The water shader's uZone for these zones, and its uPatch.
export const zoneUniform = (zones) => (zones?.inX !== undefined ? [zones.gain, zones.from, zones.over, zones.lee] : [0, 0, 0, 0]);
export const patchUniform = (zones) => (zones?.patch ? [zones.patch.x, zones.patch.z, zones.patch.radius, zones.patch.length] : [0, 0, 1, 1]);

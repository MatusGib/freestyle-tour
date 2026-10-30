// What the ground is, per pixel: from map polygons first, then the distance
// to the shore, then the satellite colour. Plan 2 textures and plants follow it.
export const GROUND = { water: 0, drySand: 1, wetSand: 2, coralRubble: 3, scrubSoil: 4, rock: 5, mangrove: 6, builtUp: 7 };

// cell: { land, shore (metres from the shoreline), colour: [r, g, b], mangrove, beach, building }.
export function groundType({ land, shore, colour: [r, g, b], mangrove, beach, building }) {
  if (mangrove) return GROUND.mangrove;
  if (!land) return GROUND.water;
  if (building) return GROUND.builtUp;
  if (shore < 8) return GROUND.wetSand;
  if (beach) return GROUND.drySand;
  const light = (r + g + b) / 3, green = g - (r + b) / 2;
  if (green > 8) return GROUND.scrubSoil;
  if (light > 170) return shore < 120 ? GROUND.drySand : GROUND.rock;
  if (light > 110) return shore < 60 ? GROUND.coralRubble : GROUND.scrubSoil;
  return GROUND.rock;
}

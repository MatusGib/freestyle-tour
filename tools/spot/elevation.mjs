// Heights for a spot: AWS Terrain Tiles (terrarium PNG, open data on AWS;
// SRTM-class, about 30 m) sampled into the game frame, with the shore rebuilt
// from the coastline, since 30 m cells can't hold a beach, and the seabed from
// the depth map.
import { tileOf } from "./frame.mjs";

export const TERRAIN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
export const terrariumHeight = (r, g, b) => r * 256 + g + b / 256 - 32768;

export function terrainUrls(box, z) {
  const a = tileOf(box.north, box.west, z), b = tileOf(box.south, box.east, z), urls = [];
  for (let y = Math.floor(a.y); y <= Math.floor(b.y); y++) for (let x = Math.floor(a.x); x <= Math.floor(b.x); x++) urls.push({ z, x, y, url: `${TERRAIN}/${z}/${x}/${y}.png` });
  return urls;
}

// A sampler over decoded tiles ({ z, x, y, image }): height at a lat/lon.
export function terrainSampler(tiles) {
  const byKey = new Map(tiles.map((t) => [`${t.x}/${t.y}`, t])), z = tiles[0].z;
  return (lat, lon) => {
    const p = tileOf(lat, lon, z), tx = Math.floor(p.x), ty = Math.floor(p.y), t = byKey.get(`${tx}/${ty}`);
    if (!t) return 0;
    const px = Math.min(255, Math.max(0, Math.floor((p.x - tx) * 256))), py = Math.min(255, Math.max(0, Math.floor((p.y - ty) * 256)));
    const k = (py * 256 + px) * t.image.channels, d = t.image.data;
    return terrariumHeight(d[k], d[k + 1], d[k + 2]);
  };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The height at signed distance `shore` from the shoreline (metres, land
// positive), given the coarse elevation there and, under water, the depth.
// beach: { top: height at the water's edge, slope, width: where the profile
// hands over to the elevation }. A shore that isn't a beach (onBeach false:
// rock, cliffs) rises to its elevation within RISE metres instead.
const RISE = 12;
export function beachHeight(shore, elevation, beach, depth = 0, onBeach = true) {
  if (shore < 0) return -depth;
  const profile = beach.top + beach.slope * shore;
  const blend = onBeach ? smooth(beach.width * 0.5, beach.width * 1.5, shore) : smooth(0, RISE, shore);
  return Math.round(((1 - blend) * profile + blend * Math.max(elevation, profile)) * 10) / 10;
}

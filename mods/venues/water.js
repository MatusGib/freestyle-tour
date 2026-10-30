// Each venue's water and sky, drawn by the game's own shaders through the
// uniforms patches.mjs adds. Colours go straight to the screen (sRGB, 0–1),
// like the shaders' own. Without a venue every value returns to the game's,
// so its own look is unchanged.
import { GAME_COLOURS } from "./patches.mjs";
import { coastFor } from "./scenery.js";
import { currentWaves, setSea } from "./waves.js";

export const GAME_LOOK = { ...GAME_COLOURS, shallow: GAME_COLOURS.light, chop: 0, caps: 0, surf: 0, barWidth: 0, shallowWidth: 0, shelter: 0, cloud: 0, cloudTint: [1, 1, 1], haziness: .0026 };
const GAME_FOG = .0035;

// chop and caps scale the wind's chop and whitecaps (1 is open water at that
// wind); surf the shorebreak and the waves on the sandbar. shallowWidth: how
// far out the sand shows through; shelter: how much calmer the water inside
// the sandbar is. fetch: how far the wind blows over open water before the
// course, which sets the wind waves' height and length (waves.js); swell: the
// waves that come from far away, running to the beach. cloud: how much of the
// sky is cloud; haziness: how fast the water fades into the haze with
// distance (the game's is .0026); landHaze the same for the land, whose fog
// thickens faster with distance (the game's is .0035).
export const VENUE_LOOKS = {
  // Atlantic blue outside the sandbar, turquoise over the white sand of the
  // Playa Barca lagoon. The trade wind raises short chop and whitecaps
  // outside; inside the sandbar the lagoon stays flatter. Clear sky, warm haze.
  "sotavento-fuerteventura": {
    deep: [.04, .31, .47], light: [.12, .56, .65], shallow: [.44, .84, .78],
    sky: [.74, .85, .9], haze: [.84, .85, .82], skyLow: [.86, .87, .83], skyHigh: [.52, .71, .9],
    chop: 1, caps: 1, surf: .3, barWidth: 18, shallowWidth: 290, shelter: .75,
    fetch: 40000, swell: { length: 60, height: .15 },
    cloud: .42, cloudTint: [.97, .97, .95], haziness: .0016, landHaze: .0009,
    // The trades blow harder out past the sandbar, lighter close to the beach.
    zones: [5, 220, 120, 3],
  },
  // The open North Sea: dark grey-green water, green-brown with sand in the
  // surf zone, a steep shorebreak and steeper chop, under a paler, cooler sky.
  "westerland-sylt": {
    deep: [.11, .24, .27], light: [.24, .39, .4], shallow: [.44, .5, .42],
    sky: [.7, .75, .78], haze: [.72, .77, .79], skyLow: [.75, .79, .81], skyHigh: [.6, .68, .74],
    chop: 1.35, caps: 1.2, surf: 1, barWidth: 30, shallowWidth: 110, shelter: 0,
    fetch: 60000, swell: { length: 80, height: .6 },
    cloud: .72, cloudTint: [.86, .88, .89], haziness: .0022, landHaze: .0016,
    // An onshore wind arrives evenly; only out over the sand ridge a little more.
    zones: [2, 380, 80, 0],
  },
};

// The wind zones are a preview of how they would look, not wind the rider
// feels: localStorage "freestyle-tour.venue.zones-preview" = "1" turns it on.
const previewZones = () => {
  try {
    return localStorage.getItem("freestyle-tour.venue.zones-preview") === "1";
  } catch {
    return false;
  }
};

// Returns false when the water patch is missing (the game then keeps its look).
export function applyVenueLook(game, venue) {
  const water = game.water?.uniforms;
  if (!water?.uDeep) return false;
  const look = VENUE_LOOKS[venue?.id] ?? GAME_LOOK;
  const coast = VENUE_LOOKS[venue?.id] ? coastFor(venue.id) : null;
  water.uDeep.value = look.deep;
  water.uLight.value = look.light;
  water.uShallow.value = look.shallow;
  water.uSky.value = look.sky;
  water.uHaze.value = look.haze;
  water.uChop.value = look.chop;
  water.uCaps.value = look.caps;
  water.uSurf.value = look.surf;
  water.uFogRate.value = look.haziness;
  water.uZone.value = coast && look.zones && previewZones() ? look.zones : [0, 0, 0, 0];
  const bar = coast ? [coast.sandbar, look.barWidth, look.shallowWidth, look.shelter] : [0, 0, 0, 0];
  water.uShore.value = coast ? [coast.inX, coast.inZ, coast.shoreline, 0] : [0, 0, 0, 0];
  water.uCurve.value = coast ? coast.curve : [0, 0, 0, 0];
  water.uBar.value = bar;
  setSea(coast && { fetch: look.fetch, swell: look.swell, inX: coast.inX, inZ: coast.inZ, shoreline: coast.shoreline, curve: coast.curve, bar, surf: look.surf });
  water.uWave.value = currentWaves();
  const sky = game.scene?.getObjectByName("sky")?.material?.uniforms;
  if (sky?.uSkyLow) {
    sky.uSkyLow.value = look.skyLow;
    sky.uSkyHigh.value = look.skyHigh;
    sky.uCloud.value = look.cloud;
    sky.uCloudTint.value = look.cloudTint;
  }
  // The beach and its buildings fade into the same haze as the water.
  const fog = game.scene?.fog;
  if (fog?.color) {
    game.__venueGameFog ??= fog.color.clone();
    if (coast) fog.color.setRGB(...look.haze, "srgb");
    else fog.color.copy(game.__venueGameFog);
    fog.density = coast ? look.landHaze : GAME_FOG;
  }
  return true;
}

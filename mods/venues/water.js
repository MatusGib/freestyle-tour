// Each venue's water and sky, drawn by the game's own shaders through the
// uniforms patches.mjs adds. Colours go straight to the screen (sRGB, 0–1),
// like the shaders' own. Without a venue every value returns to the game's,
// so its own look is unchanged.
import { GAME_COLOURS } from "./patches.mjs";
import { coastFor } from "./scenery.js";

export const GAME_LOOK = { ...GAME_COLOURS, shallow: GAME_COLOURS.light, chop: 0, caps: 0, surf: 0, barWidth: 0, shallowWidth: 0, shelter: 0 };

// chop and caps scale the wind's chop and whitecaps (1 is open water at that
// wind); surf the shorebreak and the waves on the sandbar. shallowWidth: how
// far out the sand shows through; shelter: how much calmer the water inside
// the sandbar is.
export const VENUE_LOOKS = {
  // Atlantic blue outside the sandbar, turquoise over the white sand of the
  // Playa Barca lagoon. The trade wind raises short chop and whitecaps
  // outside; inside the sandbar the lagoon stays flatter. Clear sky, warm haze.
  "sotavento-fuerteventura": {
    deep: [.04, .31, .47], light: [.12, .56, .65], shallow: [.44, .84, .78],
    sky: [.74, .85, .9], haze: [.84, .85, .82], skyLow: [.86, .87, .83], skyHigh: [.52, .71, .9],
    chop: 1, caps: 1, surf: .3, barWidth: 18, shallowWidth: 290, shelter: .75,
  },
  // The open North Sea: dark grey-green water, green-brown with sand in the
  // surf zone, a steep shorebreak and steeper chop, under a paler, cooler sky.
  "westerland-sylt": {
    deep: [.11, .24, .27], light: [.24, .39, .4], shallow: [.44, .5, .42],
    sky: [.7, .75, .78], haze: [.72, .77, .79], skyLow: [.75, .79, .81], skyHigh: [.6, .68, .74],
    chop: 1.35, caps: 1.2, surf: 1, barWidth: 30, shallowWidth: 110, shelter: 0,
  },
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
  water.uShore.value = coast ? [coast.inX, coast.inZ, coast.shoreline, 0] : [0, 0, 0, 0];
  water.uBar.value = coast ? [coast.sandbar, look.barWidth, look.shallowWidth, look.shelter] : [0, 0, 0, 0];
  const sky = game.scene?.getObjectByName("sky")?.material?.uniforms;
  if (sky?.uSkyLow) {
    sky.uSkyLow.value = look.skyLow;
    sky.uSkyHigh.value = look.skyHigh;
  }
  // The beach and its buildings fade into the same haze as the water.
  const fog = game.scene?.fog?.color;
  if (fog) {
    game.__venueGameFog ??= fog.clone();
    if (coast) fog.setRGB(...look.haze, "srgb");
    else fog.copy(game.__venueGameFog);
  }
  return true;
}

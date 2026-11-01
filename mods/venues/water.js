// Each venue's water and sky, drawn by the game's own shaders through the
// uniforms patches.mjs adds. Colours go straight to the screen (sRGB, 0–1),
// like the shaders' own. Without a venue every value returns to the game's,
// so its own look is unchanged.
import { GAME_COLOURS } from "./patches.mjs";
import { coastFor } from "./coast.js";
import { currentWaves, setSea, setSpotWater } from "./waves.js";

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
  },
  // The open North Sea: dark grey-green water, green-brown with sand in the
  // surf zone, a steep shorebreak and steeper chop, under a paler, cooler sky.
  "westerland-sylt": {
    deep: [.11, .24, .27], light: [.24, .39, .4], shallow: [.44, .5, .42],
    sky: [.7, .75, .78], haze: [.72, .77, .79], skyLow: [.75, .79, .81], skyHigh: [.6, .68, .74],
    chop: 1.35, caps: 1.2, surf: 1, barWidth: 30, shallowWidth: 110, shelter: 0,
    fetch: 60000, swell: { length: 80, height: .6 },
    cloud: .72, cloudTint: [.86, .88, .89], haziness: .0022, landHaze: .0016,
  },
  // Lac Bay, from its depth map: deep Caribbean blue beyond the reef, bright
  // turquoise over the lagoon's white sand, dark green-blue over its
  // seagrass, surf breaking on the reef and a calm lagoon behind it. The
  // trades: a swell running downwind, high scattered white cumulus, clear air.
  // seagrass: the colour over the dark lagoon floor; sandFloor: the
  // satellite's lightness from seagrass to white sand (.3 to .75 unless
  // set); caustics: sunlight rippling over the shallow floor; marks: how
  // much of the game's stylised crest lines and streaks show (1 is the game's).
  "sorobon-bonaire": {
    deep: [.02, .2, .45], light: [.05, .42, .62], shallow: [.44, .81, .79], seagrass: [.09, .36, .38],
    sky: [.72, .84, .93], haze: [.78, .86, .92], skyLow: [.82, .88, .93], skyHigh: [.36, .6, .9],
    chop: 1, caps: .7, surf: 1, shelter: .8, caustics: 1, marks: .25,
    fetch: 100000, swell: { length: 70, height: .5 },
    cloud: .25, cloudTint: [1, 1, 1], haziness: .0006, landHaze: .00012,
  },
  // Prasonisi, from its depth map: the meltemi blows over the sandbar onto a
  // flat bay, turquoise over golden sand by the beach and deep Aegean blue
  // beyond; the sandbar's lee (spotLee) keeps the swell out and the chop
  // small near the beach, while the open sea upwind runs steep wind waves
  // onto the wave side. The meltemi's clear, deep-blue sky, almost cloudless.
  "prasonisi-rhodes": {
    // Its satellite water is darker than Bonaire's, so its sand reads darker.
    deep: [.015, .17, .4], light: [.04, .36, .58], shallow: [.42, .77, .7], seagrass: [.08, .3, .36], sandFloor: [.12, .19],
    sky: [.62, .78, .92], haze: [.8, .86, .91], skyLow: [.8, .87, .93], skyHigh: [.24, .5, .86],
    chop: 1.1, caps: 1, surf: 1, shelter: .4, caustics: 1, marks: .25,
    fetch: 40000, swell: { length: 55, height: .45 },
    cloud: .06, cloudTint: [1, 1, 1], haziness: .0005, landHaze: .00012,
  },
};

// spotWater: a real-world spot's water map (realworld/spot.js waterMap) with
// its texture, once the spot has loaded; its water then reads the depth.
// Returns false when the water patch is missing (the game then keeps its look).
export function applyVenueLook(game, venue, spotWater = null) {
  const water = game.water?.uniforms;
  if (!water?.uDeep) return false;
  const look = VENUE_LOOKS[venue?.id] ?? GAME_LOOK;
  const coast = VENUE_LOOKS[venue?.id] ? coastFor(venue.id) : null;
  const spot = VENUE_LOOKS[venue?.id] && !coast ? spotWater : null;
  water.uDeep.value = look.deep;
  water.uLight.value = look.light;
  water.uShallow.value = look.shallow;
  water.uSky.value = look.sky;
  water.uHaze.value = look.haze;
  water.uChop.value = look.chop;
  water.uCaps.value = look.caps;
  water.uSurf.value = look.surf;
  water.uFogRate.value = look.haziness;
  const bar = coast ? [coast.sandbar, look.barWidth, look.shallowWidth, look.shelter] : spot ? [0, 0, 0, look.shelter] : [0, 0, 0, 0];
  water.uShore.value = coast ? [coast.inX, coast.inZ, coast.shoreline, 0] : [0, 0, 0, 0];
  water.uCurve.value = coast ? coast.curve : [0, 0, 0, 0];
  water.uBar.value = bar;
  water.uSeagrass.value = look.seagrass ?? look.shallow;
  water.uSpotWater.value = spot?.texture ?? null;
  water.uSpotBox.value = spot ? [spot.half, 1, spot.depthMax, spot.distanceMax] : [0, 0, 0, 0];
  water.uSpotFloor.value = spot?.floor ?? .8;
  water.uSpotFetch.value = spot ? [spot.fetchMax, look.fetch] : [1, 1];
  water.uSpotColour.value = spot?.colour ?? null;
  water.uSandFloor.value = look.sandFloor ?? [.3, .75];
  water.uCaustics.value = spot ? look.caustics ?? 0 : 0;
  water.uMarks.value = look.marks ?? 1;
  setSpotWater(spot);
  // A spot's swell runs downwind, as the trades blow, and dies on its reef
  // and shores (waves.js spotWaves) rather than on an analytic beach.
  if (coast) setSea({ fetch: look.fetch, swell: look.swell, inX: coast.inX, inZ: coast.inZ, shoreline: coast.shoreline, curve: coast.curve, bar, surf: look.surf });
  else setSea(spot && { fetch: look.fetch, swell: look.swell, inX: 1, inZ: 0, shoreline: 0, curve: [0, 0, 0, 0], bar, surf: look.surf });
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
    if (coast || spot) fog.color.setRGB(...look.haze, "srgb");
    else fog.color.copy(game.__venueGameFog);
    fog.density = coast || spot ? look.landHaze : GAME_FOG;
  }
  return true;
}

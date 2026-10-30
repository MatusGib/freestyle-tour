# Venue water and graphics plan

Make each venue's water read like the real spot on a contest day: how much
wind there is, where it is stronger, how rough the water gets, and its colour.
This extends the venue pilot (`docs/superpowers/specs/2026-10-28-venue-profiles-design.md`)
and step 4 of `docs/venues-roadmap.md`.

## How the real thing looks

What a windsurfer reads from the water, and what the game can draw from it:

| Cue on the water | What causes it | In the game |
|---|---|---|
| Dark, ruffled patches moving downwind | Gusts: rougher water reflects less sky | Already there. The game's gust field is spatial and drives the physics; its shader darkens exactly where a gust blows |
| Whitecaps | Wind waves breaking. Cover W = 3.84e-6·U^3.41 (Monahan and O'Muircheartaigh 1980, U in m/s): scattered at 12–15 kt, many at 17–21 kt, everywhere at 22–27 kt | Done: small breaking crests, more inside gusts, cover from the formula |
| Foam streaks along the wind | Beaufort 7 (28 kt and up) | Done for 24 kt and up (practice goes to 28 kt) |
| Short, steep chop | Grows with wind and fetch; flat in the lee of a sandbar or reef | Done as surface shading, scaled by the local wind, calmer in a sheltered lagoon |
| Swell lines | Distant storms, independent of the local wind (North Sea, Atlantic) | Not yet: needs wave geometry (phase 2) |
| Water colour | Depth and bottom (white sand gives turquoise), suspended sand (North Sea green-brown), sky reflection | Done: deep, open, shallow colours per venue; shallows by distance from the beach |
| Shorebreak and breaking bars | Waves breaking on the beach and on sandbars | Done as foam lines; height comes with phase 2 |
| Flags, spray, sails on the beach | Show wind direction and strength at a glance | Not yet (phase 3) |

## Phase 1: water look per venue (built)

- A serve-time patch (`mods/venues/patches.mjs`) turns the water shader's fixed
  colours into uniforms that start at the game's own values, so the game looks
  the same without a venue. It adds wind chop, whitecaps, shallows, a sandbar
  band, a shorebreak, and tints the sky dome and haze.
- `mods/venues/water.js` holds each venue's look: Sotavento's Atlantic blue,
  turquoise lagoon and flatter water inside the sandbar; Sylt's grey-green
  North Sea, sandy surf zone, sand ridge and steep shorebreak.
- The whitecaps and chop follow the heat's wind and each gust, so a windier
  heat looks windier, and a gust coming shows as a dark patch with more
  whitecaps in it.
- Physics, scoring and the heat area are unchanged.

Check: both venues side by side at 15, 19 and 25 kt (practice), and the game's
own look with no venue chosen.

## Phase 2: wave height that follows the wind (built)

The game's physics never read the waves (its engine doesn't import the wave
module), so taller waves are visual only. `mods/venues/waves.js`:

- Wind waves sized by JONSWAP for the wind and each venue's fetch (about 1 m
  and 32 m long at Sotavento in 19 kt; 1.1 m and 40 m at Sylt in 17 kt), in
  three crests spread around the wind, plus a swell running to the beach
  (0.6 m at Sylt).
- Calmer inside Sotavento's sandbar; rising a little over Sylt's shallows;
  dying on the beach, where the water stays below the sand (it used to flood
  it) and a wet foreshore slopes under it so the swash runs up and down.
- The water mesh has a vertex every 7.2 m instead of 14.4 m, and the vertex
  shader and the game's height function add the same waves, so the rider,
  buoys and wake float on the drawn surface.

Still to do: waves that visibly break on the bar and the shorebreak, not just
foam.

## Phase 3: wind you can see on the beach and the rider

- Built: feather flags streaming downwind, a banner fence, rigged sails and
  boards on the sand, spectators (`mods/venues/props.js`, with three.js r185's
  geometry and simplex noise, vendored in `mods/venues/lib`).
- Still to do: flags that flap harder in more wind (they are static now);
  spray off the board and sail, growing with speed and wind; spindrift off
  crests above about 25 kt.

## Phase 4: light and sky per venue

- Canaries: high, hard sun, strong glitter, deep shadows; some days a dusty
  calima haze.
- Sylt: low autumn sun or overcast, soft light, little glitter, grey sky.
- Optional time of day per event (morning, midday, evening heats).

Built so far: clouds in the sky dome (fair-weather at Sotavento, broken at
Sylt) and per-venue haze, so the Jandía ridges and Westerland show.

## Phase 5: where the wind is stronger (decision needed)

Real venues have wind zones: at Sotavento the trades blow harder further out
and gustier near the beach; at Pozo an acceleration zone; inland lakes like
Podersdorf are gusty and shifty. Two ways:

- **Visual only (recommended to start).** Keep drawing the game's own gust
  field, which already is the wind the rider feels. Phase 1 makes it easier to
  read.
- **Preview (built, off by default).** Each venue has a zone profile in
  `water.js` (Sotavento: 5 kt more from 220 m out, 3 kt less near the beach;
  Sylt: 2 kt more over the sand ridge). With localStorage
  `freestyle-tour.venue.zones-preview` set to `1`, the water draws it: darker,
  rougher water with more whitecaps where it blows harder, calmer water in the
  lee. It is looks only; the rider doesn't feel it.
- **Real wind zones.** Make the wind stronger or gustier by place at each
  venue. This changes the physics: the server's AI must sail the same zones,
  weekly scores stop being comparable across venues, and the patch must run in
  the browser and in the Node sailer alike.

## Phase 6: every venue's look

Give each mapped venue its look once the location mapping (roadmap step 1) is
done. Starting points only, each to be checked against photos and PWA reports:

| Venue | Water | Wind setup |
|---|---|---|
| Pozo Izquierdo, Gran Canaria | Deep Atlantic blue, big chop and swell, rocky shore | Very strong, gusty side-shore |
| Costa Teguise, Lanzarote | Blue over reef and sand, chop | Side-shore trades |
| Podersdorf, Neusiedler See | Shallow brown-green lake, short steep chop | Gusty, shifty |
| Sorobon, Bonaire | Turquoise flat lagoon behind a reef | Steady trades |
| Aruba | Turquoise, flat to light chop | Steady trades |
| Leucate, Mondial du Vent | Mediterranean blue, flat near shore | Tramontane, gusty |
| Marseille | Mediterranean blue | Mistral, gusty |
| Viana do Castelo | Atlantic grey-blue, swell | Northerly |
| Mui Ne, Vietnam | Green-blue, chop | Side-onshore |
| Netherlands (2013) | North Sea grey-green | Onshore |
| Warsaw indoor (2014) | A pool under fans | Indoor: its own scene, not a coast |

Several real places can share one scene while keeping their own wind and water
values.

## Order

1. Phase 1 tuning with the user (colours, whitecap amount).
2. Phase 3 flags that flap with the wind, and spray.
3. Phase 2 breaking waves.
4. Phase 4.
5. Phase 6 as each venue is mapped.
6. Phase 5 only after the user chooses.

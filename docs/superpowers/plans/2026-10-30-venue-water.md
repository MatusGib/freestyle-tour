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

## Phase 2: wave height that follows the wind

Chop is now only shading. Real chop and swell also lift the board and the
buoys. The game moves its water mesh in a vertex shader and computes the same
heights on the CPU for the rider, buoys and wake.

1. Find whether the physics read the wave height (jumps, landings). If they
   do, taller waves change the game, and the server's AI must sail the same
   waves; stop and decide with the user.
2. If they don't: patch the vertex shader and the CPU height function together
   with one amplitude per venue and wind, so the rider still floats on the
   drawn surface.
3. Add swell at open-sea venues (Sylt, Pozo): long crests running to the
   beach, steepening and breaking on the bar and the shorebreak.

## Phase 3: wind you can see on the beach and the rider

- Flags and banners at the event site that stream in the wind direction and
  flap harder in more wind.
- Spray off the board and sail, growing with speed and wind; spindrift off
  crests above about 25 kt.
- Rigged sails lying on the beach, and spectators along the event strip.

## Phase 4: light and sky per venue

- Canaries: high, hard sun, strong glitter, deep shadows; some days a dusty
  calima haze.
- Sylt: low autumn sun or overcast, soft light, little glitter, grey sky.
- Optional time of day per event (morning, midday, evening heats).

## Phase 5: where the wind is stronger (decision needed)

Real venues have wind zones: at Sotavento the trades blow harder further out
and gustier near the beach; at Pozo an acceleration zone; inland lakes like
Podersdorf are gusty and shifty. Two ways:

- **Visual only (recommended to start).** Keep drawing the game's own gust
  field, which already is the wind the rider feels. Phase 1 makes it easier to
  read.
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
2. Phase 3 flags and spray: cheap, clearly shows the wind.
3. Phase 2, after checking the physics.
4. Phase 4.
5. Phase 6 as each venue is mapped.
6. Phase 5 only after the user chooses.

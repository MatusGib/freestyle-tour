# Real-world spots, part 1: map data, and Bonaire

Sub-project 4 (`docs/roadmap.md`), the first of two specs for making the
venues look like the real places. This one builds a spot from real map data,
the true way round, and builds Sorobon (Lac Bay, Bonaire) on it. The second
spec, the venue rendering pipeline, adds see-through water, reflections, sky
and post-processing on top; it draws on the techniques of
[WaterThreeJS](https://github.com/achrefelouafi/WaterThreeJS) (MIT).

Supersedes the Bonaire part of the scenery outline,
`docs/superpowers/plans/2026-10-30-venue-scenery.md`.

## Goal

Choosing Sorobon puts you in Lac Bay as it really is: the shape of the bay and
its shores from map data, the real seabed colours of the lagoon, the reef
across the mouth with surf breaking on it, the mangroves, the scrubland with
its cacti and divi-divi trees, and Sorobon beach with its windsurf centres,
turned so the trade wind blows across the course as it does there. Up close it
looks like real sand and rock, not flat colour.

## Decisions

| Topic | Decision |
|---|---|
| Source of the land | Real map data: OpenStreetMap features, Copernicus elevation, Sentinel-2 cloudless colours. Landmarks are modelled by hand from photos |
| Look | As realistic as possible, though richer than the game's own lagoon. The riders, buoys and HUD stay the game's |
| Orientation | True: the map turned so the real wind blows along the game's +x, never mirrored. Sotavento and Sylt are flipped to match later |
| First spot | Sorobon, Bonaire; then Pozo and Podersdorf on the same tools |
| Rendering | In today's renderer for this spec; see-through water, reflections and post come with the rendering spec, which follows the game's own quality setting |
| Assets | CC0 photo-scanned textures and models (ambientCG, Poly Haven), downloaded while building with the user's OK for each pack; what they lack (mangroves, kadushi cacti, divi-divi trees) is generated in code |
| Fetching | Only while building; the game and its server never contact any of these sources |

## Success criteria

1. In the venue chooser, Sorobon shows its picture and builds Lac Bay: the
   beach with the windsurf centres, the mangroves, the reef with its surf line,
   the lagoon's real colour pattern, the scrubland behind.
2. The wind blows across the course as the trade wind does at Sorobon,
   relative to the real shore. Nothing is mirrored: the bay and its landmarks
   are where a map puts them.
3. The tool writes a top-down comparison of the built spot over the satellite
   image; the shoreline and reef line match within about 10 m.
4. Up close the ground shows sand grain, coral rubble and rock, without
   visible tiling at the usual camera distance.
5. The rider stops at the real shoreline and the mangroves; the course lies in
   sailable water.
6. Bonaire's events (2011, 2014, 2019) race here in the challenge.
7. At the game's high quality, a frame stays within 16.7 ms on the
   development machine (the game's own GPU timer).
8. Without a venue the game is unchanged, and `npm test` passes.

## Out of scope

- See-through water, screen-space reflections, bloom, tone mapping,
  volumetric clouds: the rendering spec.
- Pozo and Podersdorf: after Bonaire sets the bar, on the same tools.
- Flipping Sotavento and Sylt to true orientation, or rebuilding them from map
  data.
- Changes to physics, scoring or the heat area. The game never reads the depth
  of the water.

## What exists

- **Venue scenery** (`mods/venues/scenery.js`, 662 lines): two hand-made
  builders, noise terrain with flat colours, batched boxes, cylinders and a
  prop kit (`props.js`: pagodas, flags, rigs, people, palms, bushes) on
  three.js r185 vendored in `mods/venues/lib`. The coast is placed by
  `coast.js` (`SITE_LAYOUTS`): an angle to the wind, a distance, bends and a
  sandbar line. Collision (`resolveVenueCollision`) follows that layout.
- **Water** (`mods/venues/patches.mjs`, `water.js`, `waves.js`): the game's
  shader with uniforms for colours, chop, whitecaps, shallows by distance from
  an analytic shoreline, a sandbar band, shorebreak; JONSWAP wind waves and
  swell that die on the beach; sky dome tint and clouds.
- **The game's renderer**: one `renderer.render(scene, camera)` per frame, an
  adaptive quality setting and a GPU timer.
- **Bonaire** in `tour/venues.json`: 18 kt steady, no scenery; its 2011, 2014
  and 2019 events map to it.

## Approach

A build-time tool turns open map data for an area into small files in
game coordinates; a shared set of modules in the venues mod builds any spot
from those files; Bonaire is the first spot. Everything the game loads is in
the repo.

We considered hand-modelling from photos (faster, but the shapes are only
approximate) and photogrammetric 3D tiles (their licences don't allow it).

## Components

### The spot file (`tour/spots/sorobon-bonaire.json`)

- `centre`: latitude and longitude of the competition area off Sorobon beach,
  fixed during the build from OpenStreetMap (the Jibe City and Sorobon
  features) and event photos;
- `detail`: the half-width of the detailed area, 2500 m; `horizon`: 12500 m;
- `windFrom`: the trade wind's bearing, 90° (east) unless the reports say
  otherwise;
- `sources`: each data source with its licence and credit line.

### The tool (`tools/spot.mjs`)

Run once per spot, `node tools/spot.mjs sorobon-bonaire`. It downloads into
`cache/spots/<id>/` (git-ignored) and writes `mods/venues/spots/<id>/`:

- **Elevation:** Copernicus DEM GLO-30 tiles (30 m). Near the shore the
  heights are rebuilt from OpenStreetMap's coastline and a beach profile, since
  30 m cells can't hold a beach. Written as 16-bit heights on a local metre
  grid: `terrain.bin` (detail, 4 m) and `horizon.bin` (coarse, 60 m).
- **Colour:** EOX Sentinel-2 cloudless imagery (about 10 m per pixel),
  colour-corrected to daylight, as `ground.jpg` (detail) and `horizon.jpg`.
- **Seabed depth:** estimated from the satellite colours with the log-ratio
  method for clear shallow water (blue over green), calibrated with known
  depths: the lagoon about 1 m, the reef crest 0 to 0.3 m, open sea beyond
  the reef 10 m and more. Written as `depth.png` (8-bit, 0–20 m).
- **Ground types:** `ground-type.png`, one value per cell: dry sand, wet sand,
  coral rubble, scrub soil, limestone rock, mangrove, built-up. From
  OpenStreetMap polygons where they exist, else from the satellite colour.
- **Features:** `features.json`: shoreline and mangrove-edge polygons, the
  reef line, beach polygons, building footprints with heights (from
  `height` or `building:levels`), roads and jetties, all in game coordinates.
- **Comparison:** `compare.png`, the built shoreline, reef and buildings drawn
  over the satellite image, for checking the match.
- **Picture:** `picture.jpg`, a 384 × 256 crop of the satellite image around
  the course, for the venue chooser and the event card. `publicVenue` reports
  `scenery` for a venue with spot files as well as one with an analytic coast,
  and the mod picks the picture's file by kind.
- **Credits:** `CREDITS.md` listing each source, its licence and its credit
  line.

Game coordinates: a local east/north metre grid around `centre`, turned so
the wind's downwind direction is +x and north is where it then falls; the
competition area's centre is the course centre. Never mirrored.

Every download first prints its source, what it fetches and its size, and
waits for the user's OK on the first run.

### Building the spot (`mods/venues/realworld/`, new)

- `spot.js` loads a spot's files and exposes heights, depths, ground types and
  features.
- `terrain.js` builds the land: a detail mesh at 4 m spacing out to about
  1.5 km from the course, a horizon mesh beyond, skirts to hide the joins. Its
  material blends the satellite colour with CC0 detail textures by ground type,
  with tiling broken up by noise and two scales of each texture.
- `scatter.js` places plants by ground type and density from the satellite
  colour, as instanced meshes: thousands at the cost of a few draw calls.
- `plants.js` generates mangroves (arching prop roots, dense rounded canopy),
  kadushi cacti (ribbed columns, a few arms), divi-divi trees (leaning
  downwind, flat crown) and scrub, each in a few variants.
- `buildings.js` raises OpenStreetMap footprints to their heights with roofs
  and wall textures.
- `collision.js` stops the rider at the shoreline and mangrove polygons.

### Sorobon (`mods/venues/sites/sorobon-bonaire.js`, new)

The hand-built landmarks on the beach, from photos: the windsurf centres'
huts and bars (Jibe City and its neighbours), the Sorobon resort bungalows,
palapa umbrellas, rigs and boards on the sand, flags blowing in the real
wind, a few palms. Its water look in `water.js`: lagoon turquoise over white
sand, darker channels, bright reef crest with surf, Caribbean blue outside;
clear sky with scattered trade-wind cumulus and a high sun.

### The water reads the real depth (`mods/venues/patches.mjs`, `waves.js`)

For a real-world spot the water shader samples `depth.png` (a texture and its
transform as uniforms) instead of the analytic shoreline, sandbar and curve:
shallows, the reef's surf line and the beach's foam come from the real
depths. Waves shrink with depth the same way, so the reef breaks the swell
and the lagoon stays flat. Sotavento and Sylt keep their analytic coasts.

### Splitting the scenery (`mods/venues/scenery.js`)

The two existing builders move to `mods/venues/sites/sotavento-fuerteventura.js`
and `sites/westerland-sylt.js`; `mountVenueScenery` picks a builder from a
table, and real-world spots build through `realworld/`. No change to how
Sotavento and Sylt look.

## Errors

- **A download fails or the user declines it:** the tool stops and says
  which source; files already written stay, so a rerun continues.
- **A spot's files are missing or don't load in the game:** the venue falls
  back to the game's own scene in its usual wind, and the mod logs it.
- **The course would not lie in sailable water:** the tool refuses to write
  the spot and says where the course hits land or reef.

## Testing

- **Tool, on small fixtures:** projection and rotation (a known point lands
  where it should; nothing is mirrored), elevation sampling and the shoreline
  rebuild, the depth fit (calibrated depths come back), ground types,
  footprint conversion with heights.
- **Real data:** Sorobon's files load; the course lies in water at least
  0.5 m deep; the shoreline stops the rider; the comparison image exists.
- **Game:** with the venue chosen the scene builds without errors; the water
  reads the depth map; Sotavento and Sylt look as before; without a venue the
  game is unchanged.
- **Browser preview:** views from the course towards the beach, the reef and
  the mangroves; frame time from the game's GPU timer at high and standard
  quality.

## Risks

- **Satellite-derived depth** is approximate where the bottom is dark (sea
  grass, coral) rather than sand. Calibration and a cap keep it plausible;
  the map's reef line overrides.
- **30 m elevation** can't show small dunes or the beach berm; the shoreline
  rebuild and detail textures carry the near view.
- **Performance** with dense vegetation and large textures: instancing,
  texture sizes chosen per quality level, and distance culling.
- **The camera's far plane and fog** may hide the horizon terrain; checked
  first, and the horizon mesh sized to what is visible.
- **Licences:** EOX's 2018+ imagery is CC BY-NC-SA 4.0, fine for this private,
  non-commercial project with credit; OpenStreetMap is ODbL with credit;
  Copernicus DEM's terms are confirmed and quoted in `CREDITS.md` before use.

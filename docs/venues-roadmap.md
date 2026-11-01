# Venue implementation roadmap

This roadmap expands sub-project 4 in `docs/roadmap.md`. It adds recognizable
places and conditions to PWA freestyle events while keeping the local copy
private and the original game's controls, scoring, heat rules and water physics
unchanged.

## Current pilot

The optional `venues` mod now offers Sotavento/Fuerteventura and
Westerland/Sylt for practice and solo heats. Tour challenges at those mapped
locations also use the same conditions for the player's and AI's heats. The
profiles are qualitative game mappings with source notes, not historical
heat-level wind measurements.

The current snapshot exposes `Game.setPracticeConditions` and a conditions
argument on `Game.start`; setting practice conditions updates the existing
water. It does not expose a venue or coastline selector. The venue mod builds
stationary, lit Three.js scene geometry: Sotavento's turquoise lagoon, outer
sandbar, Playa Barca judging tower, René Egli centre, low resort wings, dunes,
and distant Jandía ridge; Sylt's steel-blue North Sea, offshore ridge and
trough, shorebreak, rocky groynes, yellow crossing markers, blue-and-white
beach baskets, Brandenburger Strand event strip, promenade, sea wall, and
Musikmuschel. The game's wind always blows along +x and its heat area never
moves, so the coast is turned to the venue's angle to the wind instead:
side-shore and slightly offshore at Sotavento, side-onshore at Sylt. The heat
area, its buoys and the AI's heats are the game's own. The scene is mirrored
so the beach stays in the default camera's view. The local collision boundary
keeps the rider off sand, while Sylt groynes are solid unless cleared with a
high jump. Raised terrain occludes the water at the curved coast.

A serve-time patch (`mods/venues/patches.mjs`) turns the water shader's fixed
colours into uniforms, all starting at the game's own values, and adds wind
chop, whitecaps whose cover follows the measured whitecap formula for the local
wind (gusts included), and each venue's shallows, sandbar and shorebreak. The
sky dome and scene haze follow the venue. The water plan,
`docs/superpowers/plans/2026-10-30-venue-water.md`, has what comes next.

The current scene uses approximate, sourced site dimensions rather than a
georeferenced event map. The beach lies at least 80 m beyond the nearest course
corner and at least 30 m beyond the water six local AI heats were seen to sail
(they overshoot the course ends by up to 43 m). At Sotavento the shoreline is
about 316 m from the heat centre and the sandbar crosses the heat about 36 m on
its beach side. At Westerland the shoreline is about 326 m from the heat
centre, and the ridge, about 400 m out, crosses the seaward part of the
heat.

The committed tour data currently has 55 events across 2006–2025 and 13 raw
location strings. It has no `2026.json` season file: a refresh on 2026-10-30
reached the PWA site, but its 2026 Fuerteventura and Sylt events (and a
Shanghai foil freestyle invitational) have no results published yet, so 2026
locations are not included in event-to-venue matching yet. The manually
maintained Champion's challenge events stay
available through their existing feature.

Scene layout references:

- [Fuerteventura tourism: Sotavento windsurfing and NE summer winds](https://mapas.fuerteventuraturismo.es/en/water-sports/resource/playa-de-sotavento-windsurf)
- [Fuerteventura tourism: Sotavento lagoon and sandbar distance](https://mapas.fuerteventuraturismo.es/en/fuerteventura-tourism/resource/sotavento)
- [2025 Fuerteventura World Cup map: Playa Barca competition layout](https://www.fuerteventura-worldcup.org/images/LACARPA-2025.pdf)
- [Schleswig-Holstein coastal profile: Sylt sand ridge, trough, dunes, and west-facing shore](https://www.schleswig-holstein.de/DE/fachinhalte/K/kuestenschutz_fachplaene/2_Sylt/1_Einleitung/1_Einleitung)
- [PWA Sylt event page: waves, shorebreak, tide, and rock groynes](https://www.pwaworldtour.com/events/detail/2026-sylt-germany-grand-slam/)
- [Sylt tourism: Brandenburger Strand access](https://www.sylt.de/en/poi/barrierefreier-stranduebergang-strandstrasse)
- [Sylt tourism: Musikmuschel on the Westerland promenade](https://www.sylt.de/poi/musikmuschel)
- [2026 Westerland World Cup site layout](https://sylt-soel.de/magazin/wenn-die-promenade-wieder-strae-wird/)

Event winds (`docs/superpowers/specs/2026-10-30-event-winds-design.md`) add
Podersdorf, Pozo and Sorobon (Bonaire) as venues with a usual wind and no
scenery, and each of the 43 events at the five venues has its reported wind,
or a note that its reports give none. The scenery outline for the rest is
`docs/superpowers/plans/2026-10-30-venue-scenery.md`.

### Real-world spots: Sorobon (2026-10-31)

Sorobon is built from map data
(`docs/superpowers/specs/2026-10-30-real-world-spots-design.md`, plans
`2026-10-30-spot-data-tool.md` and `2026-10-30-spot-in-game.md`). The spec's
success criteria:

1. **Met.** The chooser shows Sorobon's satellite picture and builds Lac Bay:
   the beach with Jibe City and the resort, the mangroves, the reef with its
   surf, the lagoon's colour pattern, the scrubland behind.
2. **Met.** The trade wind blows across the course from the reef towards the
   beach, and nothing is mirrored.
3. **Met.** `compare.png` shows the built shoreline and reef over the
   satellite image.
4. **Met.** Up close the ground shows sand grain, coral rubble and rock from
   CC0 textures at two scales, without visible tiling.
5. **Met.** The rider stops at the real shoreline and at the mangroves, which
   count as land even where they stand in the water; the course is in water
   at least 0.8 m deep.
6. **Met.** A 2014 Bonaire World Cup challenge heat sails at Sorobon in that
   event's wind.
7. **Not met on the development machine**, whose integrated Radeon 680M takes
   16.5 ms for the game's own scene at high (1920×1080): Sorobon adds 2.3 ms
   there, to 18.8 ms. At the game's default auto setting it takes 12.4 ms, and
   at balanced about 13 ms.
8. **Met.** Without a venue the game is unchanged, Sotavento and Sylt build
   exactly as before, and `npm test` passes.

Next: the venue rendering spec (see-through water, reflections, bloom), then
Pozo and Podersdorf on the same tools.

## Scope and ground rules

- Cover PWA freestyle events from 2006–2026 first. Add earlier freestyle venues
  from 1997–2005 after the modern event list is covered. Wave and slalom venues
  remain later work.
- Keep a venue's typical character separate from conditions reported for a
  particular event, year or round. Sylt can host several events with different
  wind and water conditions.
- Use settings and environment controls already supported by the game. If the
  game cannot express a reported condition without changing core physics, keep
  it as event information and leave the gameplay mapping at a supported value.
- Keep every new feature in a toggleable `venues` mod. The game must still run
  as before when the mod is disabled.
- Keep source links, dates and confidence with curated venue and condition
  data. Do not turn a qualitative report into a made-up precise wind reading.
- The game and its local server must not contact PWA or the original game while
  playing. Collect source data during development and keep it in the repository.

## Work sequence

### 0. Check what the current game can express

Use the current local snapshot (`vendor/current.json`, currently
`2026-10-24`) to identify the environment controls the game already exposes.
The initial audit found that `Game.start` accepts conditions and
`Game.setPracticeConditions` updates both the active conditions and the
existing water, while the game has no exposed venue or coastline selector.
Check these findings against any new snapshot before building on them. The
environment controls include:

- wind speed, gust range and direction;
- water appearance or state;
- scene, shoreline, background and course orientation;
- the safest mod hook for selecting these values for a heat.

Record which values can be changed through existing game data and which would
need a small serve-time patch. Prefer existing hooks. Add a patch only where a
hook cannot reach the required setting, and make it fail loudly if a later
snapshot changes the matched code.

**Exit check:** choose two contrasting pilot venues that can be represented
using supported settings, and document any visual or condition that the game
cannot yet show.

### 1. Build a venue inventory and canonical map

First, refresh and review the 2026 event data. The existing Champion's
challenge data includes hand-entered 2026 event details from when structured
results were unavailable. Compare those details with current PWA reports and
refresh the structured event data where the site now provides it. Keep a
source note for any details that still need manual entry.

Use the location fields in `tour/seasons/*.json` as the starting list for
2006–2026. Compare the raw location strings with PWA event pages, reports and
live-ticker archives. Normalize alternate spellings and event labels to a
canonical venue, while preserving the source location string on each event.

For each venue, record:

- a stable id, display name, country and known locality;
- source location spellings and the events that use them;
- links and dates for the pages that support the mapping;
- ambiguous or unmatched locations, with a note instead of a guessed match.

Keep the first pass limited to freestyle events. Do not treat a shared event
site as proof that all its freestyle heats used the same course or conditions.

**Exit check:** every 2006–2026 freestyle event has a canonical venue id or an
explicit unresolved status, and the summary reports both counts.

Initial source checks:

- [2026 Fuerteventura event report](https://www.pwaworldtour.com/news/detail/fuerteventura-pwa-grand-slam-35/)
- [2026 Sylt event page](https://www.pwaworldtour.com/events/detail/2026-sylt-germany-grand-slam/)
- [2026 Sylt event summary](https://www.pwaworldtour.com/news/detail/citroen-windsurf-world-cup-sylt-34/)

### 2. Define venue profiles and event conditions

Store curated venue profiles separately from crawled event results so a PWA
refresh cannot erase hand-reviewed data. Finalize the exact file names and
schema in the venue design spec after the game capability audit.

A venue profile should describe the typical setting and the in-game values it
can use. An event-condition record should describe what reports say about that
specific event or round. Include provenance and confidence, for example:

- **reported:** a published wind or water observation;
- **bounded:** a range or description that can be mapped to a supported game
  range;
- **inferred:** a cautious venue-level fallback where event reporting is
  unavailable.

Keep unsupported or unknown values empty and use a documented fallback when a
heat starts. Generate conditions deterministically from the event and room ids
so replays remain stable and the player and AI sail in the same conditions.
For the first version, use one event-level condition profile. Add round- or
day-level variation only when the source record supports it.

**Exit check:** one event can be traced from its raw PWA location and source
reports through its canonical venue, profile and selected in-game settings.

### 3. Make a two-venue playable prototype

Use two contrasting venues that already appear in the Champion's challenge
events: Sotavento/Fuerteventura and Westerland/Sylt. Both have official PWA
reports and fit within the game's existing wind range.

Add a small venue selector or preview flow in the `venues` mod. A practice
heat is enough for this prototype; a full tournament is not a dependency. Show
the venue name and the known wind or water description before the heat. Use the
same selected conditions for the player and AI. Keep established challenge
score targets and prizes unchanged while the venue mappings are tuned.

Compare both profiles in the same heat type. The difference should come from
supported environmental and scene settings, not from hidden scoring or
control changes. Include a safe default for an unrecognized venue or a missing
condition record.

**Exit check:** both venues load in the game, feel visibly distinct, replay
deterministically, and the original experience is unchanged with the mod off.

### 4. Cover all modern freestyle venues

Apply the reviewed mapping and profile model to every canonical venue used by
the 2006–2026 freestyle event set. Add more visual profiles only where the
snapshot supports them; several real locations may share an in-game scene while
still using different sourced wind and water profiles.

Review new PWA seasons when refreshing tour data. Add new canonical venues or
aliases without changing older event records. Keep the report clear about
venues that have a name and location but lack enough evidence for a specific
environment profile.

**Exit check:** every modern freestyle event resolves to a venue at runtime;
missing environmental evidence uses an explicit fallback and appears in the
data summary.

### 5. Connect venues to tournament events

When tournament mode selects an event, load its canonical venue and its
event-specific conditions. Pass the same deterministic settings to the
player's heat and each AI heat in that round. Show the venue and conditions on
the event card and result summary. An event without reliable historical
conditions can use its venue profile and should be labeled as typical
conditions.

**Exit check:** a tournament event chooses its venue without manual selection,
and an AI replay uses the same conditions that were shown to the player.

### 6. Add historical and other-discipline venues

After the modern freestyle set is complete, research PWA freestyle events from
1997–2005 using event reports and archives. Use the same confidence and
unresolved-data rules. Wave and slalom venue profiles can follow as separate
extensions with their own condition models; do not broaden the first freestyle
mod to cover them.

## Completion criteria

- All 2006–2026 PWA freestyle events map to a sourced canonical venue or an
  explicit unresolved entry.
- Curated venue profiles and event conditions retain source links, source
  dates and confidence.
- At least two venues have distinct, playable profiles using settings the
  current game supports.
- The player's heat, AI heat and replay agree on event and room conditions.
- Tournament events load their venue automatically.
- The feature stays local, private and optional, and the base heat rules and
  core physics remain unchanged.
- Snapshot compatibility is checked for each patch, and unknown venue data
  falls back visibly and safely.

## Main risks

- Conditions vary within an event and exact heat-level readings are uncommon.
  Use event-level profiles first and label inferred values.
- Venue names and locations change spelling between source pages. Keep aliases
  explicit and review unresolved mappings.
- The current snapshot may expose fewer visual controls than the real venues
  suggest. Reuse supported scenes and settings; defer features that require a
  core-physics rewrite.
- Game updates can break serve-time patches. Keep patches small and tied to
  snapshot checks.

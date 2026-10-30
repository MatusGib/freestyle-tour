# Venue profiles: first playable delivery

This is the first implementation slice of sub-project 4 in
`docs/roadmap.md`. The full sequence is in `docs/venues-roadmap.md`.

## Goal

Let the player choose two recognizable PWA freestyle locations for practice or
a solo heat, and use an event's mapped location for both the player and AI in a
tour challenge. Keep the original heat rules and core physics unchanged.

## Decisions

| Topic | Decision |
|---|---|
| First venues | Sotavento/Fuerteventura and Westerland/Sylt, both used by Champion's challenge events and present in the committed tour data |
| Data | Curated `tour/venues.json`, separate from generated season results so tour-data rebuilds cannot erase reviewed profiles |
| Gameplay mapping | Use the current game's supported room wind: 15–19 kt and gust settings up to 6 kt. Preserve the generated seed so wind animation and replay remain stable |
| Wind evidence | Source reports are qualitative; profile values are labeled as gameplay mappings, not measured event averages |
| Water and scenery | Add stationary 3D coastal terrain and props in the Three.js scene, let raised terrain occlude the water, block movement onto sand, and let a sufficiently high jump clear Sylt's rock groynes. Give the water shader venue colours, wind chop, whitecaps and shallows through a serve-time patch whose uniforms start at the game's own look. Keep the game's heat area, wave geometry and physical response |
| Site layout | Keep every beach at least 80 m beyond the nearest course corner and 30 m beyond the water the AI sails. Sotavento: shoreline about 316 m from the heat centre, sandbar crossing the heat. Sylt: shoreline about 326 m out, the 400 m sand ridge crossing the seaward part of the heat |
| Wind direction | The game's wind always blows along +x and its heat area is fixed. Each coast is turned to the venue's angle to the wind (side-shore at Sotavento, side-onshore at Sylt), mirrored to keep the beach in view. Turning the heat area instead would leave its buoys and the server's AI heats in the old frame |
| Selection | The optional `venues` mod remembers the chosen venue and applies it to practice and solo heat starts until the player selects the game's weekly wind |
| Tour challenge | When `venues` is enabled, an event whose location matches a pilot profile uses that profile for the server AI heat. The exact returned conditions are applied to the player's heat |
| Other locations | Keep the original weekly wind when there is no mapped profile |
| Privacy and networking | Profile sources are repository data; the running game and local server make no PWA requests |

## Player flow

1. The `Choose venue` control opens the available pilot profiles.
2. Choosing a venue applies it to the next practice or solo heat and keeps it
   selected across reloads.
3. `Use the game's weekly wind` clears the selection.
4. In the tour challenge, a mapped event location takes precedence for that
   planned heat. The AI and player use the same conditions record.

## Data and matching

Each profile has a stable id, display name, source location spellings,
supported in-game wind settings, a short character description, a confidence
label, a note explaining the mapping and dated source links. Matching uses a
normalized exact location alias. Unknown or ambiguous locations do not receive
a guessed profile.

The AI cache key includes the venue catalog version and matched venue id. The
room id used for an event and week produces a stable seed; the profile then
overrides only the supported wind and gust values. Other conditions and
simulation behavior remain under the game's existing engine.

## Success criteria

- The two profiles can be selected for practice and solo heat starts.
- The sailing view shows a fixed, venue-specific shoreline layout with terrain and props.
- Venue water ends at the visible shoreline; land blocks passage and Sylt groynes stop the rider unless cleared by a jump.
- Clearing the selection returns to the game's weekly wind.
- Tour challenges at mapped locations use the same conditions for AI and
  player; unrecognized locations use weekly conditions.
- Recorded heats retain their selected conditions for replay.
- With the mod disabled, the game and challenge mod keep their existing
  behavior.
- Venue collision stays local to the optional scenery mod; the base game's water response, tricks and scoring are unchanged.

## Sources

- [PWA 2026 Fuerteventura event preview](https://www.pwaworldtour.com/news/detail/fuerteventura-pwa-grand-slam-27/)
- [PWA 2026 Fuerteventura event report](https://www.pwaworldtour.com/news/detail/fuerteventura-pwa-grand-slam-35/)
- [PWA 2026 Sylt event page](https://www.pwaworldtour.com/events/detail/2026-sylt-germany-grand-slam/)
- [PWA 2026 Sylt freestyle report](https://www.pwaworldtour.com/news/detail/citroen-windsurf-world-cup-sylt-10/)

## Out of scope

- The full 2006–2026 venue catalog and historical venues from 1997–2005.
- Engine-wide changes to shoreline geometry, course orientation, or the game's
  water physics.
- Wave and slalom venues.
- A full tournament bracket or career progression.

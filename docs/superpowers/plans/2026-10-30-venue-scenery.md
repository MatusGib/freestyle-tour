# Scenery for the other venues (outline)

A rough plan, not a build plan: each venue gets its own short spec and plan
when its turn comes. It extends phase 6 of the water plan
(`2026-10-30-venue-water.md`) and step 4 of `docs/venues-roadmap.md`. The
event-winds spec (`docs/superpowers/specs/2026-10-30-event-winds-design.md`)
gives Podersdorf, Pozo and Sorobon a wind but no scenery; this is how they,
and later the rest, get a coast.

Every description below is a starting point, to be checked against photos,
maps and PWA reports before building.

## What a venue's scenery is

What Sotavento and Sylt are made of, so each new venue needs the same pieces:

- **Coast:** an entry in `SITE_LAYOUTS` (`mods/venues/coast.js`): the beach's
  angle to the wind, how far beyond the course it lies, its bends, and a
  sandbar or reef line.
- **Water:** an entry in `VENUE_LOOKS` (`mods/venues/water.js`): deep, open
  and shallow colours, chop, whitecaps, shelter, clouds and haze; and the
  waves' fetch and swell (`mods/venues/waves.js`).
- **Land and landmarks:** a build function in `mods/venues/scenery.js`, using
  the prop kit in `mods/venues/props.js` (pagodas, flags, rigs, people, palms,
  bushes, buildings).
- **Collision:** the beach stops the rider; special obstacles (Sylt's groynes)
  where the venue has them.
- **Picture:** `mods/venues/assets/<id>.svg`, for the chooser and the event
  card.
- **Wind zones** (optional), in `tour/venues.json`.
- **Checks:** the beach at least 80 m beyond the course's corner and 30 m
  beyond the water AI riders sail; the water below the sand; the game's own
  look unchanged without a venue.

## Step 0: make room

- `scenery.js` is 662 lines with two venues. Before a third, split it into
  shared helpers and one file per venue (`mods/venues/sites/<id>.js`), and let
  `mountVenueScenery` pick the builder from a table instead of an `if` per
  venue.
- Grow the prop kit with pieces several spots share: reeds, boulders, wind
  turbines, mangroves, cacti and scrub, beach huts, a lighthouse, breakwaters.

## Step 1: the three venues from the event-winds spec

Easiest first.

### Sorobon, Bonaire (3 events)

- **Real:** Lac Bay: a very shallow, milky-turquoise lagoon over white sand,
  closed by a reef with surf breaking on it; mangroves at the back of the bay;
  a flat, dry island with cacti and scrub; windsurf centres' huts on the
  beach; steady easterly trades, side-shore; flat water.
- **Reuses:** Sotavento's lagoon and sandbar: the reef is a bar with breakers
  further out, the heat inside it in flat water.
- **New:** mangroves, cacti, beach huts; a calmer, brighter lagoon look.
- **Check:** the course has to fit inside the reef, as the real heats did.

### Podersdorf, Neusiedler See (6 events)

- **Real:** a shallow steppe lake, brown-green and murky, with short, steep
  chop and no swell; reed belts along the shore; the small lighthouse at the
  end of the beach; a grassy lido with the event village; flat land with wind
  turbines on the horizon; gusty, shifty north-westerlies.
- **Reuses:** the waves are already sized by fetch, so a lake's short fetch
  gives short chop; no swell.
- **New:** lake water look (no ocean colours, no sandbar), reeds, lighthouse,
  turbines on the horizon.
- **Maybe:** wind zones for gusty patches near the shore.

### Pozo Izquierdo, Gran Canaria (3 events)

- **Real:** a small bay with a shore of boulders and stones, no sand; deep
  blue Atlantic with whitecaps and swell; very strong, gusty side-shore
  trades; the windsurf centre and low village houses; bare brown hills and
  wind turbines.
- **Reuses:** Sylt's rocks and groyne collision for the boulder shore.
- **New:** a stone beach; bigger swell; waves that visibly break on the shore
  (still to do in water plan phase 2, and Pozo is where it matters most).
- **Check:** the real bay is smaller than the game's 420 m course, so the
  coast is a compromise, as at the other venues.

## Step 2: the other spots

After their events get winds (the event-winds spec leaves them out). Several
hosted one event, so they could share a scene per kind of spot (tropical
lagoon, Mediterranean beach, Atlantic beach) with their own colours and one or
two landmarks, keeping full scenes for venues with many events.

| Venue | Events | Starting point |
|---|---|---|
| Costa Teguise, Lanzarote | 5 | Las Cucharas beach, breakwaters making sheltered bays, black volcanic rock, white hotels, side-shore trades |
| Aruba | 1 | Turquoise flat water, palms, steady trades |
| Mui Ne, Vietnam | 1 | Long sandy bay, round basket boats, palms, red dunes |
| Leucate, France | 1 | Mondial du Vent beach, Mediterranean blue, gusty Tramontane, event tents |
| Marseille, France | 1 | City beach with the city and hills behind, Mistral |
| Viana do Castelo, Portugal | 1 | River mouth, the basilica on the hill, Atlantic |
| National Stadium, Warsaw | 1 | Find out what this event was before planning a scene |
| Netherlands | 1 | Find out where it was; the location string doesn't say |

## The same steps for each venue

1. Photos and maps: where the beach lies to the contest wind, where the heats
   were sailed, the landmarks a viewer would know.
2. Coast layout, then the beach clearance check.
3. Water look and waves.
4. Land, landmarks and props; the picture.
5. Collision.
6. Wind zones, if the venue has well-known ones.
7. Side by side in practice at its usual wind, and the game's own look with
   no venue.

## Open questions, for when each venue starts

- How faithful: a few landmarks a viewer would know, or a full scene.
- Shared scenes for the one-event venues, or none until they matter.
- Pozo's breaking waves stay visual only (the physics never read the waves).

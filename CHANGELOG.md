# Changelog

Owner-facing summary of game ideas demonstrated in this private prototype. For
proposal details and status, see the [roadmap](docs/roadmap.md).

## 2026-11-01

- **Prasonisi, Rhodes:** a new real-world venue in Podersdorf's place, built
  from map, elevation and satellite data with the meltemi blowing across the
  sandbar. The course sits in the flat-water bay off the windsurf centres'
  beach; the bay's water stays flat because the sandbar shelters it, while
  waves break on the Aegean side. The beach is laid out from aerial imagery
  and the centres' own photos: ProCenter's shed row with its flags, rigs and
  board shelves, its sunbeds, spotting tower and rescue RIB, a second
  station 200 m along the beach, cars only in the mapped car parks, and
  windsurfers sailing the bay clear of the heat. The meltemi blows 6 kt
  harder where it jets past the islet. The rider now stops with board and
  rig clear of the sand at any real-world shore. Adds the islet and its 1890
  lighthouse and generated phrygana, junipers and tamarisks; a frame draws
  about as many triangles as Sorobon in a quarter of the draw calls.

## 2026-10-31

- **Sorobon, Bonaire:** Lac Bay reconstructed from map, elevation and satellite
  data in its true trade-wind orientation. Adds a lagoon with estimated depth,
  reef surf, mapped terrain and shore landmarks; the 2014 event challenge uses
  its reported wind. On Radeon 680M at 1080p High, the scene adds 2.3 ms
  (18.8 ms total); default/balanced runs at 12.4–13 ms.
- **Wipeout fish:** six colourful fish visit after a crash, circle and leap over
  the rider and sail with splashes, then dart away and dive as the rider gets
  back up.

## 2026-10-30

- **Venue conditions:** sourced wind and gust records for 43 events across five
  venues; venue wind zones and conditions stay consistent for player heats, AI
  and replays.
- **Developer tuning panel:** draft and validate event winds, venue profiles,
  Champion conditions and AI score targets; optionally write approved values to
  their data files.

## 2026-10-25

- **Champion's challenge:** race Lennart Neubauer in native 1v1 heats at five of his PWA wins, with event context and a helmet unlock.

## 2026-10-24

- **Local mod layer:** run a private copy with independently enabled features while preserving the original game's core play.
- **Replays and ghosts:** replay stored heats or sail against the week's best local run.
- **PWA riders and AI challenges:** event and rider records for 2006–2026, with pseudonyms and ratings; AI sails against a chosen score target.

## In progress

- Full tournament brackets and automatic venue selection.

## Next venue work

- Specify water that reveals the seabed, shore reflections and bloom; then build
  Pozo's scene, which has a wind profile only. Podersdorf left the venue
  chooser for Prasonisi; its events still sail in their reported winds.

## Planned

- Additional tricks and a career mode.

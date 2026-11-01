# Fristajlo Mods

A private, local prototype based on the [fristajlo.ws](https://fristajlo.ws) windsurf
freestyle game. It demonstrates optional ideas for a PWA-style tour; the original
game's controls, physics, scoring and heat rules stay intact. The game is never
hosted or published.

[Changelog](CHANGELOG.md) · [Roadmap](docs/roadmap.md)

## Run

Requires Node.js 22 or later; no npm dependencies.

```sh
npm run snapshot   # download the game into ignored vendor/
npm run tour-data  # optional: build PWA event and rider data
npm start          # open http://localhost:5180
npm test           # run the test suite
```

Use `npm start -- --mods=` to run without mods, or `npm start -- --mods=a,b` to
select mods. The default set is in `mods/enabled.json`.

## Included ideas

- **Replays and ghosts:** replay stored heats or sail against the week's best local run.
- **Riders and challenges:** browse PWA freestyle events (2006–2026), then sail a
  solo heat against an AI rider tuned to a target score.
- **Champion's challenge:** race Lennart Neubauer in the game's native 1v1 at one
  of five PWA wins; earn a Red Bull helmet.
- **Venues and conditions:** Sotavento and Sylt coastal scenes; sourced event
  winds and venue wind zones stay consistent for player, AI and replay.
- **Bonaire:** Lac Bay mapped in its true trade-wind orientation, with
  satellite-colour terrain, estimated lagoon depth, reef surf and mapped shore
  features; the 2014 event challenge uses its reported wind.
- **Wipeout fish:** six colourful fish circle and leap over a fallen rider and
  sail, splash, then dart away and dive as the rider recovers.
- **Dolphins and a whale:** in practice, sail 10 s without touching anything and
  dolphins porpoise beside you until you load a jump; 10 s more and a whale
  belly-flops in front of you. Jump clean over it, or wipe out.
- **Developer panel:** draft and validate event winds, venue conditions, Champion
  settings and AI score tuning.

## Data and scope

During play, the copy talks only to its local server. `npm run snapshot` downloads
the game; `npm run tour-data` downloads PWA results and builds the local tour data.
Heats and settings are stored under ignored `data/`; source pages are cached under
ignored `cache/`.

**Next:** specify see-through venue water, seabed visibility, shore reflections
and bloom, then build Pozo and Podersdorf scenes. The full tournament bracket
and automatic venue selection are in progress; more tricks and a career mode
are later proposals. See the [roadmap](docs/roadmap.md).

## Add a mod

Add a folder under `mods/` and register it in `mods/enabled.json`. A mod's
`index.js` adds browser features; optional `patches.mjs` applies checked
server-side game patches. `mods/local-badge` is the smallest example.

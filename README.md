# freestyle-tour

A private copy of the fristajlo.ws windsurf freestyle game, with mods that show
the game's developer ideas for making it play like the PWA freestyle World Cup.
Never published. See `docs/roadmap.md`.

## Use it

Requires Node 22 or later. No dependencies.

```bash
npm run snapshot     # download a dated copy of the live game into vendor/ (never committed)
npm start            # play it at http://localhost:5180
npm test
```

- `npm start -- --mods=` runs the original with no mods.
- `npm start -- --mods=a,b` runs only the mods listed.
- `npm run snapshot -- --name 2026-11-01` takes a new snapshot after a game update
  and makes it current; run `npm test` to see which mods need updating.

The copy never contacts fristajlo.ws. Riders, heats and feedback are stored in
`data/db.json` (never committed). The 1v1 lobby stays empty until you start a Champion's challenge heat.

## Mods

- `local-badge`: proof that the mod layer works (a badge and a key-guide label).
- `ghosts`: in a solo heat, sail against a ghost of the best heat stored this
  week. The "Ghost" switch in the overlay turns it off.
- `replay-viewer`: the "Replays" button in the menu plays stored heats again,
  with a timeline, speeds, cameras, the move list and video clips.
- `challenge`: pick an event and a rider, and your next solo heat is against
  them. The local server sails their heat first (about 20 seconds) with the
  Freestajlo planner, aiming for the score their rating says. Needs the tour
  data (`npm run tour-data`).
- `venues`: choose a venue for your practice and solo heats. Sotavento and
  Sylt have their own coastal scenes; Podersdorf, Pozo and Bonaire (Sorobon)
  have their usual winds in the game's own scene. Tour-event challenges at
  those five venues sail in each event's reported wind
  (`tour/event-winds.json`), or the venue's usual wind where the reports give
  none; the player and the AI get the same conditions.
- `champion`: the Champion's challenge. Race Lennart Neubauer at one of his
  PWA wins in the game's own 1v1 heat, for a Red Bull helmet. See
  [the Champion's challenge](#the-champions-challenge) below.

`node tools/demo-heat.mjs` stores a short demo heat with real moves for the
current week, so replays and ghosts can be shown without playing first.

Our mods also use two local endpoints that the original client never calls:
`GET /api/local/heats?week=&version=` and `GET /api/local/heats/<heatId>`.

The venue and challenge mods use `GET /api/local/venues`,
`GET /api/local/tour/seasons`, `GET /api/local/tour/events/<id>` and
`POST /api/local/ai-heats`. AI heats are cached in `data/ai-heats.json`.
`node tools/ai-check.mjs` sails 25 heats at several targets in five weeks'
winds and checks that the AI lands within 1.0 of its target on average.

Event winds are in `tour/event-winds.json`, curated by hand from each event's
PWA reports and kept apart from the crawled results: the wind on the day of
the final elimination, at its real strength within the game's 12–28 kt, with
its source, and whether it was reported, read from sail sizes or words, or
inferred. `node tools/ai-check.mjs --winds 12,16,20,24,28` shows how the AI
scores across wind strengths.

The venue profiles are in `tour/venues.json`. They are curated separately
from the crawled event results, with PWA source links and notes explaining how
qualitative reports map to the game's wind range. Venue selection adds
stationary 3D coastal terrain and location-specific props to the scene without
changing the base game's tricks, scoring or heat area. The game's wind always
blows the same way and its heat area never moves, so each venue turns its
coast instead: the beach lies at the venue's real angle to the wind
(side-shore at Sotavento, side-onshore at Sylt), beyond the course and the
water AI riders sail. The scene is mirrored, so the coast stays in view.
Raised terrain occludes water at the curved shoreline, collision keeps the
rider off the sand, and Sylt's rock groynes stop the rider unless a jump clears
them. A serve-time patch gives the game's water shader each venue's colours,
wind chop and whitecaps that grow with the wind (gusts included), and its
shallows: the Playa Barca lagoon and sandbar at Sotavento; the sandy surf zone,
sand ridge and shorebreak at Sylt. Venues add wind waves and swell (visual
only: the physics never read the waves) that die on the beach without
flooding it, clouds and their own haze; the beaches are built with three.js
r185's geometry and simplex noise, vendored in `mods/venues/lib`. Without a
venue the water looks as before.

Venues also have wind zones the rider really feels: at Sotavento about 4 kt
more over the outer half of the heat and 3 kt less near the beach, at Sylt a
little more out over the sand ridge. They travel in the heat's conditions;
the game's wind function adds them (patched in the browser and, through a
Node module hook, in the AI's engine), the water shows them, and the local
server stores each solo heat's conditions so replays and ghosts match. The plan for more is
`docs/superpowers/plans/2026-10-30-venue-water.md`.

The mods share one look, the game's own (`mods/lib/ui.js`): their chips sit
in a tray under the wordmark (one Mods chip on a phone), and their panels open
as popovers under it.

## The Champion's challenge

The `champion` mod lets you race Lennart Neubauer at one of his real PWA wins,
in the game's own 1v1 heat.

- **The button:** "Champion's challenge", under "1v1 Lobby" in the main menu,
  names this week's event, him and the wind. Like the lobby button, it is off
  until you have a rider.
- **The event:** one of his five most recent PWA wins (2023 Sylt, 2024
  Fuerteventura, 2025 Sylt, 2026 Fuerteventura and 2026 Sylt), the same all
  week. The button opens a card with the event's story, its podium, the prize
  and your best score this week.
- **The heat:** "Race Lennart Neubauer" on the card starts the 1v1 heat
  straight away, with the game's usual countdown. There is no challenge to send
  or accept. "Challenge again" on the result screen starts the next heat
  within a few seconds.
- **Him:** he wears the Red Bull helmet and sails a Severne Freek (the game's
  hidden sail). He rides Starboard boards, which the game doesn't have, so his
  board is a plain orange one. The AI riders sail his heat with the Freestajlo
  planner, scoring around 45, in 21 kt gusting 23–27 kt: more wind than the
  game's own 1v1 rooms (15–19 kt). The server sails his next heat ahead of
  time, so you don't wait for it.
- **The prize:** beat him and a congratulations screen shows both scores and
  the Red Bull helmet. The helmet then appears in the look editor, and "Wear
  it now" puts it on your rider.
- **Real names:** the challenge names him and the podiums as they are. The
  rest of the game keeps pseudonyms. The Red Bull logo is a trademark, so the
  repository stays private.

How it works: the local server plays the other side of the game's 1v1, with
the lobby, the room and his poses over a relay socket. Serve-time patches
(`mods/champion/patches.mjs`) give the challenge's rooms 21 kt and add the
helmet to the game. The mod uses `GET /api/local/weekly` (which also starts
sailing his first heat) and `POST /api/local/weekly/start`, and the game uses
its own 1v1 endpoints (`/api/lagoons`, `/api/lagoons/connect`, a WebSocket at
`/__relay`, `/api/lagoons/opponent`), which answer an empty lobby until a
heat starts. Its events are in `server/champion.json`, and results are kept in
`data/champion.json`.

After a game update: if the menu changes, the button doesn't appear. If the
patches no longer match, the patched modules answer 500 and the server log
names the mod. Leave `champion` out of `--mods` until it is updated.

## Tour data

`npm run tour-data` reads pwaworldtour.com and rebuilds `tour/`: every PWA
freestyle event 2006–2026 with its entries, placings, points and ladders, the
riders with their pseudonyms, and each rider's Glicko-2 rating going into each
event. Pages are cached in `cache/pwa/` (never committed), one request per
second, so a second run is quick.

- `npm run tour-data -- --offline` rebuilds from the cache only.
- `npm run tour-data -- --refresh 2026` downloads the 2026 pages again
  (`--refresh all` for everything).
- `tour/aliases.json` merges one rider's spellings (`{ "old id": "newest id" }`).
- `tour/pseudonyms.json` fixes a pseudonym (`{ "rider id": "Pseudonym" }`).

The summary lists unmatched ladder sailors, possible duplicate riders and how
well the ratings predicted 2022–2026 heats. The build stops without writing if
the favourite won fewer than 65% of them.

## Writing a mod

A mod is a folder in `mods/` that you add to `mods/enabled.json`.

- `index.js` exports `default { name, setup(ctx) }`, which runs in the browser.
  `ctx` gives you:
  - `engine`: the game's functions and objects, found by code signature
    (see `mods/lib/identify.js`)
  - `parts`: the raw game modules
  - `whenGame()`: resolves to the running game object
  - `onStep(fn)`: runs `fn(state, input)` every physics step
  - `overlay(id)`: an element for your own UI
  - `log(...)`, `snapshot`, `mods`
- `patches.mjs` (optional) exports `patches`, find-and-replace rules the server
  applies to a game module before serving it:
  `{ part: "engine" | marker: "text", find: "text" | /pattern/g, replace, expect }`.
  `expect` is the number of matches; a wrong count makes that module answer 500
  and names your mod in the server log.

`mods/local-badge` is a small example of both.

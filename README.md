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
`data/db.json` (never committed). The 1v1 lobby stays empty unless a Champion's challenge is waiting.

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
- `champion`: the "Champion's challenge" button in the main menu. Each week it
  offers one of Lennart Neubauer's recent PWA wins: a card tells the event's
  story, and you race him in the game's own 1v1 heat, where he scores around
  45, at 21 kt gusting to 27 (the mod's patches give its rooms more wind than
  the game's own). The local server plays the other side of the 1v1 lobby,
  and the AI riders sail his heat. Beating him wins a Red Bull helmet, which
  the patches add to the game's look editor. It uses real names, unlike the
  rest of the game. If a game update changes the menu, the button doesn't
  appear.

`node tools/demo-heat.mjs` stores a short demo heat with real moves for the
current week, so replays and ghosts can be shown without playing first.

Our mods also use two local endpoints that the original client never calls:
`GET /api/local/heats?week=&version=` and `GET /api/local/heats/<heatId>`.

The challenge mod uses three more: `GET /api/local/tour/seasons`,
`GET /api/local/tour/events/<id>` and `POST /api/local/ai-heats`. AI heats
are cached in `data/ai-heats.json`. `node tools/ai-check.mjs` sails 25 heats
at several targets in five weeks' winds and checks that the AI lands within
1.0 of its target on average.

The Champion's challenge uses `GET /api/local/weekly` and
`POST /api/local/weekly/start`, and the game's own 1v1 endpoints
(`/api/lagoons`, `/api/lagoons/connect`, a WebSocket at `/__relay`,
`/api/lagoons/opponent`), which stay an empty lobby until a challenge is
waiting. Its events are in `server/champion.json`, and results are kept in
`data/champion.json`.

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

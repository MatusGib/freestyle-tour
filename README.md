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
`data/db.json` (never committed). The 1v1 lobby stays empty.

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

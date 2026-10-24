# Sub-project 1: local copy and mod layer

Part of the roadmap in `docs/roadmap.md`. Everything later builds on this.

## Goal

Run the original fristajlo.ws game entirely from this machine, unchanged, and
give us a reliable way to change it through mods.

## Success criteria

1. `npm run snapshot` saves a complete, dated copy of the live site under
   `vendor/`.
2. `npm start` serves that copy at `http://localhost:5180`. In the browser, the
   tutorial, practice, a solo heat, the look studio and the leaderboard (showing
   local heats) all work.
3. While playing, the browser makes no request to any host other than
   localhost. This is enforced by a Content-Security-Policy header and checked in
   the browser's network log.
4. The proof mod (`mods/local-badge`) is visibly active: it reads the game's heat
   rules through the mod layer, shows the physics clock through a step hook, and
   changes the in-game key-guide heading through a serve-time patch.
5. `npm test` passes: snapshot integrity, symbol lookup, every fake API action,
   patch failure handling and a determinism check in the headless harness.

## Out of scope

- Any new gameplay. Replays and ghosts, tournaments, venues and tricks are
  later sub-projects.
- 1v1 and anything else online. The lobby stays empty.
- Hosting, accounts and passwords. The local copy assumes a single user on a
  private machine.

## What the original needs

Found by reading the client code on 2026-10-23 and confirmed by a spike on
2026-10-24 that served the downloaded files locally:

- **Front end:** one server-rendered HTML page, about 50 JavaScript modules, 2
  stylesheets, a font (`/fonts/oswald-variable.ttf`) and two root images
  (`/favicon.svg`, `/wordmark.svg`). It is built with vinext (a Vite-based
  Next.js). The 3D scene is built in code with three.js; there are no model or
  texture files.
- **It boots offline.** Served locally, the menu, the 3D water and a practice
  session all ran. It made no requests for server-rendered data. Two requests
  failed harmlessly: Cloudflare's bot-check script, which the page injects and
  which only exists on fristajlo.ws, and `/favicon.ico`.
- **The game modules load in Node.** The engine, wind, controls and weekly
  calendar modules import cleanly in Node, and two runs with the same seed and
  inputs end in identical states.
- **Server APIs** the client calls:

  | Endpoint | Used for |
  |---|---|
  | `POST /api/rider` | Rider profile, with an `action` of `create`, `load`, `save`, `lookup`, `login` or `logout` |
  | `POST /api/heats` | Registers a solo heat before it starts; returns `heatId` and `weekStart` |
  | `GET /api/leaderboard?version=&week=` | Weekly and all-time boards, Elo board, scoring-version starts |
  | `POST /api/leaderboard` | Submits a finished heat: its attempts and its input replay |
  | `/api/lagoons/*` | 1v1 lobby. The client polls it in the background even during practice |
  | `POST /api/feedback` | Feedback form |
  | `POST /api/admin` | Admin dashboard |

## Approach

Serve a saved snapshot of the original from a small local Node server. The
server injects one extra script, the mod loader, into the page. Mods change the
game in two ways:

- **Runtime hooks:** a mod imports the game's own modules by URL. The browser
  gives it the same module instances the game uses, so mutating an exported
  object, such as the trick table or the heat rules, changes the game. For
  behaviour, mods hook the running game object the way the Freestajlo bot does
  (find it through React, wrap its control reader).
- **Serve-time patches:** where no hook reaches, a mod supplies find-and-replace
  rules that the server applies to a module's text before sending it. Each rule
  states how many matches it expects, so a new snapshot that breaks it fails
  loudly instead of silently.

We considered editing a pretty-printed copy of the original directly. We
rejected it: changes would be buried in one huge diff of minified code, they
couldn't be shown one at a time, and every game update would mean redoing them.

## Repository layout

```
lib/snapshot.mjs          shared Node helpers: part markers, opening a snapshot, loading game modules
tools/refs.mjs            finds the files a page, module or stylesheet refers to
tools/snapshot.mjs        downloads a dated snapshot of the live site
server/index.mjs          command line entry point
server/app.mjs            local server: static files, mod injection, patches, fake APIs
server/html.mjs           prepares the snapshot's page (drops the bot check, adds the loader)
server/patches.mjs        loads and applies mods' serve-time patches
server/store.mjs          JSON file store under data/
server/api/*.mjs          one module per fake API, plus the router
mods/loader.js            browser entry point injected into the page
mods/lib/identify.js      finds the game's functions by code signature (shared by browser and Node)
mods/lib/game.js          finds the running game object and offers a step hook
mods/enabled.json         default list of enabled mods
mods/local-badge/         proof mod: index.js (browser) and patches.mjs (server)
sim/load.mjs              loads the snapshot's engine in Node
sim/run.mjs               runs a heat headlessly from a seed and an input function
test/*.test.mjs           node:test suites
vendor/                   snapshots (git-ignored)
data/                     fake-server data (git-ignored)
```

Node 22 or later, no dependencies.

## Components

### Snapshot tool (`tools/snapshot.mjs`)

`npm run snapshot -- [--site https://fristajlo.ws] [--name 2026-10-24]`

- Downloads `/` and `/favicon.ico`, then follows references until nothing new
  turns up. Only same-origin paths are followed.
  - **Hard references** must exist: `src` and `href` attributes in the HTML,
    static and dynamic imports in modules, `_next/static/...` paths listed in
    modules, and `url(...)` in stylesheets.
  - **Soft references** are guesses and may be missing: chunk file names
    mentioned in module text, root image and font paths in module text, and
    `/favicon.ico`.
- Writes the files under `vendor/<name>/` with their original paths (`/` becomes
  `index.html`), plus `manifest.json`: the source URL, the fetch time, each
  file's path, size and SHA-256, the soft references that were missing, and which
  module holds each part we rely on:

  | Part | What it holds | Marker |
  |---|---|---|
  | `engine` | Physics, tricks and judging | `attemptsPerTack:` |
  | `wind` | Conditions and the wind model | `Math.sin(r*.17)` |
  | `controls` | Keyboard and touch handler, heat replay recorder | `syncAir(` |
  | `scene` | The three.js scene | `areaArrow` |
  | `week` | Weekly challenge calendar and its wind | `Europe/Warsaw` |

  Each marker must appear in exactly one module.
- Writes `vendor/current.json` (`{ "snapshot": "<name>" }`) to select the
  snapshot the server uses.
- Refuses to overwrite an existing snapshot folder. Exits with an error, before
  writing anything, if a part's marker doesn't match exactly one module or a hard
  reference failed to download.

### Local server (`server/index.mjs`, `server/app.mjs`)

`npm start -- [--port 5180] [--snapshot <name>] [--mods a,b]`

- Listens on 127.0.0.1 only.
- **Page:** `/` serves the snapshot's HTML with Cloudflare's bot-check script
  removed and `<script type="module" src="/__mods/loader.js">` added right after
  `<head>`, so the loader runs before the game's own modules.
- **Mods:** paths under `/__mods/` come from the repo's `mods/` folder.
  `/__mods/config.json` gives the snapshot name, each part's URL and the enabled
  mods (from `--mods`, or `mods/enabled.json`).
- **Snapshot files:** every other path listed in the manifest is served with its
  content type. `/favicon.ico` answers `204` if the snapshot has none. Anything
  else is `404`.
- **Network isolation:** every response carries a Content-Security-Policy that
  limits scripts, styles, images, fonts and connections to `'self'`, plus the
  `data:` and `blob:` sources and inline scripts the page needs. Responses are
  not cached, so mod edits show on reload. The server never forwards requests to
  the internet.
- **Patches:** at startup the server applies the patch rules of every enabled mod
  to the snapshot's modules. A rule picks its target by part or by a marker text
  that only the target module contains, because file names change with every
  game build. It then gives a string or global pattern, a replacement and the
  expected number of matches. A rule that targets no module, or whose match count
  is wrong, is logged with the mod's name, and the affected module answers HTTP
  500 with that message.
- **Fake APIs** (the server loads the snapshot's engine and weekly calendar in
  Node to score heats and compute weeks exactly as the game does):

  | Endpoint | Local behaviour |
  |---|---|
  | `POST /api/rider` | Riders live in `data/db.json`. `create` issues a random v4 UUID key (`409` if the nickname is taken); `load` and `save` work by key (`401` if unknown); `save` increments `revision`; `lookup` and `login` work by nickname with no password check; `logout` succeeds |
  | `POST /api/heats` | Issues a `heatId` and returns the current week's start |
  | `POST /api/leaderboard` | Scores the heat's attempts with the game's own heat totals, stores the heat with its replay, and returns the personal best and the weekly rank |
  | `GET /api/leaderboard` | Weekly board (with the week's wind), all-time board for the requested scoring version, and an empty Elo board, built from local heats |
  | `POST /api/lagoons/lobby-connect` | `{ "relay": null }`, which makes the client switch its lobby socket off |
  | `POST /api/lagoons` | An empty lobby (`serverTime`, no room, no riders, challenges or rankings) |
  | Other `/api/lagoons/*` | `404`: 1v1 is unavailable in the local copy |
  | `POST /api/feedback` | Stored in `data/db.json` |
  | `/api/admin`, any other `/api/*` | `404`, and the server logs the path so new endpoints show up after a re-snapshot |

- **Store (`server/store.mjs`):** one JSON file, written to a temporary file and
  renamed so a crash can't corrupt it.

### Mod loader (`mods/loader.js` and `mods/lib/`)

- Reads `/__mods/config.json`, imports each part by URL, and builds `ctx.engine`
  with `identify.js`. Each function or object mods need is found by a code
  signature that must match exactly once:

  | Part | Found |
  |---|---|
  | `engine` | `step`, `initState`, `startTrick`, `slots`, `pump`, `switchStance`, `duck`, `heatTotals`, `heatInit`, `isAir`, `inArea`, `tricks`, `heatRules` |
  | `wind` | `conditions`, `wind` |
  | `controls` | `Controls`, `heatStart` |
  | `week` | `weekStart`, `nextWeekStart`, `weekConditions` |

  This is the same technique as the Freestajlo bot's `bot/extract.mjs`.
- Calls each enabled mod's `setup(ctx)` in order. `ctx` offers:
  - `ctx.engine`: the identified functions and objects
  - `ctx.parts`: the raw module namespaces, including `scene`
  - `ctx.snapshot`, `ctx.mods`: the snapshot name and the enabled mods
  - `ctx.whenGame()`: resolves to the running game object, found through React
    as the bot does
  - `ctx.onStep(fn)`: calls `fn(state, input)` on every physics step, by wrapping
    the game's control reader
  - `ctx.overlay(id)`: returns a DOM element in a fixed corner stack for the mod's
    own UI
  - `ctx.log(...)`: prefixed console logging
- A mod that throws during setup is logged and skipped; the others still run.
- **Mod format:** `mods/<name>/index.js` exports `default { name, setup(ctx) }`.
  An optional `mods/<name>/patches.mjs` exports `patches`, an array of rules, and
  is read only by the server.

### Proof mod (`mods/local-badge`)

- **Runtime:** shows a small badge, "Local copy · snapshot <name> · <n> mods ·
  heat <seconds> s, <attemptsPerTack> attempts per tack", with the numbers read
  from `ctx.engine.heatRules`. While a session runs, it adds the physics clock
  from `ctx.onStep`.
- **Patch:** appends " · local" to the in-game key-guide heading ("Same keys in
  the air"), expecting exactly one match. Menu text is not used because it is
  also in the server-rendered HTML, and changing it only in the module would cause
  a hydration mismatch.

### Headless harness (`sim/`)

- `sim/load.mjs` imports the engine, wind and controls modules straight from the
  snapshot folder and builds the same `engine` object with `identify.js`.
- `sim/run.mjs` runs a heat from a seed and an input function of the step number
  and state, and returns the final state, the heat totals and a hash of the final
  state.

Later sub-projects use the harness to test judging, replays and AI riders without
a browser.

## Errors and updates

- **No snapshot yet:** the server exits with a message to run
  `npm run snapshot` first.
- **A game update:** run the snapshot tool again with a new name, which also
  points `vendor/current.json` at it, and run the tests. Failing signature lookups
  and patch match counts show which mods need updating. Older snapshots stay in
  `vendor/` for comparison.
- **An unknown API call:** answered with `404` and logged.

## Testing

- **Unit tests** need no snapshot: reference extraction, the crawl (with a fake
  site), part detection, signature matching, the store, every fake API action
  (with a stand-in for the game's functions), the page preparation, the patch
  rules and the server itself (with a tiny fixture snapshot).
- **Snapshot tests** run against the current snapshot and are skipped when there
  is none: every manifest entry exists with a matching SHA-256; every signature
  matches exactly once in Node; the same seed and inputs run twice give the same
  final-state hash; the proof mod's patch applies cleanly.
- **In the browser:** a `.claude/launch.json` entry starts the server for the
  app's browser pane. We play the tutorial, practice and a solo heat, open the
  look studio and leaderboard, see the badge, the clock and the patched heading,
  and confirm that the network log shows only localhost requests and the console
  shows no CSP violations.

## Risks

- **The fake APIs may need fields we haven't seen.** The response shapes come from
  reading the client code. Contract tests pin them, the browser check exercises
  them, and the server logs unknown requests.
- **The game object hook depends on React internals.** If a game update moves the
  game object, `whenGame` never resolves; the badge's clock not appearing shows
  this.

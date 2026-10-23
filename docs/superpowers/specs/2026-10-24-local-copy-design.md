# Sub-project 1: local copy and mod layer

Part of the roadmap in `docs/roadmap.md`. Everything later builds on this.

## Goal

Run the original fristajlo.ws game entirely from this machine, unchanged, and
give us a reliable way to change it through mods.

## Success criteria

1. `node tools/snapshot.mjs` saves a complete, dated copy of the live site under
   `vendor/`.
2. `node server/index.mjs` serves that copy at `http://localhost:5180`. In the
   browser, the tutorial, practice, a solo heat, the look studio and the
   leaderboard (showing local heats) all work.
3. While playing, the browser makes no request to any host other than
   localhost. This is enforced by a Content-Security-Policy header and checked in
   the browser's network log.
4. The proof mod (`mods/local-badge`) is visibly active: it reads the game's heat
   rules through the mod layer and changes one menu label through a serve-time
   patch.
5. `node --test` passes: snapshot integrity, symbol lookup, every fake API action,
   patch failure handling and a determinism check in the headless harness.

## Out of scope

- Any new gameplay. The PWA rules, replays, tournaments, venues and tricks are
  later sub-projects.
- 1v1 and anything else online. The lobby reports itself unavailable.
- Hosting, accounts and passwords. The local copy assumes a single user on a
  private machine.

## What the original needs (findings, 2026-10-23)

- **Front end:** one server-rendered HTML page plus about 45 JavaScript modules
  and 2 stylesheets under `/_next/static/`, built with vinext (a Vite-based
  Next.js). The 3D scene is built in code with three.js; there are no model or
  texture files. Root files include `/favicon.svg` and `/wordmark.svg`.
- **Server APIs** the client calls:

  | Endpoint | Used for |
  |---|---|
  | `POST /api/rider` | Rider profile, with an `action` of `create`, `load`, `save`, `lookup`, `login` or `logout` |
  | `POST /api/heats` | Registers a solo heat before it starts; returns `heatId` and `weekStart` |
  | `GET /api/leaderboard?week=` | Weekly and all-time boards, Elo board, scoring-version starts |
  | `POST /api/leaderboard` | Submits a finished heat: its attempts and its input replay |
  | `/api/lagoons/*` | 1v1 lobby over WebSocket, with WebRTC signalling |
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
  (find it through React, wrap its controls).
- **Serve-time patches:** where no hook reaches, a mod supplies find-and-replace
  rules that the server applies to a module's text before sending it. Each rule
  states how many matches it expects, so a new snapshot that breaks it fails
  loudly instead of silently.

We considered editing a pretty-printed copy of the original directly. We
rejected it: changes would be buried in one huge diff of minified code, they
couldn't be shown one at a time, and every game update would mean redoing them.

## Repository layout

```
tools/snapshot.mjs        downloads a dated snapshot of the live site
server/index.mjs          local server: static files, mod injection, patches, fake APIs
server/api/*.mjs          one module per fake API (rider, heats, leaderboard, lagoons, feedback)
server/store.mjs          JSON file store under data/
mods/loader.js            browser entry point injected into the page
mods/lib/identify.js      finds the game's functions by code signature (shared by browser and Node)
mods/lib/game.js          finds the running game object and offers hooks
mods/enabled.json         default list of enabled mods
mods/local-badge/         proof mod: index.js (browser) and patches.mjs (server)
sim/load.mjs              loads the snapshot's engine in Node
sim/run.mjs               runs a heat headlessly from a seed and an input script
test/*.test.mjs           node:test suites
vendor/                   snapshots (git-ignored)
data/                     fake-server data (git-ignored)
```

Node 20 or later, no dependencies, the same as the Freestajlo bot.

## Components

### Snapshot tool (`tools/snapshot.mjs`)

`node tools/snapshot.mjs [--site https://fristajlo.ws] [--name 2026-10-24]`

- Downloads `/`, then follows references until nothing new turns up: `src` and
  `href` attributes in the HTML, static and dynamic imports in each module,
  chunk file names mentioned in module text, and `url(...)` in stylesheets.
  Only same-origin paths are followed.
- Writes the files under `vendor/<name>/` with their original paths, plus
  `manifest.json`: the source URL, the fetch time, each file's path, size and
  SHA-256, any references that could not be fetched, and which module holds
  each part we rely on:
  - `engine`: physics, tricks and judging (contains `attemptsPerTack:`)
  - `wind`: conditions and the wind model (contains `Math.sin(r*.17)`)
  - `controls`: keyboard and touch handler and the replay recorder (contains `setStick(`)
  - `scene`: the module that creates the three.js renderer
- Writes `vendor/current.json` (`{ "snapshot": "<name>" }`) to select the
  snapshot the server uses.
- Refuses to overwrite an existing snapshot folder. Exits with an error if any
  of the four parts is missing or any referenced file failed to download.

### Local server (`server/index.mjs`)

`node server/index.mjs [--port 5180] [--snapshot <name>] [--mods a,b]`

- **Static files:** serves the selected snapshot with correct content types. `/`
  serves the snapshot's HTML with one added
  `<script type="module" src="/__mods/loader.js">` before the game's own scripts.
  Paths under `/__mods/` come from the repo's `mods/` folder;
  `/__mods/enabled.json` reflects `--mods` or `mods/enabled.json`.
- **Network isolation:** every response carries a Content-Security-Policy that
  limits scripts, styles, images, fonts and connections to `'self'`, plus the
  `data:` and `blob:` sources and inline scripts the page needs. The server never
  forwards requests to the internet.
- **Patches:** before serving a module, the server applies the patch rules of
  every enabled mod. A rule picks its target by part (`engine`, `wind`,
  `controls`, `scene`) or by a marker text that only the target module contains,
  because file names change with every game build. It then gives a pattern, a
  replacement and the expected number of matches.
  A mismatch returns HTTP 500 for that file and prints which mod and rule failed.
  Patched files are cached in memory until the server restarts.
- **Fake APIs:**

  | Endpoint | Local behaviour |
  |---|---|
  | `POST /api/rider` | Stores one or more riders in `data/db.json`. `create` issues a random player key; `load`, `save` (increments `revision`), `lookup`, `login` (no password check) and `logout` behave as the client expects |
  | `POST /api/heats` | Issues a `heatId` and returns the current week's start |
  | `POST /api/leaderboard` | Stores the heat with its attempts and replay; returns its rank among local heats for the week |
  | `GET /api/leaderboard` | Weekly board, all-time board and an empty Elo board, built from local heats |
  | `/api/lagoons/*` | `503` with the message "1v1 is unavailable in the local copy" |
  | `POST /api/feedback` | Appends to `data/feedback.jsonl` and returns success |
  | `/api/admin`, any other `/api/*` | `404`, and the server logs the path so new endpoints show up after a re-snapshot |

  The exact request and response fields are taken from the client code while
  building each endpoint and pinned by contract tests.
- **Store (`server/store.mjs`):** one JSON file, written to a temporary file and
  renamed so a crash can't corrupt it.

### Mod loader (`mods/loader.js` and `mods/lib/`)

- Reads `/__mods/enabled.json` and the snapshot manifest, imports the four parts
  by URL, and builds `ctx.engine` with `identify.js`: each function or object the
  mods need (step, initState, startTrick, slots, pump, switchStance, duck,
  heatTotals, heatInit, isAir, inArea, tricks, heatRules, conditions, wind,
  Controls, heatStart) is found by a code signature, which must match exactly
  once. This is the same technique as the Freestajlo bot's `bot/extract.mjs`.
- Calls each mod's `setup(ctx)` in list order. `ctx` offers:
  - `ctx.engine`: the identified functions and objects
  - `ctx.parts`: the raw module namespaces
  - `ctx.whenGame()`: resolves to the running game object, found through React
    as the bot does
  - `ctx.onStep(fn)`: calls `fn(state)` every physics step, by wrapping the game's
    control reader
  - `ctx.overlay(id)`: returns a positioned DOM element for the mod's own UI
  - `ctx.log(...)`: prefixed console logging
- A mod that throws during setup is logged and skipped; the others still run.
- **Mod format:** `mods/<name>/index.js` exports `default { name, setup(ctx) }`.
  An optional `mods/<name>/patches.mjs` exports `patches`, an array of rules, and
  is read only by the server.

### Proof mod (`mods/local-badge`)

- **Runtime:** shows a small badge, "Local copy · snapshot <name> · <n> mods ·
  heat <seconds> s, <attemptsPerTack> attempts per tack", with the numbers read
  from `ctx.engine.heatRules`.
- **Patch:** appends " · local" to the Practice menu subtitle ("Unlimited attempts
  · No time limit"), expecting exactly one match.

### Headless harness (`sim/`)

- `sim/load.mjs` imports the engine, wind and controls modules straight from the
  snapshot folder and builds the same `engine` object with `identify.js`. If a
  module needs browser globals at import time, the harness supplies minimal stubs
  for them.
- `sim/run.mjs` runs a heat from a seed and a list of per-step inputs and returns
  the final state, the heat totals and a hash of the final state.

Later sub-projects use the harness to test judging, replays and AI riders without
a browser.

## Errors and updates

- **No snapshot yet:** the server exits with a message to run
  `node tools/snapshot.mjs` first.
- **A game update:** run the snapshot tool again to get a new dated folder, point
  `vendor/current.json` at it and run the tests. Failing signature lookups and
  patch match counts show which mods need updating. Older snapshots stay in
  `vendor/` for comparison.
- **An unknown API call:** answered with `404` and logged.

## Testing

- **Snapshot:** every manifest entry exists with a matching SHA-256; all four
  parts are present; no references are left unfetched.
- **Symbol lookup:** in Node, every signature matches exactly once in the
  current snapshot.
- **Server:** the HTML contains the loader tag; every response carries the CSP
  header; each fake API action matches its contract (create, load, save, lookup,
  logout; register a heat, submit it, see it on the board); the lobby returns
  `503`; unknown paths return `404`; a patch with the wrong match count returns
  `500` with a clear message.
- **Harness:** the same seed and inputs run twice give the same final-state hash.
- **In the browser:** a `.claude/launch.json` entry starts the server for the
  app's browser pane. We play the tutorial, practice and a solo heat, open the
  look studio and leaderboard, see the badge and the patched label, and confirm
  that the network log shows only localhost requests and the console shows no
  CSP violations.

## Risks

- **The captured page may need server-rendered data on navigation.** The game
  looks like a single page, but if it requests React server component payloads,
  the snapshot tool must capture them and the server must serve them. The first
  implementation step checks that the captured page boots offline before
  anything else is built.
- **Some modules may not load in Node.** The harness stubs browser globals; if
  that isn't enough for a part, the harness loads only the parts it can and the
  rest stay browser-only.
- **The fake APIs must match fields the client reads but we haven't seen yet.**
  Contract tests and the server's log of unknown requests catch mismatches.

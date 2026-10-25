# Sub-project 3c, part 1b: the Champion's challenge

Part of the roadmap in `docs/roadmap.md`. It replaces the weekly super final
(part 1, `2026-10-25-weekly-super-final-design.md`) with a harder, hand-picked
version, after trying it out:

- always against Lennart Neubauer, at his three recent wins;
- in the game's windiest 1v1 room;
- an intro card with the event's story;
- a Red Bull helmet as the prize;
- a congratulations screen when you beat him.

The super final's server pieces (the local 1v1 lobby, the relay, room ids,
results) stay and are reused. Then the project is pushed to a private GitHub
repository, so it can be shared with the game's creator.

## Goal

A "Champion's challenge" in the game's main menu. Each week it offers one of
Lennart Neubauer's recent PWA wins, tells its story, and lets you race him in
the game's own 1v1 heat at his best, in 19 kt gusting to 25. Beating him wins a
Red Bull helmet for your rider.

## Decisions

| Topic | Decision |
|---|---|
| Name | "Champion's challenge" (the solo heat's menu entry already says "Weekly challenge") |
| Events | Neubauer's three recent wins: 2023 Sylt (event 342), 2024 Fuerteventura (359) and 2025 Sylt (378). One a week, seeded by the week |
| Opponent | Lennart Neubauer, always |
| Difficulty | The AI aims for his best form at his latest rating, the one going into 2025 Sylt (1946), at all three events: his average plus the spread (6), at most 50. That is about 47.5, against 41.5 on an average day |
| Wind | 19 kt with gusts to 25 kt (`gustKnots` 6), the game's windiest 1v1 room |
| Opponent's heat | Gusts make every room's wind different, so each room gets its own sailed heat, cached by the room's seed. The next room's heat is sailed while you race |
| Intro card | Opens when you press the button: the event, a short story of it, the podium, the prize with a picture, your best this week, and "Challenge Lennart Neubauer" |
| Story | Written in our own words from the PWA's event reports: the conditions and how the final went |
| Prize | A Red Bull helmet: a new helmet in the game (navy shell, silver visor, the Red Bull logo drawn as a decal), added by a serve-time patch. It appears in the look editor once won |
| After a win | A congratulations screen over the game's result screen: who you beat, where, both scores, the helmet, and "Wear it now" |
| Names on screen | Real names in the Champion's challenge (Neubauer and the podiums). The rest of the game keeps pseudonyms |
| Sharing | A private GitHub repository, `freestyle-tour`, on the user's account. The user invites the game's creator. The Red Bull logo is a trademark, so the repository stays private |
| The super final | Replaced: its button, its mod and its hidden-gear prize go |

## Success criteria

1. The main menu has a "Champion's challenge" button under "1v1 Lobby",
   naming this week's event, Lennart Neubauer and "19 kt, gusts 21–25 kt".
2. Pressing it opens the intro card: the event (name, dates, place), its
   story, the podium with real names, the Red Bull helmet with a picture, and
   your best this week. Its button gets Neubauer ready, and the game's own
   challenge toast appears.
3. The heat is the game's 1v1 at 19 kt with gusts 21–25 kt, against "Lennart
   Neubauer". His score lands within 2 points of the target.
4. "Challenge again" starts a new heat within a few seconds.
5. A win shows the congratulations screen. The Red Bull helmet then appears in
   the look editor, and "Wear it now" puts it on your rider, where it shows in
   heats and on the menu. A loss shows nothing extra.
6. With the mod off (`npm start -- --mods=`), the game is as before. Solo
   heats, ghosts, the replay viewer and the challenge mod are unaffected, and
   `npm test` passes.
7. The repository is on GitHub, private, with `main` pushed.

## Out of scope

- Other champions, other events, women's finals.
- The real events' winds, which were above the game's range.
- More collectibles.
- Inviting the game's creator to the repository (the user does that).

## What exists

- **The super final (part 1).** The local 1v1 lobby (`server/lagoon/lobby.mjs`),
  the relay (`server/lagoon/relay.mjs`), the weekly picker, room ids for a wind,
  results in `data/weekly.json` (`server/weekly.mjs`), the endpoints
  (`server/api/weekly.mjs`) and the mod (`mods/super-final/`).
- **The game's helmets.** The look editor lists six (`helmet` in
  `appearance-*.js`): none, black or white water helmet, red visor helmet, knit
  cap and baseball cap. The 3D rider builds the chosen one from spheres, tubes
  and plain colours (`function vd(helmet)` in `dispose-model-*.js`). The bundle
  includes the 3D library's `CanvasTexture`, so a texture can be drawn on a
  canvas. Hidden sails and boards carry `visibility: "hidden"` and show only
  with the hidden-gear setting.
- **Serve-time patches.** A mod's `patches.mjs` lists exact text replacements in
  a game module, each with the number of matches it expects; a game update that
  breaks one fails loudly (`server/patches.mjs`). The local-badge mod uses one.
- **Riders.** The local server stores whatever look a rider sends, so a new
  helmet value is kept.
- **Tour data.** The three events' podiums, with real names, and Neubauer's
  ratings. No winds or heat scores.

## Approach

The mod draws the button, the intro card and the congratulations screen
itself, styled with the game's own classes. The server picks the week's event
from the three, sails Neubauer's heat for each room, and runs the 1v1 as the
super final does. The helmet goes into the game through a serve-time patch, so
it is a real helmet: chosen in the look editor, saved on the rider, and drawn
in heats, 1v1 and replays.

We considered swapping the helmet's look in the running 3D scene from the mod
(fragile, and never in the look editor), and showing the helmet only in our own
screens (not a real prize).

## Components

### Champion data (`server/champion.json`, new)

`{ rider: "m:lennart-neubauer", events: [{ id, story }] }` for events 342, 359
and 378. Each story is two to four sentences in our own words from the PWA's
reports.

### Weekly picker (`server/weekly.mjs`)

- **`weekOf`:** picks among the champion's events, in id order, seeded by the
  week.
- **`opponentFor`:** Lennart Neubauer, with his real name. The target is his
  best form at his latest rating: `min(50, averageScore(rating) + 6)`.
- **`podium`:** the event's first three, with real names.
- **The wind:** `{ knots: 19, gustKnots: 6 }`.

### Heats per room (`server/api/weekly.mjs`, `server/lagoon/lobby.mjs`)

- The AI-heats cache key includes the room's seed.
- Starting sails the heat for the first room, then starts sailing the next
  room's heat in the background. Each room that opens starts the one after.
- The lobby takes rooms with their heats ready. If you ask for a rematch before
  the next heat is ready, Neubauer's challenge appears as soon as it is.

### The helmet (`mods/champion/patches.mjs`, new)

- Adds "Red Bull helmet" to the look editor's helmets, shown only once the
  prize is won.
- Adds a `redbull` helmet to the 3D rider: the water helmet's shape in navy,
  a silver visor, and the Red Bull logo (two red bulls and a yellow sun) drawn on
  a canvas and placed on the front and sides.

### The mod (`mods/champion/`, replacing `mods/super-final/`)

- **The button** after "1v1 Lobby", following that button's state, as now.
- **The intro card:** the event, the story, the podium, the prize with a
  picture of the helmet, your best this week, and "Challenge Lennart Neubauer".
- **The congratulations screen:** shown when a heat against Neubauer ends in
  your win. It names him and the event, shows both scores and the helmet. "Wear
  it now" puts the helmet on your rider.
- **The prize:** unlocks the helmet in the look editor. The hidden-gear unlock
  goes.

### Endpoints

- `GET /api/local/weekly` adds the story, the podium and the time of your last
  win, so the mod can tell a new one.
- `POST /api/local/weekly/start` takes no division.

### Sharing

`gh repo create freestyle-tour --private`, with `main` pushed. `vendor/`
(the game) and `data/` (your local data) stay out, as `.gitignore` says.

## Errors

- **The AI can't reach the target in gusty wind:** the target is capped at what
  the planning probe shows it reaches reliably.
- **A game update breaks the helmet patch:** the server stops at start with a
  message naming the patch, as for any patch.
- **A rematch before the next heat is ready:** the challenge comes when it is.
- **No tour data:** the button says to run `npm run tour-data`, as now.

## Testing

- **Weekly picker:** the three events by week, Neubauer as the opponent, the
  target, real names and the podium in the answer.
- **Heats per room:** the cache key carries the seed; the next room is prepared.
- **Lobby:** a rematch waits for its heat.
- **Patch** (snapshot test): each replacement matches exactly once, and the
  rider builder makes a `redbull` helmet with the decal.
- **Mod helpers:** the button's and card's texts.
- **In the browser** (the pane visible): the seven success criteria, with the
  helmet seen in the look editor and on the rider.

## Risks

- **The AI's best score in gusty wind** is untested; the probe settles the
  target.
- **The logo** has to read on a small helmet; the decal is drawn large on the
  front.
- **Hiding the helmet until it's won** needs a patch where the look editor
  lists options; the probe finds the right place.
- **Sailing each room** takes about 20 seconds in the worker; sailing ahead
  hides it.

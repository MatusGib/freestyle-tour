# Sub-project 3c, part 1b: the Champion's challenge

Part of the roadmap in `docs/roadmap.md`. It replaces the weekly super final
(part 1, `2026-10-25-weekly-super-final-design.md`) with a harder, hand-picked
version, after trying it out:

- always against Lennart Neubauer, at his five most recent wins;
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
| Events | Neubauer's five most recent wins: 2023 Sylt, 2024 Fuerteventura and 2025 Sylt, from the PWA results data, and 2026 Fuerteventura and 2026 Sylt, whose results weren't on the PWA site when it was crawled (their podiums and stories come from the event reports, entered by hand). One a week, seeded by the week |
| Opponent | Lennart Neubauer, always |
| Difficulty | The AI aims for his best form at his latest rating in the tour data, the one going into 2025 Sylt (1946), at all five events: his average plus the spread (6), at most 50. That is 47.45, against 41.45 on an average day |
| Wind | 19 kt with gusts to 25 kt (`gustKnots` 6), the game's windiest 1v1 room |
| Opponent's heat | Gusts make every room's wind different, so each room gets its own sailed heat. Rooms are never reused, so heats aren't cached; the next room's heat is sailed while you race |
| Intro card | Opens when you press the button: the event, a short story of it, the podium, the prize with a picture, the heat you'll face, your best this week, and "Challenge Lennart Neubauer" |
| Story | Written in our own words from the event reports: the conditions and how the final went |
| Prize | A Red Bull helmet: a new helmet in the game (navy shell, silver visor, the Red Bull logo drawn as a decal), added by serve-time patches. It appears in the look editor once won |
| After a win | A congratulations screen over the game's result screen: who you beat, where, both scores, the helmet, and "Wear it now" |
| Results | Kept in `data/champion.json`, apart from the super final's `data/weekly.json`, so an old super final win doesn't count as beating him |
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
  results (`server/weekly.mjs`), the endpoints (`server/api/weekly.mjs`) and the
  mod (`mods/super-final/`).
- **The game's helmets.** The look editor lists six (`helmet` in
  `appearance-*.js`): none, black or white water helmet, red visor helmet, knit
  cap and baseball cap. Its list function filters hidden sails and boards but
  returns the helmets as they are, and the game's look check keeps only values
  in those lists. The 3D rider builds the chosen helmet from spheres, tubes and
  plain colours (`function vd(helmet)` in `dispose-model-*.js`); every helmet
  but the caps shares one water-helmet shell. The bundle includes the 3D
  library's `CanvasTexture` (`$i` in that module).
- **Serve-time patches.** A mod's `patches.mjs` lists exact text replacements in
  a game module, each with the number of matches it expects
  (`server/patches.mjs`). One that no longer matches makes that module answer
  500 with the patch's message, and the server logs it. The local-badge mod uses
  one. An `import` may sit anywhere at a module's top level, so a patch can
  bring in a mod's module from `/__mods/`.
- **Riders.** The local server stores whatever look a rider sends. The game
  keeps your rider in `localStorage["fristajlo-player-v3"]` and reloads it from
  the server when its window gets focus.
- **Tour data.** 2023 Sylt (event 342), 2024 Fuerteventura (359) and 2025 Sylt
  (378), with their podiums and Neubauer's ratings. No winds or heat scores. The
  2026 events aren't in it: the PWA site had no results tables for them when it
  was crawled.

## Approach

The mod draws the button, the intro card and the congratulations screen
itself. The server picks the week's event from the five, sails Neubauer's heat
for each room, and runs the 1v1 as the super final does. The helmet goes into
the game through serve-time patches, so it is a real helmet: chosen in the look
editor, saved on the rider, and drawn in heats, 1v1 and replays.

We considered swapping the helmet's look in the running 3D scene from the mod
(fragile, and never in the look editor), and showing the helmet only in our own
screens (not a real prize).

## Components

### Champion data (`server/champion.json`, new)

`{ rider, name, rating, events: [{ id, tourId?, name, when, place, podium,
story }] }` for the five events, oldest first. It holds everything the card
shows, so the challenge needs no tour data at runtime. A test checks the
podiums and the rating against the tour data where it has the event.

### Weekly picker (`server/weekly.mjs`)

- **`weekOf(champion, weekStart)`:** one of the champion's events, in the order
  listed, seeded by the week.
- **`opponentFor(champion)`:** Lennart Neubauer, with his real name. The target
  is his best form: `min(50, averageScore(rating) + 6)`.
- **The wind:** `WIND = { knots: 19, gustKnots: 6 }`.
- **Results:** each week's best and whether you won, your last win (with both
  scores, so the mod can congratulate you once), and the prize on the first
  win.

### Heats per room (`server/api/weekly.mjs`, `server/lagoon/lobby.mjs`)

- **A room queue:** starting sails the heat for the first room; handing that
  room to the lobby starts sailing the next one.
- **The lobby** takes rooms with their heats ready. If you ask for a rematch
  before the next heat is ready, your challenge stays pending, and the room
  opens as soon as it is.

### The helmet (`mods/champion/helmet.js` and `mods/champion/patches.mjs`, new)

- **`helmet.js`** draws the logo (two red bulls charging at a yellow sun, and
  the name) on a canvas, adds the visor and the logo to the game's helmet
  group, and draws a picture of the helmet for the mod's screens.
- **The patches:**
  - add "Red Bull helmet" (`redbull`) to the game's helmet list, so the look
    check keeps it;
  - make the look editor's list leave it out until the prize is won in this
    browser;
  - draw its shell in navy and add the parts from `helmet.js`.

### The mod (`mods/champion/`, replacing `mods/super-final/`)

- **The button** after "1v1 Lobby", following that button's state, as now.
- **The intro card:** the event, the story, the podium, the prize with a
  picture of the helmet, the heat you'll face, your best this week, and
  "Challenge Lennart Neubauer".
- **The congratulations screen:** after a challenge starts, the mod checks this
  week's info every few seconds, and shows the screen for a win it hasn't shown
  before. It names him and the event, shows both scores and the helmet. "Wear it
  now" saves the helmet on your rider through the local server and lets the
  game reload your rider.
- **The prize:** unlocks the helmet in the look editor. The hidden-gear unlock
  goes.

### Endpoints

- `GET /api/local/weekly`: the event (with its podium), the story, the
  opponent and target, the wind, your best, whether you won, your last win and
  the prize.
- `POST /api/local/weekly/start` takes no body.

### Sharing

`gh repo create freestyle-tour --private`, with `main` pushed. `vendor/`
(the game) and `data/` (your local data) stay out, as `.gitignore` says.

## Errors

- **Planning the opponent's heat fails, or no room has the wind:** the card
  shows "Couldn't get Lennart Neubauer ready. Press to try again."
- **A game update breaks the helmet patches:** the patched module answers 500
  with the patch's message and the server logs it; switch the mod off until the
  patches are updated.
- **A rematch before the next heat is ready:** the challenge opens when it is.
- **Sailing the next room fails in the background:** the server logs it, and
  the rematch stays pending; press the button again.

## Testing

- **Weekly picker:** the events by week, Neubauer as the opponent, the target,
  results with the last win, and the champion file against the tour data.
- **Endpoints:** this week's info, starting, the next room sailed behind the
  first, a rematch waiting for its heat, a win recorded with the prize, errors.
- **Lobby:** a rematch waits for its heat.
- **Patches** (snapshot test): each replacement matches exactly once, and both
  patched modules still parse.
- **Room winds** (snapshot test): rooms with the champion's wind each give
  their own gusts.
- **Mod helpers:** the button's and card's texts.
- **In the browser** (the pane visible): the seven success criteria, with the
  helmet seen in the look editor and on the rider.

## Risks

- **The AI's best score in gusty wind:** settled while planning. In five
  rooms at 19 kt gusting to 25 it scored 46.43 to 46.92 against 47.45, each heat
  sailed in 6 to 8 seconds.
- **The logo** has to read on a small helmet: it is drawn large across the
  front, and reads at the look editor's size.
- **The hand-entered 2026 events** rest on the event reports; when the PWA
  publishes their results, the tour data can be rebuilt and the podiums checked.

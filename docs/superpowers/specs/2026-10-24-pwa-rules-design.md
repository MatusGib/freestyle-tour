# Sub-project 2: PWA rules mod

Part of the roadmap in `docs/roadmap.md`. Builds on the local copy and mod layer
from sub-project 1.

## Goal

A mod, `pwa-rules`, that makes a solo heat run like a PWA freestyle heat: longer
heats in the Best Move format, a five-judge panel, and the PWA start flags. The
original rules come back by turning the mod off.

## Decisions

| Topic | Decision |
|---|---|
| Heat length | 6 minutes |
| Moves per tack | Up to 6 (a wipeout uses one, as in the original) |
| Counting | Best 4 per tack, 8 in total |
| Tack rule | Kept from the original: tack or jibe between scored moves |
| Repeated moves | Original rules: a move repeated on the same tack counts once (the best one); all Culo variations share one slot per tack; a move repeated on the other tack loses 1 point |
| Judges | 5 simulated judges score each move in tenths; the highest and lowest are dropped and the middle three averaged |
| Start | A 5-second sequence: red flag at 5 s to go, yellow at 2.5 s, green at the start. Moves before green don't score |
| End | Yellow flag for the final minute, red at the end (as in the original) |
| Leaderboard | Heats under these rules are saved as scoring version 3 and never mix with original-rules heats |
| Approach | An engine hook and small serve-time patches, plus runtime changes to the heat rules |

## Success criteria

1. With the mod on, a solo heat lasts 6 minutes after a 5-second start sequence
   (red, yellow, green, with the horn at green). Moves tried before green don't
   score.
2. Each landed move gets five judge scores. The landing popup, the scoresheet and
   the heat total all use the panel's score.
3. The scoresheet counts the best 4 moves per tack, and its text says so. A
   seventh move on a tack is refused, and the tack rule and repeat rules work as
   in the original.
4. A judges' sheet shows each move's five scores, with the dropped two struck
   through, and the average.
5. A finished heat appears on the leaderboard under "Scoring v3 · PWA rules",
   which the board opens on. Original-rules heats stay under v2.
6. With the mod off, the game behaves exactly as before, and `npm test` still
   passes.

## Out of scope

- Opponents and multi-rider heats (sub-project 4).
- Venue conditions, including the PWA minimum-conditions rule (sub-project 5).
- New tricks (sub-project 6).
- Changing how a single judge rates a move. Each judge starts from the game's
  own breakdown of the move.

## How the original works

Found in the 2026-10-24 snapshot:

- **Heat rules** live in one exported object (`heatRules`):
  `{ seconds: 180, attemptsPerTack: 8, counting: 6, minPerTack: 3, maxPerTack: 3 }`.
  The engine reads it live for the time limit, the attempt limit and the
  final-minute flag. The HUD reads it for its per-tack dots and its counting
  total. Changing the object at runtime changes all of these.
- **Hard-coded in the engine:** the heat totals keep the best 3 moves per tack
  (`slice(0, 3)` for each tack), whatever `maxPerTack` says.
- **Hard-coded in the page module:** the rule texts "Best 6 · 3 per tack",
  "/6 counting", "3 minutes · 8 attempts per tack · Best 6 count" and
  "3 min · Best 6 count".
- **Scoring a move:** when an attempt ends, one engine function copies the move's
  score and breakdown (difficulty, amplitude, control, flow) onto the attempt.
  The landing popup, the heat total and the best score are all computed right
  after it, from the attempt.
- **Flags:** a state function maps the heat time to `countdown` (before 0, red),
  `running` (green), `final` (last minute, yellow) or `over` (red). A table gives
  each state's colour and labels. A second function sounds the horn when the time
  crosses 0 and when it reaches the end.
- **Moves that don't score:** while `heat.warmup` is true, tricks are allowed but
  not recorded as attempts.
- **Scoring version:** the client registers solo heats with `scoringVersion: 2`.
  The board's version list is `[2, 1]`, and the board opens on version 2.

## Approach

Three kinds of change, each as small as possible:

1. **Runtime:** at setup, the mod changes `heatRules` to
   `{ seconds: 360, attemptsPerTack: 6, counting: 8, minPerTack: 4, maxPerTack: 4 }`.
2. **Serve-time patches** (in `mods/pwa-rules/patches.mjs`):
   - **Scoring hook:** right after the engine copies a move's score onto the
     attempt, call `globalThis.__freestyleHooks?.moveScored?.(attempt)`. This is a
     general hook that later mods can use too.
   - **Counting:** the heat totals keep the best `maxPerTack` moves per tack
     instead of 3.
   - **Preparatory flag:** the flag state is `preparatory` (yellow, "Get ready",
     "Yellow flag, heat about to start") in the last 2.5 seconds before the start.
     The existing `countdown` state is relabelled "Warning" ("Red flag, warning
     signal").
   - **Rule texts:** "Best 8 · 4 per tack", "/8 counting",
     "6 minutes · 6 moves per tack · Best 8 count" and "6 min · Best 8 count".
   - **Scoring version 3:** solo heats register as version 3; the board's version
     list becomes `[3, 2, 1]` and opens on 3; version 3 is labelled "PWA rules".
3. **Per-step logic:** a pure function, `beforeStep(state)`, runs before every
   physics step, through `ctx.onStep` in the browser and directly in the Node
   harness. When a heat starts, it moves the clock to −5 s and sets
   `heat.warmup`. It clears `warmup` when the clock reaches 0.

We considered rewriting scores after the game computes them (the original score
would flash in the landing popup, and replays would disagree) and replacing the
game's scoring with our own copy (more duplicated code that breaks on game
updates). The hook keeps the game's own flow intact.

## Components

All in `mods/pwa-rules/`. The pure modules have no browser or Node dependencies,
so the browser, the server and the harness share them.

### `rules.js`

The rule values in one place: heat seconds, moves per tack, counting per tack,
judge count, the start sequence (`{ warning: 5, preparatory: 2.5 }`) and the
scoring version. `applyRules(heatRules)` writes them into the game's object.

### `judges.js`

`judgePanel(attempt)` returns `{ scores, dropped, score }`.

- **Input:** the attempt's breakdown (difficulty, amplitude, control, flow), its
  `id`, `startedAt` and `key`.
- **Judges:** five fixed judges, each with a slight leaning, a weight between 0.9
  and 1.1 on each part of the breakdown. For example, judge 2 weights amplitude
  1.1. Judges are labelled "Judge 1" to "Judge 5".
- **Variation:** each judge adds a small offset between −0.3 and +0.3, from a
  seeded random generator keyed by the attempt's `id`, `startedAt`, `key` and the
  judge's number. The same move in the same replay always gets the same scores.
- **Scores:** each judge's score is clamped to 0–10 and rounded to tenths. The
  highest and lowest (one each, by position on ties) are `dropped`. `score` is the
  average of the other three, rounded to hundredths.
- **Moves without a score:** a wipeout or a move scored 0 gets five zeros.

### `start.js`

`beforeStep(state, rules)`: the start sequence described above. It does nothing
when the heat isn't enabled, and acts once per heat (it marks the heat it has
started).

### `index.js` (browser)

At setup it:

- calls `applyRules(ctx.engine.heatRules)`;
- registers `moveScored`, which runs `judgePanel` and stores the result on the
  attempt: the game's original score as `baseScore`, the panel as `judges`, and
  the panel's average as `score`;
- registers `beforeStep` through `ctx.onStep`;
- adds the judges' sheet as an overlay. During a heat it's a small "Judges" button.
  At the end of the heat it opens by itself and lists every landed move with five
  scores (dropped ones struck through), the average, the −1 note for repeats from
  the other tack, and whether the move counts.

### `patches.mjs` (server)

The patch rules listed under Approach. Each targets its module by part or by a
marker, and states its expected match count, as sub-project 1 requires.

## Changes outside the mod

- **Patched game in Node.** `lib/snapshot.mjs` gains a way to load a snapshot's
  parts with mods' patches applied. It writes the patched modules, and the
  unpatched ones they import, to `vendor/<snapshot>-patched/<mods>/`, which git
  ignores, and imports them from there. The server scores submitted heats with
  the patched engine when mods are enabled, so best-4 counting matches what the
  player saw. The harness can load it too.
- **Leaderboard by version.** The server's weekly board shows only heats of the
  requested scoring version, as the all-time board already does.

## Testing

- **`judges.js`:**
  - The same attempt always gives the same scores.
  - Scores are in tenths, between 0 and 10, and within 0.35 of the judge's
    weighted breakdown (the 0.3 offset plus rounding), unless clamped at 0 or 10.
  - Exactly one highest and one lowest are dropped, and `score` is the mean of the
    rest.
  - A zero breakdown gives five zeros.
- **`start.js`:** the clock moves to −5 s once per heat; `warmup` is set before 0
  and cleared at 0; heats that aren't enabled are untouched.
- **Patches** (snapshot test): every rule matches exactly once in the current
  snapshot.
- **Patched engine in Node** (snapshot test):
  - The heat totals keep 4 moves per tack, from synthetic attempts, and the Culo
    slot and the other-tack penalty still apply.
  - The flag state is `countdown` at −4 s, `preparatory` at −1 s, `running` at
    10 s and `final` at 301 s.
- **Scripted heat in Node** (snapshot test): a heat on the patched engine, with
  the hook and `beforeStep` installed, lands at least one move. That move carries
  five judge scores, and its score equals the panel's average. The inputs are
  found by a search during implementation and pinned in the test.
- **Server:** weekly and all-time boards filter by version; heats submitted with
  the mod on are totalled with best-4 counting.
- **In the browser**, with `npm start`:
  1. The menu texts read "6 minutes · 6 moves per tack · Best 8 count".
  2. A solo heat starts with red, yellow, then green and the horn. A trick before
     green doesn't score.
  3. Landed moves show the panel's score in the popup. The scoresheet shows
     "Best 8 · 4 per tack" and four dots per tack.
  4. The judges' sheet opens at the end with five scores per move.
  5. The leaderboard opens on "Scoring v3 · PWA rules" with the heat.
  6. With `--mods=`, everything above is back to the original.

## Risks

- **The start sequence shifts the clock.** The game's input recording starts with
  the heat, so replays (sub-project 3) must run `beforeStep` too. Sharing the pure
  function makes this possible, and the scripted Node heat checks it.
- **The flag UI may expect only the four original states.** If the HUD can't show
  `preparatory`, the patch also maps it in the HUD's colour lookup. The browser
  check catches this.
- **The client's version list and labels are spread over two modules.** Patches
  for version 3 may need adjusting after a game update. Their match counts fail
  loudly if so.

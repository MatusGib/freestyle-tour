# Sub-project 3b: AI riders

Part of the roadmap in `docs/roadmap.md`, the second of the three tournament
pieces. It builds on the rider data (`tour/`, sub-project 3a) and on the replay
runner and opponent display from replays and ghosts (sub-project 2). The base
game stays unchanged.

## Goal

AI riders who sail real heats with the game's own engine, scoring what their
rating says, and a `challenge` mod to sail a solo heat against any rider of any
event.

## Decisions

| Topic | Decision |
|---|---|
| What you can play | A challenge mod: pick an event and a rider, then sail your next solo heat against them |
| How the AI sails | Freestajlo's planner, which plans each jump by simulating it with the game's own engine and can aim for a chosen heat score |
| Where and when | On the local server, before your heat: about 20 seconds in a worker thread, then cached. During your heat the mod plays the recording back as the opponent |
| Planner code | A pinned copy of Freestajlo's planner as of 2026-10-24, because that repo keeps changing |
| Score scale | The game's own. A rider rated 1965 (the top 5% of men's ratings going into events) averages 42, close to the 38–42 heat totals reported from 2026 events |
| Heat-to-heat spread | ±6 points (one standard deviation) |
| Score range | Targets are clipped to 22–50: the planner can't aim lower than about 22 |
| Wind in a challenge heat | This week's solo wind, since the original starts solo heats only with it. Venue winds come with sub-project 4 |
| Names | Only pseudonyms reach the browser |

## Success criteria

1. In the challenge mod you can pick 2025 Sylt Grand Slam, then "Balt Möller".
   After "Plan heat" (under a minute), your next solo heat shows the opponent
   rider labelled with that pseudonym. It sails a full heat whose moves score.
   At the end both totals and the winner are shown.
2. `tools/ai-check.mjs` finds the AI's heat score within 1.0 of its target on
   average, and never more than 3 off, for targets 22, 28, 34, 40 and 46 in five
   weeks' winds.
3. Every saved AI heat replays with the replay runner to the score it was saved
   with.
4. The same rider, event and week give the same heat.
5. The ghost doesn't appear in a challenge heat. With the challenge mod off, the
   game and the ghost behave exactly as before, and `npm test` passes.

## Out of scope

- The tournament mode: ladders, heats against a field, points (piece 3c). It
  will use this piece's score model to settle AI-vs-AI heats without sailing
  them.
- Riders' styles: favourite tricks or how they ride. Every AI sails the
  planner's way.
- Riders' looks: the opponent uses the game's default appearance.
- Venue winds and water (sub-project 4).
- Targets below 22: the weakest riders sail at the floor.

## What exists

- **The planner** (`C:\Users\mateusz\Projects\Freestajlo\bot\`):
  - `brain.mjs` plans each jump by simulating trick programs from the exact
    current state and replays the best plan input for input. `createBrain(E, { target })`
    aims for a heat score. `null` goes for the most.
  - `sim.mjs` steps the game and turns the planner's inputs into controls events.
  - `programs.mjs` and `trained.mjs` hold the trick programs and their tuned
    timing.
  - The planner needs `step`, `heatRules`, `heatTotals`, `tricks`, `isAir`,
    `inArea`, `wind` and `Controls` from the game. Our mod layer already
    identifies all of them.
- **A probe on 2026-10-24** ran the planner unchanged on our snapshot's engine
  in Node, in this week's solo wind (19 kt, gusts +6), with the game's recorder
  attached:

  | Target | Score | Time |
  |---|---|---|
  | max | 50.64 | 16.5 s |
  | 45 | 44.49 | 24.1 s |
  | 40 | 39.58 | 16.5 s |
  | 30 | 30.16 | 21.2 s |
  | 20 | 22.26 | 21.3 s |
  | 15 | 20.57 | 25.8 s |
  | 10 | 0.00 (lands nothing) | 26.9 s |

- **Ratings** (`tour/ratings.json`): going into events, men's ratings run from
  1208 (5th percentile) through 1507 (median) to 1964 (95th) and 2167 (max).
  Women's run from 1223 through 1500 to 2086 and 2213.
- **The opponent display:**
  - `showOpponent(name, now, appearance)` and `receiveOpponent(sample)` (with
    the pose nested), as the ghost uses them;
  - `createRunner` (`mods/lib/replay.js`) replays a recording step by step.
- **The local server** loads the game's `engine` and `week` parts.
  `handleApi` is synchronous and returns `{ status, body }`.

## The score model (`lib/ai/score.mjs`)

Win chances in Glicko are close to a normal curve with a scale of 295.6 rating
points: `P(a beats b) ≈ Φ((Ra − Rb) / 295.6)`. If each rider's heat score is
normal around an average with spread σ, then `P(a beats b) = Φ((Sa − Sb) / (σ√2))`.
The two match when the average moves `σ√2 / 295.6` points per rating point:
0.0287 for σ = 6.

- `averageScore(rating) = 42 + (rating − 1965) × 0.0287`. So 1500 averages
  28.7, 1210 averages 20.3, and 2167 averages 47.8.
- `heatTarget(rating, seed)`: the average plus a normal draw with σ = 6,
  clipped to 22–50. The draw comes from a small seeded generator, so a seed
  always gives the same target.
- `winChance(ra, rb)`: the model's chance that a beats b, `Φ((Sa − Sb) / (6√2))`,
  for piece 3c and the tests.
- The seed of a challenge is a hash of the rider id, the event id and the
  week's start.

## Components

### Planner copy (`lib/ai/freestajlo/`)

`brain.mjs`, `sim.mjs`, `programs.mjs` and `trained.mjs`, copied from
Freestajlo on 2026-10-24. Each starts with a line naming its source and date.
The code is unchanged, so later Freestajlo improvements can be copied in the
same way.

### Sailing (`lib/ai/sail.mjs`)

`sailHeat(engine, conditions, target, { seconds })` starts a heat the way the
game starts a solo heat. It attaches the game's `Recorder`, lets the planner
sail with `createBrain(engine, { target })` until the heat ends (or for
`seconds`, for tests), and returns `{ replay, score, attempts, tricks, steps }`.
`attempts` and `tricks` take the shapes the server already stores for heats.

### Worker (`lib/ai/worker.mjs`)

A worker thread that loads the snapshot's `engine`, `wind`, `controls` and
`week` parts once and sails heats on request. Before answering, it replays
each recording with `createRunner` and checks the score. A mismatch is an error.
The server keeps one worker and queues requests, so two challenges never sail
at once.

### Server

- `server/app.mjs` awaits `handleApi`, so a route can answer later.
- `GET /api/local/tour/seasons`: the seasons with their events, as
  `[{ season, events: [{ id, name, start, divisions: ["men", "women"] }] }]`.
- `GET /api/local/tour/events/<id>`: the event's riders by division, as
  `{ id, name, divisions: { men: [{ rider, pseudonym, place, average }] } }`,
  in place order. `average` is the rider's average heat score going into the
  event.
- `POST /api/local/ai-heats` with `{ rider, event }`:
  - the rider must be an entry of the event;
  - for this week's solo wind, it computes the target and sails the heat (or
    returns it from `data/ai-heats.json`);
  - it answers `{ key, rider, pseudonym, event, weekStart, conditions, target, score, replay }`;
  - the cache key is the snapshot name, the week, the rider and the event.
- Real names stay on the server: the endpoints read `tour/` and send only
  pseudonyms.

### Opponent slot (`mods/lib/opponent.js`)

The game draws one opponent. `claimOpponent(owner)`, `releaseOpponent(owner)`
and `opponentOwner()` let mods take turns. The challenge mod claims it for a
challenge heat. The ghost mod doesn't start a ghost while another mod holds it.

### Challenge mod (`mods/challenge/`)

- **Panel:** a "Challenge" button in the mod overlay opens a panel:
  - season, event and division (pseudonyms with their place at the event and
    their average score);
  - "Plan heat", which shows "Planning Balt Möller's heat…" while the server
    sails;
  - "Next solo heat: vs Balt Möller (target 41.3)" once it's ready, with a
    button to cancel.
- **Heat:** when the next solo heat starts, the same check the ghost uses, the
  mod claims the opponent slot. It shows the AI under its pseudonym, and feeds
  it a pose each step from a runner over the recording.
- **End:** when your heat ends, the panel shows "You 38.2 · Balt Möller 41.7 —
  Balt Möller wins", and the challenge is used up.
- **Week change:** a challenge planned for an earlier week is planned again
  before it's used.

## Errors

- **Planning fails** (the planner throws, or the replay check fails): the
  server answers 500 with the reason, and the panel shows "Couldn't plan the
  heat" and Retry.
- **Unknown rider or event, or a rider not entered in that event:** 404.
- **A solo heat that starts while planning:** no opponent. The panel says the
  heat is still being planned.
- **A new snapshot:** cached heats from another snapshot aren't used, because
  the snapshot name is part of the key.

## Testing

- **Score model:**
  - `averageScore(1965)` is 42 and the slope is 0.0287;
  - `winChance` is within 0.02 of Glicko's for rating gaps of 0–600 at
    deviation 50;
  - targets are reproducible from their seed and stay within 22–50;
  - over many seeds, targets average the rider's average with a spread close
    to 6.
- **Sailing** (snapshot test): a 20-second heat at target 40 records and
  replays with `createRunner` to the same attempts and state.
- **Worker:** it answers a request with a heat, and reports a planner error.
- **Server:** with a stand-in sailer, checks that:
  - the season and event lists come back in order, with no real names;
  - a challenge for a rider not in the event is a 404;
  - a second request for the same challenge comes from the cache.
- **Opponent slot:** claims and releases. The ghost mod skips its ghost while
  the slot is held.
- **Challenge helpers:** the labels, the result line and the week check, as plain
  functions.
- **`tools/ai-check.mjs`:** the accuracy check of success criterion 2. It runs
  by hand (about 2 minutes, in parallel worker threads), not in `npm test`.
- **In the browser:**
  1. Plan a challenge against Balt Möller at 2025 Sylt and sail a solo heat:
     the opponent appears, sails and scores, and the result shows.
  2. Plan one, wait past the end of the week (or fake the clock), and see it
     planned again.
  3. The ghost stays away in a challenge heat and comes back in the next one.
  4. With `--mods=` nothing new appears.

## Risks

- **About 20 seconds per heat.** Fine before a heat. Too slow for every
  AI-vs-AI heat of a tournament, which is why piece 3c will draw those scores
  from the model instead of sailing them.
- **The planner's floor:** riders whose draw falls below 22 sail at 22, so the
  weakest riders score a little higher than their rating says.
- **The AI's score can miss its target by about a point,** so a challenge
  against an even rider is slightly noisier than the model.
- **One worker sails one heat at a time.** Two challenges planned back to back
  take about 40 seconds.
- **A pinned planner copy doesn't get Freestajlo's later fixes** until someone
  copies them in again.

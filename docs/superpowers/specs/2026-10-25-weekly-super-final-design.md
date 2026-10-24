# Sub-project 3c, part 1: the weekly super final

Part of the roadmap in `docs/roadmap.md`. The tournament mode (3c) became the
**Weekly challenge**: each week you relive a past PWA event against the real
riders who sailed it. This first part is a thin slice through the whole idea:

- a past event each week;
- you against its winner in one super final;
- the game's own 1v1 heat;
- a prize for winning.

Later parts add the event winds, the full bracket and more collectibles. It
builds on the rider data (3a), the AI riders (3b) and the mod layer. The base
game stays unchanged.

## Goal

A "Super final" section in the game's main menu. Each week it offers one past
event's final, against that event's winner, sailed as a real 1v1 heat in the
game's own 1v1 screens. Your first win unlocks the game's hidden gear.

## Decisions

| Topic | Decision |
|---|---|
| Slice | The super final first; the full bracket later, on the same pieces |
| How it looks | The game's own 1v1 heat: lobby challenge, countdown, opponent on the water, result screen with the winner |
| How | The local server plays the multiplayer side of the original's 1v1 (lobby, rooms, pose relay) with an AI rider in the other seat |
| Event of the week | One past event per week, picked from all events with results, seeded by the week (the game's own calendar: Monday 00:00 Warsaw time) |
| Opponent | The event's winner, in the division you pick (men or women, when the event had both) |
| Opponent's heat | Sailed by the AI riders (3b) at a target seeded by the week, so every retry that week faces the same heat |
| Wind | The room id decides a 1v1 heat's wind in the game (15–19 kt, gusts none or 4–6). The server picks a room id that matches the event's wind. Until the event winds table exists (the next spec), 17 kt without gusts |
| Retries | As many as you like in the week; the server keeps your best score and whether you beat the winner |
| Prize | Your first win switches on the game's own hidden gear: the Severne Freek CC1 sail and the Severne Psycho board |
| Name | "Super final", because the solo heat's menu entry already says "Weekly challenge" |
| Names on screen | Pseudonyms only |

## Success criteria

1. The main menu has a "Super final" button under "1v1 Lobby", styled like the
   game's own. It names this week's event and the opponent's pseudonym.
2. Pressing it gets the opponent ready (under a minute) and opens the game's 1v1
   lobby, where their challenge is waiting. Accepting starts a 1v1 heat with the
   game's countdown and the opponent sailing under their pseudonym. At the end,
   the game's result screen names the winner and shows both scores.
3. A retry in the same week faces the same opponent heat, in the same wind.
4. A win switches on the hidden gear, so both Severne items appear in the look
   editor; a loss doesn't.
5. Without a super final waiting, the 1v1 lobby behaves as before (empty).
   Solo heats, ghosts, the replay viewer and the challenge mod are unaffected.
   `npm test` passes.

## Out of scope

- The full bracket (a later part of 3c).
- The event winds table (the next spec): until then every super final sails
  at 17 kt.
- Collectibles beyond the game's hidden gear.
- Online play and ratings: the Elo on the result screen shows each rider's
  own number with no change.

## What exists

Found in the 2026-10-24 snapshot (`page-*.js`, `scene-*.js`,
`conditions-*.js`, `appearance-*.js`):

- **Lobby requests.** The 1v1 lobby talks to `POST /api/lagoons`. Every request
  carries `playerKey` and `lobbyClientId`.
  - It polls with `{ presence, activity, lobby, scope }`, plus an `action` for
    things you do:
    - `challenge` with `{ challengeId, riderId }`;
    - `accept`, `reject` or `cancel` with `{ challengeId }`;
    - `leave` with `{ roomId }`;
    - `progress` with `{ roomId, attempts }` during a heat;
    - `finish` at its end.
  - Our local server answers it today with an empty lobby.
- **Lobby replies.** The answer merges into a state that starts as
  `{ riders: [], challenges: [], rankings: [] }`, plus `room`, `serverTime` and
  `resultsExpired`.
  - A challenge has `id`, `incoming` and `expiresAt`. An incoming one shows
    "Accept challenge" and "Reject".
- **Rooms.** A room has `id`, `status` (`pending`, `racing` or `finished`),
  `startsAt`, `yourSeat`, `outcome` (a seat number, `draw` or `void`) and
  `seats`.
  - Each seat has `seat`, `nickname`, `appearance`, `submitted`, `forfeited`,
    `score`, `rating`, `ratingDelta` and the tricks the result screen lists.
  - When a room is `racing` with `startsAt`, the game starts a 1v1 heat on a
    clock of `(now − startsAt) / 1000`, so a `startsAt` in the future gives the
    countdown. It calls `showOpponent` with the other seat's nickname and
    appearance.
- **Wind.** A 1v1 heat's wind comes from the room id: the game hashes it into
  a seed and turns that into conditions. Over 20,000 ids, winds ran 15–19 kt
  in equal shares, with gusts none or 4–6 kt.
- **Poses.** They travel in one of three ways:
  - a WebSocket relay. `POST /api/lagoons/connect` with `{ roomId }` answers
    `{ relay: { url, ticket, expiresInMs } }`; the socket uses a subprotocol and
    a `ticket.<ticket>` protocol, and exchanges JSON messages (`auth`, `ready`,
    `ping`, `pong`, `pose` with a `sample`, `invalidate`);
  - WebRTC (needs signaling, not used here);
  - an HTTP fallback, `POST /api/lagoons/opponent` with `{ roomId, pose }`,
    answering `{ opponent: sample }`, at most every 500 ms.
- **Hidden gear.** The game keeps hidden gear behind a browser setting,
  `localStorage["fristajlo.hidden-gear"] = "true"`, and announces changes with
  a `fristajlo-hidden-gear-change` event. It is normally switched by a secret
  gesture in the look editor. The hidden items are the Severne Freek CC1 sail
  and the Severne Psycho board.
- **AI riders (3b).** They give a heat's recording and score for any wind and
  target, sailed in a worker thread.
- **Tour data (3a).** It gives each event's entries (winner first) and each
  rider's rating going into it.

## Approach

The local server plays the multiplayer side. When you start the super final,
it puts the event's winner online in the lobby with a challenge for you. When
you accept, it opens a room, starts it, and streams the AI's poses over a small
WebSocket relay, the way the real relay does. The game's HTTP fallback is
answered too. The game runs its own 1v1 heat and result screen.

We considered patching the game's 1v1 code to take a room from a mod, without
the network (fragile: several patches into minified code), and keeping the
challenge mod's overlay (no 1v1 look and no event wind, the point of the idea).

## Components

### Probe (first task of the plan)

A minimal hard-coded room against the real game, before anything else is
built:

- an incoming challenge;
- `accept`;
- `racing` with `startsAt`;
- a few seconds of poses over the relay, then over the HTTP fallback;
- `finish`, and a finished room.

It confirms the exact request and reply shapes (fields the game requires,
the relay's subprotocol and message fields). The spec's components are then
built to what the probe found.

### Lobby (`server/lagoon/lobby.mjs`)

A plain state machine with an injected clock, so it can be tested without a
browser.

- **`offer({ opponent, heat, roomId })`:**
  - puts the opponent in `riders`, under their pseudonym, with their
    appearance and their rating going into the event;
  - adds an incoming challenge, which expires after 10 minutes.
- **`accept(challengeId)`:** opens a `pending` room with the AI in seat 2.
  - About 2 seconds later it goes `racing`, with `startsAt` 5 seconds after
    that.
- **`progress` and `finish`:** keep your attempts. At `finish`, your score
  comes from the game's own `heatTotals`, as the server does for solo heats.
- **The AI's seat** is `submitted`, with its score, once the room's clock
  passes the heat's length.
- **Finished room:** when both seats are in, the room is `finished`, with
  `outcome` the higher score's seat, or `draw`.
- **Leaving or rejecting:** `leave` during a heat forfeits it, and `reject`
  or `cancel` drops the challenge. Both follow the game's own texts.
- **`snapshot()`:** the reply for any poll, `{ riders, challenges, rankings: [], room, serverTime }`.
- **Unknown actions** are logged and answered with the current snapshot.

### Relay (`server/lagoon/relay.mjs`)

- **The socket:** a minimal WebSocket endpoint on the local server, with the
  handshake and text frames, no dependencies. The CSP's `connect-src 'self'`
  allows it.
- **Authorizing:** `POST /api/lagoons/connect` answers a short-lived ticket and
  the socket's URL.
- **Messages:** the relay answers `auth` and `ping` the way the game expects.
  While the room is racing, it sends a `pose` about 30 times a second: the AI's
  pose at the room's clock.
- **HTTP fallback:** `POST /api/lagoons/opponent` answers the same pose.
- **`lobby-connect`** keeps answering `{ relay: null }`, so the lobby itself
  stays on HTTP polling.

### AI pose track (`lib/ai/worker.mjs`)

- **A second job:** the worker replays a stored recording and returns its poses
  every 1/30 s, `[{ t, pose }]`, using the game's pose builder (`riderPose`).
- **The `pose` part:** the worker loads it as well.
- **When:** the server asks for the track when a room starts. A replay takes
  well under a second.

### Weekly picker (`server/weekly.mjs`)

- **`weekOf(now)`:** `{ weekStart, event, divisions }`.
  - The event is `events[seedOf("weekly", weekStart) % events.length]`, over
    the tour's events in id order.
- **`opponentFor(week, division)`:**
  - the division's winner (place 1, first in place order);
  - their rating going into the event;
  - the target `heatTarget(rating, seedOf(rider, event, weekStart, "super-final"))`.
- **`roomIdFor(wind, weekStart, event)`:** the first id
  `super-final-<event>-<weekStart>-<n>` whose conditions match the wind
  (knots and gusts). It uses the game's own room-conditions function, which
  the mod layer will identify as a new signature (`roomConditions`).
- **Results:** kept in `data/weekly.json`, as
  `{ weeks: { "<weekStart>": { event, division, best, won } }, prize: { earnedAt } }`.

### Endpoints

- `GET /api/local/weekly`:
  - this week's event (name, date, location);
  - its divisions, with the opponent's pseudonym and average score;
  - the wind;
  - your best score and whether you've won;
  - whether the prize is earned.
- `POST /api/local/weekly/start` with `{ division }`:
  - sails or reuses the opponent's heat, in the room's wind (the AI riders'
    cache);
  - offers the challenge in the lobby;
  - answers when it's ready.
- `/api/lagoons`, `/api/lagoons/connect` and `/api/lagoons/opponent`: served
  by the lobby and the relay above, replacing today's stub. `lobby-connect`
  and `signaling` keep their current answers.

### Super final mod (`mods/super-final/`)

- **The menu button.** It adds a "Super final" button after the game's "1v1
  Lobby" button, copying that button's classes so it looks native.
  - Its second line is "This week: <event> · vs <pseudonym> · <knots> kt".
  - When the event had both divisions, it shows a small Men/Women switch.
  - If the menu's structure isn't found, it falls back to a button in the mod
    overlay.
- **Pressing it:** the button says "Getting <pseudonym> ready…", calls
  `/api/local/weekly/start`, then opens the game's 1v1 lobby by clicking the
  game's own "1v1 Lobby" button.
- **The prize.** When `/api/local/weekly` says the prize is earned, the mod
  sets `fristajlo.hidden-gear` and fires the change event. It shows
  "Unlocked: Severne Freek CC1 sail and Severne Psycho board" the first time.
  It checks on every load.

## Errors

- **Planning the opponent's heat fails:** the button shows "Couldn't get
  <pseudonym> ready" with Retry.
- **The challenge expires:** it disappears from the lobby. Press "Super final"
  again.
- **The relay doesn't match the game:** the game falls back to the HTTP pose
  exchange by itself. Updates are slower, but the heat works.
- **You leave mid-heat:** the room ends the way the game expects (forfeit), and
  no result is recorded.
- **A heat running across Monday 00:00** counts for the week it started in.
- **No tour data:** the button says to run `npm run tour-data`.

## Testing

- **Lobby,** with a fake clock:
  - offer, accept, pending, racing with `startsAt`;
  - progress, finish, and the AI submitting at the heat's end;
  - outcome for a win, a loss and a draw;
  - leave, reject, an expiring challenge;
  - unknown actions answered with the snapshot.
- **Relay:**
  - the handshake and frames with a raw socket;
  - tickets checked;
  - poses following the room clock;
  - the HTTP fallback answering the same pose.
- **Pose track** (snapshot test): replaying a stored recording gives one pose
  per 1/30 s, matching `riderPose` at those steps.
- **Weekly picker:**
  - the same event all week;
  - the winner as the opponent;
  - the same target all week;
  - room ids matching each wind, found deterministically (snapshot test).
- **Endpoints and storage:** best score and won kept; the prize recorded on
  the first win only.
- **Mod helpers:** button texts and the prize check, as plain functions.
- **In the browser** (the pane visible):
  1. The menu button names the event and opponent.
  2. Pressing it opens the lobby with the challenge. Accepting gives the
     countdown, then the opponent sails under their pseudonym.
  3. The result screen names the winner with both scores.
  4. A retry faces the same heat.
  5. A win switches on the hidden gear. The win path is unit-tested; in the
     browser it's checked by temporarily lowering the opponent's target
     through a test-only server option.
  6. The plain 1v1 lobby, solo heats, ghosts and the challenge mod still behave.

## Risks

- **The 1v1 protocol is undocumented.** The probe comes first, and the plan
  stops and reports if the game won't accept a local room.
- **A game update** can change the protocol, the menu or the hidden-gear
  switch. Each part fails visibly (the lobby stays empty, the button falls back
  to the overlay).
- **Poses at 30 a second** may look less smooth than a live player. The game's
  own opponent playback smooths them, as it does for real opponents.
- **The hidden gear can also be switched by the game's secret gesture,** so the
  prize isn't exclusive. More collectibles would need new designs (a later
  part).
- **The wind is 17 kt everywhere until the winds table lands.**

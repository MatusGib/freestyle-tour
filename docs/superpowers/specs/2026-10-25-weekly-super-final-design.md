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
2. Pressing it gets the opponent ready (under a minute), and their challenge
   appears as the game's own challenge toast. Accepting starts a 1v1 heat with the
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

### Probe (done while planning, 2026-10-25)

A prototype of the lobby, relay and weekly picker ran against the real game.
It sailed the whole flow:

- the challenge toast;
- the game's own countdown ("Heat starts in 5 · … Wind: 17 kt, steady wind");
- the AI on the water;
- the result screen ("Amada Vryeswijk won the heat!");
- "Challenge again";
- a forfeit;
- the hidden gear in the look editor.

What it found, and what the components below do about it:

- **Challenges appear anywhere.** A pending incoming challenge shows as the
  game's own challenge toast, over the menu as well as in the lobby, so the mod
  doesn't need to open the lobby.
- **Every room needs a never-used id.**
  - The game ignores rooms whose id it has dismissed.
  - It keeps a checkpoint of an unfinished 1v1 heat per room id and resumes it.
    A reused id after a server restart resumed an old heat near its end.
  - So room ids carry the time the super final was started, and every room
    (each rematch too) takes the next id with the same wind.
  - Without gusts, all room ids with the same knots give exactly the same wind,
    so the AI's heat is reused. With gusts the wind depends on the id's seed;
    that's for the event winds part.
- **The live score.** During the heat, the HUD shows the rival seat's `score`
  and per-tack scores from its `attempts`. So the AI's seat reveals the attempts
  it has settled so far.
- **"Challenge again"** on the result screen sends `challenge` with the AI's
  `riderId`, then `dismiss`. The AI accepts at once, in a new room.
- **The relay** must send `{ type: "ready" }` as soon as the socket opens. The
  game sends no message first.

### Lobby (`server/lagoon/lobby.mjs`)

A plain state machine with an injected clock, so it can be tested without a
browser.

- **`offer(opponent, heat, nextRoomId, meta)`:**
  - puts the opponent in `riders` (and you, as the real lobby does), under
    their pseudonym, with their appearance and their rating going into the
    event;
  - adds an incoming challenge, which expires after 10 minutes;
  - `nextRoomId()` gives a new room id for every room.
- **`accept`:** opens a `pending` room with the AI in seat 2.
  - About 2 seconds later it goes `racing`, with `startsAt` 5 seconds after
    that.
- **`challenge`** (after a heat, for the same rider): a new room at once.
- **The AI's seat during the heat** shows only the attempts it has settled by
  the room's clock, and their total.
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
- **Messages:** the relay answers `ping`, and ignores ticket renewals (`auth`)
  and the game's own poses.
  While the room is racing, it sends a `pose` about 30 times a second: the AI's
  pose at the room's clock.
- **HTTP fallback:** `POST /api/lagoons/opponent` answers the same pose.
- **`lobby-connect`** keeps answering `{ relay: null }`, so the lobby itself
  stays on HTTP polling.

### AI pose track (`lib/ai/worker.mjs`)

- **A second job:** the worker replays a stored recording and returns
  `{ poses, settledAt }`.
  - `poses` is the rider's pose every 1/30 s, from the game's pose builder
    (`riderPose`).
  - `settledAt` is the heat time at which each attempt stopped being pending,
    by attempt id.
- **The `pose` part:** the worker loads it as well.
- **When:** the server asks for the track when it offers the challenge, and
  keeps it for rematches in the same wind. A replay takes well under a second.

### Weekly picker (`server/weekly.mjs`)

- **`weekOf(tour, weekStart)`:** `{ weekStart, event }`.
  - The event is `events[seedOf("weekly", weekStart) % events.length]`, over
    the tour's events with a single winner in each division, in id order. (An
    event whose final was never sailed lists several riders at place 1.)
- **`opponentFor(tour, week, division)`:**
  - the division's winner (place 1, first in place order);
  - their rating going into the event;
  - the target `heatTarget(rating, seedOf(rider, event, weekStart, "super-final"))`.
- **`roomIdsFor(roomConditions, wind, prefix)`:** the ids `<prefix>-<n>`
  whose conditions match the wind (knots and gusts), in order.
  - The prefix is `super-final-<event>-<time of the start>`.
  - It uses the game's own room-conditions function, which the mod layer
    identifies as a new signature (`roomConditions`).
- **`recordRoom(store, room, at)`:** records a finished room's result. A
  forfeit isn't recorded.
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
  Lobby" button, with the game's menu-button class so it looks native. It puts
  the button back whenever the game redraws the menu.
  - Its second line is "This week: <event> · vs <pseudonym> · <knots> kt".
  - When the event had both divisions, it shows a small Men/Women switch.
  - If a game update changes the menu, the button doesn't appear. An overlay
    fallback was tried in the probe, but it couldn't tell a changed menu from
    the result and lobby screens.
- **Pressing it:** the button says "Getting <pseudonym> ready…" and calls
  `/api/local/weekly/start`. It then says "<pseudonym> has challenged you:
  accept to start the heat", and the game's challenge toast appears on its next
  lobby poll.
- **The prize.** Each time the menu comes back, the mod checks
  `/api/local/weekly`. When the prize is earned, it sets `fristajlo.hidden-gear`
  and fires the change event. The button then says "Unlocked: Severne Freek CC1
  sail and Severne Psycho board" until it's pressed again.

## Errors

- **Planning the opponent's heat fails:** the button shows "Couldn't get
  <pseudonym> ready. Press to try again."
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
  2. Pressing it brings the game's challenge toast. Accepting gives the
     countdown, then the opponent sails under their pseudonym.
  3. The result screen names the winner with both scores.
  4. A retry faces the same heat.
  5. A win switches on the hidden gear. The win path is unit-tested. In the
     browser, a win is recorded in `data/weekly.json` by hand; after a restart
     the Severne items must appear in the look editor. (An idle rider scores 0,
     so lowering the opponent's target wouldn't produce a win.)
  6. The plain 1v1 lobby, solo heats, ghosts and the challenge mod still behave.

## Risks

- **The 1v1 protocol is undocumented.** The probe showed the game accepts a
  local room. A game update could still change it.
- **Gusty winds (the next part)** make each room id's wind different. So a
  rematch in a gusty wind will need the AI's heat sailed again for the new room
  (about 20 seconds).
- **A game update** can change the protocol, the menu or the hidden-gear
  switch. Each part fails visibly (the lobby stays empty, the button doesn't
  appear).
- **Poses at 30 a second** may look less smooth than a live player. The game's
  own opponent playback smooths them, as it does for real opponents.
- **The hidden gear can also be switched by the game's secret gesture,** so the
  prize isn't exclusive. More collectibles would need new designs (a later
  part).
- **The wind is 17 kt everywhere until the winds table lands.**

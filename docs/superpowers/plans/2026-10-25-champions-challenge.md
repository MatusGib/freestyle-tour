# Champion's Challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the weekly super final with the "Champion's challenge": each week one of Lennart Neubauer's five most recent PWA wins, an intro card with its story, a 1v1 heat against him at his best in 19 kt gusting to 25, a Red Bull helmet as the prize with a congratulations screen; then push the project to a private GitHub repository.

**Architecture:**
- The super final's local 1v1 lobby and relay stay. The lobby now takes ready-made rooms, each with its own sailed heat, because gusts give every room its own wind; a room queue sails the next room's heat while you race.
- A hand-written `server/champion.json` holds the five events (story, podium, dates) and Neubauer's rating.
- The Red Bull helmet enters the game through serve-time patches that import `mods/champion/helmet.js` into the game's look lists and 3D rider.
- The `champion` mod draws the menu button, the intro card and the congratulations screen.

**Tech Stack:** Node 22+ (`node:test`), browser ES modules, the game's own 1v1 client and 3D classes from the snapshot, the `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-10-25-champions-challenge-design.md`

---

## Facts this plan relies on (verified 2026-10-25)

- **The prototype:** every file in this plan was first run in a copy of the repo with the real snapshot. A dry run then applied the tasks one by one to a fresh copy of `main`; each task's failing run and test counts below come from it. The suite goes 224 → 225 → 226 → 227 → 231 → 227.
- **The AI's top score:** in five rooms at 19 kt gusting to 25, aiming for 47.45, it scored 46.43–46.92, each heat sailed in 6–8 s.
- **The browser run** (the prototype, the pane visible):
  - the menu button: "Champion's challenge · This week: 2024 Fuerteventura Grand Slam · vs Lennart Neubauer · 19 kt, gusts 21–25 kt";
  - the intro card, with the story, the podium, the helmet's picture, "Your heat: Lennart Neubauer at his best, aiming for about 47 points, in 19 kt, gusts 21–25 kt", and "Challenge Lennart Neubauer";
  - "Getting Lennart Neubauer ready…" for 8 s, then the game's challenge toast;
  - the countdown with "Wind: 19 kt, gusts 21–25 kt";
  - Neubauer scoring live (15.76 at 26 s, 46.36 at the end);
  - "Challenge again" opening the next room at once, its heat already sailed;
  - after a win was recorded by hand: "Congratulations! You beat Lennart Neubauer at the 2024 Fuerteventura Grand Slam, 48.10 to 46.36.";
  - "Wear it now" saving the helmet, the game reloading the rider on its own (revision 3, helmet `redbull`);
  - the look editor's Wear tab listing "Red Bull helmet" after the six headwear options, the rider wearing it in 3D with the logo legible, and the option gone again once the unlock flag was off.
- **The game's code** (2026-10-24 snapshot):
  - the helmet list ends with `{value:`cap`,label:`Baseball cap`}]` in `appearance-*.js`;
  - its list function `f(e,t,n=!1)` returns `c[e]` for helmets, and its look check keeps only listed values;
  - the 3D helmet builder is `function vd(e)` in `dispose-model-*.js`, with the 3D library's `CanvasTexture` as `$i`.
- **The game's rider:** the game keeps it in `localStorage["fristajlo-player-v3"]`, and reloads it from the server on window focus.
- **Your real data:** `data/weekly.json` holds a real super final win (it earned the hidden gear), which is why the Champion's challenge keeps its results in `data/champion.json`.
- **`gh`** is installed and logged in to github.com as MatusGib, with the `repo` scope. The repository has no remote yet.
- **Line endings:** most checked-out files have Windows line endings. Use the Edit tool for "replace" steps, not `sed`.

## File structure

| File | Responsibility |
|---|---|
| `server/lagoon/lobby.mjs` (modify) | Rooms arrive ready with their own heats; a rematch waits for one |
| `server/champion.json` (create) | The five events (name, dates, place, podium, story) and Neubauer's rating |
| `server/weekly.mjs` (replace) | The week's event, the champion as the opponent, the wind, room ids, results with the last win |
| `server/api/weekly.mjs` (replace) | `GET /api/local/weekly`, `POST /api/local/weekly/start`, the room queue |
| `server/api/index.mjs`, `server/app.mjs` (modify) | Routing, the champion file, `data/champion.json` |
| `mods/champion/helmet.js` (create) | The logo, the helmet's 3D parts, its picture, the unlock flag |
| `mods/champion/patches.mjs` (create) | The helmet in the game's look lists and 3D rider |
| `mods/champion/champion.js`, `mods/champion/index.js` (create) | The mod's texts, and its button, card and congratulations screen |
| `mods/super-final/` (delete), `mods/enabled.json` (modify) | The super final goes |
| `README.md`, `docs/roadmap.md` (modify) | Docs |
| Tests | `test/lobby.test.mjs`, `test/weekly.test.mjs`, `test/api-weekly.test.mjs`, `test/room-wind-snapshot.test.mjs` (replace); `test/pose-track-snapshot.test.mjs` (modify); `test/champion-patch-snapshot.test.mjs`, `test/champion.test.mjs` (create); `test/super-final.test.mjs` (delete) |

Run all commands from the repo root (`C:\Users\mateusz\Projects\freestyle-tour`) in Git Bash. Work on a branch: `git checkout -b champion`.

---

### Task 1: Rooms with their own heats

**Files:**
- Modify: `server/lagoon/lobby.mjs` (replaced whole below)
- Modify: `server/api/weekly.mjs` (one call)
- Test: `test/lobby.test.mjs` (replaced whole below)

- [ ] **Step 1: Write the failing test.** Replace `test/lobby.test.mjs` with:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { HEAT_SECONDS, TIMES, createLobby } from "../server/lagoon/lobby.mjs";

const PLAYER = { nickname: "Tester", appearance: { sail: "teal" } };
const OPPONENT = { id: "m:balz-muller", nickname: "Balt Möller", appearance: { sail: "orange" }, rating: 1757 };
const attempt = (id, score) => ({ id, status: "landed", score, tack: "port", label: "Culo" });
// The AI's heat: three attempts, settled at 20, 50 and 170 seconds.
const HEAT = { score: 30, attempts: [attempt(1, 8), attempt(2, 10), attempt(3, 12)], poses: [{ x: 0 }, { x: 1 }, { x: 2 }], settledAt: { 1: 20, 2: 50, 3: 170 } };
const total = (attempts) => attempts.reduce((sum, a) => sum + a.score, 0);

function setup() {
  let time = 1_000_000;
  const results = [];
  const logs = [];
  let n = 0;
  let isReady = true;
  const lobby = createLobby({ now: () => time, score: total, onResult: (room) => results.push(room), log: (m) => logs.push(m) });
  return {
    lobby,
    results,
    logs,
    later: (ms) => void (time += ms),
    get time() {
      return time;
    },
    // Whether the next room's heat is ready.
    ready: (value) => void (isReady = value),
    offer: (meta = { weekStart: 1, event: 291, division: "men" }) => lobby.offer(OPPONENT, () => (isReady ? { id: `room-${n++}`, heat: HEAT } : null), meta),
    poll: (body = {}) => lobby.act(body, PLAYER),
  };
}

// Accepts the offered challenge and runs the clock to the start of the heat.
function race(s) {
  const challengeId = s.poll().challenges[0].id;
  s.poll({ action: "accept", challengeId });
  s.later(TIMES.racingAfter + TIMES.countdown);
}

test("the lobby answers the old empty lobby until an opponent is offered", () => {
  const s = setup();
  assert.deepEqual(s.poll({ action: "sync" }), { serverTime: s.time, room: null, riders: [], challenges: [], rankings: [] });
  assert.deepEqual(s.logs, [], "quiet actions aren't logged");
});

test("an offer puts the opponent online with an incoming challenge", () => {
  const s = setup();
  s.offer();
  const { riders, challenges, room } = s.poll();
  assert.deepEqual(riders, [
    { id: "m:balz-muller", nickname: "Balt Möller", appearance: { sail: "orange" }, rating: 1757, activity: "lobby", status: "available", you: false },
    { id: "you", nickname: "Tester", appearance: { sail: "teal" }, rating: 1500, activity: "lobby", status: "available", you: true },
  ]);
  assert.equal(challenges.length, 1);
  assert.deepEqual({ ...challenges[0], id: "id" }, { id: "id", status: "pending", incoming: true, expiresAt: s.time + TIMES.offerFor, senderName: "Balt Möller", recipientName: "Tester" });
  assert.equal(room, null);
});

test("accepting opens a pending room that races with a countdown to startsAt", () => {
  const s = setup();
  s.offer();
  const challengeId = s.poll().challenges[0].id;
  const pending = s.poll({ action: "accept", challengeId }).room;
  assert.deepEqual([pending.id, pending.status, pending.startsAt - s.time, pending.yourSeat], ["room-0", "pending", TIMES.racingAfter + TIMES.countdown, 1]);
  assert.deepEqual(pending.seats.map((seat) => [seat.seat, seat.riderId, seat.nickname, seat.score, seat.ratingDelta]), [[1, "you", "Tester", null, null], [2, "m:balz-muller", "Balt Möller", 0, null]]);
  s.later(TIMES.racingAfter);
  const { room, challenges, riders } = s.poll();
  assert.equal(room.status, "racing");
  assert.equal(challenges[0].status, "accepted");
  assert.deepEqual(riders.map((r) => r.activity), ["match", "match"]);
});

test("during the heat the AI's seat shows only its settled attempts and their total", () => {
  const s = setup();
  s.offer();
  race(s);
  s.later(30_000);
  const seat = s.poll().room.seats[1];
  assert.deepEqual([seat.attempts.map((a) => a.id), seat.score, seat.submitted], [[1], 8, false]);
  s.later(25_000);
  assert.deepEqual(s.poll().room.seats[1].attempts.map((a) => a.id), [1, 2]);
});

test("the AI submits at the end of the heat; your finish decides the outcome", () => {
  for (const [yours, outcome] of [[[attempt(9, 31)], "1"], [[attempt(9, 20)], "2"], [[attempt(9, 30)], "draw"]]) {
    const s = setup();
    s.offer();
    race(s);
    s.later(HEAT_SECONDS * 1000);
    assert.equal(s.poll().room.seats[1].submitted, true);
    const room = s.poll({ action: "finish", roomId: "room-0", attempts: yours }).room;
    assert.deepEqual([room.status, room.outcome, room.seats[0].score, room.seats[1].score], ["finished", outcome, total(yours), 30]);
    assert.equal(s.results.length, 1);
    assert.deepEqual(s.results[0].meta, { weekStart: 1, event: 291, division: "men" });
  }
});

test("finishing first waits for the AI, and the result is reported once", () => {
  const s = setup();
  s.offer();
  race(s);
  s.later(179_000);
  assert.equal(s.poll({ action: "finish", roomId: "room-0", attempts: [attempt(9, 40)] }).room.status, "racing");
  s.later(1_000);
  assert.equal(s.poll().room.outcome, "1");
  s.poll();
  assert.equal(s.results.length, 1);
});

test("leaving before the start, even in the countdown, voids the room; leaving during the heat forfeits it", () => {
  const before = setup();
  before.offer();
  before.poll({ action: "accept", challengeId: before.poll().challenges[0].id });
  assert.deepEqual(before.poll({ action: "leave", roomId: "room-0" }).room.outcome, "void");
  assert.equal(before.results.length, 0);
  const countdown = setup();
  countdown.offer();
  countdown.poll({ action: "accept", challengeId: countdown.poll().challenges[0].id });
  countdown.later(TIMES.racingAfter + 1000);
  const cancelled = countdown.poll({ action: "leave", roomId: "room-0" }).room;
  assert.deepEqual([cancelled.outcome, cancelled.seats[1].attempts, cancelled.seats[1].score], ["void", [], 0], "a cancelled room doesn't show the AI's heat");
  assert.equal(countdown.results.length, 0);
  const during = setup();
  during.offer();
  race(during);
  const room = during.poll({ action: "leave", roomId: "room-0" }).room;
  assert.deepEqual([room.status, room.outcome, room.seats[0].forfeited], ["finished", "2", true]);
  assert.equal(during.results[0].you.forfeited, true);
});

test("a challenge can be rejected, cancelled or left to expire", () => {
  for (const [action, status] of [["reject", "rejected"], ["cancel", "cancelled"]]) {
    const s = setup();
    s.offer();
    const challengeId = s.poll().challenges[0].id;
    assert.equal(s.poll({ action, challengeId }).challenges[0].status, status);
  }
  const s = setup();
  s.offer();
  s.later(TIMES.offerFor);
  const { challenges } = s.poll();
  assert.equal(challenges[0].status, "expired");
  assert.equal(s.poll({ action: "accept", challengeId: challenges[0].id }).room, null);
});

test("challenging again after a heat opens a new room at once, and dismissing hides the old one", () => {
  const s = setup();
  s.offer();
  race(s);
  s.later(HEAT_SECONDS * 1000);
  s.poll({ action: "finish", roomId: "room-0", attempts: [] });
  assert.equal(s.poll({ action: "dismiss", roomId: "room-0" }).room, null);
  const again = s.poll({ action: "challenge", challengeId: "c2", riderId: "m:balz-muller" });
  assert.deepEqual([again.room.id, again.room.status, again.challenges[0].status, again.challenges[0].incoming], ["room-1", "pending", "accepted", false]);
  assert.equal(s.poll({ action: "challenge", challengeId: "c3", riderId: "m:balz-muller" }).room.id, "room-1", "not while a room runs");
});

test("the game's own order, challenge again and then dismiss the old room, keeps the new room", () => {
  const s = setup();
  s.offer();
  race(s);
  s.later(HEAT_SECONDS * 1000);
  s.poll({ action: "finish", roomId: "room-0", attempts: [] });
  assert.equal(s.poll({ action: "challenge", challengeId: "c2", riderId: "m:balz-muller" }).room.id, "room-1");
  assert.equal(s.poll({ action: "dismiss", roomId: "room-0" }).room.id, "room-1");
});

test("challenging again before the next room's heat is ready leaves the challenge pending until it is", () => {
  const s = setup();
  s.offer();
  race(s);
  s.later(HEAT_SECONDS * 1000);
  s.poll({ action: "finish", roomId: "room-0", attempts: [] });
  s.ready(false);
  const waiting = s.poll({ action: "challenge", challengeId: "c2", riderId: "m:balz-muller" });
  assert.deepEqual([waiting.challenges[0].status, waiting.challenges[0].incoming, waiting.room.id], ["pending", false, "room-0"]);
  s.ready(true);
  const opened = s.poll();
  assert.deepEqual([opened.challenges[0].status, opened.room.id, opened.room.status], ["accepted", "room-1", "pending"]);
});

test("unknown actions are logged and answered with the snapshot", () => {
  const s = setup();
  s.offer();
  assert.equal(s.poll({ action: "teleport" }).challenges.length, 1);
  assert.deepEqual(s.logs, ["lobby: unknown action teleport"]);
});

test("the racing pose follows the room's clock, 30 a second", () => {
  const s = setup();
  s.offer();
  assert.equal(s.lobby.racingPose(), null);
  race(s);
  assert.deepEqual(s.lobby.racingPose(), { roomId: "room-0", pose: { x: 0 } });
  s.later(40);
  assert.deepEqual(s.lobby.racingPose().pose, { x: 1 });
  s.later(10_000);
  assert.deepEqual(s.lobby.racingPose().pose, { x: 2 }, "the last pose after the track ends");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/lobby.test.mjs`
Expected: 13 tests, 9 failing with `TypeError: offer.nextRoomId is not a function` (the old lobby takes a heat and a room-id function, not a room function).

- [ ] **Step 3: Replace `server/lagoon/lobby.mjs`** with:

```js
// The local 1v1 lobby: plays the multiplayer side of the game's 1v1 for one AI
// opponent at a time. offer() puts the opponent online with a challenge for
// you; the game accepts it (or, after a heat, challenges again), and each room
// goes through pending, racing (with a countdown to startsAt) and finished, the
// way the real lobby's rooms do. A plain state machine on an injected clock, so
// it can be tested without a browser.
import { randomUUID } from "node:crypto";

export const HEAT_SECONDS = 180;
export const TIMES = { racingAfter: 2000, countdown: 5000, offerFor: 10 * 60 * 1000 };
export const POSES_PER_SECOND = 30;
const YOU = "you";
const QUIET = new Set(["sync", "exit", "offline", "presence"]);

// score(attempts): the heat total, by the game's own rules. onResult(room) is
// called once when a room finishes with a result (not when it's cancelled).
export function createLobby({ now, score, onResult = () => {}, log = () => {} }) {
  let offer = null; // { challenge, opponent, takeRoom, meta }
  let room = null;

  const clock = () => (now() - room.startsAt) / 1000;

  // A room from offer.takeRoom(): { id, heat }.
  function openRoom({ id, heat }) {
    const racingAt = now() + TIMES.racingAfter;
    room = {
      id,
      heat,
      status: "pending",
      racingAt,
      startsAt: racingAt + TIMES.countdown,
      outcome: null,
      dismissed: false,
      you: { attempts: [], score: 0, submitted: false, forfeited: false },
      ai: { attempts: heat.attempts, score: heat.score, submitted: false, forfeited: false },
      meta: offer.meta,
    };
  }

  // Opens a room for the challenge if one is ready; otherwise the challenge
  // stays pending until one is.
  function startIfReady() {
    const next = offer.takeRoom();
    if (!next) return;
    offer.challenge.status = "accepted";
    openRoom(next);
  }

  function finishRoom() {
    room.status = "finished";
    const { you, ai } = room;
    room.outcome = you.forfeited ? "2" : you.score > ai.score ? "1" : you.score < ai.score ? "2" : "draw";
    onResult(room);
  }

  // Moves the challenge and room along with the clock.
  function tick() {
    if (offer?.challenge.status === "pending" && now() >= offer.challenge.expiresAt) offer.challenge.status = "expired";
    if (offer?.challenge.status === "pending" && !offer.challenge.incoming) startIfReady();
    if (!room) return;
    if (room.status === "pending" && now() >= room.racingAt) room.status = "racing";
    if (room.status !== "racing") return;
    if (!room.ai.submitted && clock() >= HEAT_SECONDS) room.ai.submitted = true;
    if (room.ai.submitted && (room.you.submitted || room.you.forfeited)) finishRoom();
  }

  // The AI's side as the game should see it now: during the heat, only the
  // attempts it has settled so far, and their total, like a live opponent.
  function aiNow() {
    if (room.ai.submitted) return room.ai;
    if (room.status !== "racing") return { ...room.ai, attempts: [], score: 0 };
    const attempts = room.ai.attempts.filter((a) => room.heat.settledAt[a.id] <= clock());
    return { ...room.ai, attempts, score: score(attempts) };
  }

  const seatOf = (seat, rider, side) => ({
    seat,
    riderId: rider.id,
    nickname: rider.nickname,
    appearance: rider.appearance,
    submitted: side.submitted,
    forfeited: side.forfeited,
    score: side.score,
    rating: rider.rating,
    ratingDelta: null,
    attempts: side.attempts,
  });

  function roomView(player) {
    const you = { id: YOU, nickname: player.nickname, appearance: player.appearance, rating: 1500 };
    const yours = room.you.submitted ? room.you : { ...room.you, score: null, attempts: null };
    return { id: room.id, status: room.status, startsAt: room.startsAt, yourSeat: 1, outcome: room.outcome, seats: [seatOf(1, you, yours), seatOf(2, offer.opponent, aiNow())] };
  }

  // The reply to any lobby poll: the empty lobby the local copy has always
  // answered, until an opponent is offered. player: { nickname, appearance }.
  function snapshot(player) {
    tick();
    if (!offer) return { serverTime: now(), room: null, riders: [], challenges: [], rankings: [] };
    const inHeat = !!room && room.status !== "finished";
    const riders = [
      { id: offer.opponent.id, nickname: offer.opponent.nickname, appearance: offer.opponent.appearance, rating: offer.opponent.rating, activity: inHeat ? "match" : "lobby", status: inHeat ? "in-heat" : "available", you: false },
      { id: YOU, nickname: player.nickname, appearance: player.appearance, rating: 1500, activity: inHeat ? "match" : "lobby", status: "available", you: true },
    ];
    const challenges = [{ ...offer.challenge, senderName: offer.opponent.nickname, recipientName: player.nickname }];
    return { serverTime: now(), room: room && !room.dismissed ? roomView(player) : null, riders, challenges, rankings: [] };
  }

  const ACTIONS = {
    accept({ challengeId }) {
      if (offer?.challenge.id === challengeId && offer.challenge.status === "pending") startIfReady();
    },
    reject({ challengeId }) {
      if (offer?.challenge.id === challengeId && offer.challenge.status === "pending") offer.challenge.status = "rejected";
    },
    cancel({ challengeId }) {
      if (offer?.challenge.id === challengeId && offer.challenge.status === "pending") offer.challenge.status = "cancelled";
    },
    // "Challenge again" after a heat: the AI accepts in a new room as soon as
    // its heat is ready, at once if it already is.
    challenge({ challengeId, riderId }) {
      if (!offer || riderId !== offer.opponent.id || (room && room.status !== "finished")) return;
      offer.challenge = { id: challengeId, status: "pending", incoming: false, expiresAt: now() + TIMES.offerFor };
      startIfReady();
    },
    progress({ roomId, attempts }) {
      if (room?.id === roomId && room.status === "racing") room.you.attempts = attempts;
    },
    finish({ roomId, attempts }) {
      if (room?.id !== roomId || room.status === "finished") return;
      room.you = { ...room.you, attempts, score: score(attempts), submitted: true };
    },
    leave({ roomId }) {
      if (room?.id !== roomId || room.status === "finished") return;
      // Before the start, even in the countdown, the game calls leaving a cancel.
      if (now() < room.startsAt) {
        room.status = "finished";
        room.outcome = "void";
        return;
      }
      room.you.forfeited = true;
      room.ai.submitted = true;
    },
    dismiss({ roomId }) {
      if (room?.id === roomId && room.status === "finished") room.dismissed = true;
    },
  };

  return {
    snapshot,
    // body.action: what the player did, if anything. Answers with the snapshot.
    act(body, player) {
      tick();
      const handler = ACTIONS[body.action];
      if (handler) handler(body);
      else if (body.action && !QUIET.has(body.action)) log(`lobby: unknown action ${body.action}`);
      return snapshot(player);
    },
    // opponent: { id, nickname, appearance, rating }; takeRoom(): the next room,
    // { id, heat: { score, attempts, poses, settledAt } }, or null while it
    // isn't ready (every room needs a new id: the game ignores room ids it has
    // dismissed); meta: what onResult gets back with the room.
    offer(opponent, takeRoom, meta = null) {
      offer = { challenge: { id: randomUUID(), status: "pending", incoming: true, expiresAt: now() + TIMES.offerFor }, opponent, takeRoom, meta };
      room = null;
    },
    // The AI's pose at the room's clock while it races, or null.
    racingPose() {
      tick();
      if (room?.status !== "racing") return null;
      const { poses } = room.heat;
      const i = Math.max(0, Math.min(poses.length - 1, Math.floor(clock() * POSES_PER_SECOND)));
      return { roomId: room.id, pose: poses[i] };
    },
    get room() {
      return room;
    },
  };
}
```

- [ ] **Step 4: Keep the super final working.** In `server/api/weekly.mjs`, replace

```js
    lobby.offer(opponent, { score: heat.score, attempts: heat.attempts, poses, settledAt }, nextRoomId, { weekStart: week.weekStart, event: week.event.id, division: body.division });
```

with

```js
    const ready = { score: heat.score, attempts: heat.attempts, poses, settledAt };
    lobby.offer(opponent, () => ({ id: nextRoomId(), heat: ready }), { weekStart: week.weekStart, event: week.event.id, division: body.division });
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/lobby.test.mjs test/api-weekly.test.mjs`
Expected: PASS, 18 tests (13 + 5).

Run: `npm test`
Expected: PASS, 225 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add server/lagoon/lobby.mjs server/api/weekly.mjs test/lobby.test.mjs
git commit -m "Give each 1v1 room its own heat, and let a rematch wait for one" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Serve the Champion's challenge

**Files:**
- Create: `server/champion.json`
- Replace: `server/weekly.mjs`, `server/api/weekly.mjs`
- Modify: `server/api/index.mjs`, `server/app.mjs`
- Test: `test/weekly.test.mjs`, `test/api-weekly.test.mjs`, `test/room-wind-snapshot.test.mjs` (replace); `test/pose-track-snapshot.test.mjs` (modify)

- [ ] **Step 1: Write the failing tests.** Replace `test/weekly.test.mjs` with:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { averageScore, seedOf } from "../lib/ai/score.mjs";
import { createStore } from "../server/store.mjs";
import { loadTour } from "../server/tour.mjs";
import { LOOK, WIND, opponentFor, recordResult, recordRoom, roomIdsFor, weekOf } from "../server/weekly.mjs";
import { ROOT, WEEK, tempDir } from "./helpers.mjs";

const WEEK_START = 1792360800000;
const event = (id) => ({ id, name: `Event ${id}`, when: "July 2026", place: "Somewhere", podium: ["A", "B", "C"], story: `Story ${id}.` });
const CHAMPION = { rider: "m:lennart-neubauer", name: "Lennart Neubauer", rating: 1946, events: [event("a"), event("b"), event("c")] };

test("each week picks one of the champion's events, the same all week, in the order listed", () => {
  const week = weekOf(CHAMPION, WEEK_START);
  assert.equal(week.event, CHAMPION.events[seedOf("weekly", WEEK_START) % 3]);
  assert.equal(weekOf(CHAMPION, WEEK_START).event, week.event);
  const picks = new Set(Array.from({ length: 12 }, (_, i) => weekOf(CHAMPION, WEEK_START + i * WEEK).event.id));
  assert.ok(picks.size > 1, "the event changes from week to week");
});

test("the opponent is the champion under his real name, aiming for his best form", () => {
  assert.deepEqual(opponentFor(CHAMPION), {
    id: "m:lennart-neubauer",
    nickname: "Lennart Neubauer",
    appearance: LOOK,
    rating: 1946,
    target: Math.round((averageScore(1946) + 6) * 100) / 100,
  });
  assert.equal(opponentFor(CHAMPION).target, 47.45);
  assert.equal(opponentFor({ ...CHAMPION, rating: 2400 }).target, 50, "never above the planner's ceiling");
});

test("room ids are those whose wind matches, in order, under the given prefix", () => {
  const roomConditions = (id) => {
    const n = Number(id.split("-").at(-1));
    return { seed: n, knots: 15 + (n % 5), gustKnots: n % 2 ? 6 : 0 };
  };
  const ids = roomIdsFor(roomConditions, WIND, "champion-2025-sylt-99");
  assert.deepEqual([ids.next().value, ids.next().value, ids.next().value], ["champion-2025-sylt-99-9", "champion-2025-sylt-99-19", "champion-2025-sylt-99-29"]);
});

test("results keep each week's best and whether you won; a win is your last win, and the first earns the prize", (t) => {
  const store = createStore(join(tempDir(t), "champion.json"), { weeks: {}, prize: null });
  const result = (score, opponentScore, won, at) => recordResult(store, { weekStart: WEEK_START, event: "2025-sylt", score, opponentScore, won, at });
  result(20, 47, false, 1);
  assert.deepEqual(store.data, { weeks: { [WEEK_START]: { event: "2025-sylt", best: 20, won: false } }, prize: null });
  result(48, 47, true, 2);
  result(30, 46, false, 3);
  assert.deepEqual(store.data.weeks[WEEK_START], { event: "2025-sylt", best: 48, won: true });
  assert.deepEqual(store.data.lastWin, { at: 2, event: "2025-sylt", score: 48, opponentScore: 47 });
  result(49, 46.5, true, 4);
  assert.deepEqual([store.data.lastWin.at, store.data.prize], [4, { earnedAt: 2 }]);
});

test("a finished room is recorded as a win only with outcome 1, and a forfeit not at all", (t) => {
  const store = createStore(join(tempDir(t), "champion.json"), { weeks: {}, prize: null });
  const meta = { weekStart: WEEK_START, event: "2025-sylt" };
  const room = (outcome, score, forfeited = false) => ({ meta, outcome, you: { score, forfeited }, ai: { score: 47 } });
  recordRoom(store, room("2", 0, true), 1);
  recordRoom(store, { ...room("1", 50), meta: null }, 2);
  assert.deepEqual(store.data.weeks, {}, "forfeits and rooms without a challenge aren't recorded");
  recordRoom(store, room("draw", 47), 3);
  assert.deepEqual([store.data.weeks[WEEK_START].won, store.data.lastWin, store.data.prize], [false, undefined, null]);
  recordRoom(store, room("1", 48), 4);
  assert.deepEqual(store.data.lastWin, { at: 4, event: "2025-sylt", score: 48, opponentScore: 47 });
});

test("server/champion.json agrees with the tour data where the tour data has the event", () => {
  const champion = JSON.parse(readFileSync(join(ROOT, "server", "champion.json"), "utf8"));
  const tour = loadTour(join(ROOT, "tour"));
  assert.equal(new Set(champion.events.map((e) => e.id)).size, champion.events.length, "event ids are unique");
  const inTour = champion.events.filter((e) => e.tourId);
  assert.ok(inTour.length >= 3);
  for (const e of inTour) {
    const entries = tour.events.get(e.tourId).divisions.men.entries;
    assert.deepEqual(e.podium, entries.slice(0, 3).map((x) => tour.riders.get(x.rider).name), e.name);
    assert.equal(entries[0].rider, champion.rider, `${champion.name} won ${e.name}`);
  }
  const latest = inTour.at(-1).tourId;
  assert.equal(champion.rating, Math.round(tour.ratings.events[latest].men[champion.rider].rating), "his rating going into his latest event in the tour data");
});
```

Replace `test/api-weekly.test.mjs` with:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { handleApi } from "../server/api/index.mjs";
import { HEAT_SECONDS, TIMES, createLobby } from "../server/lagoon/lobby.mjs";
import { createRelay } from "../server/lagoon/relay.mjs";
import { createStore } from "../server/store.mjs";
import { WIND, recordRoom, weekOf } from "../server/weekly.mjs";
import { fakeGame, tempDir } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const CHAMPION = {
  rider: "m:lennart-neubauer",
  name: "Lennart Neubauer",
  rating: 1946,
  events: ["2023-sylt", "2025-sylt"].map((id) => ({ id, name: `${id} event`, when: "September 2025", place: "Westerland, Sylt, Germany", podium: ["Lennart Neubauer", "Yentel Caers", "Jacopo Testa"], story: `What happened at ${id}.` })),
};
// Room ids ending in a multiple of 3 have the champion's wind; the rest don't.
// Each id's number is its seed, so each room's wind is its own.
const roomConditions = (id) => {
  const n = Number(id.split("-").at(-1));
  return n % 3 ? { seed: n, knots: 15, gustKnots: 0 } : { seed: n, ...WIND };
};
const attempt = (id, score) => ({ id, status: "landed", score, tack: "port", label: "Culo" });
const settle = () => new Promise((resolve) => setImmediate(resolve));

// A stand-in for the AI riders. holdNext() makes the next sail wait until the
// function it returns is called.
function fakeAi() {
  const calls = [];
  let hold = null;
  return {
    calls,
    holdNext() {
      let release;
      hold = new Promise((resolve) => (release = resolve));
      return release;
    },
    async sail(conditions, target) {
      calls.push(["sail", conditions.seed, target]);
      const wait = hold;
      hold = null;
      await wait;
      return { replay: { format: 1, steps: 10, events: "" }, score: 30, attempts: [attempt(1, 30)], tricks: [], steps: 10 };
    },
    async poses(conditions) {
      calls.push(["poses", conditions.seed]);
      return { poses: [{ x: 0 }], settledAt: { 1: 50 } };
    },
  };
}

function setup(t, { ai = fakeAi(), rooms = roomConditions } = {}) {
  const dir = tempDir(t);
  const store = createStore(join(dir, "db.json"));
  store.update((data) => void data.riders.push({ key: "k1", nickname: "Tester", appearance: { sail: "teal" } }));
  let time = NOW;
  const now = () => time;
  // Wired as server/app.mjs wires it.
  const weekly = createStore(join(dir, "champion.json"), { weeks: {}, prize: null });
  const lobby = createLobby({ now, score: (attempts) => fakeGame.heatTotals({ attempts }).total, onResult: (room) => recordRoom(weekly, room, now()) });
  const logs = [];
  const ctx = { store, game: { ...fakeGame, roomConditions: rooms }, now, ai, weekly, lobby, relay: createRelay({ lobby, now }), champion: CHAMPION, log: (line) => logs.push(line), snapshot: "2026-10-24" };
  const call = (method, path, body = {}) => handleApi({ method, path, query: new URLSearchParams(), body, host: "localhost:5180" }, ctx);
  const poll = (body = {}) => call("POST", "/api/lagoons", { playerKey: "k1", ...body }).body;
  return { ctx, call, poll, ai, logs, later: (ms) => void (time += ms) };
}

test("this week's challenge names the event, its story and podium, and the champion, under real names", (t) => {
  const { call } = setup(t);
  const week = weekOf(CHAMPION, fakeGame.weekStart(NOW));
  const { status, body } = call("GET", "/api/local/weekly");
  assert.equal(status, 200);
  assert.deepEqual(body, {
    weekStart: fakeGame.weekStart(NOW),
    event: { id: week.event.id, name: week.event.name, when: week.event.when, place: week.event.place, podium: week.event.podium },
    story: week.event.story,
    opponent: { name: "Lennart Neubauer", target: 47.45 },
    wind: WIND,
    best: null,
    won: false,
    lastWin: null,
    prize: false,
  });
});

test("starting sails the champion's heat for the first room and offers his challenge; taking the room starts sailing the next", async (t) => {
  const { call, poll, ai } = setup(t);
  const week = weekOf(CHAMPION, fakeGame.weekStart(NOW));
  const { status, body } = await call("POST", "/api/local/weekly/start");
  assert.equal(status, 200);
  assert.deepEqual(body, { name: "Lennart Neubauer", wind: WIND });
  assert.deepEqual(ai.calls, [["sail", 0, 47.45], ["poses", 0]]);
  const { challenges } = poll();
  assert.deepEqual([challenges[0].senderName, challenges[0].recipientName], ["Lennart Neubauer", "Tester"]);
  const { room } = poll({ action: "accept", challengeId: challenges[0].id });
  assert.equal(room.id, `champion-${week.event.id}-${NOW}-0`);
  await settle();
  assert.deepEqual(ai.calls.slice(2), [["sail", 3, 47.45], ["poses", 3]], "the next room gets its own heat, in its own wind");
});

test("challenging again waits for the next room's heat, then opens it", async (t) => {
  const { call, poll, ai, later } = setup(t);
  const week = weekOf(CHAMPION, fakeGame.weekStart(NOW));
  await call("POST", "/api/local/weekly/start");
  const release = ai.holdNext();
  const first = poll({ action: "accept", challengeId: poll().challenges[0].id }).room;
  later(TIMES.racingAfter + TIMES.countdown + HEAT_SECONDS * 1000);
  poll({ action: "finish", roomId: first.id, attempts: [attempt(9, 10)] });
  const waiting = poll({ action: "challenge", challengeId: "c2", riderId: "m:lennart-neubauer" });
  assert.deepEqual([waiting.challenges[0].status, waiting.room.id], ["pending", first.id], "the old room stays until the new one opens");
  release();
  await settle();
  const ready = poll();
  assert.deepEqual([ready.challenges[0].status, ready.room.id, ready.room.status], ["accepted", `champion-${week.event.id}-${NOW}-3`, "pending"]);
});

test("a win is recorded with both scores, as your last win, and earns the prize", async (t) => {
  const { call, poll, later } = setup(t);
  await call("POST", "/api/local/weekly/start");
  const room = poll({ action: "accept", challengeId: poll().challenges[0].id }).room;
  later(TIMES.racingAfter + TIMES.countdown + HEAT_SECONDS * 1000);
  assert.equal(poll({ action: "finish", roomId: room.id, attempts: [attempt(9, 31)] }).room.outcome, "1");
  const info = call("GET", "/api/local/weekly").body;
  assert.deepEqual([info.best, info.won, info.prize], [31, true, true]);
  assert.deepEqual(info.lastWin, { at: NOW + TIMES.racingAfter + TIMES.countdown + HEAT_SECONDS * 1000, event: info.event.id, score: 31, opponentScore: 30 });
});

test("the 1v1 endpoints go to the lobby and relay: tickets, the AI's pose, and the old answers", (t) => {
  const { call } = setup(t);
  assert.deepEqual(call("POST", "/api/lagoons/lobby-connect").body, { relay: null });
  assert.equal(call("POST", "/api/lagoons/connect", { roomId: "r" }).body.relay.url, "ws://localhost:5180/__relay");
  assert.deepEqual(call("POST", "/api/lagoons/opponent", { roomId: "r" }).body, { opponent: null });
  assert.equal(call("POST", "/api/lagoons/signaling").status, 404);
  assert.deepEqual(call("POST", "/api/lagoons", { playerKey: "k1", action: "sync" }).body, { serverTime: NOW, room: null, riders: [], challenges: [], rankings: [] });
});

test("errors: a planner failure, and no room with the champion's wind", async (t) => {
  const failing = setup(t, { ai: { sail: async () => { throw new Error("the planner fell over"); }, poses: async () => ({}) } });
  const { status, body } = await failing.call("POST", "/api/local/weekly/start");
  assert.deepEqual([status, body.error], [500, "Couldn't get Lennart Neubauer ready: the planner fell over"]);
  const windless = setup(t, { rooms: (id) => ({ seed: 1, knots: 15, gustKnots: 0 }) });
  const none = await windless.call("POST", "/api/local/weekly/start");
  assert.deepEqual([none.status, none.body.error], [500, "Couldn't get Lennart Neubauer ready: no room id gives 19 kt with gusts of 6"]);
});
```

Replace `test/room-wind-snapshot.test.mjs` with:

```js
// Room winds come from the game's own room-conditions function. Skipped when
// no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { WIND, roomIdsFor } from "../server/weekly.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("room ids with the champion's wind are found quickly, and each gives its own gusts", { skip }, async () => {
  const game = await loadGame(snapshot, ["wind"]);
  const ids = roomIdsFor(game.roomConditions, WIND, "champion-2025-sylt-1792885000000");
  const [a, b] = [ids.next().value, ids.next().value];
  assert.match(a, /^champion-2025-sylt-1792885000000-\d+$/);
  for (const id of [a, b]) assert.deepEqual({ ...game.roomConditions(id), seed: 0 }, { seed: 0, ...WIND });
  const [ca, cb] = [game.roomConditions(a), game.roomConditions(b)];
  let differ = 0;
  for (let t = 0; t < 180; t += 1.3) if (game.wind(ca, 0, 0, t) !== game.wind(cb, 0, 0, t)) differ += 1;
  assert.ok(differ > 0, "gusts make every room's wind its own, so every room needs its own heat");
});
```

In `test/pose-track-snapshot.test.mjs`, replace `import { DEFAULT_WIND, roomIdsFor } from "../server/weekly.mjs";` with `import { WIND, roomIdsFor } from "../server/weekly.mjs";`, and `roomIdsFor(engine.roomConditions, DEFAULT_WIND, "probe")` with `roomIdsFor(engine.roomConditions, WIND, "probe")`.

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/weekly.test.mjs test/api-weekly.test.mjs test/room-wind-snapshot.test.mjs test/pose-track-snapshot.test.mjs`
Expected: 4 failing files with `SyntaxError: The requested module '../server/weekly.mjs' does not provide an export named 'LOOK'` (once) or `... named 'WIND'` (three times).

- [ ] **Step 3: Write `server/champion.json`** (the stories are our own words from the event reports; the 2026 events were entered by hand, since the PWA site had no results tables for them when the tour data was crawled):

```json
{
  "rider": "m:lennart-neubauer",
  "name": "Lennart Neubauer",
  "rating": 1946,
  "events": [
    {
      "id": "2023-sylt",
      "tourId": 342,
      "name": "2023 Sylt World Cup",
      "when": "22 September – 1 October 2023",
      "place": "Westerland, Sylt, Germany",
      "podium": ["Lennart Neubauer", "Yentel Caers", "Steven Van Broeckhoven"],
      "story": "His first win on the PWA World Tour. In a good sideshore wind he won the single elimination, then met Yentel Caers, who had just taken the world title, in the double-elimination final. Neubauer opened with a double culo, held off Caers's comeback to within a few tenths, and sealed it with a clean air funnel burner."
    },
    {
      "id": "2024-fuerteventura",
      "tourId": 359,
      "name": "2024 Fuerteventura Grand Slam",
      "when": "25 July – 3 August 2024",
      "place": "Sotavento, Fuerteventura, Spain",
      "podium": ["Lennart Neubauer", "Adrien Bosson", "Yentel Caers"],
      "story": "Neubauer broke 40 points twice on his way through the single elimination, then lost its final to Adrien Bosson by 0.7, to a culo in the last seconds. He fought back through the double elimination to win the event, his second World Tour win in a row, and finished the year as world champion."
    },
    {
      "id": "2025-sylt",
      "tourId": 378,
      "name": "2025 Sylt Grand Slam",
      "when": "26 September – 5 October 2025",
      "place": "Westerland, Sylt, Germany",
      "podium": ["Lennart Neubauer", "Yentel Caers", "Jacopo Testa"],
      "story": "A strong cross-offshore south-easterly sent the heats far out to sea, judged from drone footage for the first time. Neubauer landed the first triple culo ever seen in a World Cup heat, worth 48.2 points and the day's best score, and beat Yentel Caers in the final."
    },
    {
      "id": "2026-fuerteventura",
      "name": "2026 Fuerteventura Grand Slam",
      "when": "July 2026",
      "place": "Sotavento, Fuerteventura, Spain",
      "podium": ["Lennart Neubauer", "Yentel Caers", "Balz Müller"],
      "story": "Ten days of howling wind and head-high kickers. Neubauer won the single elimination, then met Yentel Caers in a double-elimination final called one of the best in freestyle history: 46.59 to 45.88, the two highest heat scores of the event, settled by a gliding Spock double culo."
    },
    {
      "id": "2026-sylt",
      "name": "2026 Sylt Grand Slam",
      "when": "25 September – 4 October 2026",
      "place": "Westerland, Sylt, Germany",
      "podium": ["Lennart Neubauer", "Dieter Van der Eyken", "Takumi Moriya"],
      "story": "An offshore easterly pushed the heats a long way out to sea. Neubauer showed a new Shaka into Shaka combo on his way through the single elimination, and beat Dieter Van der Eyken in the final with more than 38 points, the best score of the event, on the way to his second world title."
    }
  ]
}
```

- [ ] **Step 4: Replace `server/weekly.mjs`** with:

```js
// The Champion's challenge: one of the champion's recent wins each week,
// seeded by the week, with the champion himself as the opponent at his best
// form. His heat is sailed by the AI riders in the game's windiest 1v1 wind.
// champion: server/champion.json.
import { averageScore, CEILING, SPREAD, seedOf } from "../lib/ai/score.mjs";

// The game's windiest 1v1 room: 19 kt, gusting 21–25 kt.
export const WIND = { knots: 19, gustKnots: 6 };
const round = (value) => Math.round(value * 100) / 100;

// The game's default look, so the lobby and result screens have a full
// appearance to draw, but with an orange sail and board (the default is teal)
// so the opponent stands apart from a default-look player.
export const LOOK = { country: "", skinColor: "warm", hair: "short", glasses: "sunglasses", helmet: "none", facialHair: "none", hairColor: "brown", facialHairColor: "brown", bodyType: "male", outfit: "wetsuit", harness: "black", sail: "orange", board: "orange" };

// The week's event, from the champion's events in the order listed.
export function weekOf(champion, weekStart) {
  return { weekStart, event: champion.events[seedOf("weekly", weekStart) % champion.events.length] };
}

// The champion as the opponent, aiming for his best form: his average score
// plus the spread, at most the planner's ceiling.
export function opponentFor(champion) {
  return {
    id: champion.rider,
    nickname: champion.name,
    appearance: LOOK,
    rating: champion.rating,
    target: round(Math.min(CEILING, averageScore(champion.rating) + SPREAD)),
  };
}

// Room ids ("<prefix>-<n>") whose wind (by the game's own roomConditions)
// matches, in order. Every room needs an id never used before: the game ignores
// ids it has dismissed, and resumes an unfinished heat it kept for an id. So
// the prefix should carry the time the challenge was started. With gusts, each
// id gives its own gusts.
export function* roomIdsFor(roomConditions, wind, prefix) {
  for (let n = 0; n < 100_000; n++) {
    const id = `${prefix}-${n}`;
    const c = roomConditions(id);
    if (c.knots === wind.knots && c.gustKnots === wind.gustKnots) yield id;
  }
  throw new Error(`no room id gives ${wind.knots} kt with gusts of ${wind.gustKnots}`);
}

// Keeps each week's best score and whether you won, your last win (so the mod
// can congratulate you once), and when the prize was earned (the first win).
// store: createStore(file, { weeks: {}, prize: null }).
export function recordResult(store, { weekStart, event, score, opponentScore, won, at }) {
  store.update((data) => {
    const week = data.weeks[weekStart] ?? { event, best: 0, won: false };
    week.best = Math.max(week.best, score);
    week.won ||= won;
    data.weeks[weekStart] = week;
    if (!won) return;
    data.lastWin = { at, event, score, opponentScore };
    data.prize ??= { earnedAt: at };
  });
}

// Records a finished Champion's challenge room from the lobby; a forfeit isn't
// recorded.
export function recordRoom(store, room, at) {
  if (!room.meta || room.you.forfeited) return;
  recordResult(store, { ...room.meta, score: room.you.score, opponentScore: room.ai.score, won: room.outcome === "1", at });
}
```

- [ ] **Step 5: Replace `server/api/weekly.mjs`** with:

```js
// Endpoints for the Champion's challenge mod: this week's event, and getting the
// champion ready in the local 1v1 lobby. Real names: the champion and the
// podiums are named as they are.
import { WIND, opponentFor, roomIdsFor, weekOf } from "../weekly.mjs";
import { fail, ok } from "./reply.mjs";

// This week's event and its story, the champion, the wind, your best score,
// whether you won, your last win, and whether the prize is earned.
export function weeklyInfo({ champion, game, now, weekly }) {
  const week = weekOf(champion, game.weekStart(now()));
  const { id, name, when, place, podium, story } = week.event;
  const opponent = opponentFor(champion);
  const record = weekly.data.weeks[week.weekStart];
  return ok({
    weekStart: week.weekStart,
    event: { id, name, when, place, podium },
    story,
    opponent: { name: opponent.nickname, target: opponent.target },
    wind: WIND,
    best: record?.best ?? null,
    won: !!record?.won,
    lastWin: weekly.data.lastWin ?? null,
    prize: !!weekly.data.prize,
  });
}

// Each room needs its own heat: gusts make every room id's wind different, and
// room ids are never reused. take() hands out the ready room, or null, and
// starts sailing the next one, so "Challenge again" seldom has to wait.
export function roomQueue(ids, heatFor, log = () => {}) {
  let ready = null;
  const fill = async () => {
    const id = ids.next().value;
    ready = { id, heat: await heatFor(id) };
  };
  return {
    start: fill,
    take() {
      const room = ready;
      if (!room) return null;
      ready = null;
      fill().catch((error) => log(`Couldn't get the next room ready: ${error.message}`));
      return room;
    },
  };
}

// Sails the champion's heat for the first room, offers his challenge in the
// lobby, and keeps the next room's heat sailing behind it.
export async function startWeekly({ champion, game, now, ai, lobby, log }) {
  const week = weekOf(champion, game.weekStart(now()));
  const opponent = opponentFor(champion);
  const heatFor = async (id) => {
    const conditions = game.roomConditions(id);
    const sailed = await ai.sail(conditions, opponent.target);
    const { poses, settledAt } = await ai.poses(conditions, sailed.replay);
    return { score: sailed.score, attempts: sailed.attempts, poses, settledAt };
  };
  try {
    const rooms = roomQueue(roomIdsFor(game.roomConditions, WIND, `champion-${week.event.id}-${now()}`), heatFor, log);
    await rooms.start();
    lobby.offer(opponent, rooms.take, { weekStart: week.weekStart, event: week.event.id });
  } catch (error) {
    return fail(500, `Couldn't get ${opponent.nickname} ready: ${error.message}`);
  }
  return ok({ name: opponent.nickname, wind: WIND });
}
```

- [ ] **Step 6: Route it.** In `server/api/index.mjs`:
  - replace `// game, now(), tour, ai, aiHeats, snapshot, lobby, relay, weekly }. POST` with

    ```js
    // game, now(), tour, ai, aiHeats, snapshot, lobby, relay, weekly, champion,
    // log }. POST
    ```

  - replace `  if (route === "POST /api/local/weekly/start") return startWeekly(body, ctx);` with `  if (route === "POST /api/local/weekly/start") return startWeekly(ctx);`.

- [ ] **Step 7: Wire it into the server.** In `server/app.mjs`:
  - Replace

    ```js
    // Returns an http.Server that isn't listening yet. `game`, `now`, `tour` and
    // `ai` can be replaced in tests; by default the snapshot's engine, calendar and
    // wind are loaded, the tour data is read from tour/, and AI heats are sailed in
    // a worker thread.
    export async function createApp({ root, snapshot: name, mods, dataFile, modsDir = join(root, "mods"), game, now = Date.now, log = console.log, tour, ai }) {
    ```

    with

    ```js
    // Returns an http.Server that isn't listening yet. `game`, `now`, `tour`, `ai`
    // and `champion` can be replaced in tests; by default the snapshot's engine,
    // calendar and wind are loaded, the tour data is read from tour/, AI heats are
    // sailed in a worker thread, and the champion is server/champion.json.
    export async function createApp({ root, snapshot: name, mods, dataFile, modsDir = join(root, "mods"), game, now = Date.now, log = console.log, tour, ai, champion }) {
    ```

  - After `  ai ??= createSailer({ root, snapshot: snapshot.name });` add

    ```js
      champion ??= JSON.parse(readFileSync(new URL("./champion.json", import.meta.url), "utf8"));
    ```

  - Replace `  const weekly = createStore(join(dirname(dataFile), "weekly.json"), { weeks: {}, prize: null });` with

    ```js
      // The Champion's challenge's results, apart from the super final's old
      // weekly.json, so an old super final win doesn't count as beating him.
      const weekly = createStore(join(dirname(dataFile), "champion.json"), { weeks: {}, prize: null });
    ```

  - Replace ``        log(`Couldn't record the super final's result: ${error.stack ?? error}`);`` with ``        log(`Couldn't record the Champion's challenge result: ${error.stack ?? error}`);``.
  - Replace `  const ctx = { store, game, now, tour, ai, aiHeats, snapshot: snapshot.name, lobby, relay, weekly };` with `  const ctx = { store, game, now, tour, ai, aiHeats, snapshot: snapshot.name, lobby, relay, weekly, champion, log };`.

- [ ] **Step 8: Run the tests, then the suite**

Run: `node --test test/weekly.test.mjs test/api-weekly.test.mjs test/room-wind-snapshot.test.mjs test/pose-track-snapshot.test.mjs test/api-router.test.mjs test/server.test.mjs`
Expected: PASS, 26 tests (6 + 6 + 1 + 1 + 6 + 6).

Run: `npm test`
Expected: PASS, 226 tests, 0 failures. (The super final mod still loads but no longer matches the endpoint; Task 5 replaces it.)

- [ ] **Step 9: Commit**

```bash
git add server/champion.json server/weekly.mjs server/api/weekly.mjs server/api/index.mjs server/app.mjs test/weekly.test.mjs test/api-weekly.test.mjs test/room-wind-snapshot.test.mjs test/pose-track-snapshot.test.mjs
git commit -m "Serve the Champion's challenge: Neubauer's recent wins, at his best, in gusty rooms" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: The Red Bull helmet in the game

**Files:**
- Create: `mods/champion/helmet.js`, `mods/champion/patches.mjs`
- Test: `test/champion-patch-snapshot.test.mjs`

- [ ] **Step 1: Write the failing test** in `test/champion-patch-snapshot.test.mjs`:

```js
// The Red Bull helmet's patches apply to the game's snapshot, and the patched
// modules still parse. Skipped when no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tryOpenSnapshot } from "../lib/snapshot.mjs";
import { loadPatches, patchSnapshot } from "../server/patches.mjs";
import { ROOT, tempDir } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("the Red Bull helmet's patches change the look editor's lists and the 3D rider, and both still parse", { skip }, async (t) => {
  const errors = [];
  const patched = patchSnapshot(snapshot, await loadPatches(join(ROOT, "mods"), ["champion"]), (line) => errors.push(line));
  assert.deepEqual(errors, []);
  const texts = [...patched.values()].map((p) => p.text);
  assert.equal(texts.length, 2);
  const appearance = texts.find((text) => text.includes("{value:`redbull`,label:`Red Bull helmet`}"));
  const rider = texts.find((text) => text.includes("if(e===`redbull`)__championParts(t,"));
  assert.ok(appearance.includes("e===`helmet`&&!__championHelmetWon()?c.helmet.filter("), "the editor lists it only once won");
  assert.ok(rider.includes("e===`redbull`?__championNavy:2438200"), "the shell is navy");
  const dir = tempDir(t);
  for (const [name, text] of [["appearance.mjs", appearance], ["rider.mjs", rider]]) {
    assert.ok(text.includes('from"/__mods/champion/helmet.js"'));
    writeFileSync(join(dir, name), text);
    const check = spawnSync(process.execPath, ["--check", join(dir, name)], { encoding: "utf8" });
    assert.equal(check.status, 0, `${name}: ${check.stderr}`);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/champion-patch-snapshot.test.mjs`
Expected: FAIL, `AssertionError`, actual `0`, expected `2` (no patches yet, so no module changes).

- [ ] **Step 3: Write `mods/champion/helmet.js`:**

```js
// The Champion's challenge prize, the Red Bull helmet: its logo drawn on a
// canvas, the 3D parts the game's rider gets (through patches.mjs, which
// imports this module into the game), and a picture of it for the mod's
// screens. Browser only.

export const HELMET = "redbull";
export const WON_KEY = "freestyle-tour.champion-helmet";
export const NAVY = 0x13244b;
const SILVER = 0xc9ced6;
const RED = "#d8102c";
const YELLOW = "#fdc82f";

// Whether the Champion's challenge has been won in this browser: the look
// editor lists the helmet only then.
export function helmetWon() {
  try {
    return localStorage.getItem(WON_KEY) === "true";
  } catch {
    return false;
  }
}

// A charging bull facing right, in a 1 × 0.66 box.
function bull(ctx) {
  ctx.beginPath();
  ctx.moveTo(0.06, 0.26);
  ctx.bezierCurveTo(0.2, 0.16, 0.42, 0.12, 0.56, 0.1);
  ctx.bezierCurveTo(0.66, 0.08, 0.74, 0.16, 0.8, 0.26);
  ctx.lineTo(0.93, 0.1);
  ctx.lineTo(0.88, 0.27);
  ctx.bezierCurveTo(0.95, 0.33, 1, 0.42, 0.97, 0.48);
  ctx.lineTo(0.88, 0.5);
  ctx.lineTo(0.8, 0.47);
  ctx.lineTo(0.94, 0.62);
  ctx.lineTo(0.88, 0.65);
  ctx.lineTo(0.7, 0.5);
  ctx.bezierCurveTo(0.58, 0.53, 0.44, 0.53, 0.33, 0.5);
  ctx.lineTo(0.08, 0.64);
  ctx.lineTo(0.04, 0.6);
  ctx.lineTo(0.2, 0.44);
  ctx.bezierCurveTo(0.12, 0.4, 0.08, 0.34, 0.06, 0.3);
  ctx.lineTo(0, 0.42);
  ctx.lineTo(0.02, 0.28);
  ctx.closePath();
  ctx.fill();
}

// The logo centred at (cx, cy), size wide: two red bulls charging at a yellow
// sun, with the name under them unless name is false.
export function drawLogo(ctx, cx, cy, size, { name = true } = {}) {
  const bullSize = size * 0.5;
  const top = cy - size * (name ? 0.24 : 0.16);
  ctx.save();
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.arc(cx, top + size * 0.14, size * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = RED;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(cx - side * size * 0.04, top);
    ctx.scale(-side * bullSize, bullSize);
    bull(ctx);
    ctx.restore();
  }
  if (name) {
    ctx.font = `italic 900 ${Math.round(size * 0.2)}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Red Bull", cx, top + size * 0.36);
  }
  ctx.restore();
}

// The canvas for the helmet's front: the logo on a transparent background.
function logoCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  drawLogo(canvas.getContext("2d"), 256, 166, 440);
  return canvas;
}

// The game's water helmet shell is a sphere cap pushed up at the front; the
// logo goes on a slightly larger patch of the same shape so it sits on it.
function shaped(geometry) {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    position.setY(i, y + (0.32 * Math.max(0, position.getZ(i)) * (1 - y)) / 1.22);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Adds the visor and the logo to the game's helmet group (whose shell the game
// has already drawn in NAVY). three: the game's own 3D classes, passed in by
// the patch.
export function addHelmetParts(group, { Mesh, SphereGeometry, Material, CanvasTexture }) {
  const visor = new Mesh(new SphereGeometry(1, 20, 10), new Material({ color: SILVER, roughness: 0.25, metalness: 0.6 }));
  visor.name = "Helmet visor";
  visor.position.set(0, 0.095, 0.163);
  visor.scale.set(0.208, 0.018, 0.11);
  group.add(visor);
  const texture = new CanvasTexture(logoCanvas());
  texture.colorSpace = "srgb";
  const width = 1.7;
  const logo = new Mesh(
    shaped(new SphereGeometry(1.012, 32, 16, Math.PI / 2 - width / 2, width, 0.55, 0.78)),
    new Material({ map: texture, transparent: true, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  logo.name = "Helmet logo";
  logo.position.set(0, 0.067, -0.024);
  logo.scale.set(0.213, 0.229, 0.203);
  group.add(logo);
}

// A picture of the helmet, seen from the front, on the given canvas.
export function drawHelmetPicture(canvas) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const navy = `#${NAVY.toString(16).padStart(6, "0")}`;
  const gradient = ctx.createRadialGradient(w * 0.4, h * 0.3, w * 0.05, w * 0.5, h * 0.5, w * 0.55);
  gradient.addColorStop(0, "#2d4a8a");
  gradient.addColorStop(1, navy);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.78);
  ctx.bezierCurveTo(w * 0.06, h * 0.2, w * 0.3, h * 0.06, w * 0.5, h * 0.06);
  ctx.bezierCurveTo(w * 0.7, h * 0.06, w * 0.94, h * 0.2, w * 0.9, h * 0.78);
  ctx.quadraticCurveTo(w * 0.5, h * 0.9, w * 0.1, h * 0.78);
  ctx.fill();
  ctx.fillStyle = "#c9ced6";
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.74, w * 0.36, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  drawLogo(ctx, w * 0.5, h * 0.4, w * 0.52);
}
```

- [ ] **Step 4: Write `mods/champion/patches.mjs`:**

```js
// Puts the Red Bull helmet into the game. The look editor lists it once the
// Champion's challenge is won, the game's look check keeps it on a rider (it
// keeps only values in the lists), and the 3D rider draws it: the water
// helmet's shell in navy, then the visor and logo from helmet.js. The minified
// names (c, f, vd, Z, ko, Ho, $i) are the 2026-10-24 snapshot's; a game update
// that changes them makes these patches fail loudly.
const FROM = `from"/__mods/champion/helmet.js";`;
const APPEARANCE = "label:`Baseball cap`";
const RIDER = "t.name=`Helmet`";
const VISOR = "if(e===`red`){let e=new Z(new ko(1,20,10),n);e.name=`Helmet visor`,e.position.set(0,.095,.163),e.scale.set(.208,.018,.11),t.add(e)}";

export const patches = [
  {
    marker: APPEARANCE,
    find: "{value:`cap`,label:`Baseball cap`}]",
    replace: "{value:`cap`,label:`Baseball cap`},{value:`redbull`,label:`Red Bull helmet`}]",
    expect: 1,
  },
  {
    marker: APPEARANCE,
    find: ":e===`facialHair`&&t.bodyType===`female`?c.facialHair.filter(({value:e})=>e===`none`):c[e]}",
    replace: ":e===`facialHair`&&t.bodyType===`female`?c.facialHair.filter(({value:e})=>e===`none`):e===`helmet`&&!__championHelmetWon()?c.helmet.filter(({value:e})=>e!==`redbull`):c[e]}",
    expect: 1,
  },
  {
    marker: APPEARANCE,
    find: "function f(e,t,n=!1){",
    replace: `import{helmetWon as __championHelmetWon}${FROM}function f(e,t,n=!1){`,
    expect: 1,
  },
  {
    marker: RIDER,
    find: "e===`red`?14887222:2438200",
    replace: "e===`red`?14887222:e===`redbull`?__championNavy:2438200",
    expect: 1,
  },
  {
    marker: RIDER,
    find: `${VISOR}return t}`,
    replace: `${VISOR}if(e===\`redbull\`)__championParts(t,{Mesh:Z,SphereGeometry:ko,Material:Ho,CanvasTexture:$i});return t}`,
    expect: 1,
  },
  {
    marker: RIDER,
    find: "function vd(e){",
    replace: `import{NAVY as __championNavy,addHelmetParts as __championParts}${FROM}function vd(e){`,
    expect: 1,
  },
];
```

- [ ] **Step 5: Run the test, then the suite**

Run: `node --test test/champion-patch-snapshot.test.mjs`
Expected: PASS, 1 test.

Run: `npm test`
Expected: PASS, 227 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add mods/champion/helmet.js mods/champion/patches.mjs test/champion-patch-snapshot.test.mjs
git commit -m "Add a Red Bull helmet to the game's look editor and 3D rider" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Mod helpers

**Files:**
- Create: `mods/champion/champion.js`
- Test: `test/champion.test.mjs`

- [ ] **Step 1: Write the failing test** in `test/champion.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { TITLE, bestText, doneText, failedText, menuLine, newWin, prizeDue, readyText, winText } from "../mods/champion/champion.js";

const info = {
  event: { id: "2025-sylt", name: "2025 Sylt Grand Slam" },
  opponent: { name: "Lennart Neubauer", target: 47.45 },
  wind: { knots: 19, gustKnots: 6 },
  best: null,
  won: false,
  lastWin: null,
  prize: false,
};

test("the menu line names the event, the champion and the wind, as the game writes gusts", () => {
  assert.equal(TITLE, "Champion's challenge");
  assert.equal(menuLine(info), "This week: 2025 Sylt Grand Slam · vs Lennart Neubauer · 19 kt, gusts 21–25 kt");
  assert.equal(menuLine({ ...info, wind: { knots: 17, gustKnots: 0 } }), "This week: 2025 Sylt Grand Slam · vs Lennart Neubauer · 17 kt");
});

test("the button's and card's other lines", () => {
  assert.equal(readyText("Lennart Neubauer"), "Getting Lennart Neubauer ready…");
  assert.equal(doneText("Lennart Neubauer"), "Lennart Neubauer has challenged you: accept to start the heat");
  assert.equal(failedText("Lennart Neubauer"), "Couldn't get Lennart Neubauer ready. Press to try again.");
  assert.equal(bestText(info), "No heat against him this week yet.");
  assert.equal(bestText({ ...info, best: 41.5 }), "Your best this week: 41.50.");
  assert.equal(bestText({ ...info, best: 48.1, won: true }), "Your best this week: 48.10, and you beat him.");
});

test("a win is new until the mod has congratulated you on it, and names the event when it's this week's", () => {
  const won = { ...info, lastWin: { at: 20, event: "2025-sylt", score: 48.1, opponentScore: 46.74 } };
  assert.equal(newWin(info, null), false);
  assert.equal(newWin(won, null), true);
  assert.equal(newWin(won, "20"), false);
  assert.equal(winText(won), "You beat Lennart Neubauer at the 2025 Sylt Grand Slam, 48.10 to 46.74.");
  assert.equal(winText({ ...won, lastWin: { ...won.lastWin, event: "2023-sylt" } }), "You beat Lennart Neubauer, 48.10 to 46.74.");
});

test("the prize is due when earned and not yet unlocked in this browser", () => {
  assert.equal(prizeDue({ ...info, prize: true }, null), true);
  assert.equal(prizeDue({ ...info, prize: true }, "true"), false);
  assert.equal(prizeDue(info, null), false);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/champion.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `mods/champion/champion.js`.

- [ ] **Step 3: Write `mods/champion/champion.js`:**

```js
// Pure helpers for the Champion's challenge mod, shared with the tests. info is
// what GET /api/local/weekly returns.

export const TITLE = "Champion's challenge";
// The last win the mod congratulated you on (its time).
export const SEEN_KEY = "freestyle-tour.champion-seen-win";

// As the game writes it: gusts from 2 kt above the wind up to gustKnots above.
export const windText = (wind) => (wind.gustKnots ? `${wind.knots} kt, gusts ${wind.knots + 2}–${wind.knots + wind.gustKnots} kt` : `${wind.knots} kt`);
export const menuLine = (info) => `This week: ${info.event.name} · vs ${info.opponent.name} · ${windText(info.wind)}`;
export const readyText = (name) => `Getting ${name} ready…`;
export const failedText = (name) => `Couldn't get ${name} ready. Press to try again.`;
export const doneText = (name) => `${name} has challenged you: accept to start the heat`;
export const bestText = (info) => (info.best === null ? "No heat against him this week yet." : `Your best this week: ${info.best.toFixed(2)}${info.won ? ", and you beat him" : ""}.`);

// A win the mod hasn't congratulated you on yet.
export const newWin = (info, seenAt) => !!info.lastWin && info.lastWin.at > Number(seenAt ?? 0);

export function winText({ lastWin, event, opponent }) {
  const where = lastWin.event === event.id ? ` at the ${event.name}` : "";
  return `You beat ${opponent.name}${where}, ${lastWin.score.toFixed(2)} to ${lastWin.opponentScore.toFixed(2)}.`;
}

// The prize is due when earned and not yet unlocked in this browser.
export const prizeDue = (info, setting) => info.prize && setting !== "true";
```

- [ ] **Step 4: Run the test, then the suite**

Run: `node --test test/champion.test.mjs`
Expected: PASS, 4 tests.

Run: `npm test`
Expected: PASS, 231 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add mods/champion/champion.js test/champion.test.mjs
git commit -m "Add the Champion's challenge mod's helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: The Champion's challenge mod

**Files:**
- Create: `mods/champion/index.js`
- Modify: `mods/enabled.json`
- Delete: `mods/super-final/` (both files), `test/super-final.test.mjs`

- [ ] **Step 1: Write `mods/champion/index.js`:**

```js
// The Champion's challenge: a button in the game's main menu that offers, each
// week, one of Lennart Neubauer's recent wins. Pressing it opens a card with
// the event's story, its podium and the prize; from there the local server
// gets him ready (his heat sailed by the AI riders, at his best) and challenges
// you in the game's own 1v1 lobby. Beating him wins the Red Bull helmet, with a
// congratulations screen.
import { SEEN_KEY, TITLE, bestText, doneText, failedText, menuLine, newWin, prizeDue, readyText, winText, windText } from "./champion.js";
import { HELMET, WON_KEY, drawHelmetPicture } from "./helmet.js";

const PLAYER_KEY = "fristajlo-player-v3"; // the game's own record of your rider
const TEAL = "#178b93";
const PRIMARY = `background:${TEAL};color:#fff;border:0;border-radius:10px;padding:10px 16px;font:600 15px system-ui,sans-serif;cursor:pointer`;
const SECONDARY = `background:transparent;color:${TEAL};border:1px solid ${TEAL};border-radius:10px;padding:10px 16px;font:600 15px system-ui,sans-serif;cursor:pointer`;
const LABEL = `margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${TEAL};font-weight:700`;
const MUTED = "color:#4a5d63;font-size:13px";
const TROPHY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: it lasts until the page reloads.
  }
};
const getJson = async (url, init) => {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${url} answered ${res.status}`);
  return body;
};
const postJson = (url, body = {}) => getJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// A card over the game; a click outside it closes it.
function dialog(children) {
  const card = el("div", { role: "dialog", style: "box-sizing:border-box;background:#fbfaf6;color:#13262b;border-radius:16px;max-width:460px;width:100%;max-height:100%;overflow:auto;padding:20px 22px;box-shadow:0 18px 50px rgba(0,0,0,.35)" }, children);
  const backdrop = el("div", { style: "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,30,34,.55);font:15px/1.45 system-ui,sans-serif" }, [card]);
  backdrop.addEventListener("click", (event) => event.target === backdrop && backdrop.remove());
  document.body.append(backdrop);
  return backdrop;
}
function helmetPicture() {
  const canvas = el("canvas", { width: 220, height: 160, style: "width:110px;height:80px;flex:none" });
  drawHelmetPicture(canvas);
  return canvas;
}
const buttons = (...list) => el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:14px" }, list);

// Puts the helmet on your rider through the local server's rider save, then
// lets the game pick it up: it reloads your rider when its window gets focus.
async function wearHelmet() {
  const profile = JSON.parse(read(PLAYER_KEY) ?? "null");
  if (!profile?.key) throw new Error("no rider in this browser");
  await postJson("/api/rider", { action: "save", playerKey: profile.key, appearance: { ...profile.appearance, helmet: HELMET } });
  window.dispatchEvent(new Event("focus"));
}

export default {
  name: "champion",
  setup({ whenGame, log }) {
    let info = null;
    let status = "";
    let busy = false;
    let watching = false;
    let statusLine = null; // the open card's status line, if any

    const button = Object.assign(document.createElement("button"), { type: "button", className: "lagoon-menu-button" });
    const line = document.createElement("span");
    button.innerHTML = TROPHY;
    button.append(` ${TITLE} `, line);

    function render() {
      line.textContent = status || (info ? menuLine(info) : "Loading this week's event…");
      if (statusLine) statusLine.textContent = status;
    }
    function setStatus(text) {
      status = text;
      render();
    }

    function congratulate() {
      write(SEEN_KEY, String(info.lastWin.at));
      const first = read(WON_KEY) !== "true";
      write(WON_KEY, "true");
      const wear = el("button", { type: "button", textContent: "Wear it now", style: PRIMARY });
      const close = el("button", { type: "button", textContent: "Close", style: SECONDARY });
      const box = dialog([
        el("p", { textContent: "Congratulations!", style: LABEL }),
        el("h2", { textContent: winText(info), style: "margin:4px 0 12px;font-size:20px;line-height:1.3" }),
        el("div", { style: "display:flex;gap:12px;align-items:center;background:#eef6f6;border-radius:12px;padding:10px" }, [
          helmetPicture(),
          el("p", { style: "margin:0", textContent: first ? "Your prize: the Red Bull helmet. It's in the look editor now, with the headwear." : "The Red Bull helmet is already yours." }),
        ]),
        buttons(wear, close),
      ]);
      close.onclick = () => box.remove();
      wear.onclick = async () => {
        wear.disabled = true;
        try {
          await wearHelmet();
          wear.textContent = "You're wearing it";
        } catch (error) {
          log("could not put the helmet on", error);
          wear.textContent = "Couldn't put it on: use the look editor";
        }
      };
    }

    // This week's info; congratulates you on a win you haven't seen yet, and
    // unlocks the prize in this browser if it was earned elsewhere.
    async function load() {
      info = await getJson("/api/local/weekly");
      if (newWin(info, read(SEEN_KEY))) congratulate();
      else if (prizeDue(info, read(WON_KEY))) write(WON_KEY, "true");
    }
    async function refresh() {
      await load();
      if (!busy) status = "";
      render();
    }

    async function start() {
      const { name } = info.opponent;
      busy = true;
      setStatus(readyText(name));
      try {
        await postJson("/api/local/weekly/start");
        watching = true;
        setStatus(doneText(name));
        return true;
      } catch (error) {
        log("could not get the champion ready", error);
        setStatus(failedText(name));
        return false;
      } finally {
        busy = false;
      }
    }

    function showCard() {
      const go = el("button", { type: "button", textContent: `Challenge ${info.opponent.name}`, style: PRIMARY });
      const close = el("button", { type: "button", textContent: "Close", style: SECONDARY });
      statusLine = el("p", { style: `margin:10px 0 0;${MUTED}`, textContent: status });
      const box = dialog([
        el("p", { textContent: TITLE, style: LABEL }),
        el("h2", { textContent: info.event.name, style: "margin:2px 0 0;font-size:22px;line-height:1.25" }),
        el("p", { textContent: `${info.event.when} · ${info.event.place}`, style: `margin:2px 0 12px;${MUTED}` }),
        el("p", { textContent: info.story, style: "margin:0 0 12px" }),
        el("p", { textContent: "Podium", style: LABEL }),
        el("ol", { style: "margin:4px 0 12px;padding-left:22px" }, info.event.podium.map((name) => el("li", { textContent: name }))),
        el("div", { style: "display:flex;gap:12px;align-items:center;background:#eef6f6;border-radius:12px;padding:10px;margin-bottom:12px" }, [
          helmetPicture(),
          el("div", {}, [
            el("strong", { textContent: "Prize: the Red Bull helmet" }),
            el("div", { style: MUTED, textContent: read(WON_KEY) === "true" ? "Yours already: it's in the look editor." : `Beat ${info.opponent.name} to win it for your rider.` }),
          ]),
        ]),
        el("p", { style: `margin:0;${MUTED}`, textContent: `Your heat: ${info.opponent.name} at his best, aiming for about ${Math.round(info.opponent.target)} points, in ${windText(info.wind)}.` }),
        el("p", { style: `margin:4px 0 0;${MUTED}`, textContent: bestText(info) }),
        buttons(go, close),
        statusLine,
      ]);
      const closeCard = () => {
        box.remove();
        statusLine = null;
      };
      close.onclick = closeCard;
      box.addEventListener("click", (event) => event.target === box && (statusLine = null));
      go.onclick = async () => {
        if (busy) return;
        go.disabled = true;
        if (await start()) closeCard();
        else go.disabled = false;
      };
    }
    button.addEventListener("click", () => info && showCard());

    // The menu is drawn by the game and redrawn often: put the button back after
    // "1v1 Lobby" whenever it's missing, and refresh this week's info then. (If
    // a game update changes the menu, the button just doesn't appear.) It starts
    // once the game is running: an extra button in the page's first markup would
    // upset React taking the page over. The button is off whenever the game's
    // lobby button is (no rider yet). After a challenge starts, this week's info
    // is checked every few seconds, so a win is congratulated on the result
    // screen.
    whenGame().then(() => {
      setInterval(() => {
        const lobby = [...document.querySelectorAll("section.start-panel > button.lagoon-menu-button")].find((b) => b.textContent.includes("1v1 Lobby"));
        if (!lobby) return;
        button.disabled = lobby.disabled;
        if (button.previousElementSibling !== lobby) {
          lobby.after(button);
          refresh().catch((error) => {
            log("could not load this week's Champion's challenge", error);
            setStatus(error.message);
          });
        }
      }, 500);
      setInterval(() => {
        if (watching) load().catch((error) => log("could not check for a win", error));
      }, 3000);
    });
    render();
  },
};
```

- [ ] **Step 2: Swap the mods.** `mods/enabled.json` becomes:

```json
["local-badge", "ghosts", "replay-viewer", "challenge", "champion"]
```

Then remove the super final:

```bash
git rm -r mods/super-final test/super-final.test.mjs
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: PASS, 227 tests, 0 failures.

- [ ] **Step 4: Check it in the browser.** The game only runs at full speed while the Browser pane is visible; if it's hidden, show it with the view tool.
  1. **Back up.** Copy `data/` to the scratchpad. In the page at http://localhost:5180, save `localStorage["fristajlo-player-v3"]` (your rider).
  2. **Start.** Start the server with the preview tool (`local-copy` in `.claude/launch.json`).
  3. **The menu** has "Champion's challenge" under "1v1 Lobby", naming this week's event, Lennart Neubauer and "19 kt, gusts 21–25 kt".
  4. **The card.** Press the button: the card shows the event, the dates and place, the story, the podium, the helmet's picture, the heat you'll face, your best, and "Challenge Lennart Neubauer".
  5. **The challenge.** Press it: "Getting Lennart Neubauer ready…" (about 8 s), the card closes, and the game's challenge toast appears. Accept.
  6. **The heat.** The countdown says "Wind: 19 kt, gusts 21–25 kt", and his HUD score rises toward about 47.
  7. **The rematch.** After the heat, "Challenge again" starts a new heat at once.
  8. **The forfeit.** "Forfeit · back to lobby" isn't recorded: `data/champion.json` doesn't change.
  9. **The win and the prize:**
     - Stop the server. In `data/champion.json`, set this week's `won` to `true`, add `"lastWin": { "at": <now in ms>, "event": "<this week's event id>", "score": 48.1, "opponentScore": 46.36 }` and `"prize": { "earnedAt": <same> }`. Start the server and reload.
     - The congratulations screen names him, the event and both scores.
     - "Wear it now" turns into "You're wearing it".
     - In Edit rider → Customize looks → Wear, "Red Bull helmet" is listed and chosen, and the rider wears the navy helmet with the logo.
     - In the page, set `localStorage["freestyle-tour.champion-helmet"] = "false"`, reopen the Wear tab, and the option is gone.
  10. **Unaffected:** a solo heat still runs with its ghost.
  11. **Put everything back:**
     - Stop the server and restore `data/` from the backup (this removes `data/champion.json`).
     - In the page, restore `fristajlo-player-v3`, and remove `freestyle-tour.champion-helmet` and `freestyle-tour.champion-seen-win`, so the prize is still yours to win.

  If something fails, use superpowers:systematic-debugging before changing code.

- [ ] **Step 5: Commit**

```bash
git add mods/champion/index.js mods/enabled.json
git commit -m "Replace the super final with the Champion's challenge mod" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Documentation

**Files:**
- Modify: `README.md`, `docs/roadmap.md`

- [ ] **Step 1: The README.** In `README.md`:
  - Replace `` `data/db.json` (never committed). The 1v1 lobby stays empty unless a super final is waiting.`` with `` `data/db.json` (never committed). The 1v1 lobby stays empty unless a Champion's challenge is waiting.``
  - Replace the whole `super-final` item in the Mods list, from `` - `super-final`: a "Super final" button in the main menu. Each week it offers`` through `` changes the menu, the button doesn't appear.``, with:

    ```markdown
    - `champion`: the "Champion's challenge" button in the main menu. Each week it
      offers one of Lennart Neubauer's recent PWA wins: a card tells the event's
      story, and you race him at his best in the game's own 1v1 heat, at 19 kt
      gusting to 25. The local server plays the other side of the 1v1 lobby, and
      the AI riders sail his heat. Beating him wins a Red Bull helmet, which the
      mod's patches add to the game's look editor. It uses real names, unlike the
      rest of the game. If a game update changes the menu, the button doesn't
      appear.
    ```

  - Replace the paragraph that starts `The super final uses` (four lines, ending `` Results are kept in `data/weekly.json`.``) with:

    ```markdown
    The Champion's challenge uses `GET /api/local/weekly` and
    `POST /api/local/weekly/start`, and the game's own 1v1 endpoints
    (`/api/lagoons`, `/api/lagoons/connect`, a WebSocket at `/__relay`,
    `/api/lagoons/opponent`), which stay an empty lobby until a challenge is
    waiting. Its events are in `server/champion.json`, and results are kept in
    `data/champion.json`.
    ```

- [ ] **Step 2: The roadmap.** In `docs/roadmap.md`, after the line `     Plan: \`docs/superpowers/plans/2026-10-25-weekly-super-final.md\`.`, add:

```markdown
     Then made harder as the **Champion's challenge (done):** Lennart Neubauer
     at his five most recent wins, in the game's windiest room, with each
     event's story and a Red Bull helmet as the prize.
     Spec: `docs/superpowers/specs/2026-10-25-champions-challenge-design.md`.
     Plan: `docs/superpowers/plans/2026-10-25-champions-challenge.md`.
```

- [ ] **Step 3: Run the suite and commit**

Run: `npm test`
Expected: PASS, 227 tests, 0 failures.

```bash
git add README.md docs/roadmap.md
git commit -m "Document the Champion's challenge" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Push to a private GitHub repository

Run this once the branch is merged into `main` (the finishing step). The user asked for a private repository on their account, and will invite the game's creator themselves.

- [ ] **Step 1: Check what would be pushed**

Run: `git status --short && git branch --show-current && git ls-files vendor data cache | wc -l`
Expected: a clean tree, `main`, and `0` (the game, your data and the PWA cache are never committed).

- [ ] **Step 2: Check `gh`**

Run: `gh auth status`
Expected: logged in to github.com as MatusGib, with the `repo` scope. If not, stop and ask the user to run `gh auth login` (signing in is theirs to do).

- [ ] **Step 3: Create the repository and push**

Run: `gh repo create freestyle-tour --private --source . --remote origin --push`
Expected: `✓ Created repository MatusGib/freestyle-tour on github.com`, `✓ Added remote ...`, `✓ Pushed commits to ...`.

- [ ] **Step 4: Check it's private and up to date**

Run: `gh repo view MatusGib/freestyle-tour --json visibility,url,defaultBranchRef --jq '"\(.visibility) \(.url) \(.defaultBranchRef.name)"'`
Expected: `PRIVATE https://github.com/MatusGib/freestyle-tour main`.

Run: `git status -sb | head -1`
Expected: `## main...origin/main`.

- [ ] **Step 5: Tell the user** the repository's URL, and that they can invite the game's creator under Settings → Collaborators.

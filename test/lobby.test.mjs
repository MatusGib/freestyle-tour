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
    start: (meta = { weekStart: 1, event: 291, division: "men" }) => lobby.start(OPPONENT, () => (isReady ? { id: `room-${n++}`, heat: HEAT } : null), meta),
    poll: (body = {}) => lobby.act(body, PLAYER),
  };
}

// Starts a heat and runs the clock to its start.
function race(s) {
  s.start();
  s.later(TIMES.countdown);
}

test("the lobby answers the old empty lobby until a heat is started", () => {
  const s = setup();
  assert.deepEqual(s.poll({ action: "sync" }), { serverTime: s.time, room: null, riders: [], challenges: [], rankings: [] });
  assert.deepEqual(s.logs, [], "quiet actions aren't logged");
});

test("starting puts the opponent online and opens a room at once, racing from a countdown, as your challenge he accepted", () => {
  const s = setup();
  s.start();
  const { riders, challenges, room } = s.poll();
  assert.deepEqual(riders, [
    { id: "m:balz-muller", nickname: "Balt Möller", appearance: { sail: "orange" }, rating: 1757, activity: "match", status: "in-heat", you: false },
    { id: "you", nickname: "Tester", appearance: { sail: "teal" }, rating: 1500, activity: "match", status: "available", you: true },
  ]);
  assert.equal(challenges.length, 1);
  assert.deepEqual({ ...challenges[0], id: "id" }, { id: "id", status: "accepted", incoming: false, expiresAt: s.time + TIMES.offerFor, senderName: "Balt Möller", recipientName: "Tester" });
  assert.deepEqual([room.id, room.status, room.startsAt - s.time, room.yourSeat], ["room-0", "racing", TIMES.countdown, 1]);
  assert.deepEqual(room.seats.map((seat) => [seat.seat, seat.riderId, seat.nickname, seat.score, seat.ratingDelta]), [[1, "you", "Tester", null, null], [2, "m:balz-muller", "Balt Möller", 0, null]]);
});

test("starting before the heat is ready leaves the challenge pending until it is", () => {
  const s = setup();
  s.ready(false);
  s.start();
  const waiting = s.poll();
  assert.deepEqual([waiting.challenges[0].status, waiting.challenges[0].incoming, waiting.room], ["pending", false, null]);
  s.ready(true);
  const opened = s.poll();
  assert.deepEqual([opened.challenges[0].status, opened.room.id, opened.room.status], ["accepted", "room-0", "racing"]);
});

test("during the heat the AI's seat shows only its settled attempts and their total", () => {
  const s = setup();
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
  race(s);
  s.later(179_000);
  assert.equal(s.poll({ action: "finish", roomId: "room-0", attempts: [attempt(9, 40)] }).room.status, "racing");
  s.later(1_000);
  assert.equal(s.poll().room.outcome, "1");
  s.poll();
  assert.equal(s.results.length, 1);
});

test("leaving in the countdown voids the room; leaving during the heat forfeits it", () => {
  const countdown = setup();
  countdown.start();
  countdown.later(1000);
  const cancelled = countdown.poll({ action: "leave", roomId: "room-0" }).room;
  assert.deepEqual([cancelled.outcome, cancelled.seats[1].attempts, cancelled.seats[1].score], ["void", [], 0], "a cancelled room doesn't show the AI's heat");
  assert.equal(countdown.results.length, 0);
  const during = setup();
  race(during);
  const room = during.poll({ action: "leave", roomId: "room-0" }).room;
  assert.deepEqual([room.status, room.outcome, room.seats[0].forfeited], ["finished", "2", true]);
  assert.equal(during.results[0].you.forfeited, true);
});

test("a challenge waiting for its heat can be cancelled or left to expire", () => {
  const cancelled = setup();
  cancelled.ready(false);
  cancelled.start();
  const challengeId = cancelled.poll().challenges[0].id;
  assert.equal(cancelled.poll({ action: "cancel", challengeId }).challenges[0].status, "cancelled");
  cancelled.ready(true);
  assert.equal(cancelled.poll().room, null);
  const expired = setup();
  expired.ready(false);
  expired.start();
  expired.later(TIMES.offerFor);
  assert.equal(expired.poll().challenges[0].status, "expired");
  expired.ready(true);
  assert.equal(expired.poll().room, null);
});

test("challenging again after a heat opens a new room at once, and dismissing hides the old one", () => {
  const s = setup();
  race(s);
  s.later(HEAT_SECONDS * 1000);
  s.poll({ action: "finish", roomId: "room-0", attempts: [] });
  assert.equal(s.poll({ action: "dismiss", roomId: "room-0" }).room, null);
  const again = s.poll({ action: "challenge", challengeId: "c2", riderId: "m:balz-muller" });
  assert.deepEqual([again.room.id, again.room.status, again.challenges[0].status, again.challenges[0].incoming], ["room-1", "racing", "accepted", false]);
  assert.equal(s.poll({ action: "challenge", challengeId: "c3", riderId: "m:balz-muller" }).room.id, "room-1", "not while a room runs");
});

test("the game's own order, challenge again and then dismiss the old room, keeps the new room", () => {
  const s = setup();
  race(s);
  s.later(HEAT_SECONDS * 1000);
  s.poll({ action: "finish", roomId: "room-0", attempts: [] });
  assert.equal(s.poll({ action: "challenge", challengeId: "c2", riderId: "m:balz-muller" }).room.id, "room-1");
  assert.equal(s.poll({ action: "dismiss", roomId: "room-0" }).room.id, "room-1");
});

test("challenging again before the next room's heat is ready leaves the challenge pending until it is", () => {
  const s = setup();
  race(s);
  s.later(HEAT_SECONDS * 1000);
  s.poll({ action: "finish", roomId: "room-0", attempts: [] });
  s.ready(false);
  const waiting = s.poll({ action: "challenge", challengeId: "c2", riderId: "m:balz-muller" });
  assert.deepEqual([waiting.challenges[0].status, waiting.challenges[0].incoming, waiting.room.id], ["pending", false, "room-0"]);
  s.ready(true);
  const opened = s.poll();
  assert.deepEqual([opened.challenges[0].status, opened.room.id, opened.room.status], ["accepted", "room-1", "racing"]);
});

test("unknown actions are logged and answered with the snapshot", () => {
  const s = setup();
  s.start();
  assert.equal(s.poll({ action: "teleport" }).challenges.length, 1);
  assert.deepEqual(s.logs, ["lobby: unknown action teleport"]);
});

test("the racing pose follows the room's clock, 30 a second", () => {
  const s = setup();
  assert.equal(s.lobby.racingPose(), null, "no room, no pose");
  s.start();
  assert.deepEqual(s.lobby.racingPose(), { roomId: "room-0", pose: { x: 0 } }, "the first pose through the countdown");
  s.later(TIMES.countdown);
  assert.deepEqual(s.lobby.racingPose(), { roomId: "room-0", pose: { x: 0 } });
  s.later(40);
  assert.deepEqual(s.lobby.racingPose().pose, { x: 1 });
  s.later(10_000);
  assert.deepEqual(s.lobby.racingPose().pose, { x: 2 }, "the last pose after the track ends");
});

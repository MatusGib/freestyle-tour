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
  const lobby = createLobby({ now: () => time, score: total, onResult: (room) => results.push(room), log: (m) => logs.push(m) });
  return {
    lobby,
    results,
    logs,
    later: (ms) => void (time += ms),
    get time() {
      return time;
    },
    offer: (meta = { weekStart: 1, event: 291, division: "men" }) => lobby.offer(OPPONENT, HEAT, () => `room-${n++}`, meta),
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

test("leaving before the start voids the room; leaving during the heat forfeits it", () => {
  const before = setup();
  before.offer();
  before.poll({ action: "accept", challengeId: before.poll().challenges[0].id });
  assert.deepEqual(before.poll({ action: "leave", roomId: "room-0" }).room.outcome, "void");
  assert.equal(before.results.length, 0);
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

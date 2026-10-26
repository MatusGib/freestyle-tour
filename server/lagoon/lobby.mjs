// The local 1v1 lobby: plays the multiplayer side of the game's 1v1 for one AI
// opponent at a time. start() puts the opponent online and opens a room with
// him at once, as if you had challenged him and he had accepted (after a heat,
// the game challenges again), and each room races (from a countdown to
// startsAt) and then finishes, the way the real lobby's rooms do once both
// riders are in. A room opens racing rather than pending: the game counts down
// only while a room races or a challenge is pending, so a pending room would
// show "Starting in" a meaningless number. A plain state machine on an
// injected clock, so it can be tested without a browser.
import { randomUUID } from "node:crypto";

export const HEAT_SECONDS = 180;
export const TIMES = { countdown: 5000, offerFor: 10 * 60 * 1000 };
export const POSES_PER_SECOND = 30;
const YOU = "you";
const QUIET = new Set(["sync", "exit", "offline", "presence"]);

// score(attempts): the heat total, by the game's own rules. onResult(room) is
// called once when a room finishes with a result (not when it's cancelled).
export function createLobby({ now, score, onResult = () => {}, log = () => {} }) {
  let offer = null; // { challenge, opponent, takeRoom, meta }
  let room = null;

  const clock = () => (now() - room.startsAt) / 1000;
  // Your challenge to the opponent, waiting for him to accept.
  const challengeOf = (id) => ({ id, status: "pending", incoming: false, expiresAt: now() + TIMES.offerFor });

  // A room from offer.takeRoom(): { id, heat }.
  function openRoom({ id, heat }) {
    room = {
      id,
      heat,
      status: "racing",
      startsAt: now() + TIMES.countdown,
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
    if (offer?.challenge.status === "pending") startIfReady();
    if (room?.status !== "racing") return;
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
  // answered, until a heat is started. player: { nickname, appearance }.
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
    cancel({ challengeId }) {
      if (offer?.challenge.id === challengeId && offer.challenge.status === "pending") offer.challenge.status = "cancelled";
    },
    // "Challenge again" after a heat: the AI accepts in a new room as soon as
    // its heat is ready, at once if it already is.
    challenge({ challengeId, riderId }) {
      if (!offer || riderId !== offer.opponent.id || (room && room.status !== "finished")) return;
      offer.challenge = challengeOf(challengeId);
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
    // Opens a room with the opponent now, or, while takeRoom has none ready,
    // as soon as it has. The game starts the heat when its next lobby poll
    // sees the room. opponent: { id, nickname, appearance, rating };
    // takeRoom(): the next room, { id, heat: { score, attempts, poses,
    // settledAt } }, or null while it isn't ready (every room needs a new id:
    // the game ignores room ids it has dismissed); meta: what onResult gets
    // back with the room.
    start(opponent, takeRoom, meta = null) {
      offer = { challenge: challengeOf(randomUUID()), opponent, takeRoom, meta };
      room = null;
      startIfReady();
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

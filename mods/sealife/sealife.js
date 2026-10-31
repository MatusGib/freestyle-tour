// Dolphins and a whale for a rider who sails along doing nothing, in
// practice: when they come and go, and where they swim. Pure helpers, shared
// with the tests; index.js draws them. Times are the game's clock, in seconds.
import { SPLASH } from "../lib/splash.js";

export const DOLPHINS_AFTER = 10; // of sailing with nothing pressed
export const WHALE_AFTER = 20;
export const LAND = 2.6; // from the whale surfacing to its belly flop
export const WHALE_SUNK = LAND + 2.4; // from the whale surfacing to it sinking out of sight
const FOAM_LIFE = 4;
export const WHALE_GONE = LAND + FOAM_LIFE; // its visit ends as its foam fades
export const SPRAY = 240; // droplets in its splash
export const SPRAY_LIFE = 2.9;
export const CROWN_LIFE = 1.6; // its sheet of water
const LEAP = 1; // a dolphin's leap out of the water
const UNDER = 1.4; // under the water between leaps
const DIVE = 1.4; // a leaving dolphin's dive, deep and out of sight
export const DOLPHINS_LEAVE = LEAP + DIVE;
const STEP = .02; // to see which way a dolphin is going

// Practice: on the water, with no heat, tutorial or 1v1 clock.
export const isPractice = (game) => !!game.active && !game.state.heat.enabled && !game.tutorial && !game.competitionClock;
// No key held and the touch stick at rest. Then the rider sails straight.
export const isCalm = (controls) => controls.keys.size === 0 && !controls.stick.x && !controls.stick.y;
// On the water and upright: not in the air, sliding, landing, crashed or body dragging.
export const isSailing = (state) => !state.air && !state.sliding && !state.landing && !state.crashTime && !state.dragging;

export const sense = (game) => ({
  practice: isPractice(game),
  calm: isCalm(game.controls),
  sailing: isSailing(game.state),
  loading: game.controls.keys.has("Space"), // a jump
  airborne: !!game.state.air,
  crashed: game.state.crashTime > 0,
});

// The sea: quiet is when the rider began sailing with nothing pressed (null
// if not); dolphins { start, leave } with leave null until they go; whale
// { start, outcome } with outcome null until it lands, then "hit" or
// "missed". sense.touching (index.js works it out): the rider touches the
// whale's body.
export const START = { quiet: null, dolphins: null, whale: null };

// The next sea, and whether the whale has just landed on the rider.
export function nextSea(sea, sense, time) {
  if (!sense.practice) return { sea: START, hit: false };
  let quiet = sense.calm && sense.sailing ? sea.quiet ?? time : null;
  let { dolphins, whale } = sea;
  if (dolphins?.leave === null && (sense.loading || sense.crashed)) dolphins = { ...dolphins, leave: time };
  if (dolphins?.leave != null && time >= dolphins.leave + DOLPHINS_LEAVE) dolphins = null;
  let hit = false;
  if (whale?.outcome === null && time >= whale.start + LAND) {
    hit = !sense.airborne && !sense.crashed;
    whale = { ...whale, outcome: hit ? "hit" : "missed" };
    if (quiet !== null) quiet = time; // the next whale needs another 20 s
  }
  // Clearing it takes a jump over its back: touching it is a wipe-out too.
  if (whale?.outcome === "missed" && sense.touching && !sense.crashed) {
    hit = true;
    whale = { ...whale, outcome: "hit" };
  }
  if (whale && time >= whale.start + WHALE_GONE) whale = null;
  const still = quiet === null ? 0 : time - quiet;
  if (!dolphins && still >= DOLPHINS_AFTER) dolphins = { start: time, leave: null };
  if (!whale && still >= WHALE_AFTER) whale = { start: time, outcome: null };
  return { sea: { quiet, dolphins, whale }, hit };
}

const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

// The dolphins, in the rider's frame: side metres to the rider's side (one
// way or the other), forward metres ahead. Each porpoises like a dolphin
// keeping pace with a boat: a leap out of the water every EVERY s from first,
// high metres high, in again nose first, down under the water and up into
// the next leap. delay: when it sets off from behind.
export const DOLPHINS = [
  { side: 4.2, forward: 1, high: 1.3, delay: 0, first: 1.6 },
  { side: 5.8, forward: -1.5, high: 1.1, delay: .3, first: 2.4 },
  { side: -4.6, forward: 0, high: 1.45, delay: .6, first: 3.2 },
];
const ARRIVE = 1.5; // to swim in from 12 m behind
const EVERY = LEAP + UNDER;
const AHEAD = 1.5; // a leap carries a dolphin this far ahead; it drops back under the water

// The start of the leap a dolphin is in at t, or null.
function leapAt(dolphin, t) {
  if (t < dolphin.first) return null;
  const start = dolphin.first + Math.floor((t - dolphin.first) / EVERY) * EVERY;
  return t - start < LEAP ? start : null;
}

// Out of the water the leap is a parabola; under it the dolphin follows the
// same curve upside down, stretched over UNDER, so it goes in and comes out
// at the leap's angle, high * UNDER / LEAP deep at the bottom. Before its
// first leap it swims at that depth.
function swimming(dolphin, t) {
  if (t <= dolphin.delay) return null;
  const near = smooth((t - dolphin.delay) / ARRIVE);
  const deep = dolphin.high * UNDER / LEAP;
  let lift = -deep, surge = 0;
  if (t >= dolphin.first - UNDER / 2) {
    const start = dolphin.first + Math.floor((t - dolphin.first) / EVERY) * EVERY, into = t - start;
    if (into < LEAP) {
      const u = into / LEAP;
      [lift, surge] = [4 * dolphin.high * u * (1 - u), u];
    } else {
      const v = (into - LEAP) / UNDER;
      [lift, surge] = [-4 * deep * v * (1 - v), t < dolphin.first ? 0 : 1 - smooth(v)];
    }
  }
  return { forward: dolphin.forward - 12 * (1 - near) + AHEAD * surge, side: dolphin.side, lift };
}

// Where a dolphin is t s after the dolphins came, or null when out of sight.
// From leave (t too) the rider is loading a jump: the dolphin finishes the
// leap it is in, then dives on down, 4.5 m deep, dropping behind, and
// doesn't come up again.
export function dolphinSpot(dolphin, t, leave = null) {
  if (leave === null || t < leave) return swimming(dolphin, t);
  const start = leapAt(dolphin, leave);
  const end = start === null ? leave : start + LEAP;
  if (t < end) return swimming(dolphin, t);
  const from = swimming(dolphin, end), s = t - end;
  if (!from || s >= DIVE) return null;
  // On from the way it was going, never up, and curving down to 4.5 m.
  const slope = Math.min(0, (from.lift - (swimming(dolphin, end - STEP) ?? from).lift) / STEP);
  const v = s / DIVE, toward = v * v * (3 - 2 * v), onward = v * (1 - v) * (1 - v);
  return { forward: from.forward - 2 * s * s, side: from.side, lift: from.lift + (-4.5 - from.lift) * toward + DIVE * slope * onward };
}

// The dolphin's place and how far its nose is lifted, the rider sailing at
// speed (m/s): its body follows its path.
export function dolphinPose(dolphin, t, leave, speed) {
  const here = dolphinSpot(dolphin, t, leave);
  if (!here) return null;
  const ahead = dolphinSpot(dolphin, t + STEP, leave);
  const [from, to] = ahead ? [here, ahead] : [dolphinSpot(dolphin, t - STEP, leave), here];
  return { ...here, pitch: Math.atan2(to.lift - from.lift, speed * STEP + to.forward - from.forward) };
}

// The splashes a dolphin makes at t, where it left the water and where it went
// back in, by how far ahead they were then and their age. With leave, leaps
// after it never happen.
export function dolphinSplashes(dolphin, t, leave = null) {
  const out = [];
  for (let start = dolphin.first; start <= t; start += EVERY) {
    if (leave !== null && start >= leave) break;
    for (const when of [start, start + LEAP]) {
      const age = t - when;
      if (age >= 0 && age <= SPLASH) out.push({ forward: swimming(dolphin, when).forward, age });
    }
  }
  return out;
}

const SURFACE = .8; // the whale's head rising before it leaps
const SIDE = 8; // it surfaces this far to the side of where it lands
const WHALE_HIGH = 5.5;
const STEEP = 1.1; // its nose's lift as it leaves the water

// Where the whale is t s after it surfaced: across, metres from where it
// lands across the rider's path; lift; and pitch, its nose's lift. It flattens
// out to land on its belly, then sinks. Null when out of sight.
export function whaleSpot(t) {
  if (t < 0) return null;
  if (t < SURFACE) {
    const k = smooth(t / SURFACE);
    return { across: SIDE, lift: -3 + 2.4 * k, pitch: STEEP * k };
  }
  if (t < LAND) {
    const u = (t - SURFACE) / (LAND - SURFACE);
    return { across: SIDE * (1 - u), lift: -.6 * (1 - u) + 4 * WHALE_HIGH * u * (1 - u), pitch: STEEP * (1 - u) * (1 - u) };
  }
  if (t >= WHALE_SUNK) return null;
  const k = (t - LAND) / (WHALE_SUNK - LAND);
  return { across: 0, lift: -3.5 * k * k, pitch: -.2 * k };
}

// Where the whale lands: 6 m in front of where the rider will be, their place
// plus their velocity (m/s) times the time left, so its splash, not its body,
// hits them, and they don't drift into it as it sinks.
export function aim(rider, whale, time) {
  const left = Math.max(0, whale.start + LAND - time), front = 6 / (Math.hypot(rider.vx, rider.vz) || Infinity);
  return { x: rider.x + rider.vx * (left + front), z: rider.z + rider.vz * (left + front) };
}

// The whale's body, as model.js builds it: half its length, height and width.
export const WHALE_BODY = { long: 5, high: 1.5, wide: 1.7 };
const REACH = .6; // the rider's board reaches this far past their middle

// Whether the rider touches the whale: within its outline (lying along axis,
// a unit vector, lift above the water) and lower than its back there.
export function touchesWhale(rider, whale) {
  const dx = rider.x - whale.x, dz = rider.z - whale.z;
  const along = (dx * whale.axis.x + dz * whale.axis.z) / (WHALE_BODY.long + REACH);
  const side = (dz * whale.axis.x - dx * whale.axis.z) / (WHALE_BODY.wide + REACH);
  const inside = 1 - along * along - side * side;
  return inside > 0 && rider.height < whale.lift + WHALE_BODY.high * Math.sqrt(inside);
}

// A repeatable random number in [0, 1) for droplet i.
const random = (i, salt) => {
  const s = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

// Droplet i of the whale's belly flop, age s after it: thrown up and out from
// all round its body over the first 0.12 s, the highest from beside its
// middle, where the most water is pushed aside. In the whale's frame: along
// its length, side across it, y up from the water. Null before it is thrown
// and once it is back in the water.
export function sprayDrop(i, age) {
  const s = age - .12 * random(i, 1);
  if (s < 0) return null;
  const angle = random(i, 2) * Math.PI * 2, ca = Math.cos(angle), sa = Math.sin(angle);
  const nx = ca / WHALE_BODY.long, nz = sa / WHALE_BODY.wide, n = Math.hypot(nx, nz); // out across its outline
  const up = (4 + 9 * random(i, 3)) * (1 - .55 * ca * ca), out = 1.5 + 4 * random(i, 4);
  const y = up * s - 4.9 * s * s;
  if (s > 0 && y < 0) return null;
  return {
    along: WHALE_BODY.long * ca + nx / n * out * s,
    side: WHALE_BODY.wide * sa + nz / n * out * s,
    y,
    size: (.1 + .3 * random(i, 5)) * (1 - .4 * s / SPRAY_LIFE),
  };
}

// The sheet of water thrown up all round the whale: how far it has spread
// (times its outline), how high, and how see-through. Null once it has fallen.
export function crown(age) {
  const k = age / CROWN_LIFE;
  if (k < 0 || k >= 1) return null;
  return { grow: 1.05 + .7 * k, height: 3.6 * Math.sin(Math.PI * k ** .7), opacity: .8 * (1 - k) ** 1.5 };
}

// The foam left on the water, spreading and fading. Null once it has gone.
export function foam(age) {
  const k = age / FOAM_LIFE;
  if (k < 0 || k >= 1) return null;
  return { grow: 1.1 + 1.3 * (1 - (1 - k) ** 2), opacity: .85 * (1 - k) ** 1.5 };
}

// Dolphins and a whale for a rider who sails along doing nothing, in
// practice: when they come and go, and where they swim. Pure helpers, shared
// with the tests; index.js draws them. Times are the game's clock, in seconds.

export const DOLPHINS_AFTER = 10; // of sailing with nothing pressed
export const WHALE_AFTER = 20;
export const LAND = 2.6; // from the whale surfacing to its belly flop
export const WHALE_GONE = 5; // from the whale surfacing to it sinking out of sight
export const WHALE_SPLASH = 1.4; // its splash's droplets in the air
const LEAP = 1.1; // a dolphin's leap
const DIVE = 1.2; // a leaving dolphin's dive out of sight
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
// "missed".
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
  if (whale && time >= whale.start + WHALE_GONE) whale = null;
  const still = quiet === null ? 0 : time - quiet;
  if (!dolphins && still >= DOLPHINS_AFTER) dolphins = { start: time, leave: null };
  if (!whale && still >= WHALE_AFTER) whale = { start: time, outcome: null };
  return { sea: { quiet, dolphins, whale }, hit };
}

const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

// The dolphins, in the rider's frame: side metres to the rider's side (one
// way or the other), forward metres ahead. delay: when each sets off; first:
// its first leap, after it has swum in, then one every EVERY s.
export const DOLPHINS = [
  { side: 4.2, forward: 1, delay: 0, first: 1.6 },
  { side: 5.8, forward: -1.5, delay: .3, first: 2.4 },
  { side: -4.6, forward: 0, delay: .6, first: 3.2 },
];
const ARRIVE = 1.5; // to swim in from 12 m behind and 2 m down
const EVERY = 2.6;
const HIGH = 1.7; // a leap's height
const AHEAD = 2.5; // a leap carries a dolphin this far ahead; it drops back after

// Swimming just under the surface, back fin out.
const swim = (dolphin, t) => -.25 + .06 * Math.sin(3 * t + dolphin.side);

// How far through its leap cycle a dolphin is: surge 0 to 1, rising through a
// leap and easing back after it; start is the leap it is in, or null.
function cycle(dolphin, t) {
  if (t < dolphin.first) return { surge: 0, start: null };
  const start = dolphin.first + Math.floor((t - dolphin.first) / EVERY) * EVERY, into = t - start;
  return into < LEAP ? { surge: into / LEAP, start } : { surge: 1 - smooth((into - LEAP) / (EVERY - LEAP)), start: null };
}

function swimming(dolphin, t) {
  if (t <= dolphin.delay) return null;
  const near = smooth((t - dolphin.delay) / ARRIVE);
  const { surge, start } = cycle(dolphin, t);
  let lift = -2 + (swim(dolphin, t) + 2) * near;
  if (start !== null) {
    const u = (t - start) / LEAP;
    lift = swim(dolphin, start) * (1 - u) + swim(dolphin, start + LEAP) * u + 4 * HIGH * u * (1 - u);
  }
  return { forward: dolphin.forward - 12 * (1 - near) + AHEAD * surge, side: dolphin.side, lift };
}

// Where a dolphin is t s after the dolphins came, or null when out of sight.
// From leave (t too) the rider is loading a jump: the dolphin finishes the
// leap it is in, then dives, dropping behind, and doesn't come up again.
export function dolphinSpot(dolphin, t, leave = null) {
  if (leave === null || t < leave) return swimming(dolphin, t);
  const { start } = cycle(dolphin, leave);
  const end = start === null ? leave : start + LEAP;
  if (t < end) return swimming(dolphin, t);
  const from = swimming(dolphin, end), s = t - end;
  if (!from || s >= DIVE) return null;
  const k = s / DIVE;
  return { forward: from.forward - 2 * s * s, side: from.side, lift: from.lift - (2.5 + from.lift) * k * k };
}

// The dolphin's place and how far its nose is lifted, the rider sailing at
// speed (m/s).
export function dolphinPose(dolphin, t, leave, speed) {
  const here = dolphinSpot(dolphin, t, leave);
  if (!here) return null;
  const ahead = dolphinSpot(dolphin, t + STEP, leave);
  const [from, to] = ahead ? [here, ahead] : [dolphinSpot(dolphin, t - STEP, leave), here];
  return { ...here, pitch: Math.atan2(to.lift - from.lift, speed * STEP + to.forward - from.forward) };
}

const SURFACE = .8; // the whale's head rising before it leaps
const SIDE = 8; // it surfaces this far to the side of where it lands
const WHALE_HIGH = 5.5;
const STEEP = 1.1; // its nose's lift as it leaves the water

// Where the whale is t s after it surfaced: across, metres from where it
// lands across the rider's path; lift; and pitch, its nose's lift. It flattens
// out to land on its belly, then sinks. Null when out of sight.
export function whaleSpot(t) {
  if (t < 0 || t >= WHALE_GONE) return null;
  if (t < SURFACE) {
    const k = smooth(t / SURFACE);
    return { across: SIDE, lift: -3 + 2.4 * k, pitch: STEEP * k };
  }
  if (t < LAND) {
    const u = (t - SURFACE) / (LAND - SURFACE);
    return { across: SIDE * (1 - u), lift: -.6 * (1 - u) + 4 * WHALE_HIGH * u * (1 - u), pitch: STEEP * (1 - u) * (1 - u) };
  }
  const k = (t - LAND) / (WHALE_GONE - LAND);
  return { across: 0, lift: -3.5 * k * k, pitch: -.2 * k };
}

// Where the rider will be when the whale lands: their place plus their
// velocity (m/s) times the time left.
export function aim(rider, whale, time) {
  const left = Math.max(0, whale.start + LAND - time);
  return { x: rider.x + rider.vx * left, z: rider.z + rider.vz * left };
}

// Droplet i of the whale's splash: thrown up and out in a ring, falling back
// and shrinking away.
export function whaleSplash(i, count, age) {
  const angle = i / count * Math.PI * 2, out = (3 + 1.5 * (i % 3)) * age;
  return {
    x: Math.cos(angle) * out,
    y: (6.5 + i % 2) * age - 4.9 * age * age,
    z: Math.sin(angle) * out,
    size: .35 * Math.max(0, 1 - age / WHALE_SPLASH),
  };
}

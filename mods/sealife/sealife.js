// Dolphins and a whale for a rider who sails along doing nothing, in
// practice: when they come and go, and where they swim. Pure helpers, shared
// with the tests; index.js draws them. Times are the game's clock, in seconds.

export const DOLPHINS_AFTER = 10; // of sailing with nothing pressed
export const WHALE_AFTER = 20;
export const LAND = 2.6; // from the whale surfacing to its belly flop
export const WHALE_GONE = 5; // from the whale surfacing to it sinking out of sight
const LEAP = 1.1; // a dolphin's leap
const DIVE = 1.2; // a leaving dolphin's dive out of sight
export const DOLPHINS_LEAVE = LEAP + DIVE;

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

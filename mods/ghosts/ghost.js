// Choosing and labelling the ghost. Pure helpers, shared with the tests.

// The best heat that has a usable recording, or null.
export const pickGhost = (heats) => heats.filter((h) => h.hasReplay).reduce((best, h) => (!best || h.score > best.score ? h : best), null);

export const ghostLabel = (heat) => `Ghost · ${heat.nickname} · ${heat.score.toFixed(2)}`;

export const stepOf = (state) => Math.round(state.totalTime * 120);

// A sample for the game's opponent display, shaped like the ones its 1v1
// transports send: the pose nested under `pose`, plus a timestamp and stream.
export const ghostSample = (pose, now) => ({ pose, updatedAt: now, streamId: "ghost" });

// A solo heat at its first step: practice has no heat, and 1v1 heats run on a
// competition clock.
export const isHeatStart = (state, game) => state.heat.enabled && state.totalTime === 0 && !game.competitionClock;

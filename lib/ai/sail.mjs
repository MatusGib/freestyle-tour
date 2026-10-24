// Sails a solo heat with the Freestajlo planner, recorded the way the game
// records one: the game's own Controls with its Recorder attached, one physics
// step at a time. The recording replays with mods/lib/replay.js.
import { createBrain } from "./freestajlo/brain.mjs";
import { wrap } from "./freestajlo/sim.mjs";

const LONGEST = 210 * 120; // a heat lasts 180 s; stop at 210 s whatever happens

// target: the heat score to aim for. seconds: stop early (for tests).
export function sailHeat(engine, conditions, target, { seconds = Infinity } = {}) {
  const controls = new engine.Controls();
  const recorder = new engine.Recorder();
  controls.recorder = recorder.record;
  const sim = wrap(engine, engine.heatStart(conditions, controls), controls);
  const brain = createBrain(engine, { target });
  const limit = Math.min(LONGEST, Math.round(seconds * 120));
  let steps = 0;
  while (!sim.state.heat.done && steps < limit) {
    sim.step(brain.update(sim.state, sim.act, controls));
    recorder.step();
    steps += 1;
  }
  const totals = engine.heatTotals(sim.state.heat);
  return {
    replay: recorder.replay(),
    score: totals.total,
    attempts: sim.state.heat.attempts,
    tricks: totals.counting.map((a) => ({ tack: a.tack, label: a.label, score: a.score })),
    steps,
    state: sim.state,
  };
}

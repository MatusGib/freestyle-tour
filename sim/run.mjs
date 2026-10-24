// Runs a heat headlessly in fixed 1/120 s steps, like the game's own loop.
// input(step, state) returns { steer, power, charge } for each step.
import { createHash } from "node:crypto";

export const DT = 1 / 120;

export function runHeat(engine, { seed, steps, input, heat = true }) {
  const state = engine.initState(engine.conditions(seed));
  state.heat.enabled = heat;
  for (let i = 0; i < steps && !state.heat.done; i++) engine.step(state, input(i, state), DT);
  const hash = createHash("sha256").update(JSON.stringify(state)).digest("hex");
  return { state, totals: engine.heatTotals(state.heat), hash };
}

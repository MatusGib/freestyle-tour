// Settings that tune the AI riders (server/tuning.json), changed in the
// developer panel. aiTargetOffset: points added to every solo-challenge
// rider's target; the champion keeps his own.
import { problem } from "./problem.mjs";

export const NO_TUNING = { aiTargetOffset: 0 };

export function checkTuning(tuning, name = "server/tuning.json") {
  const offset = tuning?.aiTargetOffset;
  if (typeof offset !== "number" || offset < -10 || offset > 10) throw problem("tuning.aiTargetOffset", `${name}: the AI target offset must be from -10 to +10 points`);
  return tuning;
}

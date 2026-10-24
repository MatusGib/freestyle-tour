// Copied unchanged from Freestajlo (bot/programs.mjs, 2026-10-23 version) for freestyle-tour's AI riders.
// Trick programs the planner chooses between. Each one is a starting point:
// before every jump the bot re-tunes charge and tap timing by simulation.
//   key: the trick the program is for, as the judges identify it (a heat
//        counts each key once per tack, and less on the second tack, so
//        distinct keys are worth more; every combo that starts with a Culo or
//        holds two in a row is just "culo")
//   ducked / switch: rig setup before charging (E / Q keys)
//   charge: jump charge level 0..1 (it fills at 0.9 per second of holding Jump)
//   taps: [seconds after takeoff, slot]; slots are A=0, W=1, D=2, S=3
// Slots map to tricks by stance; e.g. ducked regular: A=Kono, W=Culo, D=Bob,
// and W again early in a Culo turns it into a Double Air Culo.
// tools/train-programs.mjs tunes these and stores the result in trained.mjs.
import { TRAINED } from "./trained.mjs";

export const RAW_PROGRAMS = [
  // Culo family: one identity, the highest scoring one there is.
  { name: "double culo > culo > kono", key: "culo", ducked: true, charge: 0.7, taps: [[0.01, 1], [0.12, 1], [0.4, 1], [0.5, 0]] },
  { name: "double culo > culo", key: "culo", ducked: true, charge: 0.58, taps: [[0.01, 1], [0.17, 1], [0.6, 1]] },
  { name: "double culo", key: "culo", ducked: true, charge: 0.68, taps: [[0.01, 1], [0.135, 1]] },
  { name: "loop > spock > double culo > culo", key: "culo", charge: 1, taps: [[0.05, 1], [0.08, 2], [0.5, 2], [0.75, 1], [0.8, 1], [1.2, 1]] },
  // Distinct combos, each its own trick.
  { name: "flaka > loop > spock > culo", key: "flaka>loop>spock>culo", charge: 1, taps: [[0, 0], [0.12, 1], [0.44, 2], [0.66, 2], [0.88, 1]] },
  { name: "loop > loop > spock > culo", key: "loop>loop>spock>culo", charge: 1, taps: [[0.1, 1], [0.11, 1], [0.15, 2], [0.2, 2], [0.5, 1]] },
  { name: "loop > spock > culo", key: "loop>spock>culo", charge: 1, taps: [[0.19, 1], [0.35, 2], [0.69, 2], [0.78, 3]] },
  { name: "flaka > loop > spock", key: "flaka>loop>spock", charge: 1, taps: [[0.26, 0], [0.6, 1], [1.1, 2], [1.83, 2]] },
  { name: "spock > kono", key: "spock>kono", charge: 1, taps: [[0.18, 2], [0.58, 2], [1.22, 0]] },
  { name: "spock > culo", key: "spock>culo", charge: 0.6, taps: [[0.12, 2], [0.18, 2], [0.85, 1]] },
  { name: "bob > culo", key: "bob>culo", ducked: true, charge: 0.86, taps: [[0.5, 2], [1.15, 1]] },
  { name: "funnel > burner", key: "funnel>burner", switch: true, ducked: true, charge: 0.8, taps: [[0.4, 0], [0.9, 2]] },
  { name: "shifty", key: "shifty", charge: 1, taps: [[0.01, 3], [0.1, 3], [0.35, 3]] },
  { name: "chebongka", key: "cheese_roll", charge: 1, taps: [[0.01, 3], [0.06, 1], [0.5, 0]] },
  { name: "pasko", key: "pasko", charge: 1, taps: [[0.2, 0], [0.33, 3]] },
  { name: "skopu", key: "skopu", switch: true, ducked: true, charge: 1, taps: [[0.01, 1]] },
  { name: "bongka", key: "loop", charge: 1, taps: [[0.1, 1], [0.3, 0]] },
];

const steps = (s) => Math.round(s * 120);
export const toSteps = (p) => ({
  ...p,
  charge: steps(p.charge / 0.9),
  taps: p.taps.map(([t, slot]) => [steps(t), slot]),
});

export const PROGRAMS = RAW_PROGRAMS.map((p) => ({ ...toSteps(p), ...TRAINED[p.name] }));

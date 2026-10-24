// Stores a short demo heat, recorded with the snapshot's own engine and
// controls, for the current week. Replays and ghosts can then be shown without
// playing a heat first. The demo rider borrows the first local rider's look.
//   node tools/demo-heat.mjs
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGame, openSnapshot } from "../lib/snapshot.mjs";
import { createStore } from "../server/store.mjs";
import { recordHeat } from "../sim/record.mjs";

const NICKNAME = "Demo rider";
const root = fileURLToPath(new URL("..", import.meta.url));

const engine = await loadGame(openSnapshot(root), ["engine", "wind", "controls", "week"]);
const now = Date.now();
const weekStart = engine.weekStart(now);
const conditions = engine.weekConditions(weekStart);
const { state, replay } = recordHeat(engine, conditions);
const totals = engine.heatTotals(state.heat);

const store = createStore(join(root, "data", "db.json"));
let rider = store.data.riders.find((r) => r.nickname === NICKNAME);
if (!rider) {
  rider = { key: randomUUID(), revision: 1, nickname: NICKNAME, appearance: store.data.riders[0]?.appearance ?? {} };
  store.update((d) => void d.riders.push(rider));
}
store.update((d) => void d.heats.push({
  heatId: randomUUID(),
  playerKey: rider.key,
  scoringVersion: 2,
  weekStart,
  conditions,
  startedAt: now,
  finishedAt: now,
  attempts: state.heat.attempts,
  replay,
  score: totals.total,
  tricks: totals.counting.map((a) => ({ tack: a.tack, label: a.label, score: a.score })),
}));
const moves = totals.counting.map((a) => a.label).join(", ") || "no scoring moves";
console.log(`Stored a demo heat for ${NICKNAME}: ${totals.total.toFixed(2)} points (${moves}), wind ${conditions.knots} kt`);

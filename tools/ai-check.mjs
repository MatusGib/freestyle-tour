// Sails AI heats at several targets in several weeks' solo winds and reports
// how close the scores land. The bar: within 1.0 on average, never more than 3.
//   node tools/ai-check.mjs [--weeks 5] [--targets 22,28,34,40,46] [--winds 12,16,20,24,28]
// --winds sails each target in each of those winds (4 kt gusts) instead of
// the weeks' own, and reports the misses per wind.
import { availableParallelism } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createSailer } from "../lib/ai/sailer.mjs";
import { loadGame, openSnapshot } from "../lib/snapshot.mjs";

export const BAR = { mean: 1.0, worst: 3 };
const WEEK = 7 * 24 * 3600 * 1000;

// results: [{ target, score }]. Returns the mean and worst miss and whether
// they meet the bar.
export function judge(results) {
  const misses = results.map((r) => Math.abs(r.score - r.target));
  const mean = misses.reduce((sum, m) => sum + m, 0) / misses.length;
  const worst = Math.max(...misses);
  return { mean, worst, pass: mean <= BAR.mean && worst <= BAR.worst };
}

async function main() {
  const { values } = parseArgs({ options: { weeks: { type: "string", default: "5" }, targets: { type: "string", default: "22,28,34,40,46" }, winds: { type: "string", default: "" } } });
  const root = fileURLToPath(new URL("..", import.meta.url));
  const snapshot = openSnapshot(root);
  const game = await loadGame(snapshot, ["week"]);
  const targets = values.targets.split(",").map(Number);
  const winds = values.winds ? values.winds.split(",").map(Number) : [null];
  const jobs = [];
  for (let back = 0; back < Number(values.weeks); back++) {
    const weekStart = game.weekStart(Date.now() - back * WEEK);
    const week = game.weekConditions(weekStart);
    for (const knots of winds) for (const target of targets) jobs.push({ weekStart, conditions: knots ? { ...week, knots, gustKnots: 4 } : week, target });
  }
  const lanes = Math.max(1, Math.min(jobs.length, availableParallelism() - 1));
  console.log(`Sailing ${jobs.length} heats in ${lanes} worker threads…`);
  const results = [];
  const queue = [...jobs];
  await Promise.all(Array.from({ length: lanes }, async () => {
    const sailer = createSailer({ root, snapshot: snapshot.name });
    while (queue.length) {
      const job = queue.shift();
      const heat = await sailer.sail(job.conditions, job.target);
      results.push({ ...job, score: heat.score });
      const c = job.conditions;
      console.log(`  ${new Date(job.weekStart).toISOString().slice(0, 10)} (${c.knots} kt +${c.gustKnots})  target ${job.target}  scored ${heat.score.toFixed(2)}`);
    }
    await sailer.close();
  }));
  if (values.winds) {
    for (const knots of winds) {
      const at = results.filter((r) => r.conditions.knots === knots);
      const mean = at.reduce((sum, r) => sum + (r.score - r.target), 0) / at.length;
      console.log(`  ${knots} kt: ${at.length} heats, scored ${mean >= 0 ? "+" : ""}${mean.toFixed(2)} against the target on average`);
    }
  }
  const { mean, worst, pass } = judge(results);
  console.log(`\nMean miss ${mean.toFixed(2)}, worst ${worst.toFixed(2)} (bar: ${BAR.mean} and ${BAR.worst}): ${pass ? "pass" : "FAIL"}`);
  if (!pass) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

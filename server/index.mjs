// Starts the local copy of the game on 127.0.0.1.
//   npm start -- [--port 5180] [--snapshot <name>] [--mods a,b]
//   npm start -- --mods=      runs the original with no mods
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createApp } from "./app.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const { values } = parseArgs({
  options: {
    port: { type: "string", default: "5180" },
    snapshot: { type: "string" },
    mods: { type: "string" },
  },
});
const mods = values.mods !== undefined ? values.mods.split(",").filter(Boolean) : JSON.parse(readFileSync(join(root, "mods", "enabled.json"), "utf8"));

try {
  const server = await createApp({ root, snapshot: values.snapshot, mods, dataFile: join(root, "data", "db.json") });
  server.listen(Number(values.port), "127.0.0.1", () => {
    console.log(`Local copy running at http://localhost:${values.port}`);
    console.log(`Mods: ${mods.length ? mods.join(", ") : "none"}`);
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

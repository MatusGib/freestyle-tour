// The local server: the snapshot's files, the mod loader and its config,
// serve-time patches and the fake APIs. It never forwards anything to the
// internet, and the CSP header makes the browser refuse other hosts too.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { createSailer } from "../lib/ai/sailer.mjs";
import { fileFor, loadGame, openSnapshot } from "../lib/snapshot.mjs";
import { handleApi } from "./api/index.mjs";
import { createWeekRooms } from "./api/weekly.mjs";
import { prepareHtml } from "./html.mjs";
import { loadPatches, patchSnapshot } from "./patches.mjs";
import { createLobby } from "./lagoon/lobby.mjs";
import { createRelay } from "./lagoon/relay.mjs";
import { createStore } from "./store.mjs";
import { loadTour } from "./tour.mjs";
import { loadVenueCatalog } from "./venues.mjs";
import { recordRoom } from "./weekly.mjs";

export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
].join("; ");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};
const typeOf = (path) => TYPES[extname(path)] ?? "application/octet-stream";

// Returns an http.Server that isn't listening yet. `game`, `now`, `tour`, `ai`
// and `champion` can be replaced in tests; by default the snapshot's engine,
// calendar and wind are loaded, the tour data is read from tour/, AI heats are
// sailed in a worker thread, and the champion is server/champion.json.
export async function createApp({ root, snapshot: name, mods, dataFile, modsDir = join(root, "mods"), game, now = Date.now, log = console.log, tour, ai, champion }) {
  const snapshot = openSnapshot(root, name);
  game ??= await loadGame(snapshot, ["engine", "week", "wind"]);
  tour ??= loadTour(join(root, "tour"));
  const venues = mods?.includes("venues") ? loadVenueCatalog(join(root, "tour", "venues.json")) : null;
  ai ??= createSailer({ root, snapshot: snapshot.name, mods, modsDir });
  champion ??= JSON.parse(readFileSync(new URL("./champion.json", import.meta.url), "utf8"));
  const store = createStore(dataFile);
  const aiHeats = createStore(join(dirname(dataFile), "ai-heats.json"), { heats: {} });
  // The Champion's challenge's results, apart from the super final's old
  // weekly.json, so an old super final win doesn't count as beating him.
  const weekly = createStore(join(dirname(dataFile), "champion.json"), { weeks: {}, prize: null });
  // A room usually finishes inside the relay's timer, where a thrown error would
  // stop the server: a result that can't be written is logged instead.
  const lobby = createLobby({
    now,
    score: (attempts) => game.heatTotals({ attempts }).total,
    onResult: (room) => {
      try {
        recordRoom(weekly, room, now());
      } catch (error) {
        log(`Couldn't record the Champion's challenge result: ${error.stack ?? error}`);
      }
    },
    log,
  });
  const relay = createRelay({ lobby, now });
  const weekRooms = createWeekRooms({ champion, game, now, ai, log });
  const patched = patchSnapshot(snapshot, await loadPatches(modsDir, mods), log);
  const page = prepareHtml(readFileSync(join(snapshot.dir, "index.html"), "utf8"));
  const config = JSON.stringify({ snapshot: snapshot.name, parts: snapshot.manifest.parts, mods });
  const files = new Set(snapshot.manifest.files.map((f) => f.path));
  const modsRoot = resolve(modsDir) + sep;
  const ctx = { store, game, now, tour, venues, mods, ai, aiHeats, snapshot: snapshot.name, lobby, relay, weekly, champion, weekRooms, log };

  const send = (res, status, type, body) => {
    res.writeHead(status, { "content-type": type, "content-security-policy": CSP, "cache-control": "no-store" });
    res.end(body);
  };

  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith("/api/")) {
      const body = req.method === "POST" ? await readJson(req) : undefined;
      const result = await handleApi({ method: req.method, path, query: url.searchParams, body, host: req.headers.host }, ctx);
      if (result.unknown) log(`Unknown API call: ${req.method} ${path}`);
      return send(res, result.status, TYPES[".json"], JSON.stringify(result.body));
    }
    if (path === "/") return send(res, 200, TYPES[".html"], page);
    if (path === "/__mods/config.json") return send(res, 200, TYPES[".json"], config);
    if (path.startsWith("/__mods/")) {
      const file = resolve(modsDir, path.slice("/__mods/".length));
      if (!file.startsWith(modsRoot)) return send(res, 404, "text/plain", "Not found");
      try {
        return send(res, 200, typeOf(file), readFileSync(file));
      } catch {
        return send(res, 404, "text/plain", "Not found");
      }
    }
    const patch = patched.get(path);
    if (patch?.error) return send(res, 500, "text/plain; charset=utf-8", patch.error);
    if (patch) return send(res, 200, TYPES[".js"], patch.text);
    if (files.has(path)) return send(res, 200, typeOf(path), readFileSync(join(snapshot.dir, fileFor(path))));
    if (path === "/favicon.ico") return send(res, 204, "text/plain", "");
    return send(res, 404, "text/plain", "Not found");
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      log(error.stack ?? String(error));
      send(res, 500, "text/plain", "Local server error");
    });
  });
  server.on("upgrade", (req, socket) => relay.handleUpgrade(req, socket));
  return server;
}

async function readJson(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}

// The local server: the snapshot's files, the mod loader and its config,
// serve-time patches and the fake APIs. It never forwards anything to the
// internet, and the CSP header makes the browser refuse other hosts too.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileFor, loadGame, openSnapshot } from "../lib/snapshot.mjs";
import { handleApi } from "./api/index.mjs";
import { prepareHtml } from "./html.mjs";
import { loadPatches, patchSnapshot } from "./patches.mjs";
import { createStore } from "./store.mjs";

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

// Returns an http.Server that isn't listening yet. `game` and `now` can be
// replaced in tests; by default the snapshot's engine and calendar are loaded.
export async function createApp({ root, snapshot: name, mods, dataFile, modsDir = join(root, "mods"), game, now = Date.now, log = console.log }) {
  const snapshot = openSnapshot(root, name);
  game ??= await loadGame(snapshot, ["engine", "week"]);
  const store = createStore(dataFile);
  const patched = patchSnapshot(snapshot, await loadPatches(modsDir, mods), log);
  const page = prepareHtml(readFileSync(join(snapshot.dir, "index.html"), "utf8"));
  const config = JSON.stringify({ snapshot: snapshot.name, parts: snapshot.manifest.parts, mods });
  const files = new Set(snapshot.manifest.files.map((f) => f.path));
  const modsRoot = resolve(modsDir) + sep;
  const ctx = { store, game, now };

  const send = (res, status, type, body) => {
    res.writeHead(status, { "content-type": type, "content-security-policy": CSP, "cache-control": "no-store" });
    res.end(body);
  };

  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith("/api/")) {
      const body = req.method === "POST" ? await readJson(req) : undefined;
      const result = handleApi({ method: req.method, path, query: url.searchParams, body }, ctx);
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

  return createServer((req, res) => {
    handle(req, res).catch((error) => {
      log(error.stack ?? String(error));
      send(res, 500, "text/plain", "Local server error");
    });
  });
}

async function readJson(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}

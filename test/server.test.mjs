import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CSP, createApp } from "../server/app.mjs";
import { LOADER_TAG } from "../server/html.mjs";
import { fakeGame, makeSnapshot, tempDir } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const FILES = {
  "/": `<!doctype html><html><head><script src="/_next/static/chunks/main.js"></script></head><body><script>(function(){var a='/cdn-cgi/challenge-platform/scripts/jsd/main.js'})()</script></body></html>`,
  "/_next/static/chunks/main.js": `console.log("Same keys in the air");`,
  "/_next/static/chunks/engine.js": `export const rules={attemptsPerTack:8};`,
  "/wordmark.svg": `<svg xmlns="http://www.w3.org/2000/svg"></svg>`,
};

async function startServer(t, { mods = [], modFiles = {} } = {}) {
  const root = tempDir(t);
  makeSnapshot(root, "fixture", FILES, { engine: "/_next/static/chunks/engine.js" });
  for (const [path, text] of Object.entries(modFiles)) {
    const out = join(root, "mods", path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
  }
  const logs = [];
  const server = await createApp({ root, mods, dataFile: join(root, "data", "db.json"), game: fakeGame, now: () => NOW, log: (m) => logs.push(m) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { get: (path, init) => fetch(base + path, init), logs };
}

const post = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("the page drops the bot check, adds the loader and carries the CSP", async (t) => {
  const { get } = await startServer(t);
  const res = await get("/");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-security-policy"), CSP);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const html = await res.text();
  assert.ok(html.includes(`<head>${LOADER_TAG}`));
  assert.ok(!html.includes("/cdn-cgi/"));
});

test("snapshot files are served with their content type; anything else is 404", async (t) => {
  const { get } = await startServer(t);
  const svg = await get("/wordmark.svg");
  assert.equal(svg.status, 200);
  assert.equal(svg.headers.get("content-type"), "image/svg+xml");
  const js = await get("/_next/static/chunks/engine.js");
  assert.equal(js.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal((await get("/nope.js")).status, 404);
  assert.equal((await get("/favicon.ico")).status, 204);
  assert.equal((await get("/vendor/current.json")).status, 404);
});

test("mods: the config, mod files, and no way out of the mods folder", async (t) => {
  const { get } = await startServer(t, { mods: ["demo"], modFiles: { "demo/index.js": "export default { name: 'demo', setup() {} };" } });
  assert.deepEqual(await (await get("/__mods/config.json")).json(), { snapshot: "fixture", parts: { engine: "/_next/static/chunks/engine.js" }, mods: ["demo"] });
  const mod = await get("/__mods/demo/index.js");
  assert.equal(mod.status, 200);
  assert.equal(mod.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal((await get("/__mods/..%2F..%2Fpackage.json")).status, 404);
  assert.equal((await get("/__mods/missing.js")).status, 404);
});

test("patches change modules; a broken patch answers 500 naming the mod", async (t) => {
  const { get, logs } = await startServer(t, {
    mods: ["good", "bad"],
    modFiles: {
      "good/patches.mjs": `export const patches = [{ marker: "Same keys in the air", find: "Same keys in the air", replace: "Same keys in the air · local", expect: 1 }];`,
      "bad/patches.mjs": `export const patches = [{ part: "engine", find: "missing text", replace: "x", expect: 1 }];`,
    },
  });
  assert.ok((await (await get("/_next/static/chunks/main.js")).text()).includes("Same keys in the air · local"));
  const broken = await get("/_next/static/chunks/engine.js");
  assert.equal(broken.status, 500);
  assert.match(await broken.text(), /mod "bad"/);
  assert.ok(logs.some((m) => /mod "bad"/.test(m)));
});

test("API calls reach the fake APIs; unknown ones are 404 and logged", async (t) => {
  const { get, logs } = await startServer(t);
  const created = await get("/api/rider", post({ action: "create", nickname: "Tester", appearance: {} }));
  assert.equal(created.status, 200);
  assert.equal((await created.json()).profile.nickname, "Tester");
  assert.deepEqual(await (await get("/api/lagoons/lobby-connect", post({}))).json(), { relay: null });
  assert.equal((await get("/api/admin")).status, 404);
  assert.ok(logs.includes("Unknown API call: GET /api/admin"));
});

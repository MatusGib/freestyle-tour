import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { crawl, writeSnapshot } from "../tools/snapshot.mjs";
import { tempDir } from "./helpers.mjs";

const SITE = "https://game.test";
const MARKERS = "attemptsPerTack:1;Math.sin(r*.17);syncAir(;areaArrow;Europe/Warsaw;Invalid rider pose.";
const PAGES = {
  "/": `<html><head><link rel="stylesheet" href="/_next/static/css/a.css"/><script src="/_next/static/chunks/page-AAAAAAAA.js"></script></head></html>`,
  "/_next/static/css/a.css": `@font-face{src:url(/fonts/f.ttf)}`,
  "/fonts/f.ttf": "font",
  "/_next/static/chunks/page-AAAAAAAA.js": `import{x}from"./dep-BBBBBBBB.js";const d=["_next/static/chunks/lazy-CCCCCCCC.js"];const g="guess-DDDDDDDD.js";`,
  "/_next/static/chunks/dep-BBBBBBBB.js": `export const x=1;${MARKERS}`,
  "/_next/static/chunks/lazy-CCCCCCCC.js": "export{}",
};
const siteWith = (pages) => async (url) => {
  const path = new URL(url).pathname;
  return path in pages ? { status: 200, body: Buffer.from(pages[path]) } : { status: 404, body: Buffer.alloc(0) };
};

test("crawl follows every reference and separates missing guesses from missing files", async () => {
  const { files, missing, skipped } = await crawl(SITE, siteWith(PAGES));
  assert.deepEqual([...files.keys()].sort(), Object.keys(PAGES).sort());
  assert.deepEqual(missing, []);
  assert.deepEqual(skipped.sort(), ["/_next/static/chunks/guess-DDDDDDDD.js (404)", "/favicon.ico (404)"]);
});

test("crawl reports a hard reference that could not be downloaded", async () => {
  const pages = { ...PAGES };
  delete pages["/_next/static/chunks/lazy-CCCCCCCC.js"];
  const { missing } = await crawl(SITE, siteWith(pages));
  assert.deepEqual(missing, ["/_next/static/chunks/lazy-CCCCCCCC.js (404)"]);
});

test("writeSnapshot writes the files and a manifest with hashes and parts", async (t) => {
  const dir = join(tempDir(t), "snap");
  const result = await crawl(SITE, siteWith(PAGES));
  const manifest = await writeSnapshot(dir, SITE, result);
  assert.equal(readFileSync(join(dir, "index.html"), "utf8"), PAGES["/"]);
  assert.equal(manifest.files.length, 6);
  const page = manifest.files.find((f) => f.path === "/");
  assert.equal(page.sha256, createHash("sha256").update(PAGES["/"]).digest("hex"));
  assert.equal(manifest.parts.engine, "/_next/static/chunks/dep-BBBBBBBB.js");
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).skipped, result.skipped);
});

test("writeSnapshot writes nothing when a part is missing", async (t) => {
  const dir = join(tempDir(t), "snap");
  const pages = { ...PAGES, "/_next/static/chunks/dep-BBBBBBBB.js": "export const x=1;" };
  const result = await crawl(SITE, siteWith(pages));
  await assert.rejects(writeSnapshot(dir, SITE, result), /Expected one module containing/);
  assert.equal(existsSync(dir), false);
});

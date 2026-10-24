import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createCrawler } from "../lib/pwa/crawl.mjs";
import { tempDir } from "./helpers.mjs";

// A stand-in site and clock: each request is logged with the time it started.
function fakeSite(pages) {
  let time = 0;
  const requests = [];
  return {
    requests,
    now: () => time,
    sleep: async (ms) => void (time += ms),
    fetch: async (url) => {
      requests.push({ url, at: time });
      time += 300;
      return url in pages ? { status: 200, text: pages[url] } : { status: 404, text: "Page Not Found" };
    },
  };
}

test("pages are downloaded once and then read from the cache, also by a later run", async (t) => {
  const cacheDir = join(tempDir(t), "cache");
  const site = fakeSite({ "https://pwa.test/a": "page a" });
  const crawler = createCrawler({ cacheDir, ...site });
  assert.equal(await crawler.get("https://pwa.test/a"), "page a");
  assert.equal(await crawler.get("https://pwa.test/a"), "page a");
  assert.equal(await createCrawler({ cacheDir, ...site }).get("https://pwa.test/a"), "page a");
  assert.equal(site.requests.length, 1);
  assert.equal(crawler.downloads, 1);
});

test("requests start at least a second apart", async (t) => {
  const site = fakeSite({ "https://pwa.test/a": "a", "https://pwa.test/b": "b", "https://pwa.test/c": "c" });
  const crawler = createCrawler({ cacheDir: tempDir(t), ...site });
  for (const page of ["a", "b", "c"]) await crawler.get(`https://pwa.test/${page}`);
  assert.deepEqual(site.requests.map((r) => r.at), [0, 1000, 2000]);
});

test("fresh downloads a cached page again, once per run", async (t) => {
  const cacheDir = tempDir(t);
  const site = fakeSite({ "https://pwa.test/a": "old" });
  await createCrawler({ cacheDir, ...site }).get("https://pwa.test/a");
  site.fetch = async (url) => (site.requests.push({ url }), { status: 200, text: "new" });
  const crawler = createCrawler({ cacheDir, ...site });
  assert.equal(await crawler.get("https://pwa.test/a", { fresh: true }), "new");
  assert.equal(await crawler.get("https://pwa.test/a", { fresh: true }), "new");
  assert.equal(site.requests.length, 2);
});

test("offline reads the cache and fails on a page it doesn't have", async (t) => {
  const cacheDir = tempDir(t);
  const site = fakeSite({ "https://pwa.test/a": "a" });
  await createCrawler({ cacheDir, ...site }).get("https://pwa.test/a");
  const offline = createCrawler({ cacheDir, offline: true, ...site });
  assert.equal(await offline.get("https://pwa.test/a"), "a");
  await assert.rejects(offline.get("https://pwa.test/b"), /https:\/\/pwa.test\/b is not in the cache/);
  assert.equal(site.requests.length, 1);
});

test("an answer other than 200 rejects with its status and isn't cached", async (t) => {
  const site = fakeSite({});
  const crawler = createCrawler({ cacheDir: tempDir(t), ...site });
  await assert.rejects(crawler.get("https://pwa.test/missing"), (error) => error.status === 404 && /answered 404/.test(error.message));
  await assert.rejects(crawler.get("https://pwa.test/missing"), { status: 404 });
  assert.equal(site.requests.length, 2);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createFetcher } from "../tools/spot/fetcher.mjs";
import { tempDir } from "./helpers.mjs";

const fakeFetch = (calls) => async (url) => { calls.push(url); return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(`body of ${url}`) }; };

test("without consent nothing is downloaded; what is missing is listed", async (t) => {
  const calls = [];
  const fetcher = createFetcher({ cacheDir: tempDir(t), download: false, fetch: fakeFetch(calls) });
  fetcher.need("https://a.test/1", "Terrain Tiles");
  fetcher.need("https://a.test/2", "Terrain Tiles");
  assert.deepEqual(fetcher.missing(), [{ source: "Terrain Tiles", count: 2 }]);
  await assert.rejects(() => fetcher.get("https://a.test/1"), /not downloaded yet/);
  assert.deepEqual(calls, []);
});

test("with consent each URL is downloaded once, then read from the cache", async (t) => {
  const calls = [], cacheDir = tempDir(t);
  const fetcher = createFetcher({ cacheDir, download: true, fetch: fakeFetch(calls) });
  assert.equal((await fetcher.get("https://a.test/1")).toString(), "body of https://a.test/1");
  await fetcher.get("https://a.test/1");
  assert.equal(calls.length, 1);
  const offline = createFetcher({ cacheDir, download: false, fetch: fakeFetch(calls) });
  offline.need("https://a.test/1", "x");
  assert.deepEqual(offline.missing(), []);
  assert.equal((await offline.get("https://a.test/1")).toString(), "body of https://a.test/1");
});

test("a failed download names its source", async (t) => {
  const fetcher = createFetcher({ cacheDir: tempDir(t), download: true, fetch: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(() => fetcher.get("https://a.test/1", { source: "EOX" }), /EOX: https:\/\/a.test\/1 answered 503/);
});

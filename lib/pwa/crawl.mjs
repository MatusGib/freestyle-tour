// Fetches PWA pages one at a time, at least gapMs apart, and keeps each one in
// cacheDir. Later runs, and a crawl that stopped halfway, read the cache
// instead of downloading again.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const USER_AGENT = "freestyle-tour-data/1.0 (private, non-commercial)";

export async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  return { status: res.status, text: await res.text() };
}

const fileFor = (url) => `${createHash("sha256").update(url).digest("hex").slice(0, 32)}.html`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// get(url, { fresh }) resolves to the page's text. fresh downloads it again,
// once per run, even when it is cached. offline never downloads. A status
// other than 200 rejects with an error carrying that status.
export function createCrawler({ cacheDir, offline = false, fetch = fetchText, gapMs = 1000, now = Date.now, sleep = pause }) {
  let last = -Infinity;
  let downloads = 0;
  const fetched = new Set();
  return {
    get downloads() {
      return downloads;
    },
    async get(url, { fresh = false } = {}) {
      const file = join(cacheDir, fileFor(url));
      if ((!fresh || fetched.has(url)) && existsSync(file)) return readFileSync(file, "utf8");
      if (offline) throw new Error(`${url} is not in the cache, and --offline never downloads`);
      const wait = last + gapMs - now();
      if (wait > 0) await sleep(wait);
      last = now();
      const { status, text } = await fetch(url);
      downloads += 1;
      if (status !== 200) throw Object.assign(new Error(`${url} answered ${status}`), { status });
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(file, text);
      fetched.add(url);
      return text;
    },
  };
}

// Downloads for the spot tool, through a cache (cache/spots/<id>/), and never
// without consent: a run without --download only lists what it would fetch.
// A request is identified by its URL and, for POSTs, its body.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const USER_AGENT = "freestyle-tour-spots/1.0 (private, non-commercial)";

export function createFetcher({ cacheDir, download = false, fetch = globalThis.fetch }) {
  const fileFor = (url, body = "") => join(cacheDir, `${createHash("sha256").update(url + body).digest("hex").slice(0, 32)}.bin`);
  const needed = new Map(); // source → count of uncached requests
  return {
    // Notes a request the run will make, so missing() can list it first.
    need(url, source, body) {
      if (!existsSync(fileFor(url, body))) needed.set(source, (needed.get(source) ?? 0) + 1);
    },
    missing: () => [...needed].map(([source, count]) => ({ source, count })),
    async get(url, { source = "download", body } = {}) {
      const file = fileFor(url, body);
      if (existsSync(file)) return readFileSync(file);
      if (!download) throw new Error(`${source}: ${url} is not downloaded yet; run again with --download`);
      const res = await fetch(url, body ? { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT } } : { headers: { "user-agent": USER_AGENT } });
      if (!res.ok) throw new Error(`${source}: ${url} answered ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(file, bytes);
      return bytes;
    },
  };
}

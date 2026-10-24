// Downloads a dated snapshot of the live game into vendor/<name>/. Snapshots
// are never committed.
//   npm run snapshot -- [--site https://fristajlo.ws] [--name 2026-10-24]
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { fileFor, findParts, reindexSnapshot } from "../lib/snapshot.mjs";
import { extractRefs } from "./refs.mjs";

const followsRefs = (path) => path === "/" || /\.(m?js|css)$/.test(path);

// fetchFile(url) resolves to { status, body: Buffer }. Returns the downloaded
// files, the hard references that failed (missing) and the soft ones (skipped).
export async function crawl(site, fetchFile) {
  const files = new Map();
  const failed = new Map();
  const hard = new Set(["/"]);
  const queue = ["/", "/favicon.ico"];
  const seen = new Set(queue);
  while (queue.length) {
    const path = queue.shift();
    const res = await fetchFile(new URL(path, site).href);
    if (res.status !== 200) {
      failed.set(path, res.status);
      continue;
    }
    files.set(path, res.body);
    if (!followsRefs(path)) continue;
    for (const ref of extractRefs(path, res.body.toString("utf8"))) {
      if (ref.hard) hard.add(ref.path);
      if (!seen.has(ref.path)) {
        seen.add(ref.path);
        queue.push(ref.path);
      }
    }
  }
  const list = (wantHard) => [...failed].filter(([path]) => hard.has(path) === wantHard).map(([path, status]) => `${path} (${status})`);
  return { files, missing: list(true), skipped: list(false) };
}

// Writes the crawled files and manifest.json into dir. Finds the parts first,
// so nothing is written when the game's layout has changed.
export async function writeSnapshot(dir, site, { files, skipped }) {
  const modules = new Map([...files].filter(([path]) => /\.m?js$/.test(path)).map(([path, body]) => [path, body.toString("utf8")]));
  const parts = findParts(modules);
  const entries = [];
  for (const [path, body] of files) {
    const out = join(dir, fileFor(path));
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, body);
    entries.push({ path, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = { source: site, fetchedAt: new Date().toISOString(), parts, files: entries, skipped };
  await writeFile(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function fetchFile(url) {
  const res = await fetch(url);
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
}

async function main() {
  const { values } = parseArgs({
    options: {
      site: { type: "string", default: "https://fristajlo.ws" },
      name: { type: "string", default: new Date().toISOString().slice(0, 10) },
      reindex: { type: "string" },
    },
  });
  const root = fileURLToPath(new URL("..", import.meta.url));
  if (values.reindex) {
    const manifest = reindexSnapshot(join(root, "vendor", values.reindex));
    console.log(`Reindexed vendor/${values.reindex}`);
    for (const [part, path] of Object.entries(manifest.parts)) console.log(`  ${part.padEnd(8)} ${path}`);
    return;
  }
  const dir = join(root, "vendor", values.name);
  if (existsSync(dir)) throw new Error(`vendor/${values.name} already exists; choose another --name`);
  const result = await crawl(values.site, fetchFile);
  if (result.missing.length) throw new Error(`Could not download: ${result.missing.join(", ")}`);
  const manifest = await writeSnapshot(dir, values.site, result);
  await writeFile(join(root, "vendor", "current.json"), `${JSON.stringify({ snapshot: values.name })}\n`);
  console.log(`Saved ${manifest.files.length} files to vendor/${values.name}`);
  for (const [part, path] of Object.entries(manifest.parts)) console.log(`  ${part.padEnd(8)} ${path}`);
  if (manifest.skipped.length) console.log(`Not on the site (guessed names, ignored): ${manifest.skipped.join(", ")}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

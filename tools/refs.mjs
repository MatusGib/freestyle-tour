// Finds the files a page, module or stylesheet refers to, so the snapshot tool
// can follow them. Hard references must exist on the site. Soft ones are
// guesses from names in module text and may legitimately be missing.
const ORIGIN = "http://snapshot.local";

// Resolves ref against the file at fromPath; null if it points to another host.
export function resolvePath(fromPath, ref) {
  const url = new URL(ref, ORIGIN + fromPath);
  return url.origin === ORIGIN ? url.pathname : null;
}

function kindOf(path) {
  if (path === "/" || path.endsWith(".html")) return "html";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "js";
  if (path.endsWith(".css")) return "css";
  return "other";
}

// Returns [{ path, hard }] for the references in text, the content of fromPath.
export function extractRefs(fromPath, text) {
  const found = new Map();
  const add = (ref, hard) => {
    if (!ref || ref.startsWith("//") || /^[a-z]+:/i.test(ref)) return;
    const path = resolvePath(fromPath, ref);
    if (!path || path === "/") return;
    found.set(path, found.get(path) || hard);
  };
  const kind = kindOf(fromPath);
  if (kind === "html") {
    for (const m of text.matchAll(/\s(?:src|href)="([^"]+)"/g)) add(m[1], true);
  }
  if (kind === "js") {
    for (const m of text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'`](\.{1,2}\/[^"'`]+)["'`]/g)) add(m[1], true);
    for (const m of text.matchAll(/["'`](_next\/static\/[^"'`]+)["'`]/g)) add(`/${m[1]}`, true);
    for (const m of text.matchAll(/[\w-]+-[\w-]{8}\.js\b/g)) add(`./${m[0]}`, false);
    for (const m of text.matchAll(/["'`](\/[\w./-]+\.(?:svg|png|jpe?g|webp|ico|ttf|woff2?|json|webmanifest))["'`]/g)) add(m[1], false);
  }
  if (kind === "css") {
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) add(m[1], true);
  }
  return [...found].map(([path, hard]) => ({ path, hard }));
}

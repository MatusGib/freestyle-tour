// Serve-time patches: mods can rewrite a game module's text before it is
// served. A rule targets a module by part or by a marker text only that module
// contains, and states how many matches it expects, so a game update that
// breaks a patch fails loudly instead of silently doing nothing.
//   { part: "engine" } or { marker: "text" }, plus
//   { find: "text" or /pattern/g, replace: "text", expect: 1 }
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileFor } from "../lib/snapshot.mjs";

export async function loadPatches(modsDir, modNames) {
  const rules = [];
  for (const mod of modNames) {
    const file = join(modsDir, mod, "patches.mjs");
    if (!existsSync(file)) continue;
    const { patches } = await import(pathToFileURL(file).href);
    for (const rule of patches) {
      if (!rule.part === !rule.marker) throw new Error(`Patch from mod "${mod}" needs exactly one of part or marker`);
      if (!(typeof rule.find === "string" || rule.find?.global) || !Number.isInteger(rule.expect)) {
        throw new Error(`Patch from mod "${mod}" needs find (a string or a global pattern) and an integer expect`);
      }
      rules.push({ ...rule, mod });
    }
  }
  return rules;
}

const describe = (value) => (typeof value === "string" ? JSON.stringify(value) : String(value));
const countMatches = (text, find) => (typeof find === "string" ? text.split(find).length - 1 : [...text.matchAll(find)].length);
const targets = (rule, path, text, parts) => (rule.part ? parts[rule.part] === path : text.includes(rule.marker));

// Applies every rule that targets this module. Throws on a wrong match count.
export function applyPatches(path, text, parts, rules) {
  let out = text;
  for (const rule of rules) {
    if (!targets(rule, path, text, parts)) continue;
    const count = countMatches(out, rule.find);
    if (count !== rule.expect) {
      throw new Error(`Patch from mod "${rule.mod}" expected ${rule.expect} match(es) of ${describe(rule.find)} in ${path}, found ${count}`);
    }
    out = out.replaceAll(rule.find, rule.replace);
  }
  return out;
}

// Patches a whole snapshot at startup. Returns a Map of URL path to { text }
// for patched modules or { error } for modules a patch failed on.
export function patchSnapshot(snapshot, rules, log = console.error) {
  const result = new Map();
  if (!rules.length) return result;
  const modules = snapshot.manifest.files.map((f) => f.path).filter((path) => /\.m?js$/.test(path));
  const texts = new Map(modules.map((path) => [path, readFileSync(join(snapshot.dir, fileFor(path)), "utf8")]));
  for (const rule of rules) {
    const hits = modules.filter((path) => targets(rule, path, texts.get(path), snapshot.manifest.parts));
    if (hits.length !== 1) log(`Patch from mod "${rule.mod}" targets ${hits.length} modules (${describe(rule.part ?? rule.marker)}); it needs exactly one`);
  }
  for (const path of modules) {
    const text = texts.get(path);
    try {
      const patched = applyPatches(path, text, snapshot.manifest.parts, rules);
      if (patched !== text) result.set(path, { text: patched });
    } catch (error) {
      log(error.message);
      result.set(path, { error: error.message });
    }
  }
  return result;
}

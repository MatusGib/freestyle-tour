// Mod loader, injected into the page by the local server right after <head>.
// It imports the game's own modules by URL (the browser shares the instances
// the game uses), finds the functions mods need, then runs each enabled mod.
import { onStep, whenGame } from "./lib/game.js";
import { identify } from "./lib/identify.js";

const config = await (await fetch("/__mods/config.json")).json();
const parts = {};
for (const [part, url] of Object.entries(config.parts)) parts[part] = await import(url);
const engine = identify(parts);

const stack = document.createElement("div");
stack.style.cssText = "position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none";
document.body.append(stack);

const loaded = [];
for (const name of config.mods) {
  const log = (...args) => console.log(`[mod ${name}]`, ...args);
  try {
    const { default: mod } = await import(`/__mods/${name}/index.js`);
    await mod.setup({
      snapshot: config.snapshot,
      mods: config.mods,
      engine,
      parts,
      threeUrl: config.threeUrl,
      log,
      whenGame,
      onStep: async (fn) => onStep(await whenGame(), fn),
      overlay(id) {
        const el = document.createElement("div");
        el.dataset.mod = id;
        stack.append(el);
        return el;
      },
    });
    loaded.push(name);
  } catch (error) {
    console.error(`[mod ${name}] failed during setup and was skipped`, error);
  }
}
console.log(`[mods] ${loaded.length} of ${config.mods.length} loaded${loaded.length ? `: ${loaded.join(", ")}` : ""}`);
window.__freestyleMods = { config, engine, parts, loaded };

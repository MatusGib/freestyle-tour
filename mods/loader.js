// Mod loader, injected into the page by the local server right after <head>.
// It imports the game's own modules by URL (the browser shares the instances
// the game uses), finds the functions mods need, then runs each enabled mod.
import { onStep, whenGame } from "./lib/game.js";
import { identify } from "./lib/identify.js";
import { el, ensureStyles, icon } from "./lib/ui.js";

const config = await (await fetch("/__mods/config.json")).json();
const parts = {};
for (const [part, url] of Object.entries(config.parts)) parts[part] = await import(url);
const engine = identify(parts);

// The mods' chips sit in a tray under the game's wordmark, clear of its menu.
// On a phone the menu fills the screen, so the tray folds into one chip.
ensureStyles();
const stack = el("div", { className: "ft-tray" });
const toggle = el("button", { type: "button", className: "ft-chip ft-tray-toggle", ariaExpanded: "false" }, icon("sliders", 16), "Mods");
toggle.addEventListener("click", () => toggle.ariaExpanded = String(stack.classList.toggle("ft-open")));
stack.append(toggle);
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

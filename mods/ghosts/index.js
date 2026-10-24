// Sail against a ghost of the best heat stored this week. The ghost replays
// that heat's recording with the game's own engine, one step for every step you
// sail, and is drawn with the game's 1v1 opponent display. It never affects
// your physics or score.
import { opponentOwner } from "../lib/opponent.js";
import { createRunner } from "../lib/replay.js";
import { ghostLabel, ghostSample, mayShowGhost, pickGhost, stepOf } from "./ghost.js";

const STORAGE_KEY = "freestyle-tour.ghosts";

const readEnabled = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};
const writeEnabled = (on) => {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
};
const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
};

export default {
  name: "ghosts",
  setup({ engine, overlay, whenGame, onStep, log }) {
    let enabled = readEnabled();
    let game = null;
    let session = null;
    let ghost = null;

    const box = overlay("ghosts");
    box.style.cssText = "font:12px/1.4 system-ui,sans-serif;background:rgba(10,40,40,.85);color:#e8f4f2;padding:4px 10px;border-radius:8px;pointer-events:auto";
    const checkbox = Object.assign(document.createElement("input"), { type: "checkbox", checked: enabled });
    const label = document.createElement("label");
    const status = document.createElement("span");
    label.append(checkbox, " Ghost");
    box.append(label, status);

    const stop = () => {
      if (ghost) game.clearOpponent();
      ghost = null;
    };
    checkbox.addEventListener("change", () => {
      enabled = checkbox.checked;
      writeEnabled(enabled);
      if (!enabled) {
        stop();
        status.textContent = "";
      }
    });

    async function start(state) {
      const heats = await getJson(`/api/local/heats?week=${engine.weekStart(Date.now())}`);
      const pick = pickGhost(heats);
      if (session !== state || !enabled || opponentOwner()) return;
      if (!pick) {
        status.textContent = " · No ghost yet this week";
        return;
      }
      const heat = await getJson(`/api/local/heats/${encodeURIComponent(pick.heatId)}`);
      if (session !== state || !enabled || opponentOwner()) return;
      const runner = createRunner(engine, { conditions: heat.conditions, replay: heat.replay });
      runner.seek(stepOf(state));
      const appearance = Object.keys(heat.appearance).length ? heat.appearance : undefined;
      game.showOpponent(ghostLabel(heat), () => Date.now(), appearance);
      ghost = runner;
      status.textContent = ` · ${heat.nickname} · ${heat.score.toFixed(2)}`;
      log(`racing ${ghostLabel(heat)}`);
    }

    whenGame().then((found) => {
      game = found;
      onStep((state) => {
        if (state !== session) {
          session = state;
          stop();
          status.textContent = "";
          if (enabled && mayShowGhost(state, game, opponentOwner())) start(state).catch((error) => log("could not load the ghost", error));
        }
        if (!ghost) return;
        ghost.advance(1);
        game.receiveOpponent(ghostSample(engine.riderPose(ghost.state), performance.now()));
        if (ghost.done) stop();
      });
    });
  },
};

// Sail a solo heat against an AI rider. Pick an event and a rider; the local
// server sails that rider's heat in the event venue's conditions when the
// venues mod is enabled (about 20 seconds), and your next solo heat shows them
// as the opponent. At the end, both totals and the winner. The AI's heat never
// affects your physics or score.
import { claimOpponent, releaseOpponent } from "../lib/opponent.js";
import { createRunner } from "../lib/replay.js";
import { clearPlannedHeat, rememberPlannedHeat, windText } from "../venues/venue.js";
import { aiSample, isSoloHeatStart, isStale, nextHeatText, planningText, resultText, riderLine } from "./challenge.js";

const PANEL_STYLE =
  "position:fixed;left:12px;bottom:12px;z-index:100000;width:360px;max-height:75vh;overflow:auto;" +
  "font:12px/1.5 system-ui,sans-serif;background:rgba(10,40,40,.94);color:#e8f4f2;padding:10px 12px;border-radius:10px";

const getJson = async (url, init) => {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${url} answered ${res.status}`);
  return body;
};
const postJson = (url, body) => getJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null));
  return node;
};

export default {
  name: "challenge",
  setup({ engine, overlay, whenGame, onStep, log, mods = [] }) {
    const venuesEnabled = mods.includes("venues");
    const holder = overlay("challenge");
    holder.style.cssText = "font:12px/1.4 system-ui,sans-serif;background:rgba(10,40,40,.85);color:#e8f4f2;padding:4px 10px;border-radius:8px;pointer-events:auto";
    const status = el("span");
    holder.append(el("button", { type: "button", textContent: "Challenge", onclick: () => openPanel().catch((e) => log("could not open the challenge panel", e)) }), status);
    const panel = el("div", { hidden: true });
    panel.style.cssText = PANEL_STYLE;
    document.body.append(panel);

    let game = null;
    let armed = null; // the planned AI heat for the next solo heat
    let planning = null; // { rider, pseudonym, event } while the server sails
    let session = null; // the game state of the current session
    let ai = null; // the runner replaying the AI heat in this session
    const say = (text) => void (status.textContent = text ? ` ${text}` : "");

    function arm(heat) {
      armed = heat;
      if (venuesEnabled) rememberPlannedHeat(heat);
      claimOpponent("challenge");
      say(nextHeatText(heat));
    }
    function disarm() {
      armed = null;
      if (venuesEnabled) clearPlannedHeat();
      releaseOpponent("challenge");
    }
    async function plan(rider, pseudonym, event) {
      planning = { rider, pseudonym, event };
      say(planningText(pseudonym));
      try {
        arm(await postJson("/api/local/ai-heats", { rider, event }));
      } catch (error) {
        log("could not plan the heat", error);
        say("Couldn't plan the heat");
        status.append(" ", el("button", { type: "button", textContent: "Retry", onclick: () => plan(rider, pseudonym, event) }));
      } finally {
        planning = null;
      }
    }

    async function openPanel() {
      const seasons = await getJson("/api/local/tour/seasons");
      const seasonSelect = el("select", {}, ...seasons.map((s) => el("option", { value: s.season, textContent: s.season })));
      const eventSelect = el("select");
      const riders = el("div");
      const showEvent = async () => {
        const event = await getJson(`/api/local/tour/events/${eventSelect.value}`);
        riders.replaceChildren(
          event.venue && el("img", {
            src: `/__mods/venues/assets/${event.venue.id}.svg`,
            alt: `${event.venue.name} shoreline illustration`,
            style: "display:block;width:100%;height:100px;object-fit:cover;margin:4px 0 8px;border-radius:8px",
          }),
          el("p", {
            textContent: event.venue
              ? `${event.venue.name} · typical profile: ${windText(event.venue.gameConditions)}`
              : `${event.location ?? "Unknown location"} · using this week's conditions`,
            style: "margin:4px 0 10px;opacity:.82",
          }),
          ...Object.entries(event.divisions).flatMap(([division, list]) => [
            el("strong", { textContent: division === "men" ? "Men" : "Women" }),
            el("ol", { style: "list-style:none;padding:0;margin:2px 0 8px" }, ...list.map((r) =>
              el("li", {}, `${riderLine(r)} `, el("button", { type: "button", textContent: "Challenge", onclick: () => {
                panel.hidden = true;
                plan(r.rider, r.pseudonym, event.id);
              } })))),
          ]),
        );
      };
      const showSeason = () => {
        const season = seasons.find((s) => String(s.season) === seasonSelect.value);
        eventSelect.replaceChildren(...season.events.map((e) => el("option", { value: e.id, textContent: e.name })));
        return showEvent();
      };
      seasonSelect.onchange = () => showSeason().catch((e) => log("could not list the event", e));
      eventSelect.onchange = () => showEvent().catch((e) => log("could not list the event", e));
      const cancel = armed && el("p", {}, `${nextHeatText(armed)} `, el("button", { type: "button", textContent: "Cancel", onclick: () => { disarm(); say(""); panel.hidden = true; } }));
      panel.replaceChildren(
        ...[
          el("strong", { textContent: "Challenge " }),
          el("button", { type: "button", textContent: "Close", onclick: () => void (panel.hidden = true) }),
          cancel,
          el("p", {}, seasonSelect, " ", eventSelect),
          riders,
        ].filter(Boolean),
      );
      panel.hidden = false;
      await showSeason();
    }

    whenGame().then((found) => {
      game = found;
      onStep((state) => {
        if (state !== session) {
          session = state;
          if (ai) game.clearOpponent();
          ai = null;
          if (isSoloHeatStart(state, game)) {
            if (armed && isStale(armed, engine.weekStart(Date.now()))) {
              const { rider, pseudonym, event } = armed;
              disarm();
              plan(rider, pseudonym, event);
            } else if (armed) {
              ai = createRunner(engine, { conditions: armed.conditions, replay: armed.replay });
              game.showOpponent(armed.pseudonym, () => Date.now());
              say(`Racing ${armed.pseudonym}`);
              log(`racing ${armed.pseudonym}, target ${armed.target}`);
            } else if (planning) say(`${planningText(planning.pseudonym)} This heat has no opponent.`);
          }
        }
        if (!ai || ai.done) return;
        ai.advance(1);
        game.receiveOpponent(aiSample(engine.riderPose(ai.state), performance.now()));
      });
      // The game stops stepping once the heat ends, so the step hook never sees
      // the finished state: check for the end on a timer instead.
      setInterval(() => {
        if (!ai || !armed || !session.heat.done) return;
        say(resultText(engine.heatTotals(session.heat).total, armed));
        game.clearOpponent();
        ai = null;
        disarm();
      }, 250);
    });
  },
};

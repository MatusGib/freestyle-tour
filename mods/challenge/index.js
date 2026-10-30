// Sail a solo heat against an AI rider. Pick an event and a rider; the local
// server sails that rider's heat in the event venue's conditions when the
// venues mod is enabled (about 20 seconds), and your next solo heat shows them
// as the opponent. At the end, both totals and the winner. The AI's heat never
// affects your physics or score.
import { claimOpponent, releaseOpponent } from "../lib/opponent.js";
import { createRunner } from "../lib/replay.js";
import { createPopover, el } from "../lib/ui.js";
import { clearPlannedHeat, rememberPlannedHeat, windText } from "../venues/venue.js";
import { aiSample, isSoloHeatStart, isStale, nextHeatText, planningText, resultText, riderLine } from "./challenge.js";

const getJson = async (url, init) => {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${url} answered ${res.status}`);
  return body;
};
const postJson = (url, body) => getJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default {
  name: "challenge",
  setup({ engine, overlay, whenGame, onStep, log, mods = [] }) {
    const venuesEnabled = mods.includes("venues");
    const holder = overlay("challenge");
    holder.className = "ft-slot";
    const status = el("span", { className: "ft-chip-value", textContent: "Race a tour rider" });
    const chip = el("button", { type: "button", className: "ft-chip", ariaHasPopup: "dialog", onclick: () => openPanel().catch((e) => log("could not open the challenge panel", e)) },
      el("span", { className: "ft-chip-text" }, el("span", { className: "ft-chip-label", textContent: "Challenge" }), status));
    const retry = el("button", { type: "button", className: "ft-chip", textContent: "Retry", hidden: true });
    holder.append(chip, retry);
    const panel = createPopover("Race a tour rider", "challenge");

    let game = null;
    let armed = null; // the planned AI heat for the next solo heat
    let planning = null; // { rider, pseudonym, event } while the server sails
    let session = null; // the game state of the current session
    let ai = null; // the runner replaying the AI heat in this session
    const say = (text) => {
      status.textContent = text || "Race a tour rider";
      chip.title = text || "";
      retry.hidden = true;
    };

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
        say(`Couldn't plan ${pseudonym}'s heat`);
        retry.onclick = () => plan(rider, pseudonym, event);
        retry.hidden = false;
      } finally {
        planning = null;
      }
    }

    // The panel: this week's planned heat if any, then a season and an event,
    // the event's venue, and its riders by division, each with a Race button.
    async function openPanel() {
      if (panel.open) return panel.hide();
      panel.body.replaceChildren(el("p", { className: "ft-muted", textContent: "Loading the tour…" }));
      panel.show(chip);
      let seasons;
      try {
        seasons = await getJson("/api/local/tour/seasons");
      } catch (error) {
        panel.body.replaceChildren(el("p", { className: "ft-muted", textContent: `Couldn't load the tour: ${error.message}` }));
        throw error;
      }
      const seasonSelect = el("select", {}, ...seasons.map((s) => el("option", { value: s.season, textContent: s.season })));
      const eventSelect = el("select");
      const riders = el("div", { ariaLive: "polite" });
      const showEvent = async () => {
        riders.replaceChildren(el("p", { className: "ft-muted", textContent: "Loading the riders…" }));
        const event = await getJson(`/api/local/tour/events/${eventSelect.value}`);
        riders.replaceChildren(
          el("div", { className: "ft-venue" },
            event.venue && el("img", { src: `/__mods/venues/assets/${event.venue.id}.svg`, alt: "", width: 84, height: 52 }),
            el("div", {},
              el("strong", { textContent: event.venue?.name ?? event.location ?? "Venue unknown" }),
              el("div", { className: "ft-muted", textContent: event.venue ? `Typical: ${windText(event.venue.gameConditions)}` : "Sailed in this week's wind" }),
            ),
          ),
          ...Object.entries(event.divisions).flatMap(([division, list]) => [
            el("h3", { className: "ft-division", textContent: division === "men" ? "Men" : "Women" }),
            el("ol", { className: "ft-riders" }, ...list.map((r) => el("li", { className: "ft-rider" },
              el("span", { className: "ft-rider-place", textContent: `${r.place}.` }),
              el("span", { textContent: r.pseudonym }),
              el("span", { className: "ft-rider-score", textContent: r.average.toFixed(1), title: "Average heat score going into the event" }),
              el("button", { type: "button", className: "ft-button ft-button-small", textContent: "Race", ariaLabel: `Race ${r.pseudonym}`, onclick: () => {
                panel.hide();
                plan(r.rider, r.pseudonym, event.id);
              } }),
            ))),
          ]),
        );
      };
      const failed = (error) => {
        log("could not list the event", error);
        riders.replaceChildren(el("p", { className: "ft-muted", textContent: `Couldn't load this event: ${error.message}` }));
      };
      const showSeason = () => {
        const season = seasons.find((s) => String(s.season) === seasonSelect.value);
        eventSelect.replaceChildren(...season.events.map((e) => el("option", { value: e.id, textContent: e.name })));
        return showEvent();
      };
      seasonSelect.onchange = () => showSeason().catch(failed);
      eventSelect.onchange = () => showEvent().catch(failed);
      const planned = armed && el("div", { className: "ft-banner" },
        el("span", { textContent: nextHeatText(armed) }),
        el("button", { type: "button", className: "ft-button ft-button-small", textContent: "Cancel", onclick: () => { disarm(); say(""); panel.hide(); } }),
      );
      panel.body.replaceChildren(
        el("p", { className: "ft-sub", textContent: "Pick an event and a rider. Their heat is sailed for you (about 20 seconds); your next solo heat is against them." }),
        ...(planned ? [planned] : []),
        el("div", { className: "ft-fields" },
          el("label", { className: "ft-field" }, "Season", seasonSelect),
          el("label", { className: "ft-field" }, "Event", eventSelect),
        ),
        riders,
      );
      seasonSelect.focus();
      await showSeason().catch(failed);
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

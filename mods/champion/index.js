// The Champion's challenge: a button in the game's main menu that offers, each
// week, one of Lennart Neubauer's recent wins. Pressing it opens a card with
// the event's story, its podium and the prize; its "Race" button starts the
// game's own 1v1 heat against him at once (the local server sails his heat
// with the AI riders, at his best, ahead of time). Beating him wins the Red
// Bull helmet, with a congratulations screen.
import { SEEN_KEY, TITLE, bestText, failedText, heatText, menuLine, newWin, prizeDue, raceText, readyText, winText } from "./champion.js";
import { HELMET, WON_KEY, drawHelmetPicture } from "./helmet.js";
import { setWind } from "./wind.js";
import { ensureStyles } from "../lib/ui.js";

const PLAYER_KEY = "fristajlo-player-v3"; // the game's own record of your rider
const PRIMARY = "ft-button ft-button-primary";
const SECONDARY = "ft-button";
const TROPHY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: it lasts until the page reloads.
  }
};
const getJson = async (url, init) => {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${url} answered ${res.status}`);
  return body;
};
const postJson = (url, body = {}) => getJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// A card over the game, in the game's own look. A click outside it or Escape
// closes it, and focus goes back to where it was.
function dialog(children) {
  ensureStyles();
  const back = document.activeElement;
  const card = el("div", { className: "ft-card", role: "dialog", ariaModal: "true" }, children);
  const heading = card.querySelector("h2");
  if (heading) {
    heading.id = "ft-champion-title";
    card.setAttribute("aria-labelledby", heading.id);
  }
  const backdrop = el("div", { className: "ft-backdrop" }, [card]);
  backdrop.remove = function () {
    Element.prototype.remove.call(this);
    back?.focus?.();
  };
  backdrop.addEventListener("click", (event) => event.target === backdrop && backdrop.remove());
  backdrop.addEventListener("keydown", (event) => event.key === "Escape" && backdrop.remove());
  document.body.append(backdrop);
  card.querySelector("button")?.focus();
  return backdrop;
}
function helmetPicture() {
  const canvas = el("canvas", { width: 220, height: 160, style: "width:110px;height:80px;flex:none" });
  drawHelmetPicture(canvas);
  return canvas;
}
const buttons = (...list) => el("div", { className: "ft-actions" }, list);

// Puts the helmet on your rider through the local server's rider save, then
// lets the game pick it up: it reloads your rider when its window gets focus.
async function wearHelmet() {
  const profile = JSON.parse(read(PLAYER_KEY) ?? "null");
  if (!profile?.key) throw new Error("no rider in this browser");
  await postJson("/api/rider", { action: "save", playerKey: profile.key, appearance: { ...profile.appearance, helmet: HELMET } });
  window.dispatchEvent(new Event("focus"));
}

export default {
  name: "champion",
  setup({ whenGame, log }) {
    let info = null;
    let status = "";
    let busy = false;
    let watching = false;
    let statusLine = null; // the open card's status line, if any

    const button = Object.assign(document.createElement("button"), { type: "button", className: "lagoon-menu-button" });
    const line = document.createElement("span");
    button.innerHTML = TROPHY;
    button.append(` ${TITLE} `, line);

    function render() {
      line.textContent = status || (info ? menuLine(info) : "Loading this week's event…");
      if (statusLine) statusLine.textContent = status;
    }
    function setStatus(text) {
      status = text;
      render();
    }

    function congratulate() {
      write(SEEN_KEY, String(info.lastWin.at));
      const first = read(WON_KEY) !== "true";
      write(WON_KEY, "true");
      const wear = el("button", { type: "button", textContent: "Wear it now", className: PRIMARY });
      const close = el("button", { type: "button", textContent: "Close", className: SECONDARY });
      const box = dialog([
        el("h2", { textContent: "Congratulations!", className: "ft-title" }),
        el("p", { textContent: winText(info), style: "margin:6px 0 0" }),
        el("div", { className: "ft-prize" }, [
          helmetPicture(),
          el("p", { style: "margin:0", textContent: first ? "Your prize: the Red Bull helmet. It's in the look editor now, with the headwear." : "The Red Bull helmet is already yours." }),
        ]),
        buttons(wear, close),
      ]);
      close.onclick = () => box.remove();
      wear.onclick = async () => {
        wear.disabled = true;
        try {
          await wearHelmet();
          wear.textContent = "You're wearing it";
        } catch (error) {
          log("could not put the helmet on", error);
          wear.textContent = "Couldn't put it on: use the look editor";
        }
      };
    }

    // This week's info; congratulates you on a win you haven't seen yet, and
    // unlocks the prize in this browser if it was earned elsewhere.
    async function load() {
      info = await getJson("/api/local/weekly");
      // The game's own room wind passes his rooms through wind.js, the same
      // module (by URL) as this import.
      setWind(info.wind);
      if (newWin(info, read(SEEN_KEY))) congratulate();
      else if (prizeDue(info, read(WON_KEY))) write(WON_KEY, "true");
    }
    async function refresh() {
      await load();
      if (!busy) status = "";
      render();
    }

    // Opens his room in the local lobby, then has the game poll its lobby now
    // (it polls on pageshow) rather than within 10 seconds: the game starts the
    // heat itself, with its countdown.
    async function start() {
      const { name } = info.opponent;
      busy = true;
      setStatus(readyText(name));
      try {
        await postJson("/api/local/weekly/start");
        watching = true;
        setStatus("");
        window.dispatchEvent(new Event("pageshow"));
        return true;
      } catch (error) {
        log("could not get the champion ready", error);
        setStatus(failedText(name));
        return false;
      } finally {
        busy = false;
      }
    }

    function showCard() {
      const go = el("button", { type: "button", textContent: raceText(info.opponent.name), className: PRIMARY });
      const close = el("button", { type: "button", textContent: "Close", className: SECONDARY });
      statusLine = el("p", { className: "ft-muted", style: "margin:10px 0 0", textContent: status, ariaLive: "polite" });
      const box = dialog([
        el("h2", { textContent: info.event.name, className: "ft-title" }),
        el("p", { textContent: `${TITLE} · ${info.event.when} · ${info.event.place}`, className: "ft-sub", style: "margin:4px 0 14px" }),
        el("p", { textContent: info.story, style: "margin:0" }),
        el("h3", { textContent: "Podium" }),
        el("ol", {}, info.event.podium.map((name) => el("li", { textContent: name }))),
        el("div", { className: "ft-prize" }, [
          helmetPicture(),
          el("div", {}, [
            el("strong", { textContent: "Prize: the Red Bull helmet" }),
            el("div", { className: "ft-muted", textContent: read(WON_KEY) === "true" ? "Yours already: it's in the look editor." : `Beat ${info.opponent.name} to win it for your rider.` }),
          ]),
        ]),
        el("p", { className: "ft-muted", style: "margin:14px 0 0", textContent: heatText(info) }),
        el("p", { className: "ft-muted", style: "margin:4px 0 0", textContent: bestText(info) }),
        buttons(go, close),
        statusLine,
      ]);
      const closeCard = () => {
        box.remove();
        statusLine = null;
      };
      close.onclick = closeCard;
      box.addEventListener("click", (event) => event.target === box && (statusLine = null));
      go.onclick = async () => {
        if (busy) return;
        go.disabled = true;
        if (await start()) closeCard();
        else go.disabled = false;
      };
    }
    button.addEventListener("click", () => info && showCard());

    // The menu is drawn by the game and redrawn often: put the button back after
    // "1v1 Lobby" whenever it's missing, and refresh this week's info then. (If
    // a game update changes the menu, the button just doesn't appear.) It starts
    // once the game is running: an extra button in the page's first markup would
    // upset React taking the page over. The button is off whenever the game's
    // lobby button is (no rider yet). After a challenge starts, this week's info
    // is checked every few seconds, so a win is congratulated on the result
    // screen.
    whenGame().then(() => {
      setInterval(() => {
        const lobby = [...document.querySelectorAll("section.start-panel > button.lagoon-menu-button")].find((b) => b.textContent.includes("1v1 Lobby"));
        if (!lobby) return;
        button.disabled = lobby.disabled;
        if (button.previousElementSibling !== lobby) {
          lobby.after(button);
          refresh().catch((error) => {
            log("could not load this week's Champion's challenge", error);
            setStatus(error.message);
          });
        }
      }, 500);
      setInterval(() => {
        if (watching) load().catch((error) => log("could not check for a win", error));
      }, 3000);
    });
    render();
  },
};

// The Champion's challenge: a button in the game's main menu that offers, each
// week, one of Lennart Neubauer's recent wins. Pressing it opens a card with
// the event's story, its podium and the prize; its "Race" button starts the
// game's own 1v1 heat against him at once (the local server sails his heat
// with the AI riders, at his best, ahead of time). Beating him wins the Red
// Bull helmet, with a congratulations screen.
import { SEEN_KEY, TITLE, bestText, failedText, heatText, menuLine, newWin, prizeDue, raceText, readyText, winText } from "./champion.js";
import { HELMET, WON_KEY, drawHelmetPicture } from "./helmet.js";

const PLAYER_KEY = "fristajlo-player-v3"; // the game's own record of your rider
const TEAL = "#178b93";
const PRIMARY = `background:${TEAL};color:#fff;border:0;border-radius:10px;padding:10px 16px;font:600 15px system-ui,sans-serif;cursor:pointer`;
const SECONDARY = `background:transparent;color:${TEAL};border:1px solid ${TEAL};border-radius:10px;padding:10px 16px;font:600 15px system-ui,sans-serif;cursor:pointer`;
const LABEL = `margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${TEAL};font-weight:700`;
const MUTED = "color:#4a5d63;font-size:13px";
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

// A card over the game; a click outside it closes it.
function dialog(children) {
  const card = el("div", { role: "dialog", style: "box-sizing:border-box;background:#fbfaf6;color:#13262b;border-radius:16px;max-width:460px;width:100%;max-height:100%;overflow:auto;padding:20px 22px;box-shadow:0 18px 50px rgba(0,0,0,.35)" }, children);
  const backdrop = el("div", { style: "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,30,34,.55);font:15px/1.45 system-ui,sans-serif" }, [card]);
  backdrop.addEventListener("click", (event) => event.target === backdrop && backdrop.remove());
  document.body.append(backdrop);
  return backdrop;
}
function helmetPicture() {
  const canvas = el("canvas", { width: 220, height: 160, style: "width:110px;height:80px;flex:none" });
  drawHelmetPicture(canvas);
  return canvas;
}
const buttons = (...list) => el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:14px" }, list);

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
      const wear = el("button", { type: "button", textContent: "Wear it now", style: PRIMARY });
      const close = el("button", { type: "button", textContent: "Close", style: SECONDARY });
      const box = dialog([
        el("p", { textContent: "Congratulations!", style: LABEL }),
        el("h2", { textContent: winText(info), style: "margin:4px 0 12px;font-size:20px;line-height:1.3" }),
        el("div", { style: "display:flex;gap:12px;align-items:center;background:#eef6f6;border-radius:12px;padding:10px" }, [
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
      const go = el("button", { type: "button", textContent: raceText(info.opponent.name), style: PRIMARY });
      const close = el("button", { type: "button", textContent: "Close", style: SECONDARY });
      statusLine = el("p", { style: `margin:10px 0 0;${MUTED}`, textContent: status });
      const box = dialog([
        el("p", { textContent: TITLE, style: LABEL }),
        el("h2", { textContent: info.event.name, style: "margin:2px 0 0;font-size:22px;line-height:1.25" }),
        el("p", { textContent: `${info.event.when} · ${info.event.place}`, style: `margin:2px 0 12px;${MUTED}` }),
        el("p", { textContent: info.story, style: "margin:0 0 12px" }),
        el("p", { textContent: "Podium", style: LABEL }),
        el("ol", { style: "margin:4px 0 12px;padding-left:22px" }, info.event.podium.map((name) => el("li", { textContent: name }))),
        el("div", { style: "display:flex;gap:12px;align-items:center;background:#eef6f6;border-radius:12px;padding:10px;margin-bottom:12px" }, [
          helmetPicture(),
          el("div", {}, [
            el("strong", { textContent: "Prize: the Red Bull helmet" }),
            el("div", { style: MUTED, textContent: read(WON_KEY) === "true" ? "Yours already: it's in the look editor." : `Beat ${info.opponent.name} to win it for your rider.` }),
          ]),
        ]),
        el("p", { style: `margin:0;${MUTED}`, textContent: heatText(info) }),
        el("p", { style: `margin:4px 0 0;${MUTED}`, textContent: bestText(info) }),
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

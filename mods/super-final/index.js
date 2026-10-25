// The weekly super final: a "Super final" button in the game's main menu. Each
// week it offers one past PWA event's final against the event's winner. The
// local server gets the winner ready (their heat sailed by the AI riders) and
// challenges you in the game's own 1v1 lobby, so the heat is the game's real 1v1
// heat. Your first win switches on the game's hidden gear.
import { HIDDEN_GEAR, PRIZE_TEXT, doneText, failedText, menuLine, pickDivision, prizeDue, readyText } from "./super-final.js";

const DIVISION_KEY = "freestyle-tour.super-final-division";
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
    // Storage blocked: the choice lasts until the page reloads.
  }
};
const getJson = async (url, init) => {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${url} answered ${res.status}`);
  return body;
};
const postJson = (url, body) => getJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default {
  name: "super-final",
  setup({ whenGame, log }) {
    let info = null;
    let division = read(DIVISION_KEY) ?? "men";
    let status = "";
    let busy = false;

    const button = Object.assign(document.createElement("button"), { type: "button", className: "lagoon-menu-button" });
    const line = document.createElement("span");
    button.innerHTML = TROPHY;
    button.append(" Super final ", line);
    const switcher = document.createElement("div");
    switcher.style.cssText = "display:flex;gap:6px;justify-content:center;font:12px system-ui,sans-serif";

    function render() {
      line.textContent = status || (info ? menuLine(info, division) : "Loading this week's event…");
      // Sorted, so the switch reads Men | Women whatever order the data has.
      const names = info ? Object.keys(info.divisions).sort() : [];
      switcher.hidden = names.length < 2;
      switcher.replaceChildren(
        ...names.map((name) => Object.assign(document.createElement("button"), {
          type: "button",
          textContent: name === "men" ? "Men" : "Women",
          // The game dims disabled buttons, so the chosen division is in bold.
          disabled: busy,
          ariaPressed: String(name === division),
          style: name === division ? "font-weight:bold" : "",
          onclick: () => {
            division = name;
            write(DIVISION_KEY, name);
            status = "";
            render();
          },
        })),
      );
    }

    function unlockGear() {
      write(HIDDEN_GEAR.key, "true");
      window.dispatchEvent(new Event(HIDDEN_GEAR.event));
      status = PRIZE_TEXT;
      log(PRIZE_TEXT);
    }

    // Runs whenever the menu comes back, so the line shows this week's event
    // again after a heat, and a win from that heat unlocks the prize. The
    // "Unlocked" line stays until the button is pressed again.
    async function refresh() {
      info = await getJson("/api/local/weekly");
      division = pickDivision(info, division);
      if (!busy && status !== PRIZE_TEXT) status = "";
      if (prizeDue(info, read(HIDDEN_GEAR.key))) unlockGear();
      render();
    }

    async function start() {
      if (busy || !info) return;
      const { pseudonym } = info.divisions[division];
      busy = true;
      status = readyText(pseudonym);
      render();
      try {
        await postJson("/api/local/weekly/start", { division });
        status = doneText(pseudonym);
      } catch (error) {
        log("could not get the opponent ready", error);
        status = failedText(pseudonym);
      } finally {
        busy = false;
        render();
      }
    }
    button.addEventListener("click", () => void start());

    // The menu is drawn by the game and redrawn often: put the button back after
    // "1v1 Lobby" whenever it's missing, and refresh this week's info then. (If
    // a game update changes the menu, the button just doesn't appear.) It starts
    // once the game is running: an extra button in the page's first markup would
    // upset React taking the page over. The button is off whenever the game's
    // lobby button is (no rider yet).
    whenGame().then(() => {
      setInterval(() => {
        const lobby = [...document.querySelectorAll("section.start-panel > button.lagoon-menu-button")].find((b) => b.textContent.includes("1v1 Lobby"));
        if (!lobby) return;
        button.disabled = lobby.disabled;
        if (button.previousElementSibling !== lobby) {
          lobby.after(button, switcher);
          // Without tour data, the server's answer says to run npm run tour-data.
          refresh().catch((error) => {
            log("could not load this week's super final", error);
            status = error.message;
            render();
          });
        }
      }, 500);
    });
    render();
  },
};

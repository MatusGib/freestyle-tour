import {
  saveSelectedVenue,
  selectedVenueId,
  takePlannedHeat,
  venueConditions,
  venueRoomId,
  windText,
} from "./venue.js";
import { createVenueTextures, mountVenueScenery, resolveVenueCollision } from "./scenery.js";
import { applyVenueLook } from "./water.js";

const getJson = async (url) => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${url} answered ${res.status}`);
  return body;
};
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null));
  return node;
};

const PANEL_STYLE =
  "position:fixed;right:12px;bottom:12px;z-index:100000;width:min(390px,calc(100vw - 24px));max-height:75vh;overflow:auto;" +
  "box-sizing:border-box;font:13px/1.45 system-ui,sans-serif;background:#fbfaf6;color:#13262b;padding:14px;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3)";
const BUTTON_STYLE = "border:0;border-radius:8px;padding:7px 10px;background:#178b93;color:white;font:600 12px system-ui,sans-serif;cursor:pointer";

export default {
  name: "venues",
  async setup({ engine, overlay, whenGame, onStep, log }) {
    let textures = { sand: null };
    const holder = overlay("venues");
    holder.style.cssText = "font:12px/1.4 system-ui,sans-serif;background:rgba(10,40,40,.85);color:#e8f4f2;padding:4px 10px;border-radius:8px;pointer-events:auto";
    const open = el("button", {
      type: "button",
      textContent: "Choose venue",
      style: "border:0;background:transparent;color:#e8f4f2;font:600 12px system-ui,sans-serif;cursor:pointer",
    });
    const thumbnail = el("img", {
      alt: "",
      width: 64,
      height: 38,
      hidden: true,
      style: "width:64px;height:38px;object-fit:cover;border:1px solid rgba(255,255,255,.42);border-radius:5px;vertical-align:middle",
    });
    const status = el("span", { style: "margin-left:6px" });
    holder.append(open, thumbnail, status);
    const panel = el("div", { hidden: true });
    panel.style.cssText = PANEL_STYLE;
    document.body.append(panel);

    let game = null;
    let venues = [];
    let loading = false;
    const catalogReady = getJson("/api/local/venues").then((result) => {
      venues = result.venues;
      return venues;
    }).catch((error) => {
      log("could not load venue profiles", error);
      return [];
    });
    const setStatus = (value) => void (status.textContent = value ? ` ${value}` : "");
    const setVenueStatus = (venue) => {
      thumbnail.hidden = !venue;
      thumbnail.src = venue ? `/__mods/venues/assets/${venue.id}.svg` : "";
      setStatus(venue?.name ?? "Weekly wind");
    };
    const selected = () => venues.find((venue) => venue.id === selectedVenueId()) ?? null;
    // The coast, its water and its sky, or the game's own look without a venue.
    const showVenue = (found, venue) => {
      mountVenueScenery(found, venue, textures);
      if (!applyVenueLook(found, venue)) log("the water patch is missing; keeping the game's water");
    };

    function renderPanel() {
      const active = selected();
      const choices = venues.map((venue) => {
        const button = el("button", {
          type: "button",
          textContent: active?.id === venue.id ? "Using this venue" : "Use this venue",
          style: BUTTON_STYLE,
          disabled: active?.id === venue.id,
          onclick: () => choose(venue),
        });
        return el("article", { style: "padding:10px 0;border-top:1px solid #d9e3df" },
          el("strong", { textContent: venue.name }),
          el("img", {
            src: `/__mods/venues/assets/${venue.id}.svg`,
            alt: `${venue.name} shoreline illustration`,
            style: "display:block;width:100%;height:112px;object-fit:cover;margin:8px 0;border-radius:8px;background:#dcebe5",
          }),
          el("p", { textContent: `${windText(venue.gameConditions)} · ${venue.character}`, style: "margin:4px 0" }),
          el("small", { textContent: venue.profileNote, style: "display:block;color:#50636a;margin-bottom:8px" }),
          venue.courseNote ? el("small", { textContent: `Heat position: ${venue.courseNote}`, style: "display:block;color:#31565e;margin-bottom:7px" }) : null,
          venue.landmarks?.length ? el("small", { textContent: `Look for: ${venue.landmarks.join(" · ")}`, style: "display:block;color:#31565e;margin-bottom:5px" }) : null,
          venue.waterZones?.length ? el("small", { textContent: `Water: ${venue.waterZones.join(" · ")}`, style: "display:block;color:#31565e;margin-bottom:8px" }) : null,
          button,
        );
      });
      const clear = el("button", {
        type: "button",
        textContent: "Use the game's weekly wind",
        style: `${BUTTON_STYLE};background:transparent;color:#16666d;border:1px solid #178b93`,
        onclick: clearChoice,
      });
      panel.replaceChildren(
        el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px" },
          el("strong", { textContent: "Freestyle venues" }),
          el("button", { type: "button", textContent: "Close", onclick: () => void (panel.hidden = true) }),
        ),
        el("p", { textContent: "Choose a place for your next practice or solo heat. The profile uses the game's existing wind and water response.", style: "margin:0 0 8px;color:#50636a" }),
        ...choices,
        el("div", { style: "padding-top:10px" }, clear),
      );
    }

    async function showPanel() {
      if (loading) return;
      loading = true;
      try {
        if (!venues.length) await catalogReady;
        if (!venues.length) throw new Error("No venue profiles are available.");
        renderPanel();
        panel.hidden = false;
      } catch (error) {
        log("could not load venue profiles", error);
        panel.replaceChildren(el("p", { textContent: `Couldn't load venues: ${error.message}` }));
        panel.hidden = false;
      } finally {
        loading = false;
      }
    }

    function choose(venue) {
      saveSelectedVenue(venue.id);
      setVenueStatus(venue);
      panel.hidden = true;
      if (!game) return;
      showVenue(game, venue);
      // Update the current practice water if the game is idling on the water.
      // The same profile is applied again at start, including for a solo heat.
      game.setPracticeConditions(venueConditions(engine.roomConditions, venue, venueRoomId(venue.id)), false);
    }

    function clearChoice() {
      saveSelectedVenue(null);
      setVenueStatus(null);
      panel.hidden = true;
      if (!game) return;
      showVenue(game, null);
      game.setPracticeConditions(engine.weekConditions(engine.weekStart(Date.now())), false);
    }

    function applyAtHeatStart(found) {
      const originalStart = found.start;
      found.start = function (...args) {
        const [heat, clock, state, originalConditions] = args;
        if (clock || state) return originalStart.apply(this, args);

        const planned = takePlannedHeat();
        if (planned) {
          setVenueStatus(planned.venue);
          showVenue(found, planned.venue);
          return originalStart.call(this, heat, clock, state, planned.conditions);
        }

        const venue = selected();
        showVenue(found, venue);
        if (!venue) return originalStart.apply(this, args);
        const conditions = venueConditions(engine.roomConditions, venue, venueRoomId(venue.id));
        setVenueStatus(venue);
        return originalStart.call(this, heat, clock, state, { ...(originalConditions ?? {}), ...conditions });
      };
    }

    open.addEventListener("click", () => showPanel());
    whenGame().then(async (found) => {
      await catalogReady;
      game = found;
      // The sand texture needs the game's own three.js, which the scene patch
      // hands over; without it the beach keeps its vertex colours.
      const CanvasTexture = found.constructor.three?.CanvasTexture;
      if (CanvasTexture) textures = createVenueTextures(CanvasTexture);
      else log("the scene patch is missing; the beach has no sand texture");
      applyAtHeatStart(found);
      await onStep((state, input) => resolveVenueCollision(state, input, game?.__venueSceneryVenueId));
      const venue = selected();
      showVenue(found, venue);
      setVenueStatus(venue);
    }).catch((error) => log("could not attach venue conditions", error));
  },
};

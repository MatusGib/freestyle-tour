import {
  peekPlannedHeat,
  saveSelectedVenue,
  selectedVenueId,
  takePlannedHeatFor,
  venueConditions,
  venueRoomId,
  venueZones,
  windText,
} from "./venue.js";
import { createVenueTextures, mountVenueScenery, resolveVenueCollision } from "./scenery.js";
import { applyVenueLook } from "./water.js";
import { resolveSpotCollision } from "./realworld/collision.js";
import { mountSpot, unmountSpot } from "./realworld/mount.js";
import { createPopover, el } from "../lib/ui.js";

const getJson = async (url) => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${url} answered ${res.status}`);
  return body;
};

export default {
  name: "venues",
  async setup({ engine, overlay, whenGame, onStep, log }) {
    let textures = { sand: null };
    const holder = overlay("venues");
    holder.className = "ft-slot";
    const thumbnail = el("img", { className: "ft-chip-thumb", alt: "", width: 40, height: 24, hidden: true });
    const current = el("span", { className: "ft-chip-value", textContent: "Weekly wind" });
    const open = el("button", { type: "button", className: "ft-chip", ariaHasPopup: "dialog" },
      thumbnail, el("span", { className: "ft-chip-text" }, el("span", { className: "ft-chip-label", textContent: "Venue" }), current));
    holder.append(open);
    const panel = createPopover("Choose a venue", "venues");

    let game = null;
    let venues = [];
    let loading = false;
    let loadingSpot = null; // the venue whose real-world spot is loading
    let shown = null; // the venue showVenue last showed
    const catalogReady = getJson("/api/local/venues").then((result) => {
      venues = result.venues;
      return venues;
    }).catch((error) => {
      log("could not load venue profiles", error);
      return [];
    });
    const setVenueStatus = (venue) => {
      thumbnail.hidden = !venue?.picture;
      thumbnail.src = venue?.picture ?? "";
      current.textContent = venue ? (loadingSpot === venue.id ? `Loading ${venue.name}…` : venue.name) : "Weekly wind";
      open.title = venue ? `Venue: ${venue.name}` : "Venue: the game's weekly wind";
    };
    const selected = () => venues.find((venue) => venue.id === selectedVenueId()) ?? null;
    // The coast, its water and its sky, or the game's own look without a
    // venue. A real-world spot loads its map data first, then its water
    // reads the depth.
    const showVenue = (found, venue) => {
      shown = venue;
      mountVenueScenery(found, venue, textures);
      if (!venue?.spotFiles) unmountSpot(found);
      const spotWater = venue?.spotFiles && found.__venueSpot?.manifest.id === venue.id ? found.__venueSpotWater : null;
      if (!applyVenueLook(found, venue, spotWater)) log("the water patch is missing; keeping the game's water");
      if (!venue?.spotFiles || spotWater) return;
      loadingSpot = venue.id;
      setVenueStatus(venue);
      mountSpot(found, venue, log).then((water) => {
        if (loadingSpot === venue.id) loadingSpot = null;
        if (shown?.id !== venue.id) return;
        setVenueStatus(venue);
        if (water) applyVenueLook(found, venue, water);
      });
    };

    // Each venue is an option: its picture, wind and character, with the
    // sourced notes folded away; the game's own weekly wind is the last one.
    function renderPanel() {
      const active = selected();
      const option = (venue) => {
        const chosen = active?.id === venue.id;
        const details = el("details", { className: "ft-details" },
          el("summary", { textContent: "About this venue" }),
          el("p", { textContent: venue.profileNote }),
          venue.courseNote && el("p", { textContent: venue.courseNote }),
          venue.landmarks?.length && el("p", { textContent: `Look for: ${venue.landmarks.join(" · ")}` }),
          venue.waterZones?.length && el("p", { textContent: `Water: ${venue.waterZones.join(" · ")}` }),
        );
        const button = el("button", { type: "button", className: "ft-option", onclick: () => choose(venue) },
          venue.picture && el("img", { src: venue.picture, alt: "", width: 96, height: 64 }),
          el("span", {},
            el("span", { className: "ft-option-name" }, venue.name, chosen && el("span", { className: "ft-check", textContent: "In use" })),
            el("span", { className: "ft-option-meta", textContent: venue.scenery ? windText(venue.gameConditions) : `${windText(venue.gameConditions)} · the game's own scenery` }),
            el("span", { className: "ft-option-text", textContent: venue.character, style: "display:block" }),
          ),
        );
        button.setAttribute("aria-pressed", String(chosen));
        return el("li", {}, button, details);
      };
      const weekly = el("button", { type: "button", className: "ft-option ft-plain", onclick: clearChoice },
        el("span", {},
          el("span", { className: "ft-option-name" }, "The game's weekly wind", !active && el("span", { className: "ft-check", textContent: "In use" })),
          el("span", { className: "ft-option-text", textContent: "No coast: the open water and wind everyone sails this week.", style: "display:block" }),
        ),
      );
      weekly.setAttribute("aria-pressed", String(!active));
      panel.body.replaceChildren(
        el("p", { className: "ft-sub", textContent: "For your next practice or solo heat. The wind and water follow the venue; the rules and scoring stay the game's." }),
        el("ul", { className: "ft-options" }, ...venues.map(option), el("li", {}, weekly)),
      );
    }

    async function showPanel() {
      if (loading) return;
      if (panel.open) return panel.hide();
      loading = true;
      try {
        if (!venues.length) await catalogReady;
        if (!venues.length) throw new Error("the local server has no venue profiles.");
        renderPanel();
      } catch (error) {
        log("could not load venue profiles", error);
        panel.body.replaceChildren(el("p", { className: "ft-muted", textContent: `Couldn't load the venues: ${error.message}` }));
      } finally {
        loading = false;
      }
      panel.show(open);
    }

    function choose(venue) {
      saveSelectedVenue(venue.id);
      setVenueStatus(venue);
      panel.hide();
      if (!game) return;
      showVenue(game, venue);
      // Update the current practice water if the game is idling on the water.
      // The same profile is applied again at start, including for a solo heat.
      game.setPracticeConditions(venueConditions(engine.roomConditions, venue, venueRoomId(venue.id)), false);
    }

    function clearChoice() {
      saveSelectedVenue(null);
      setVenueStatus(null);
      panel.hide();
      if (!game) return;
      showVenue(game, null);
      game.setPracticeConditions(engine.weekConditions(engine.weekStart(Date.now())), false);
    }

    // The local server stores each solo heat's wind, for replays and ghosts,
    // but the game's request to start one carries none: the venue's goes with
    // it, decided there, and the heat then starts in exactly that wind.
    let decided = null;
    const nextConditions = () => {
      const planned = peekPlannedHeat();
      if (planned) return planned.conditions;
      const venue = selected();
      return venue ? venueConditions(engine.roomConditions, venue, venueRoomId(venue.id)) : null;
    };
    const fetchFromPage = window.fetch;
    window.fetch = function (input, init) {
      const url = new URL(typeof input === "string" ? input : input.url, location.href);
      if (init?.method === "POST" && url.pathname === "/api/heats" && typeof init.body === "string") {
        decided = nextConditions();
        if (decided) init = { ...init, body: JSON.stringify({ ...JSON.parse(init.body), conditions: decided }) };
      }
      return fetchFromPage.call(this, input, init);
    };

    function applyAtHeatStart(found) {
      const originalStart = found.start;
      found.start = function (...args) {
        const [heat, clock, state, originalConditions] = args;
        if (clock || state) return originalStart.apply(this, args);
        const chosen = decided;
        decided = null;

        // heat: true for a solo heat, false for practice and the tutorial.
        const planned = takePlannedHeatFor(heat);
        if (planned) {
          setVenueStatus(planned.venue);
          showVenue(found, planned.venue);
          return originalStart.call(this, heat, clock, state, planned.conditions);
        }

        const venue = selected();
        showVenue(found, venue);
        if (!venue) return originalStart.apply(this, args);
        const conditions = chosen ?? venueConditions(engine.roomConditions, venue, venueRoomId(venue.id));
        setVenueStatus(venue);
        return originalStart.call(this, heat, clock, state, { ...(originalConditions ?? {}), ...conditions });
      };
      // The practice wind the game's own panel sets keeps the venue's zones.
      const setPractice = found.setPracticeConditions;
      found.setPracticeConditions = function (conditions, beast) {
        const zones = conditions && !conditions.zones && venueZones(selected(), conditions.knots);
        return setPractice.call(this, zones ? { ...conditions, zones } : conditions, beast);
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
      await onStep((state, input) => {
        if (game?.__venueSpot) resolveSpotCollision(state, input, game.__venueSpot);
        else resolveVenueCollision(state, input, game?.__venueSceneryVenueId);
      });
      const venue = selected();
      showVenue(found, venue);
      setVenueStatus(venue);
    }).catch((error) => log("could not attach venue conditions", error));
  },
};

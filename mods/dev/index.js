// The developer panel: try event winds, venues' usual winds and zones, the
// champion's wind and target, and an offset on every AI target. Changes are a
// draft the local server keeps in data/ and lays over the files, used from
// the next heat; "Write to repo" writes them into the data files, "Discard"
// drops them.
import { createPopover, el } from "../lib/ui.js";
import { changeCount, fileValue, shownValue, valueAt, withChange } from "./dev.js";

// GET without a body, POST with one. A refused draft's error carries the
// field it is about (path).
async function request(url, body) {
  const init = body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(url, init);
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(answer.error ?? `${url} answered ${res.status}`), { path: answer.path ?? null });
  return answer;
}

const gustOptions = (list) => list.map((g) => [g, g ? `${g} kt` : "Steady"]);
const GUSTS = gustOptions([0, 2, 3, 4, 5, 6]);
const ROOM_GUSTS = gustOptions([0, 4, 5, 6]); // the gusts the game's 1v1 rooms have
const CONFIDENCE = ["reported", "bounded", "inferred"].map((c) => [c, c]);
const TABS = ["Events", "Venues", "Champion", "AI"];
const changesText = (n) => (n ? `${n} change${n === 1 ? "" : "s"}` : "No changes");

export default {
  name: "dev",
  setup({ overlay, log }) {
    const holder = overlay("dev");
    holder.className = "ft-slot";
    const status = el("span", { className: "ft-chip-value", textContent: "No changes" });
    const chip = el("button", { type: "button", className: "ft-chip", ariaHasPopup: "dialog", onclick: () => toggle().catch((e) => log("could not open the developer panel", e)) },
      el("span", { className: "ft-chip-text" }, el("span", { className: "ft-chip-label", textContent: "Dev" }), status));
    holder.append(chip);
    const panel = createPopover("Developer panel", "dev");

    let state = null; // GET /api/local/dev's answer
    let draft = {};
    let tab = "Events";
    let eventId = null; // the event the Events tab shows
    let refused = null; // { path, error } for the last draft the server refused
    let note = "";
    let timer = null;
    const fields = new Map(); // path → the field's parts
    const count = el("span");
    const discard = el("button", { type: "button", className: "ft-button ft-button-small", textContent: "Discard", onclick: () => act(() => request("/api/local/dev/discard", {}), "Draft discarded.") });
    const write = el("button", { type: "button", className: "ft-button ft-button-small ft-button-primary", textContent: "Write to repo", onclick: () => act(() => request("/api/local/dev/write", {}), null) });
    const barReason = el("div", { className: "ft-dev-reason", role: "alert" });
    const noteLine = el("p", { className: "ft-muted" });

    // Marks changed fields with the file's value, shows why a value was
    // refused, and counts the changes.
    function refresh() {
      for (const [path, { row, file, reset, reason }] of fields) {
        const changed = valueAt(draft, path) !== undefined;
        row.classList.toggle("ft-dev-changed", changed);
        file.textContent = changed ? `file: ${fileValue(state.files, path) ?? "none"}` : "";
        reset.hidden = !changed;
        reason.textContent = refused?.path === path ? refused.error : "";
      }
      barReason.textContent = refused && !fields.has(refused.path) ? refused.error : "";
      const n = changeCount(draft);
      count.textContent = changesText(n);
      status.textContent = changesText(n);
      discard.disabled = !n;
      write.disabled = !n || !!refused;
      noteLine.textContent = note;
    }

    async function sendNow() {
      try {
        state = await request("/api/local/dev/draft", draft);
        refused = null;
      } catch (error) {
        refused = { path: error.path, error: error.message };
      }
    }
    // Sends the whole draft a moment after typing stops.
    function send() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        sendNow().catch((e) => log("could not send the draft", e)).finally(refresh);
      }, 400);
    }

    function change(path, value) {
      draft = withChange(draft, state.files, path, value);
      refresh();
      send();
    }

    // A field: a number, a choice or text, showing the draft's value or the
    // file's; when changed, the file's value beside it and a Reset button.
    function field(label, path, { kind = "number", options = null, step = 1 } = {}) {
      const value = shownValue(draft, state.files, path);
      let input;
      if (options) {
        input = el("select", {}, ...options.map(([v, text]) => el("option", { value: String(v), textContent: text })));
        input.value = String(value);
      } else input = el("input", { type: kind, value: value ?? "", step: String(step) });
      const read = () => {
        if (options) return typeof options[0][0] === "number" ? Number(input.value) : input.value;
        if (kind === "number") return input.value === "" ? null : Number(input.value);
        return input.value;
      };
      input.addEventListener(options ? "change" : "input", () => change(path, read()));
      const file = el("span", { className: "ft-muted" });
      const reset = el("button", { type: "button", className: "ft-button ft-button-small", textContent: "Reset", onclick: () => {
        change(path, fileValue(state.files, path));
        render();
      } });
      const reason = el("div", { className: "ft-dev-reason", role: "alert" });
      const row = el("label", { className: "ft-field" }, label, input, el("span", { className: "ft-dev-meta" }, file, reset), reason);
      fields.set(path, { row, file, reset, reason });
      return row;
    }

    function eventsTab() {
      eventId ??= state.events[0]?.events[0]?.id ?? null;
      if (eventId === null) return [el("p", { className: "ft-muted", textContent: "No tour data on this computer." })];
      const select = el("select", {}, ...state.events.map((group) => el("optgroup", { label: group.venue?.name ?? "Other venues" },
        ...group.events.map((e) => el("option", { value: String(e.id), textContent: e.name })))));
      select.value = String(eventId);
      select.onchange = () => {
        eventId = Number(select.value);
        render();
      };
      const at = (name) => `eventWinds.${eventId}.${name}`;
      return [
        el("label", { className: "ft-field" }, "Event", select),
        field("Knots (empty: the reports give none)", at("knots")),
        field("Gusts", at("gustKnots"), { options: GUSTS }),
        field("Confidence", at("confidence"), { options: CONFIDENCE }),
        field("What the reports say", at("reported"), { kind: "text" }),
      ];
    }
    function venuesTab() {
      return (state.files.venues?.venues ?? []).flatMap((venue) => {
        const at = (name) => `venues.${venue.id}.${name}`;
        return [
          el("h3", { className: "ft-division", textContent: venue.name }),
          field("Usual knots", at("gameConditions.knots")),
          field("Usual gusts", at("gameConditions.gustKnots"), { options: GUSTS }),
          ...(venue.windZones ? [
            field("Zone: knots more further out", at("windZones.gain")),
            field("Zone: starts this many metres out", at("windZones.from"), { step: 10 }),
            field("Zone: ramps in over metres", at("windZones.over"), { step: 10 }),
            field("Zone: knots less by the beach", at("windZones.lee")),
          ] : []),
          ...(venue.windPatch ? [
            field("Wind patch: knots more", at("windPatch.gain")),
            field("Wind patch: starts at x (m, downwind +)", at("windPatch.x"), { step: 10 }),
            field("Wind patch: starts at z (m)", at("windPatch.z"), { step: 10 }),
            field("Wind patch: reaches across (m)", at("windPatch.radius"), { step: 10 }),
            field("Wind patch: reaches downwind (m)", at("windPatch.length"), { step: 10 }),
          ] : []),
        ];
      });
    }
    const championTab = () => [
      field("Knots", "champion.wind.knots"),
      field("Gusts", "champion.wind.gustKnots", { options: ROOM_GUSTS }),
      field("Target score", "champion.target", { step: 0.5 }),
      el("p", { className: "ft-muted", textContent: "His next room is sailed again with the new values." }),
    ];
    const aiTab = () => [field("Points added to every challenge rider's target", "tuning.aiTargetOffset", { step: 0.5 })];
    const TAB_CONTENT = { Events: eventsTab, Venues: venuesTab, Champion: championTab, AI: aiTab };

    function render() {
      fields.clear();
      const tabs = el("div", { className: "ft-dev-tabs", role: "tablist" }, ...TABS.map((name) => {
        const button = el("button", { type: "button", className: "ft-chip", role: "tab", textContent: name, onclick: () => {
          tab = name;
          render();
        } });
        button.setAttribute("aria-selected", String(tab === name));
        return button;
      }));
      panel.body.replaceChildren(
        el("p", { className: "ft-sub", textContent: "Changes are a draft the local server keeps, used from the next heat. Write to repo puts them in the data files." }),
        state.problem && el("p", { className: "ft-dev-reason", textContent: `Your saved draft doesn't fit the files: ${state.problem}` }),
        state.dropped.length > 0 && el("p", { className: "ft-muted", textContent: `Left out of the draft (no longer in the files): ${state.dropped.join(", ")}` }),
        tabs,
        el("div", { className: "ft-fields ft-dev-form" }, ...TAB_CONTENT[tab]()),
        el("div", { className: "ft-banner" }, count, el("span", { className: "ft-dev-meta" }, discard, write)),
        barReason,
        noteLine,
      );
      refresh();
    }

    // Discard or Write to repo, after sending a draft still waiting to go.
    async function act(call, done) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        await sendNow();
        if (refused) return refresh();
      }
      try {
        state = await call();
        draft = state.draft;
        refused = null;
        note = done ?? (state.written.length ? `Wrote ${state.written.join(", ")}. Commit them when you're happy.` : "Nothing to write.");
      } catch (error) {
        note = error.message;
      }
      render();
    }

    async function toggle() {
      if (panel.open) return panel.hide();
      panel.body.replaceChildren(el("p", { className: "ft-muted", textContent: "Loading…" }));
      panel.show(chip);
      try {
        state = await request("/api/local/dev");
      } catch (error) {
        panel.body.replaceChildren(el("p", { className: "ft-muted", textContent: `Couldn't load the developer panel: ${error.message}` }));
        throw error;
      }
      draft = state.draft;
      render();
    }

    // The chip counts a draft kept from an earlier session.
    request("/api/local/dev").then((answer) => {
      state = answer;
      draft = answer.draft;
      status.textContent = changesText(changeCount(draft));
    }).catch((error) => log("could not load the draft", error));
  },
};

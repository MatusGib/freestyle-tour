// Replay viewer: lists stored heats and plays any of them again in the game's
// own scene, with a timeline, speeds, camera views, the move list and the
// running score, and saves a stretch as a video file. It opens only from the
// menu, when the game isn't stepping physics, and swaps a replayed state into
// game.state while open.
import { createRunner } from "../lib/replay.js";
import {
  CAMERAS,
  SPEEDS,
  clipAround,
  clipFileName,
  createStepClock,
  extensionFor,
  formatTime,
  moveMarkers,
  normalizeClip,
  pickVideoType,
} from "./timeline.js";

const OPEN_CLASS = "freestyle-replay-open";
const PANEL_STYLE =
  "position:fixed;right:12px;bottom:12px;z-index:100000;width:380px;max-height:75vh;overflow:auto;" +
  "font:12px/1.5 system-ui,sans-serif;background:rgba(10,40,40,.94);color:#e8f4f2;padding:10px 12px;border-radius:10px";

const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
};
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null));
  return node;
};
const windText = (c) => (c.gustKnots ? `${c.knots} kt, gusts to ${c.knots + c.gustKnots}` : `${c.knots} kt`);
const dateText = (ms) => new Date(ms).toLocaleString();
const videoType = () => pickVideoType((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));

export default {
  name: "replay-viewer",
  setup({ engine, overlay, whenGame, log }) {
    document.head.append(el("style", { textContent: `.${OPEN_CLASS} .menu-layer{display:none!important}` }));
    const holder = overlay("replay-viewer");
    holder.style.cssText = "pointer-events:auto";
    holder.hidden = true;
    holder.append(el("button", { type: "button", textContent: "Replays", onclick: () => showList().catch((e) => log("could not list heats", e)) }));
    const panel = el("div", { hidden: true });
    panel.style.cssText = PANEL_STYLE;
    document.body.append(panel);

    let game = null;
    let player = null; // the open replay, or null
    let ui = null; // the open replay's elements

    whenGame().then((found) => {
      game = found;
      setInterval(() => {
        holder.hidden = game.active || !panel.hidden;
      }, 500);
    });

    async function showList() {
      const heats = await getJson("/api/local/heats");
      const rows = heats.map((h) =>
        el(
          "li",
          {},
          `${dateText(h.finishedAt)} · ${h.nickname} · ${h.score.toFixed(2)} · ${windText(h.conditions)} `,
          h.hasReplay
            ? el("button", { type: "button", textContent: "Watch", onclick: () => watch(h.heatId).catch((e) => log("could not open the replay", e)) })
            : el("em", { textContent: "No recording" }),
        ),
      );
      panel.replaceChildren(
        el("strong", { textContent: "Replays " }),
        el("button", { type: "button", textContent: "Close", onclick: closePanel }),
        rows.length ? el("ol", {}, ...rows) : el("p", { textContent: "No heats stored yet. Sail a solo heat first." }),
      );
      panel.hidden = false;
    }

    async function watch(heatId) {
      const heat = await getJson(`/api/local/heats/${encodeURIComponent(heatId)}`);
      const check = createRunner(engine, { conditions: heat.conditions, replay: heat.replay });
      check.advance(check.totalSteps);
      const matches = Math.abs(engine.heatTotals(check.state.heat).total - heat.score) < 0.005;
      const runner = createRunner(engine, { conditions: heat.conditions, replay: heat.replay });
      const markers = moveMarkers(heat.attempts);
      player = {
        heat,
        runner,
        markers,
        saved: game.state,
        playing: false,
        speed: 1,
        clock: createStepClock(),
        last: 0,
        raf: 0,
        clip: markers.length ? clipAround(markers[0], runner.totalSteps) : normalizeClip(0, runner.totalSteps, runner.totalSteps),
        recording: null,
      };
      document.body.classList.add(OPEN_CLASS);
      game.wake?.clear?.();
      buildPlayer(matches);
      player.raf = requestAnimationFrame(frame);
    }

    function buildPlayer(matches) {
      const { heat, runner, markers } = player;
      const canRecord = !!videoType();
      ui = {
        play: el("button", { type: "button", textContent: "Play", onclick: () => setPlaying(!player.playing) }),
        timeline: el("input", { type: "range", min: 0, max: runner.totalSteps, step: 1, value: 0, style: "width:100%" }),
        time: el("span"),
        score: el("span"),
        lastMove: el("div"),
        clipText: el("span"),
        clipMessage: el("span", { textContent: canRecord ? "" : " This browser can't record video." }),
      };
      ui.timeline.addEventListener("input", () => seekTo(Number(ui.timeline.value)));
      const speed = el("select", { onchange: (e) => (player.speed = Number(e.target.value)) }, ...SPEEDS.map((s) => el("option", { value: s, textContent: `${s}×`, selected: s === 1 })));
      const cameras = Object.keys(CAMERAS).map((name) => el("button", { type: "button", textContent: name, onclick: () => Object.assign(game.cameraView, CAMERAS[name]) }));
      const moves = markers.map((m) =>
        el("li", {}, el("button", {
          type: "button",
          textContent: `${formatTime(m.step)} · ${m.tack} · ${m.label} · ${m.status === "landed" ? m.score.toFixed(2) : m.status}`,
          onclick: () => {
            player.clip = clipAround(m, runner.totalSteps);
            seekTo(Math.max(0, m.step - 240));
            updateClipText();
          },
        })),
      );
      panel.replaceChildren(
        el("strong", { textContent: `${heat.nickname} · ${dateText(heat.finishedAt)} · ${heat.score.toFixed(2)} · ${windText(heat.conditions)}` }),
        el("p", { textContent: matches ? "" : "This replay doesn't match the saved score." }),
        el("div", {}, ui.play, " ", ui.time, " · ", ui.score, " ", speed),
        ui.timeline,
        ui.lastMove,
        el("div", {}, "Camera: ", ...cameras),
        moves.length ? el("ol", {}, ...moves) : el("p", { textContent: "No moves in this heat." }),
        el("div", {},
          el("button", { type: "button", textContent: "Clip start", onclick: () => ((player.clip.start = player.runner.stepCount), updateClipText()) }),
          el("button", { type: "button", textContent: "Clip end", onclick: () => ((player.clip.end = player.runner.stepCount), updateClipText()) }),
          el("button", { type: "button", textContent: "Save clip", disabled: !canRecord, onclick: saveClip }),
          " ", ui.clipText, ui.clipMessage),
        el("div", {},
          el("button", { type: "button", textContent: "Back", onclick: () => (closeReplay(), showList().catch((e) => log("could not list heats", e))) }),
          el("button", { type: "button", textContent: "Close", onclick: closePanel })),
      );
      updateClipText();
      updateStatus();
    }

    function frame(now) {
      if (!player) return;
      player.raf = requestAnimationFrame(frame);
      const seconds = player.last ? (now - player.last) / 1000 : 0;
      player.last = now;
      const { runner } = player;
      if (player.playing) {
        runner.advance(player.clock(player.speed, seconds));
        if (player.recording && runner.stepCount >= player.recording.end) stopRecording();
        if (runner.done) setPlaying(false);
      }
      game.state = runner.state;
      updateStatus();
    }

    function updateStatus() {
      const { runner } = player;
      const state = runner.state;
      ui.timeline.value = runner.stepCount;
      ui.time.textContent = `${formatTime(runner.stepCount)} / ${formatTime(runner.totalSteps)}`;
      ui.score.textContent = `Heat ${engine.heatTotals(state.heat).total.toFixed(2)}`;
      const last = state.heat.attempts.filter((a) => a.status !== "pending").at(-1);
      ui.lastMove.textContent = last ? `Last move: ${last.label} · ${last.status === "landed" ? last.score.toFixed(2) : last.status}` : "";
    }

    function updateClipText() {
      const { start, end } = normalizeClip(player.clip.start, player.clip.end, player.runner.totalSteps);
      ui.clipText.textContent = `${formatTime(start)}–${formatTime(end)}`;
    }

    function setPlaying(on) {
      if (on && player.runner.done) seekTo(0);
      player.playing = on;
      player.last = 0;
      ui.play.textContent = on ? "Pause" : "Play";
    }

    function seekTo(step) {
      player.runner.seek(step);
      game.wake?.clear?.();
      game.state = player.runner.state;
      updateStatus();
    }

    function saveClip() {
      const type = videoType();
      const { start, end } = normalizeClip(player.clip.start, player.clip.end, player.runner.totalSteps);
      if (!type || end <= start || player.recording) return;
      const name = clipFileName(player.heat.nickname, player.heat.finishedAt, start, extensionFor(type));
      seekTo(start);
      const stream = game.renderer.domElement.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6e6 });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        download(new Blob(chunks, { type }), name);
      };
      player.recording = { recorder, end };
      recorder.start();
      ui.clipMessage.textContent = " Recording…";
      setPlaying(true);
    }

    function stopRecording() {
      const { recorder } = player.recording;
      player.recording = null;
      setPlaying(false);
      recorder.stop();
      ui.clipMessage.textContent = " Clip saved.";
    }

    function download(blob, name) {
      const url = URL.createObjectURL(blob);
      const link = el("a", { href: url, download: name });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }

    function closeReplay() {
      if (!player) return;
      if (player.recording) stopRecording();
      cancelAnimationFrame(player.raf);
      game.state = player.saved;
      game.cameraView.reset();
      game.wake?.clear?.();
      document.body.classList.remove(OPEN_CLASS);
      player = null;
      ui = null;
    }

    function closePanel() {
      closeReplay();
      panel.hidden = true;
    }
  },
};

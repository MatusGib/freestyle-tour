// Proof that the mod layer works: a badge that reads the heat rules through
// the identified engine and shows the physics clock through the step hook.
export default {
  name: "local-badge",
  setup({ snapshot, mods, engine, overlay, onStep }) {
    const badge = overlay("local-badge");
    badge.style.cssText = "font:12px/1.4 system-ui,sans-serif;background:rgba(10,40,40,.85);color:#e8f4f2;padding:4px 10px;border-radius:8px";
    const { seconds, attemptsPerTack } = engine.heatRules;
    const text = `Local copy · snapshot ${snapshot} · ${mods.length} mod${mods.length === 1 ? "" : "s"} · heat ${seconds} s, ${attemptsPerTack} attempts per tack`;
    badge.textContent = text;
    let steps = 0;
    onStep((state) => {
      if (++steps % 30 === 0) badge.textContent = `${text} · t ${state.totalTime.toFixed(1)} s`;
    });
  },
};

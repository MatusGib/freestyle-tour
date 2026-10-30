// Proof that the mod layer works: a badge that reads the heat rules through
// the identified engine and shows the physics clock through the step hook.
export default {
  name: "local-badge",
  setup({ snapshot, mods, engine, overlay, onStep }) {
    const badge = overlay("local-badge");
    badge.className = "ft-note";
    const { seconds, attemptsPerTack } = engine.heatRules;
    const text = `Local copy · snapshot ${snapshot} · ${mods.length} mod${mods.length === 1 ? "" : "s"} · heat ${seconds} s, ${attemptsPerTack} attempts per tack`;
    badge.textContent = text;
    let steps = 0;
    onStep((state) => {
      if (++steps % 30 === 0) badge.textContent = `${text} · t ${state.totalTime.toFixed(1)} s`;
    });
  },
};

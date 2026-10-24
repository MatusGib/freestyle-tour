// Finds the game's functions and objects by their code, whatever names the
// minifier gave them in this build. Used by the browser mod loader and by the
// Node server and harness. Every signature must match exactly one export of
// its part, so a game update that changes the code fails loudly.
const src = (v) => (typeof v === "function" ? v.toString() : "");
const isClass = (v, methods) => typeof v === "function" && methods.every((m) => typeof v.prototype?.[m] === "function");

export const SIGNATURES = {
  engine: {
    step: (v) => /^function [\w$]+\(e,t,n\)\{e\.beastMode&&/.test(src(v)),
    initState: (v) => /^function [\w$]+\(e=[\w$]+\)\{return\{heat:/.test(src(v)),
    startTrick: (v) => /^function [\w$]+\(e,t\)\{if\(!Object\.hasOwn\([\w$]+,t\)/.test(src(v)),
    slots: (v) => /^function [\w$]+\(e\)\{if\(e\.landing\)return/.test(src(v)),
    pump: (v) => /^function [\w$]+\(e\)\{if\(e\.heat\.done\|\|e\.ducked\|\|e\.ducking/.test(src(v)),
    switchStance: (v) => src(v).includes("Settle on the board before switching stance"),
    duck: (v) => src(v).includes("Finish your move before ducking"),
    heatTotals: (v) => /^function [\w$]+\(e\)\{let [^{]*new Map;for\(let r of e\.attempts\)/.test(src(v)),
    heatInit: (v) => /^function [\w$]+\(e=!1\)\{return\{enabled:e,warmup:/.test(src(v)),
    isAir: (v) => /^function [\w$]+\(e\)\{return e\.air\|\|[\w$]+\(e\)\}$/.test(src(v)),
    inArea: (v) => /\{let r=[\w$]+\(n,e,t\);return Math\.abs\(r\.downwind\)<=n\.depth\/2/.test(src(v)),
    tricks: (v) => !!v?.flaka?.scoring && !!v?.culo?.scoring,
    heatRules: (v) => typeof v?.attemptsPerTack === "number" && typeof v?.seconds === "number",
  },
  wind: {
    conditions: (v) => /\{if\(!([\w$]+)\)return\{\.\.\.[\w$]+\};let [\w$]+=[\w$]+\(\1\);return\{seed:\1,knots:/.test(src(v)),
    wind: (v) => /return e\.knots\+Math\.sin\(r\*\.17\)/.test(src(v)),
  },
  controls: {
    Controls: (v) => isClass(v, ["setKey", "setStick", "read", "release"]),
    heatStart: (v) => /^function [\w$]+\(t,n\)\{let r=[\w$]+\(t\);return r\.heat\.enabled=!0,n\.release\(r\)/.test(src(v)),
    keyCodes: (v) => Array.isArray(v) && v[0] === "Space" && v.includes("SpeedDial"),
    Recorder: (v) => isClass(v, ["step", "replay"]),
    blendPoses: (v) => /\.pose\.trick/.test(src(v)) && src(v).includes("updatedAt"),
  },
  week: {
    weekStart: (v) => /^function [\w$]+\(e\)\{let t=e\+[\w$]+\(e\),n=\(new Date\(t\)\.getUTCDay\(\)\+6\)%7/.test(src(v)),
    nextWeekStart: (v) => /^e=>[\w$]+\(e\+7\.5\*[\w$]+\)$/.test(src(v)),
    weekConditions: (v) => /^function [\w$]+\([\w$]+\)\{return\{\.\.\.[\w$]+\([\w$]+\(`week:\$\{[\w$]+\}`\)\),/.test(src(v)),
  },
  pose: {
    riderPose: (v) => /trickStartedAt=[\w$]+\.trick\?/.test(src(v)),
  },
};

// modules: { part: module namespace }. Returns { label: export } for every
// signature of every part given; parts without signatures are skipped.
export function identify(modules, signatures = SIGNATURES) {
  const found = {};
  for (const [part, namespace] of Object.entries(modules)) {
    for (const [label, test] of Object.entries(signatures[part] ?? {})) {
      const hits = Object.values(namespace).filter((v) => {
        try {
          return test(v);
        } catch {
          return false;
        }
      });
      if (hits.length !== 1) throw new Error(`Could not locate ${part}.${label} (${hits.length} matches); the game was probably updated`);
      found[label] = hits[0];
    }
  }
  return found;
}

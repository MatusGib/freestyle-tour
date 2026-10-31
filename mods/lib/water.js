// The game's water height, j(x, z, time) in its rig-model chunk, with the
// venues mod's waves when that mod has added them; time is game.visualTime.

const WATER_HEIGHT = /^function [\w$]+\(e,t,n\)\{return (?:[\w$]+\(e,t,n,)?[\w$]+\.reduce\(\(r,i\)=>r\+Math\.sin\(e\*i\.x\+t\*i\.z\+n\*i\.speed\)\*i\.amplitude,0\)\)?\}$/;
export const isWaterHeight = (value) => typeof value === "function" && WATER_HEIGHT.test(value.toString());

// The rig-model chunk isn't one of the mod loader's parts, so it is found
// among the scripts the page has loaded. Null if it isn't there.
export async function findWaterHeight() {
  for (const { name } of performance.getEntriesByType("resource")) {
    if (!/\/rig-model-[\w-]+\.js$/.test(new URL(name).pathname)) continue;
    const found = Object.values(await import(name)).filter(isWaterHeight);
    if (found.length === 1) return found[0];
  }
  return null;
}

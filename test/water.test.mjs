import { test } from "node:test";
import assert from "node:assert/strict";
import { isWaterHeight } from "../mods/lib/water.js";

test("isWaterHeight knows the game's water height, with and without the venues mod's waves", () => {
  const game = "function j(e,t,n){return O.reduce((r,i)=>r+Math.sin(e*i.x+t*i.z+n*i.speed)*i.amplitude,0)}";
  const venues = "function j(e,t,n){return __venueWater(e,t,n,O.reduce((r,i)=>r+Math.sin(e*i.x+t*i.z+n*i.speed)*i.amplitude,0))}";
  const rider = "function F(e,t,n,r=0){return j(e,t,n)-N*P+r}";
  assert.equal(isWaterHeight(new Function(`return ${game}`)()), true);
  assert.equal(isWaterHeight(new Function(`return ${venues}`)()), true);
  assert.equal(isWaterHeight(new Function(`return ${rider}`)()), false);
  assert.equal(isWaterHeight({}), false);
});

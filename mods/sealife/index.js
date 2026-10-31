// Dolphins and a whale, in practice, for a rider who sails along with nothing
// pressed: after 10 s dolphins swim alongside and leap, and leave when the
// rider loads a jump; after 20 s a whale belly-flops in front of the rider
// and knocks them over, unless they are in the air from a jump. sealife.js
// decides when and where; this file builds the models, moves them each frame
// and makes the rider wipe out. Otherwise nothing is drawn.
import { Group, Matrix4, Quaternion, Vector3 } from "../venues/lib/three.core.min.js";
import { bakedMaterial, makeDroplets } from "../lib/shapes.js";
import { findWaterHeight } from "../lib/water.js";
import { DOLPHINS, LAND, START, WHALE_SPLASH, aim, dolphinPose, nextSea, sense, whaleSpot, whaleSplash } from "./sealife.js";
import { makeDolphin, makeWhale } from "./model.js";

const DROPS = 36; // in the whale's splash

export default {
  name: "sealife",
  setup({ parts, whenGame, log }) {
    // From patches.mjs: the game's own wipe-out.
    const wipeOut = parts.engine.__seaWipeOut;
    if (!wipeOut) log("the game's wipe-out isn't handed over (the sealife patch is missing); the whale stays away");

    whenGame().then(async (game) => {
      let height = await findWaterHeight();
      if (!height) {
        log("could not find the game's water height; the dolphins and the whale swim at sea level");
        height = () => 0;
      }

      const sealife = new Group();
      sealife.name = "sealife";
      sealife.visible = false;
      const material = bakedMaterial();
      const dolphins = DOLPHINS.map(() => makeDolphin(material));
      const whale = makeWhale(material);
      const drops = makeDroplets(DROPS);
      sealife.add(...dolphins.map(({ animal }) => animal), whale.animal, drops);
      game.scene.add(sealife);

      // Where the rider is and which way they are going. The dolphins swim in
      // this frame; once they leave, it carries on at the speed it had.
      const riderFrame = () => {
        const { x, z, vx, vz } = game.state;
        const speed = Math.hypot(vx, vz) || 1;
        return { x, z, fx: vx / speed, fz: vz / speed, speed };
      };
      let frame = null;
      // Where the whale lands, and the way across the rider's path it comes from.
      let landing = null, across = null;

      const matrix = new Matrix4(), place = new Vector3(), still = new Quaternion(), scale = new Vector3();
      let sea = START;
      const loop = () => {
        requestAnimationFrame(loop);
        // The water's own clock: it stops while the game is paused.
        const time = game.visualTime, state = game.state;
        const before = sea.whale;
        const next = nextSea(sea, sense(game), time);
        sea = wipeOut ? next.sea : { ...next.sea, whale: null };
        if (next.hit) {
          wipeOut(state, false);
          state.notice = "Wipeout · a whale!";
        }
        sealife.visible = !!(sea.dolphins || sea.whale);
        if (!sealife.visible) return;

        const pod = sea.dolphins;
        if (pod?.leave === null) frame = riderFrame();
        dolphins.forEach(({ animal, flukes }, i) => {
          const pose = pod && dolphinPose(DOLPHINS[i], time - pod.start, pod.leave === null ? null : pod.leave - pod.start, frame.speed);
          animal.visible = !!pose;
          if (!pose) return;
          const forward = pose.forward + (pod.leave === null ? 0 : frame.speed * (time - pod.leave));
          const x = frame.x + frame.fx * forward - frame.fz * pose.side, z = frame.z + frame.fz * forward + frame.fx * pose.side;
          animal.position.set(x, height(x, z, time) + pose.lift, z);
          animal.rotation.set(0, Math.atan2(-frame.fz, frame.fx), pose.pitch, "YZX");
          flukes.rotation.z = .35 * Math.sin(time * 7 + i);
        });

        const w = sea.whale;
        whale.animal.visible = false;
        drops.count = 0;
        if (!w) return;
        if (before?.start !== w.start) {
          const { fx, fz } = riderFrame();
          across = { x: -fz, z: fx };
        }
        if (w.outcome === null) landing = aim(state, w, time);
        const pose = whaleSpot(time - w.start);
        if (pose) {
          const x = landing.x + across.x * pose.across, z = landing.z + across.z * pose.across;
          whale.animal.visible = true;
          whale.animal.position.set(x, height(x, z, time) + pose.lift, z);
          whale.animal.rotation.set(0, Math.atan2(across.z, -across.x), pose.pitch, "YZX");
          whale.flukes.rotation.z = .3 * Math.sin(time * 3);
        }
        const age = time - w.start - LAND;
        if (age < 0 || age > WHALE_SPLASH) return;
        const y = height(landing.x, landing.z, time);
        for (let i = 0; i < DROPS; i++) {
          const drop = whaleSplash(i, DROPS, age);
          drops.setMatrixAt(i, matrix.compose(place.set(landing.x + drop.x, y + drop.y, landing.z + drop.z), still, scale.setScalar(drop.size)));
        }
        drops.count = DROPS;
        drops.instanceMatrix.needsUpdate = true;
      };
      requestAnimationFrame(loop);
    }).catch((error) => log("could not bring the dolphins and the whale", error));
  },
};

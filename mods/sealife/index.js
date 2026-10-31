// Dolphins and a whale, in practice, for a rider who sails along with nothing
// pressed: after 10 s dolphins porpoise alongside, and leave when the rider
// loads a jump; after 20 s a whale belly-flops in front of the rider and
// knocks them over, unless they jump clean over it. sealife.js decides when
// and where; this file builds the models, moves them each frame and makes the
// rider wipe out. Otherwise nothing is drawn.
import {
  CircleGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3,
} from "../venues/lib/three.core.min.js";
import { bakedMaterial, makeDroplets } from "../lib/shapes.js";
import { droplet } from "../lib/splash.js";
import { findWaterHeight } from "../lib/water.js";
import {
  DOLPHINS, LAND, SPRAY, START, WHALE_BODY, WHITE, aim, crown, dolphinPose, dolphinSplashes, foam, nextSea, sense, sprayDrop,
  touchesWhale, whaleSpot, whiteWater,
} from "./sealife.js";
import { makeDolphin, makeSheet, makeWhale } from "./model.js";

const DROPS = 8; // in a dolphin's splash
const DOLPHIN_SPLASHES = 6; // in the air at once, at most

// White water, see-through by opacity.
const water = (options = {}) => new MeshStandardMaterial({ color: "#f1f7f9", roughness: .3, transparent: true, depthWrite: false, ...options });

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
      const drops = makeDroplets(DROPS * DOLPHIN_SPLASHES);
      // The whale's splash: fine spray, heaps of white water heaved up along
      // its body, a sheet of water all round it, and foam left on the water.
      const spray = new InstancedMesh(new IcosahedronGeometry(1, 1), new MeshStandardMaterial({ color: "#ffffff", emissive: "#bcd9e2", emissiveIntensity: .35, roughness: .2 }), SPRAY);
      const heaps = new InstancedMesh(new IcosahedronGeometry(1, 2), water({ opacity: .8, roughness: .7 }), WHITE);
      spray.frustumCulled = heaps.frustumCulled = false;
      const sheet = makeSheet();
      const foamPatch = new Mesh(new CircleGeometry(1, 48).rotateX(-Math.PI / 2), water({ roughness: .9, polygonOffset: true, polygonOffsetFactor: -2 }));
      sealife.add(...dolphins.map(({ animal }) => animal), whale.animal, drops, spray, heaps, sheet, foamPatch);
      game.scene.add(sealife);

      // Where the rider is and which way they are going. The dolphins swim in
      // this frame; once they leave, it carries on at the speed it had.
      const riderFrame = () => {
        const { x, z, vx, vz } = game.state;
        const speed = Math.hypot(vx, vz) || 1;
        return { x, z, fx: vx / speed, fz: vz / speed, speed };
      };
      let frame = null;
      // Where the whale lands, and the way across the rider's path it comes
      // from, which its body lies along.
      let landing = null, across = null;
      const whaleAt = (pose) => ({ x: landing.x + across.x * pose.across, z: landing.z + across.z * pose.across });

      const matrix = new Matrix4(), place = new Vector3(), still = new Quaternion(), scale = new Vector3();
      const put = (mesh, i, x, y, z, size) => mesh.setMatrixAt(i, matrix.compose(place.set(x, y, z), still, scale.setScalar(size)));
      let sea = START;
      const loop = () => {
        requestAnimationFrame(loop);
        // The water's own clock: it stops while the game is paused.
        const time = game.visualTime, state = game.state;
        const before = sea.whale;
        let touching = false;
        const lying = before?.outcome && whaleSpot(time - before.start);
        if (lying) touching = touchesWhale(state, { ...whaleAt(lying), axis: across, lift: lying.lift });
        const next = nextSea(sea, { ...sense(game), touching }, time);
        sea = wipeOut ? next.sea : { ...next.sea, whale: null };
        if (next.hit) {
          wipeOut(state, false);
          state.notice = "Wipeout · a whale!";
          if (touching) state.vx = state.vz = state.speed = 0; // stopped dead by it
        }
        sealife.visible = !!(sea.dolphins || sea.whale);
        if (!sealife.visible) return;

        const pod = sea.dolphins;
        if (pod?.leave === null) frame = riderFrame();
        const leave = pod?.leave == null ? null : pod.leave - pod.start;
        const drift = pod?.leave == null ? 0 : frame.speed * (time - pod.leave);
        // A place in the dolphins' frame, forward and to the side.
        const inFrame = (forward, side) => [frame.x + frame.fx * forward - frame.fz * side, frame.z + frame.fz * forward + frame.fx * side];
        dolphins.forEach(({ animal, flukes }, i) => {
          const pose = pod && dolphinPose(DOLPHINS[i], time - pod.start, leave, frame.speed);
          animal.visible = !!pose;
          if (!pose) return;
          const [x, z] = inFrame(pose.forward + drift, pose.side);
          animal.position.set(x, height(x, z, time) + pose.lift, z);
          animal.rotation.set(0, Math.atan2(-frame.fz, frame.fx), pose.pitch, "YZX");
          flukes.rotation.z = .3 * Math.sin(time * 8 + i);
        });
        // Their splashes stay where they were made as the frame moves on.
        let count = 0;
        if (pod) {
          DOLPHINS.forEach((dolphin, i) => {
            for (const splash of dolphinSplashes(dolphin, time - pod.start, leave)) {
              const [x, z] = inFrame(splash.forward + drift - frame.speed * splash.age, dolphin.side);
              const y = height(x, z, time);
              for (let k = 0; k < DROPS && count < DROPS * DOLPHIN_SPLASHES; k++, count++) {
                const drop = droplet(k, DROPS, splash.age);
                put(drops, count, x + drop.x, y + drop.y, z + drop.z, drop.size * 1.6);
              }
            }
          });
        }
        drops.count = count;
        drops.instanceMatrix.needsUpdate = true;

        const w = sea.whale;
        whale.animal.visible = sheet.visible = foamPatch.visible = false;
        spray.count = heaps.count = 0;
        if (!w) return;
        if (before?.start !== w.start) {
          const { fx, fz } = riderFrame();
          across = { x: -fz, z: fx };
        }
        if (w.outcome === null) landing = aim(state, w, time);
        const pose = whaleSpot(time - w.start);
        if (pose) {
          const { x, z } = whaleAt(pose);
          whale.animal.visible = true;
          whale.animal.position.set(x, height(x, z, time) + pose.lift, z);
          whale.animal.rotation.set(0, Math.atan2(across.z, -across.x), pose.pitch, "YZX");
          whale.flukes.rotation.z = .3 * Math.sin(time * 3);
        }
        const age = time - w.start - LAND;
        if (age < 0) return;
        const y = height(landing.x, landing.z, time), yaw = Math.atan2(-across.z, across.x);
        // Spray and white water, in the whale's frame: along its body (across
        // the rider's path) and to its side.
        const inWhale = (mesh, count, at) => {
          let shown = 0;
          for (let i = 0; i < count; i++) {
            const bit = at(i, age);
            if (!bit) continue;
            const x = landing.x + across.x * bit.along - across.z * bit.side, z = landing.z + across.z * bit.along + across.x * bit.side;
            put(mesh, shown++, x, y + bit.y, z, bit.size);
          }
          mesh.count = shown;
          mesh.instanceMatrix.needsUpdate = true;
        };
        inWhale(spray, SPRAY, sprayDrop);
        inWhale(heaps, WHITE, whiteWater);
        const rise = crown(age);
        if (rise) {
          sheet.visible = true;
          sheet.position.set(landing.x, y - .2, landing.z);
          sheet.rotation.set(0, yaw, 0);
          sheet.scale.set(WHALE_BODY.long * rise.grow, rise.height, WHALE_BODY.wide * rise.grow);
          sheet.material.opacity = rise.opacity;
        }
        const left = foam(age);
        if (left) {
          foamPatch.visible = true;
          foamPatch.position.set(landing.x, y + .12, landing.z);
          foamPatch.rotation.set(0, yaw, 0);
          foamPatch.scale.set(WHALE_BODY.long * left.grow, 1, WHALE_BODY.wide * left.grow * 1.5);
          foamPatch.material.opacity = left.opacity;
        }
      };
      requestAnimationFrame(loop);
    }).catch((error) => log("could not bring the dolphins and the whale", error));
  },
};

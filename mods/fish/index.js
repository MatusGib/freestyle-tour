// When the rider wipes out, a few friendly fish swim in and circle the rider
// and the sail, three of them leap across in turn with a splash, and once the
// rider is back up they dart off and dive. fish.js has their paths; this file
// builds the models and moves them each frame. Between wipe-outs nothing is
// drawn.
import { Box3, Group, Matrix4, Quaternion, Vector3 } from "../venues/lib/three.core.min.js";
import { FISH, droplet, fishPose, isWaterHeight, nextVisit, splashes, wipedOut } from "./fish.js";
import { fishMaterial, makeDroplets, makeFish } from "./model.js";

const SIZE = 1.3; // like the game's rider, a little larger than life
const DROPS = 10; // in a splash
const SPLASHES = 4; // in the air at once, at most

// The game's water height, j(x, z, time) in its rig-model chunk. That chunk
// isn't one of the mod loader's parts, so it is found among the scripts the
// page has loaded.
async function findWaterHeight() {
  for (const { name } of performance.getEntriesByType("resource")) {
    if (!/\/rig-model-[\w-]+\.js$/.test(new URL(name).pathname)) continue;
    const found = Object.values(await import(name)).filter(isWaterHeight);
    if (found.length === 1) return found[0];
  }
  return null;
}

export default {
  name: "fish",
  setup({ whenGame, log }) {
    whenGame().then(async (game) => {
      let height = await findWaterHeight();
      if (!height) {
        log("could not find the game's water height; the fish swim at sea level");
        height = () => 0;
      }

      const school = new Group();
      school.name = "fish";
      school.visible = false;
      const material = fishMaterial();
      const models = FISH.map((fish) => makeFish(fish.colours, material));
      for (const { fish } of models) fish.scale.setScalar(SIZE);
      const drops = makeDroplets(DROPS * SPLASHES);
      school.add(...models.map(({ fish }) => fish), drops);
      game.scene.add(school);

      // The fish circle the middle of the rider and the sail lying in the
      // water, following the rider until the rider is up.
      const box = new Box3(), sail = new Vector3();
      const findMiddle = () => {
        const { x, z } = game.state;
        if (box.setFromObject(game.rig.sail).isEmpty()) return { x, z };
        box.getCenter(sail);
        return { x: (x + sail.x) / 2, z: (z + sail.z) / 2 };
      };

      const matrix = new Matrix4(), place = new Vector3(), still = new Quaternion(), scale = new Vector3();
      let visit = null, middle = null;
      const frame = () => {
        requestAnimationFrame(frame);
        // The water's own clock: it stops while the game is paused.
        const time = game.visualTime;
        visit = nextVisit(visit, wipedOut(game), time);
        school.visible = !!visit;
        if (!visit) return;
        if (visit.up === null) middle = findMiddle();

        FISH.forEach((fish, i) => {
          const pose = fishPose(fish, visit, time);
          const model = models[i];
          model.fish.visible = !!pose;
          if (!pose) return;
          const x = middle.x + pose.x, z = middle.z + pose.z;
          model.fish.position.set(x, height(x, z, time) + pose.lift, z);
          model.fish.rotation.set(0, pose.yaw + .08 * Math.sin(time * 9 + i), pose.pitch, "YZX");
          model.tail.rotation.y = .5 * Math.sin(time * 14 + i);
        });

        let count = 0;
        const until = visit.up === null ? Infinity : visit.up - visit.start;
        for (const fish of FISH) {
          for (const splash of splashes(fish, time - visit.start, until)) {
            const x = middle.x + splash.x, z = middle.z + splash.z, y = height(x, z, time);
            for (let i = 0; i < DROPS && count < DROPS * SPLASHES; i++, count++) {
              const drop = droplet(i, DROPS, splash.age);
              drops.setMatrixAt(count, matrix.compose(place.set(x + drop.x, y + drop.y, z + drop.z), still, scale.setScalar(drop.size)));
            }
          }
        }
        drops.count = count;
        drops.instanceMatrix.needsUpdate = true;
      };
      requestAnimationFrame(frame);
    }).catch((error) => log("could not bring the fish", error));
  },
};

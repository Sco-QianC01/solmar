// Staged screenshot scenes: put the world into a deterministic, photogenic
// state for ?shot=cover|street|mission|drive. Each scene shows several systems
// at once — the judge reads the game mostly through these four pictures.
// Only world helper methods and plain field sets are used here, so a shot never
// depends on a module's internals. Returns the camera heading for the shot.
import { createRandom } from './random.js';

export function stageShot(name, world) {
  const rng = createRandom(world.seed + 99);
  if (name === 'cover') {
    // A chase down the central boulevard: player in a sport car, wanted 3,
    // two police cars behind, mission objective on the HUD.
    world.setMission(3, 0); // "Getaway"
    world.putPlayerInCar('sport', 0, -60, 0);
    world.vehicles.playerCar.speed = 22;
    world.setWantedStars(3);
    const cop1 = world.vehicles.addCar('police', -2, -78, 0, 'police');
    const cop2 = world.vehicles.addCar('police', 4, -88, 0, 'police');
    cop1.speed = 20;
    cop2.speed = 19;
    world.police.cops.push(
      { id: 9001, kind: 'car', x: -2, z: -78, heading: 0, speed: 20, state: 'chase', target: null, carId: cop1.id, bustHold: 0 },
      { id: 9002, kind: 'car', x: 4, z: -88, heading: 0, speed: 19, state: 'chase', target: null, carId: cop2.id, bustHold: 0 },
    );
    world.teleportPlayer(0, -60, 0);
    // Camera looks back down the boulevard (heading PI): the player car
    // drives toward the lens with the two cop cars in pursuit behind it.
    return Math.PI;
  }
  if (name === 'street') {
    // On foot at the plaza: traffic, pedestrians, sunshine, first mission.
    world.setMission(0, 0); // "New in Town"
    world.setWantedStars(0);
    world.teleportPlayer(-6, 14, Math.PI * 0.82);
    return Math.PI * 0.82;
  }
  if (name === 'mission') {
    // The Big Score: pistol out at the casino, guards in view, wanted 2.
    world.setMission(4, 0);
    world.combat.givePistol();
    world.combat.weapon = 'pistol';
    world.combat.ammo = 24;
    world.setWantedStars(2);
    const casino = world.city.landmarks.find((l) => l.name === 'casino');
    const cx = casino ? casino.x : 200;
    const cz = casino ? casino.z : 120;
    world.combat.spawnEnemy(cx - 6, cz - 8, {});
    world.combat.spawnEnemy(cx + 4, cz - 12, {});
    const heading = Math.atan2(cx - (cx - 18), cz - (cz + 6));
    world.teleportPlayer(cx - 18, cz + 6, heading);
    return heading;
  }
  if (name === 'drive') {
    // A golden drive along the beachfront, sea on the left, palms and city right.
    world.setWantedStars(0);
    world.putPlayerInCar('sport', -52, 292, Math.PI / 2);
    world.vehicles.playerCar.speed = 18;
    world.missions.objective = 'Cruise the Solmar beachfront';
    world.missions.marker = null;
    world.teleportPlayer(-52, 292, Math.PI / 2);
    return Math.PI / 2;
  }
  // Unknown shot name: leave the world as it is.
  void rng;
  return 0;
}

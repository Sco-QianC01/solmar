// SOLMAR world: owns every system, wires them together, and runs one fixed step.
// The game loop lives in main.js; this file only advances the simulation and
// routes the events the systems push into ctx.events.
import { CAR, PLAYER, SAVE_KEY, TRAFFIC, WANTED } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createVehicles } from './vehicles.js';
import { createPolice } from './police.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createPeds } from './peds.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { loadSave, saveGame } from './save.js';

export function createWorld({ scene, seed }) {
  const rng = createRandom(seed);
  const city = createCity(seed);
  const vehicles = createVehicles(city, rng);
  // Populate the streets: the factory only defines the spawners.
  vehicles.spawnTraffic(TRAFFIC.count);
  vehicles.spawnParked(TRAFFIC.parkedCount);
  const police = createPolice(city, vehicles, rng);
  const player = createPlayer(city, vehicles, rng);
  const combat = createCombat(city, rng);
  const missions = createMissions({ city, player, vehicles, police, combat, rng });
  const peds = createPeds(city, rng);
  const audio = createAudio();
  const effects = createEffects(scene);
  const hud = createHud();

  const world = {
    seed,
    time: 0,
    city,
    vehicles,
    police,
    player,
    combat,
    missions,
    peds,
    audio,
    effects,
    hud,
    lastShotAt: -10,
    lastSaveAt: 0,
    screen: null, // null | 'busted' | 'wasted' — set when the run ends
    events: [],
  };

  // ---- save / load -------------------------------------------------------
  function applySave(save) {
    if (!save) return false;
    try {
      if (typeof save.cash === 'number') missions.cash = save.cash;
      if (save.storyDone) missions.storyDone = true;
      if (typeof save.missionIndex === 'number' && save.missionIndex >= 0) {
        missions.startMission(save.missionIndex);
      }
      if (Array.isArray(save.coinsTaken)) {
        for (const i of save.coinsTaken) {
          if (missions.coins[i]) missions.coins[i].taken = true;
        }
      }
      if (save.playerPos) {
        player.pos.x = save.playerPos.x;
        player.pos.y = save.playerPos.y || 0;
        player.pos.z = save.playerPos.z;
      }
      if (typeof save.health === 'number') player.health = save.health;
      return true;
    } catch {
      return false;
    }
  }

  function snapshotSave() {
    return {
      version: 1,
      cash: missions.cash,
      missionIndex: missions.index,
      playerPos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
      health: player.health,
      coinsTaken: missions.coins.map((c, i) => (c.taken ? i : -1)).filter((i) => i >= 0),
      storyDone: missions.storyDone,
      savedAt: Date.now(),
    };
  }

  world.saveNow = function saveNow() {
    saveGame(snapshotSave());
    world.lastSaveAt = world.time;
  };

  world.loadSave = function loadSaveIntoWorld() {
    return applySave(loadSave());
  };

  // ---- helpers for screenshots / debugging --------------------------------
  world.teleportPlayer = function teleportPlayer(x, z, heading) {
    player.pos.x = x;
    player.pos.z = z;
    player.pos.y = 0;
    if (heading !== undefined) player.heading = heading;
    if (player.inCar && player.car) {
      player.car.x = x;
      player.car.z = z;
      player.car.heading = heading ?? player.car.heading;
    }
  };

  world.putPlayerInCar = function putPlayerInCar(kind, x, z, heading) {
    const car = vehicles.addCar(kind, x, z, heading, 'player');
    vehicles.enterCar(car);
    player.onFoot = false;
    player.inCar = true;
    player.car = car;
    player.pos.x = x;
    player.pos.z = z;
    player.heading = heading;
    return car;
  };

  world.setWantedStars = function setWantedStars(n) {
    if (n <= 0) {
      police.heat = 0;
    } else {
      const lo = WANTED.starAt[n - 1];
      const hi = WANTED.starAt[n] ?? 1;
      police.heat = (lo + hi) / 2;
    }
    police.wanted = n;
  };

  world.setMission = function setMission(index, stage) {
    missions.startMission(index);
    if (typeof stage === 'number') {
      missions.stage = stage;
      // Recompute the objective/marker from the step list.
      const step = missions.current && missions.current.steps[stage];
      if (step) {
        missions.objective = step.text;
        missions.marker = step.marker || null;
      }
    }
  };

  world.spawnCopCars = function spawnCopCars(n) {
    for (let i = 0; i < n; i++) {
      const spot = city.randomPointOnRoad(rng);
      vehicles.addCar('police', spot.x, spot.z, spot.heading, 'police');
    }
  };

  // ---- per-frame update ----------------------------------------------------
  function drainEvents() {
    const out = { screen: null, missionDone: null };
    for (const event of world.events) {
      switch (event.type) {
        case 'busted':
          audio.fail();
          out.screen = 'busted';
          break;
        case 'wasted':
          audio.fail();
          out.screen = 'wasted';
          break;
        case 'mission-done': {
          // missions.js pushes the mission id; resolve the display title.
          const done = missions.list.find((m) => m.id === event.mission);
          audio.success();
          hud.showMissionComplete({ title: done ? done.title : event.mission, reward: event.reward });
          world.saveNow();
          out.missionDone = event;
          break;
        }
        case 'mission-failed':
          audio.fail();
          hud.message(`Mission failed: ${event.reason}`);
          break;
        case 'mission-step':
          audio.chime();
          break;
        case 'car-stolen':
          hud.message('Car stolen! Lose the cops.');
          break;
        case 'hit-ped':
          hud.message('You hit a pedestrian!');
          break;
        case 'coin':
          audio.pickup();
          hud.message(`Sun Coin found! +$50 (${event.n}/10)`);
          break;
        case 'car-wrecked':
          hud.message('Car wrecked!');
          break;
        case 'enemy-killed':
          hud.message('Guard down.');
          break;
        default:
          break;
      }
    }
    world.events.length = 0;
    return out;
  }

  world.update = function update(dt, input, cameraHeading, cameraPitch) {
    if (world.screen) return { screen: world.screen };
    world.time += dt;

    const ctx = {
      time: world.time,
      input,
      cameraHeading,
      cameraPitch,
      player,
      vehicles,
      police,
      combat,
      missions,
      city,
      peds,
      events: world.events,
      audio,
      effects,
      shotsFiredRecently: world.time - world.lastShotAt < 3,
    };

    // Weapon switching (edge-triggered).
    if (input.takePressed('Digit1') && combat.weapon !== 'pistol') {
      if (combat.hasPistol) {
        combat.weapon = 'pistol';
        hud.message('Pistol equipped.');
      } else {
        hud.message('No pistol yet — finish "New in Town".');
      }
    }
    if (input.takePressed('Digit2')) {
      combat.weapon = 'fists';
      hud.message('Fists.');
    }

    // Shooting (hold to fire, rate-limited by combat).
    if (input.shoot && combat.weapon === 'pistol' && player.onFoot) {
      const now = world.time;
      if (!world.nextShotAt || now >= world.nextShotAt) {
        world.nextShotAt = now + 0.22;
        const cp = Math.cos(cameraPitch);
        const dir = {
          x: Math.sin(cameraHeading) * cp,
          y: -Math.sin(cameraPitch),
          z: Math.cos(cameraHeading) * cp,
        };
        const origin = {
          x: player.pos.x + dir.x * 0.6,
          y: player.pos.y + 1.5,
          z: player.pos.z + dir.z * 0.6,
        };
        const result = combat.playerShoot(origin, dir);
        world.lastShotAt = now;
        world.events.push({ type: 'shot-fired' });
        audio.shot();
        effects.muzzle(origin, dir);
        police.addHeat(0.06, 'shot');
        if (result.hit === 'enemy') {
          effects.burst(
            { x: origin.x + dir.x * result.dist, y: 1.2, z: origin.z + dir.z * result.dist },
            { color: 0xd23b2e, count: 10, speed: 4, life: 0.4, size: 0.25 },
          );
          if (result.enemy.health <= 0) world.events.push({ type: 'enemy-killed', enemy: result.enemy });
        } else if (result.hit === 'empty') {
          hud.message('Out of ammo!');
        }
      }
    }

    // Punching.
    if (input.takePressed('KeyF') && player.onFoot) {
      const hits = combat.playerPunch(player.pos, player.heading);
      audio.punch();
      if (hits.length > 0) {
        effects.burst(
          { x: player.pos.x + Math.sin(player.heading) * 1.6, y: 1.2, z: player.pos.z + Math.cos(player.heading) * 1.6 },
          { color: 0xffe08a, count: 8, speed: 3, life: 0.3, size: 0.22 },
        );
        for (const enemy of hits) {
          if (enemy.health <= 0) world.events.push({ type: 'enemy-killed', enemy });
        }
      }
    }

    // Horn.
    if (input.takePressed('KeyH') && player.inCar) audio.horn();

    player.update(dt, input, ctx);
    vehicles.update(dt, ctx);
    police.update(dt, ctx);
    combat.update(dt, ctx);
    peds.update(dt, ctx);
    missions.update(dt, ctx);
    effects.update(dt);
    audio.update(dt);

    // Engine + siren follow the driving state.
    const playerCar = vehicles.playerCar;
    audio.setEngine(!!playerCar, playerCar ? Math.min(1, Math.abs(playerCar.speed) / playerCar.maxSpeed) : 0);
    audio.siren(police.sirenOn);

    // Skid puffs when the player car turns hard at speed.
    if (playerCar && Math.abs(playerCar.speed) > 12 && (input.left || input.right)) {
      effects.dust({ x: playerCar.x, y: 0.2, z: playerCar.z });
    }

    const drained = drainEvents();
    if (drained.screen) world.screen = drained.screen;

    // The combat module reports hits; the world owns the death itself so a
    // missed return value can never leave the player at 0 health and playing.
    if (!world.screen && player.health <= 0) {
      world.events.push({ type: 'wasted' });
      const again = drainEvents();
      if (again.screen) world.screen = again.screen;
    }

    // Autosave every 60 s of play.
    if (world.time - world.lastSaveAt > 60) world.saveNow();

    // HUD snapshot.
    hud.update({
      health: Math.max(0, Math.round(player.health)),
      cash: missions.cash,
      wanted: police.wanted,
      speedKmh: playerCar ? Math.round(Math.abs(playerCar.speed) * 3.6) : Math.round(player.speed * 3.6),
      onFoot: player.onFoot,
      weapon: combat.weapon,
      ammo: combat.ammo,
      objective: missions.objective || 'Explore Solmar',
      missionTitle: missions.current ? missions.current.title : 'Free Roam',
      time: world.time,
      minimap: {
        city,
        playerPos: player.pos,
        playerHeading: player.heading,
        cars: vehicles.cars,
        cops: police.cops,
        peds: peds.peds,
        marker: missions.marker,
        coins: missions.coins,
      },
    });

    return drained;
  };

  // ---- reset after busted / wasted -----------------------------------------
  world.respawn = function respawn() {
    const penalty = 100;
    missions.cash = Math.max(0, missions.cash - penalty);
    player.respawn({ x: 0, y: 0, z: -10 });
    police.reset();
    combat.clearEnemies();
    vehicles.exitCar();
    world.screen = null;
    hud.message(`You lost $${penalty}. Back on the streets.`);
    world.saveNow();
  };

  world.toTitle = function toTitle() {
    world.saveNow();
    world.screen = null;
    player.respawn({ x: 0, y: 0, z: -10 });
    police.reset();
    combat.clearEnemies();
  };

  return world;
}

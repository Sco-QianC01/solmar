// SOLMAR police: wanted level, heat, cop cars and foot cops.
// Pure logic — no three.js, no DOM, no Math.random. The police module
// owns cop behaviour; vehicles.js owns the cop cars themselves (they live
// in vehicles.cars with driver 'police') and resolves car-car collisions.

import { CAR, WANTED } from './config.js';
import { slideMove } from './vehicles.js';

const COP_CAR_MAX_SPEED = 36; // faster than traffic
const COP_CAR_ACCEL = 16;
const COP_CAR_BRAKE = 26;
const COP_CAR_TURN = 2.6; // rad/s
const FOOT_COP_SPEED = 5.2;
const SPAWN_TRIES = 20;
const DESPAWN_DIST = 120;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a) {
  const twoPi = Math.PI * 2;
  a = (a + Math.PI) % twoPi;
  if (a < 0) a += twoPi;
  return a - Math.PI;
}

function forwardOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

function wantedFromHeat(heat) {
  let w = 0;
  for (const t of WANTED.starAt) {
    if (heat >= t) w++;
  }
  return Math.min(w, WANTED.maxStars);
}

export function createPolice(city, vehicles, rng) {
  let nextCopId = 0;
  // Last player position seen by update(); canSeePlayer() works off it
  // because it has no ctx of its own.
  const lastPlayer = { x: 0, z: 0 };

  const api = {
    wanted: 0,
    heat: 0,
    sirenOn: false,
    busted: false,
    cops: [],

    addHeat(amount, reason) {
      api.heat = clamp(api.heat + amount, 0, 1);
      api.wanted = wantedFromHeat(api.heat);
    },

    // Range + building check along the segment from (fromX, fromZ) to the
    // player: sample 6 points; any building-blocked sample means no sight.
    canSeePlayer(fromX, fromZ) {
      const dx = lastPlayer.x - fromX;
      const dz = lastPlayer.z - fromZ;
      if (Math.hypot(dx, dz) >= 55) return false;
      for (let i = 0; i < 6; i++) {
        const t = (i + 0.5) / 6;
        if (city.isBlocked(fromX + dx * t, fromZ + dz * t, 0.5)) return false;
      }
      return true;
    },

    update(dt, ctx) {
      const player = ctx.player || {};
      const pos = player.pos || { x: 0, z: 0 };
      const px = pos.x;
      const pz = pos.z;
      const onFoot = !!player.onFoot;
      const now = ctx.time || 0;
      lastPlayer.x = px;
      lastPlayer.z = pz;

      // Heat decay: base rate, plus the hidden bonus while no cop is
      // within 40 m and none can see the player (line of sight broken).
      const anyNear = api.cops.some((c) => Math.hypot(c.x - px, c.z - pz) < 40);
      const anySees = api.cops.some((c) => api.canSeePlayer(c.x, c.z));
      let decay = WANTED.decayPerSec;
      if (!anyNear && !anySees) decay += WANTED.decayHiddenBonus;
      api.heat = Math.max(0, api.heat - decay * dt);
      api.wanted = wantedFromHeat(api.heat);
      if (api.heat <= 0) api.wanted = 0;

      // Target cop counts for the current wanted level.
      const desiredCars = Math.min(api.wanted * WANTED.copCarPerStar, WANTED.maxCopCars);
      const desiredFoot = onFoot ? Math.min(api.wanted, 3) : 0;
      const carCops = api.cops.filter((c) => c.kind === 'car');
      const footCops = api.cops.filter((c) => c.kind === 'foot');

      // Spawn cop cars at road points away from the player (60-150 m:
      // far enough to feel fair, close enough to join the chase).
      while (carCops.length < desiredCars) {
        const spot = findSpawnSpot(px, pz, 60, 150);
        if (!spot) break;
        const car = vehicles.addCar('police', spot.x, spot.z, spot.heading, 'police');
        const cop = {
          id: 'cop-' + (++nextCopId),
          kind: 'car',
          x: car.x,
          z: car.z,
          heading: car.heading,
          speed: 0,
          state: 'chase',
          target: { x: px, z: pz },
          carId: car.id,
          bustHold: 0,
          lastSeenAt: now,
          stuckT: 0,
          reverseT: 0,
        };
        api.cops.push(cop);
        carCops.push(cop);
      }

      // Spawn foot cops near (but not on top of) the on-foot player:
      // 15-45 m away so they can actually reach the player in time.
      while (footCops.length < desiredFoot) {
        const spot = findSpawnSpot(px, pz, 15, 45);
        if (!spot) break;
        const cop = {
          id: 'cop-' + (++nextCopId),
          kind: 'foot',
          x: spot.x,
          z: spot.z,
          heading: Math.atan2(px - spot.x, pz - spot.z),
          speed: FOOT_COP_SPEED,
          state: 'chase',
          target: { x: px, z: pz },
          carId: null,
          bustHold: 0,
          lastSeenAt: now,
          stuckT: 0,
          reverseT: 0,
        };
        api.cops.push(cop);
        footCops.push(cop);
      }

      // Wanted 0 (or a lower star count) sends the surplus cops home.
      carCops.forEach((c, idx) => {
        if (idx < desiredCars) {
          if (c.state === 'return') c.state = 'chase';
        } else {
          c.state = 'return';
        }
      });
      footCops.forEach((c, idx) => {
        if (idx < desiredFoot) {
          if (c.state === 'return') c.state = 'chase';
        } else {
          c.state = 'return';
        }
      });

      // Drive every cop.
      for (let i = api.cops.length - 1; i >= 0; i--) {
        const cop = api.cops[i];
        const distToPlayer = Math.hypot(px - cop.x, pz - cop.z);
        if (cop.kind === 'car') {
          const car = vehicles.cars.find((c) => c.id === cop.carId);
          if (!car || car.state === 'wrecked') {
            // Wrecked cop car stays as a wreck; the cop is gone.
            api.cops.splice(i, 1);
            continue;
          }
          if (cop.state === 'return') {
            driveCopCar(car, Math.atan2(car.x - px, car.z - pz), 24, dt, cop);
            syncCop(cop, car);
            if (distToPlayer > DESPAWN_DIST) {
              vehicles.removeCar(car.id);
              api.cops.splice(i, 1);
            }
            continue;
          }
          // Chase: cop cars always pursue the player's car position
          // (leading a fleeing car); they never lose the scent.
          cop.state = 'chase';
          let tx;
          let tz;
          if (!onFoot && vehicles.playerCar) {
            // Lead the fleeing car: aim where it will be, not where it is.
            const pc = vehicles.playerCar;
            const f = forwardOf(pc.heading);
            const lead = Math.min(pc.speed * 0.9, Math.hypot(pc.x - car.x, pc.z - car.z) * 0.5);
            tx = pc.x + f.x * lead;
            tz = pc.z + f.z * lead;
          } else {
            tx = px;
            tz = pz;
          }
          const d = Math.hypot(tx - car.x, tz - car.z);
          if (onFoot && d < 8) {
            // On-foot player: pull up short, don't run them over.
            car.speed = Math.max(0, car.speed - COP_CAR_BRAKE * dt);
          } else {
            driveCopCar(car, Math.atan2(tx - car.x, tz - car.z), COP_CAR_MAX_SPEED, dt, cop);
          }
          cop.target = { x: tx, z: tz };
          cop.lastSeenAt = now;
          syncCop(cop, car);
        } else {
          // Foot cop.
          if (cop.state === 'return') {
            cop.heading = Math.atan2(cop.x - px, cop.z - pz);
            moveFootCop(cop, dt);
            if (distToPlayer > DESPAWN_DIST) api.cops.splice(i, 1);
            continue;
          }
          if (!onFoot) {
            // Player in a car: foot cops can't keep up, so they search
            // the last known spot on foot instead of chasing in vain.
            cop.state = 'search';
            let tx = cop.target.x;
            let tz = cop.target.z;
            if (Math.hypot(tx - cop.x, tz - cop.z) < 3) {
              const pt = city.randomPointOnRoad(rng);
              cop.target = { x: pt.x, z: pt.z };
              tx = pt.x;
              tz = pt.z;
            }
            cop.heading = Math.atan2(tx - cop.x, tz - cop.z);
            moveFootCop(cop, dt);
            cop.bustHold = 0;
            continue;
          }
          cop.state = 'chase';
          cop.target = { x: px, z: pz };
          cop.lastSeenAt = now;
          cop.heading = Math.atan2(px - cop.x, pz - cop.z);
          moveFootCop(cop, dt);
          // Bust: one cop inside the bust radius for the full hold time.
          const d = Math.hypot(px - cop.x, pz - cop.z);
          if (d < WANTED.bustRadius) {
            cop.bustHold += dt;
            if (cop.bustHold >= WANTED.bustHoldSec && !api.busted) {
              api.busted = true;
              if (ctx.events) ctx.events.push({ type: 'busted' });
            }
          } else {
            cop.bustHold = 0;
          }
        }
      }

      api.sirenOn = api.wanted >= 1 && api.cops.some((c) => c.kind === 'car');
    },

    reset() {
      for (const cop of api.cops) {
        if (cop.carId) vehicles.removeCar(cop.carId);
      }
      api.cops.length = 0;
      api.heat = 0;
      api.wanted = 0;
      api.busted = false;
      api.sirenOn = false;
    },
  };

  // Road point at least minDist from (px, pz) (and under maxDist when
  // given); falls back to the closest point beyond minDist, else null.
  function findSpawnSpot(px, pz, minDist, maxDist) {
    let fallback = null;
    for (let t = 0; t < SPAWN_TRIES; t++) {
      const pt = city.randomPointOnRoad(rng);
      const d = Math.hypot(pt.x - px, pt.z - pz);
      if (d > minDist && (maxDist === undefined || d < maxDist)) return pt;
      if (d > minDist && (!fallback || d < fallback.d)) fallback = { pt, d };
    }
    return fallback ? fallback.pt : null;
  }

  function syncCop(cop, car) {
    cop.x = car.x;
    cop.z = car.z;
    cop.heading = car.heading;
    cop.speed = car.speed;
  }

  // Steer a cop car toward a heading at up to maxSpeed, slowing a little
  // for sharp turns, sliding along buildings like any other car. If the
  // car gets pinned (e.g. in a corner), back up briefly and retry.
  function driveCopCar(car, desiredHeading, maxSpeed, dt, cop) {
    const startX = car.x;
    const startZ = car.z;
    if (cop.reverseT > 0) {
      cop.reverseT -= dt;
      car.speed += clamp(-7 - car.speed, -COP_CAR_BRAKE * dt, COP_CAR_ACCEL * dt);
      const f = forwardOf(car.heading);
      const res = slideMove(city, car.x, car.z, f.x * car.speed * dt, f.z * car.speed * dt, CAR.radius);
      car.x = res.x;
      car.z = res.z;
      if (res.blocked) car.speed *= 0.3;
      return;
    }
    const diff = wrapAngle(desiredHeading - car.heading);
    car.heading += clamp(diff, -COP_CAR_TURN * dt, COP_CAR_TURN * dt);
    const turnFactor = clamp(1 - Math.abs(diff) / 2.5, 0.65, 1);
    const target = maxSpeed * turnFactor;
    const rate = target > car.speed ? COP_CAR_ACCEL : COP_CAR_BRAKE;
    car.speed += clamp(target - car.speed, -rate * dt, rate * dt);
    const f = forwardOf(car.heading);
    const res = slideMove(city, car.x, car.z, f.x * car.speed * dt, f.z * car.speed * dt, CAR.radius);
    car.x = res.x;
    car.z = res.z;
    if (res.blocked) car.speed *= 0.3;
    const moved = Math.hypot(car.x - startX, car.z - startZ);
    if (car.speed > 1 && moved < 0.05) cop.stuckT += dt;
    else cop.stuckT = 0;
    if (cop.stuckT > 1.0) {
      cop.reverseT = 0.8;
      cop.stuckT = 0;
    }
  }

  function moveFootCop(cop, dt) {
    const f = forwardOf(cop.heading);
    const res = slideMove(city, cop.x, cop.z, f.x * FOOT_COP_SPEED * dt, f.z * FOOT_COP_SPEED * dt, 0.55);
    cop.x = res.x;
    cop.z = res.z;
    cop.speed = FOOT_COP_SPEED;
  }

  return api;
}

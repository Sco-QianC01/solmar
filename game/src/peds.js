// Pedestrians: sidewalk walkers who flee from danger and can be hit by cars.
// Plain data, no three.js, no DOM. The renderer draws each ped as a simple figure.
import { PEDS, WANTED } from './config.js';

function lanePoint(city, rng) {
  // A point on a sidewalk: beside a random road, offset to one side.
  const road = rng.pick(city.roads);
  const along = rng.range(-city.bounds + 8, city.bounds - 8);
  const side = rng.pick([-1, 1]);
  const off = 5 + 3 / 2 + 0.6; // road half-width + half sidewalk + margin
  if (road.axis === 'x') return { x: along, z: road.at + side * off, heading: rng.chance(0.5) ? 0 : Math.PI };
  return { x: road.at + side * off, z: along, heading: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 };
}

export function createPeds(city, rng) {
  const peds = [];
  for (let i = 0; i < PEDS.count; i++) {
    const spot = lanePoint(city, rng);
    peds.push({
      id: i,
      x: spot.x,
      z: spot.z,
      heading: spot.heading,
      speed: rng.range(1.0, 1.8),
      state: 'walk', // 'walk' | 'flee' | 'down'
      color: rng.pick([0xd96f4e, 0x4a7fb8, 0xe8c832, 0x8a6fb8, 0x3aa84f, 0xe8e8e8, 0x333333]),
      downTimer: 0,
      target: null,
    });
  }

  function nearestRoadPoint(x, z) {
    return city.nearestRoadPoint(x, z);
  }

  return {
    peds,
    update(dt, ctx) {
      const player = ctx.player;
      const px = player.pos.x;
      const pz = player.pos.z;
      const danger =
        ctx.police.wanted >= 2 ||
        ctx.shotsFiredRecently ||
        (ctx.events && ctx.events.some((e) => e.type === 'shot-fired'));
      for (const ped of peds) {
        if (ped.state === 'down') {
          ped.downTimer -= dt;
          if (ped.downTimer <= 0) {
            ped.state = 'walk';
            const spot = lanePoint(city, rng);
            ped.x = spot.x;
            ped.z = spot.z;
          }
          continue;
        }
        const dx = ped.x - px;
        const dz = ped.z - pz;
        const dist = Math.hypot(dx, dz);
        const playerCar = ctx.vehicles && ctx.vehicles.playerCar;
        const carNear = playerCar && Math.hypot(ped.x - playerCar.x, ped.z - playerCar.z) < 6;
        if ((danger && dist < 26) || (carNear && playerCar.speed > 4)) {
          ped.state = 'flee';
        } else if (ped.state === 'flee' && dist > 34) {
          ped.state = 'walk';
        }
        const speed = ped.state === 'flee' ? PEDS.fleeSpeed : ped.speed;
        if (ped.state === 'flee') {
          ped.heading = Math.atan2(dx, dz);
        }
        // Walk along the current heading; at intersections, keep straight or turn.
        let nx = ped.x + Math.sin(ped.heading) * speed * dt;
        let nz = ped.z + Math.cos(ped.heading) * speed * dt;
        if (city.isBlocked(nx, nz, 0.5) || Math.abs(nx) > 315 || Math.abs(nz) > 312) {
          // Turn around or pick a new sidewalk direction.
          ped.heading += rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
          nx = ped.x;
          nz = ped.z;
        }
        // A fast car hitting a ped knocks them down and is a crime.
        if (playerCar && playerCar.speed > 3) {
          const cd = Math.hypot(ped.x - playerCar.x, ped.z - playerCar.z);
          if (cd < 1.9) {
            ped.state = 'down';
            ped.downTimer = 6;
            ctx.events.push({ type: 'hit-ped', ped });
            if (ctx.police) ctx.police.addHeat(WANTED.crimeHeat.hitPed, 'hit-ped');
          }
        }
        ped.x = nx;
        ped.z = nz;
      }
    },
    // Nearest ped within maxDist of (x, z), or null.
    nearest(x, z, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        const d = Math.hypot(ped.x - x, ped.z - z);
        if (d < bestD) {
          bestD = d;
          best = ped;
        }
      }
      return best;
    },
    // Knock a ped down (punched or shot). Returns the ped or null.
    knockDown(ped) {
      if (!ped || ped.state === 'down') return null;
      ped.state = 'down';
      ped.downTimer = 6;
      return ped;
    },
    count() {
      return peds.length;
    },
    _lanePoint: lanePoint,
    _nearestRoadPoint: nearestRoadPoint,
  };
}

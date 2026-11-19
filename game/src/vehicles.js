// SOLMAR vehicles: traffic, parked cars, and the player's car.
// Pure logic — no three.js, no DOM, no Math.random. Rendering reads
// KIND_DIMS plus the plain car fields. y is up, ground y = 0, heading 0
// faces +Z; forward = (sin(heading), 0, cos(heading)).

import { CAR, TRAFFIC, PALETTE, WORLD } from './config.js';

// Renderer dimensions per kind: l = length (along heading), w = width,
// h = height.
export const KIND_DIMS = {
  sedan: { l: 4.4, w: 1.9, h: 1.35 },
  sport: { l: 4.2, w: 1.95, h: 1.2 },
  van: { l: 5.0, w: 2.0, h: 2.1 },
  truck: { l: 6.2, w: 2.2, h: 2.6 },
  taxi: { l: 4.4, w: 1.9, h: 1.35 },
  police: { l: 4.5, w: 1.95, h: 1.4 },
};

const KIND_MAX_SPEED = {
  sedan: 34,
  taxi: 34,
  van: 30,
  truck: 26,
  sport: 40,
  police: 36,
};

// Weighted traffic mix: mostly sedans, some taxis/vans, rare sport/truck.
const TRAFFIC_KINDS = [
  'sedan', 'sedan', 'sedan', 'sedan', 'sedan',
  'taxi', 'taxi', 'van', 'van', 'sport', 'truck',
];
const PARKED_KINDS = ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'sport'];

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

function rightOf(heading) {
  return { x: -Math.cos(heading), z: Math.sin(heading) };
}

// Road grid coordinates: roads centred at -320 + 40k, k = 0..16.
function roadCoords() {
  const coords = [];
  for (let k = 0; k <= 16; k++) coords.push(-WORLD.halfSize + WORLD.roadSpacing * k);
  return coords;
}

function snapToRoad(v, coords) {
  let best = coords[0];
  for (const c of coords) {
    if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  }
  return best;
}

// Try to move (x, z) by (dx, dz) against buildings/bounds, sliding along
// one axis when the diagonal is blocked. Returns the new position and
// whether the move was fully blocked.
export function slideMove(city, x, z, dx, dz, radius) {
  const nx = x + dx;
  const nz = z + dz;
  if (!city.isBlocked(nx, nz, radius)) return { x: nx, z: nz, blocked: false };
  if (!city.isBlocked(nx, z, radius)) return { x: nx, z, blocked: false };
  if (!city.isBlocked(x, nz, radius)) return { x, z: nz, blocked: false };
  return { x, z, blocked: true };
}

// Build a closed loop route of road waypoints starting near (x, z):
// a random walk that alternates axes (turning at intersections), then a
// Manhattan return to the start intersection so the loop closes.
function buildLoopRoute(x, z, rng) {
  const coords = roadCoords();
  let ix = coords.indexOf(snapToRoad(x, coords));
  let iz = coords.indexOf(snapToRoad(z, coords));
  const startIx = ix;
  const startIz = iz;
  const waypoints = [{ x: coords[ix], z: coords[iz] }];
  let axis = rng.chance(0.5) ? 'x' : 'z';
  const steps = rng.int(6, 10);
  for (let s = 0; s < steps; s++) {
    if (axis === 'x') {
      let nx = rng.int(0, 16);
      if (nx === ix) nx = (nx + 1) % 17;
      ix = nx;
    } else {
      let nz = rng.int(0, 16);
      if (nz === iz) nz = (nz + 1) % 17;
      iz = nz;
    }
    waypoints.push({ x: coords[ix], z: coords[iz] });
    axis = axis === 'x' ? 'z' : 'x';
  }
  // Manhattan return to the start intersection.
  if (ix !== startIx) waypoints.push({ x: coords[startIx], z: coords[iz] });
  if (iz !== startIz) waypoints.push({ x: coords[startIx], z: coords[startIz] });
  return waypoints;
}

export function createVehicles(city, rng) {
  const cars = [];
  let playerCar = null;
  let nextId = 0;
  // Events raised outside update() (steal, damage) queue here and are
  // flushed into ctx.events by update(), so callers never lose them.
  const pendingEvents = [];

  function flushEvents(ctx) {
    if (pendingEvents.length > 0 && ctx.events) {
      for (const e of pendingEvents) ctx.events.push(e);
      pendingEvents.length = 0;
    }
  }

  function addCar(kind, x, z, heading, driver) {
    const car = {
      id: 'car-' + (++nextId),
      kind,
      color: kind === 'police' ? 0x1e3a8a : rng.pick(PALETTE.car),
      x,
      z,
      heading,
      speed: 0,
      drift: 0, // lateral slide velocity (player car only)
      maxSpeed: KIND_MAX_SPEED[kind] || CAR.maxSpeed,
      driver: driver === undefined ? null : driver,
      health: CAR.health,
      route: null,
      routeIndex: 0,
      state: driver === 'parked' || driver === null || driver === undefined ? 'idle' : 'drive',
      lastCrashAt: -99, // building-impact event cooldown
      lastCarCrashAt: -99, // car-car impact event cooldown
      stuckT: 0, // time spent trying to move without displacing (traffic)
      recoverT: 0, // time left in a back-up-and-retry recovery (traffic)
    };
    cars.push(car);
    return car;
  }

  function removeCar(id) {
    const i = cars.findIndex((c) => c.id === id);
    if (i < 0) return;
    if (playerCar && playerCar.id === id) playerCar = null;
    cars.splice(i, 1);
  }

  function damageCar(car, amount, cause) {
    if (!car || car.state === 'wrecked' || amount <= 0) return;
    const before = car.health;
    car.health = Math.max(0, car.health - amount);
    if (before > 50 && car.health <= 50) {
      pendingEvents.push({ type: 'car-crash', car, severity: 0.6, cause });
    }
    if (car.health <= 0 && before > 0) {
      car.state = 'wrecked';
      car.speed = 0;
      car.drift = 0;
      pendingEvents.push({ type: 'car-wrecked', car, cause });
    }
  }

  // Move a car by (dx, dz) with building slide. On a hard full block
  // (impact > 8, once per 0.6 s per car), damage the car, raise a crash
  // event and cut its speed; a slow grind against a wall just doesn't
  // move — speed is left alone so steering/reversing out still works.
  function moveCar(car, dx, dz, ctx) {
    const res = slideMove(city, car.x, car.z, dx, dz, CAR.radius);
    car.x = res.x;
    car.z = res.z;
    if (res.blocked) {
      const impact = Math.hypot(car.speed, car.drift || 0);
      if (impact > 8 && (ctx.time || 0) - car.lastCrashAt > 0.6) {
        car.lastCrashAt = ctx.time || 0;
        const before = car.health;
        damageCar(car, impact * 0.8, 'building');
        const crossed = (before > 50 && car.health <= 50) || (before > 0 && car.health <= 0);
        if (!crossed && ctx.events) {
          ctx.events.push({ type: 'car-crash', car, severity: Math.min(1, impact / 20), cause: 'building' });
        }
        car.speed *= 0.3;
        car.drift = 0;
      }
      return false;
    }
    return true;
  }

  function driveTraffic(car, dt, ctx) {
    const startX = car.x;
    const startZ = car.z;
    // Stuck recovery: back up straight for a moment, then retry the route
    // from a better angle (e.g. after clipping a building corner).
    if (car.recoverT > 0) {
      car.recoverT -= dt;
      car.speed += clamp(-5 - car.speed, -CAR.brake * dt, CAR.accel * dt);
      const f = forwardOf(car.heading);
      moveCar(car, f.x * car.speed * dt, f.z * car.speed * dt, ctx);
      return;
    }
    const route = car.route;
    let wp = route[car.routeIndex];
    let dx = wp.x - car.x;
    let dz = wp.z - car.z;
    let dist = Math.hypot(dx, dz);
    if (dist < 5) {
      car.routeIndex = (car.routeIndex + 1) % route.length;
      wp = route[car.routeIndex];
      dx = wp.x - car.x;
      dz = wp.z - car.z;
      dist = Math.hypot(dx, dz);
    }
    const desired = Math.atan2(dx, dz);
    const diff = wrapAngle(desired - car.heading);
    const turnRate = 1.6;
    car.heading += clamp(diff, -turnRate * dt, turnRate * dt);

    // Slow for the car ahead: anything within minGap in our lane.
    const f = forwardOf(car.heading);
    const r = rightOf(car.heading);
    let desiredSpeed = TRAFFIC.cruiseSpeed;
    let leaderGap = Infinity;
    let leaderSpeed = 0;
    for (const o of cars) {
      if (o === car) continue;
      const rx = o.x - car.x;
      const rz = o.z - car.z;
      const along = rx * f.x + rz * f.z;
      const lat = rx * r.x + rz * r.z;
      if (along > 0 && along < TRAFFIC.minGap && Math.abs(lat) < 2.6 && along < leaderGap) {
        leaderGap = along;
        leaderSpeed = o.speed;
      }
    }
    if (leaderGap < TRAFFIC.minGap) desiredSpeed = Math.min(desiredSpeed, leaderSpeed);
    if (leaderGap < 4.5) desiredSpeed = 0;
    // Ease off for sharp turns.
    desiredSpeed *= clamp(1 - Math.abs(diff) / 1.8, 0.35, 1);

    const rate = desiredSpeed > car.speed ? CAR.accel * 0.6 : CAR.brake;
    car.speed += clamp(desiredSpeed - car.speed, -rate * dt, rate * dt);
    if (car.speed < 0.05 && desiredSpeed === 0) car.speed = 0;

    moveCar(car, f.x * car.speed * dt, f.z * car.speed * dt, ctx);
    // Stuck if we tried to move but barely displaced (pinned on a corner).
    const moved = Math.hypot(car.x - startX, car.z - startZ);
    if (car.speed > 1 && moved < 0.05) car.stuckT += dt;
    else car.stuckT = 0;
    if (car.stuckT > 1.2) {
      car.recoverT = 0.9;
      car.stuckT = 0;
    }
  }

  function drivePlayer(car, dt, input, ctx) {
    const maxSpeed = car.maxSpeed;
    if (input.forward) {
      car.speed += CAR.accel * dt;
      if (car.speed > maxSpeed) car.speed = maxSpeed;
    } else if (input.back) {
      if (car.speed > 0.5) {
        car.speed -= CAR.brake * dt;
      } else {
        car.speed -= CAR.reverseAccel * dt;
        if (car.speed < -CAR.maxReverse) car.speed = -CAR.maxReverse;
      }
    } else {
      // Rolling resistance.
      const drag = 6 * dt;
      if (Math.abs(car.speed) <= drag) car.speed = 0;
      else car.speed -= Math.sign(car.speed) * drag;
    }

    // Steering: authority falls with speed; reversed when reversing.
    const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    if (steerInput !== 0 && Math.abs(car.speed) > 0.1) {
      const authority = clamp(1 - Math.abs(car.speed) / (maxSpeed * 2.2), 0.3, 1);
      const dir = car.speed >= 0 ? 1 : -1;
      car.heading += steerInput * CAR.steer * authority * dir * dt;
    }
    // Slight drift: lateral slide builds while turning hard at speed,
    // bleeds off at the grip rate.
    const driftTarget = steerInput !== 0 ? steerInput * car.speed * 0.12 : 0;
    car.drift += clamp(driftTarget - car.drift, -CAR.grip * dt, CAR.grip * dt);

    const f = forwardOf(car.heading);
    const r = rightOf(car.heading);
    const vx = f.x * car.speed + r.x * car.drift;
    const vz = f.z * car.speed + r.z * car.drift;
    moveCar(car, vx * dt, vz * dt, ctx);
  }

  function dampSpeed(car, amount) {
    if (car.speed > 0) car.speed = Math.max(0, car.speed - amount);
    else if (car.speed < 0) car.speed = Math.min(0, car.speed + amount);
  }

  function isMovable(car) {
    return car.state !== 'wrecked' && car.driver !== 'parked';
  }

  // Pairwise circle collisions: push apart, exchange a little speed,
  // damage + events on hard impacts.
  function collideCars(ctx) {
    const R = CAR.radius * 2;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let dist = Math.hypot(dx, dz);
        if (dist >= R) continue;
        let nx;
        let nz;
        if (dist < 0.0001) {
          nx = 1;
          nz = 0;
          dist = 0.0001;
        } else {
          nx = dx / dist;
          nz = dz / dist;
        }
        const overlap = R - dist;
        const aMove = isMovable(a);
        const bMove = isMovable(b);
        if (aMove && bMove) {
          a.x -= nx * overlap / 2;
          a.z -= nz * overlap / 2;
          b.x += nx * overlap / 2;
          b.z += nz * overlap / 2;
        } else if (aMove) {
          a.x -= nx * overlap;
          a.z -= nz * overlap;
        } else if (bMove) {
          b.x += nx * overlap;
          b.z += nz * overlap;
        } else {
          continue;
        }

        // Closing speed along the separation axis.
        const fa = forwardOf(a.heading);
        const ra = rightOf(a.heading);
        const fb = forwardOf(b.heading);
        const rb = rightOf(b.heading);
        const vax = fa.x * a.speed + ra.x * (a.drift || 0);
        const vaz = fa.z * a.speed + ra.z * (a.drift || 0);
        const vbx = fb.x * b.speed + rb.x * (b.drift || 0);
        const vbz = fb.z * b.speed + rb.z * (b.drift || 0);
        const closing = (vax - vbx) * nx + (vaz - vbz) * nz;
        if (closing <= 0) continue;

        // Exchange a little speed: the aggressor loses some, the other
        // gets a small shove along its own forward if it faces away.
        if (aMove) {
          const approachA = vax * nx + vaz * nz;
          if (approachA > 0) dampSpeed(a, closing * 0.3);
          const pushA = (-nx) * fa.x + (-nz) * fa.z;
          if (pushA > 0 && a.speed >= 0) a.speed += closing * 0.12 * pushA;
        }
        if (bMove) {
          const approachB = vbx * (-nx) + vbz * (-nz);
          if (approachB > 0) dampSpeed(b, closing * 0.3);
          const pushB = nx * fb.x + nz * fb.z;
          if (pushB > 0 && b.speed >= 0) b.speed += closing * 0.12 * pushB;
        }

        if (closing > 4) {
          const now = ctx.time || 0;
          const aCool = now - a.lastCarCrashAt > 0.5;
          const bCool = now - b.lastCarCrashAt > 0.5;
          if (aCool || bCool) {
            a.lastCarCrashAt = now;
            b.lastCarCrashAt = now;
            const beforeA = a.health;
            const beforeB = b.health;
            // Gentle taps (closing <= 6) don't damage; harder hits scale
            // with impact speed. Police cars are tougher than civilian ones.
            const dmgA = Math.max(0, closing - 6) * 0.8 * (a.kind === 'police' ? 0.15 : 1);
            const dmgB = Math.max(0, closing - 6) * 0.8 * (b.kind === 'police' ? 0.15 : 1);
            damageCar(a, dmgA, 'car');
            damageCar(b, dmgB, 'car');
            const crossed =
              (beforeA > 50 && a.health <= 50) || (beforeA > 0 && a.health <= 0) ||
              (beforeB > 50 && b.health <= 50) || (beforeB > 0 && b.health <= 0);
            if (!crossed && ctx.events) {
              ctx.events.push({ type: 'car-crash', car: a, other: b, severity: Math.min(1, closing / 20), cause: 'car' });
            }
            if ((a === playerCar || b === playerCar) && closing > 6 && ctx.events) {
              ctx.events.push({ type: 'hit-car', severity: Math.min(1, closing / 15) });
            }
            a.drift = 0;
            b.drift = 0;
          }
        }
      }
    }
  }

  function spawnTraffic(n) {
    const made = [];
    for (let k = 0; k < n; k++) {
      const pt = city.randomPointOnRoad(rng);
      const kind = rng.pick(TRAFFIC_KINDS);
      const car = addCar(kind, pt.x, pt.z, pt.heading, 'traffic');
      car.route = buildLoopRoute(pt.x, pt.z, rng);
      car.routeIndex = 0;
      car.speed = TRAFFIC.cruiseSpeed * rng.range(0.6, 1.0);
      car.state = 'drive';
      made.push(car);
    }
    return made;
  }

  function spawnParked(n) {
    const made = [];
    for (let k = 0; k < n; k++) {
      let placed = false;
      for (let attempt = 0; attempt < 8 && !placed; attempt++) {
        const pt = city.randomPointOnRoad(rng);
        const r = rightOf(pt.heading);
        const side = rng.pick([-1, 1]);
        const off = 6.2 * side;
        const x = pt.x + r.x * off;
        const z = pt.z + r.z * off;
        if (city.isBlocked(x, z, CAR.radius)) continue;
        const kind = rng.pick(PARKED_KINDS);
        const car = addCar(kind, x, z, pt.heading, 'parked');
        car.state = 'idle';
        made.push(car);
        placed = true;
      }
    }
    return made;
  }

  function nearestStealable(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.state === 'wrecked') continue;
      if (car.driver !== 'traffic' && car.driver !== 'parked') continue;
      const d = Math.hypot(car.x - pos.x, car.z - pos.z);
      if (d <= bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car) {
    if (!car) return null;
    if (car.driver === 'traffic') {
      pendingEvents.push({ type: 'car-stolen', car });
    }
    car.driver = 'player';
    car.state = 'drive';
    playerCar = car;
    return car;
  }

  function exitCar() {
    const car = playerCar;
    if (!car) return null;
    car.driver = 'parked';
    car.state = 'idle';
    car.speed = 0;
    car.drift = 0;
    playerCar = null;
    return car;
  }

  function carAt(x, z, r, ignoreId) {
    for (const car of cars) {
      if (ignoreId !== undefined && car.id === ignoreId) continue;
      if (Math.hypot(car.x - x, car.z - z) < r + CAR.radius) return car;
    }
    return null;
  }

  function update(dt, ctx) {
    flushEvents(ctx);
    const input = ctx.input || {};
    for (const car of cars) {
      if (car.state === 'wrecked') {
        car.speed = 0;
        continue;
      }
      if (car === playerCar) {
        drivePlayer(car, dt, input, ctx);
      } else if (car.driver === 'traffic' && car.route) {
        driveTraffic(car, dt, ctx);
      } else if (car.driver === 'police') {
        // Driven by the police module; leave speed/position alone.
      } else {
        car.speed = 0;
      }
    }
    collideCars(ctx);
    // Keep ctx.player in sync with the car the player is driving.
    if (playerCar && ctx.player && ctx.player.pos) {
      ctx.player.pos.x = playerCar.x;
      ctx.player.pos.z = playerCar.z;
      ctx.player.heading = playerCar.heading;
      ctx.player.speed = playerCar.speed;
    }
    flushEvents(ctx);
  }

  return {
    cars,
    KIND_DIMS,
    get playerCar() {
      return playerCar;
    },
    spawnTraffic,
    spawnParked,
    update,
    nearestStealable,
    enterCar,
    exitCar,
    addCar,
    removeCar,
    carAt,
    damageCar,
  };
}

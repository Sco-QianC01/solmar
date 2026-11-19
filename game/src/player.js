// SOLMAR — player.js
// On-foot movement, jumping, car enter/exit, health.
// Plain data + ES modules only: no three.js, no DOM, no Math.random.
// y is up, ground is y = 0. Heading 0 faces +Z;
// forward = (sin(heading), 0, cos(heading)).

import { PLAYER, CAR } from './config.js';

// Side offsets (metres from the car centre) tried when exiting a car,
// in order: right, left, front, back (car-relative).
const EXIT_OFFSETS = [
  { x: 2.4, z: 0 },
  { x: -2.4, z: 0 },
  { x: 0, z: 2.6 },
  { x: 0, z: -2.6 },
];

export function createPlayer(city, vehicles, rng) {
  const player = {
    pos: { x: 0, y: 0, z: -10 }, // the plaza, south of the fountain
    heading: 0,
    velY: 0,
    onFoot: true,
    inCar: false,
    health: PLAYER.health,
    speed: 0, // current horizontal speed, both modes
    car: null,

    // Internal movement state (not part of the public contract).
    _vx: 0,
    _vz: 0,
    _prevAction: false,

    update(dt, input, ctx) {
      ctx = ctx || {};
      const events = ctx.events || null;
      input = input || {};

      // Edge-detect the action key: enter/exit only on the press frame.
      let actionResult = null;
      if (input.action && !this._prevAction) {
        actionResult = this.tryEnterExit(ctx);
        if (actionResult === 'entered' && events) {
          events.push({ type: 'car-entered', car: this.car });
        } else if (actionResult === 'exited' && events) {
          events.push({ type: 'car-exited' });
        }
      }
      this._prevAction = !!input.action;

      if (this.inCar) {
        // vehicles.js drives the car; the player rides along.
        const car = this.car;
        if (car) {
          this.pos.x = car.x;
          this.pos.y = 0;
          this.pos.z = car.z;
          this.heading = car.heading;
          this.speed = Math.abs(car.speed || 0);
          this.velY = 0;
        } else {
          // Defensive: car vanished without an exit — drop back on foot.
          this.inCar = false;
          this.onFoot = true;
        }
        return actionResult;
      }

      // ---- On foot ----
      // Camera-relative WASD. cameraHeading lives on the input (and is
      // mirrored on ctx as a fallback); movement is relative to it.
      const camH =
        (input.cameraHeading !== undefined ? input.cameraHeading : null) ??
        ctx.cameraHeading ??
        this.heading;
      const fx = Math.sin(camH);
      const fz = Math.cos(camH);
      // Right = forward rotated -90° about Y: (cos h, 0, -sin h).
      const rx = Math.cos(camH);
      const rz = -Math.sin(camH);

      let wx = 0;
      let wz = 0;
      if (input.forward) {
        wx += fx;
        wz += fz;
      }
      if (input.back) {
        wx -= fx;
        wz -= fz;
      }
      if (input.right) {
        wx += rx;
        wz += rz;
      }
      if (input.left) {
        wx -= rx;
        wz -= rz;
      }
      const wLen = Math.hypot(wx, wz);
      if (wLen > 1) {
        wx /= wLen;
        wz /= wLen;
      }

      const targetSpeed = wLen * (input.run ? PLAYER.runSpeed : PLAYER.walkSpeed);
      const tvx = wx * targetSpeed;
      const tvz = wz * targetSpeed;

      // Acceleration smoothing: approach the target velocity, capped by
      // PLAYER.accel per second, so stops and starts feel weighty.
      const maxDelta = PLAYER.accel * dt;
      let dvx = tvx - this._vx;
      let dvz = tvz - this._vz;
      const dLen = Math.hypot(dvx, dvz);
      if (dLen > maxDelta && dLen > 0) {
        dvx = (dvx / dLen) * maxDelta;
        dvz = (dvz / dLen) * maxDelta;
      }
      this._vx += dvx;
      this._vz += dvz;

      // Collision: slide — try x then z separately against buildings.
      const r = PLAYER.radius;
      const nx = this.pos.x + this._vx * dt;
      if (!city.isBlocked(nx, this.pos.z, r)) {
        this.pos.x = nx;
      } else {
        this._vx = 0;
      }
      const nz = this.pos.z + this._vz * dt;
      if (!city.isBlocked(this.pos.x, nz, r)) {
        this.pos.z = nz;
      } else {
        this._vz = 0;
      }

      // Stay inside the world.
      this.pos.x = Math.max(-319, Math.min(319, this.pos.x));
      this.pos.z = Math.max(-319, Math.min(319, this.pos.z));

      // Car circles: push out of any overlapping car.
      if (vehicles && typeof vehicles.carAt === 'function') {
        const hit = vehicles.carAt(this.pos.x, this.pos.z, r, null);
        if (hit) {
          const dx = this.pos.x - hit.x;
          const dz = this.pos.z - hit.z;
          const dist = Math.hypot(dx, dz);
          const minDist = (hit.radius || CAR.radius) + r;
          if (dist < minDist) {
            if (dist > 0.001) {
              this.pos.x = hit.x + (dx / dist) * minDist;
              this.pos.z = hit.z + (dz / dist) * minDist;
            } else {
              this.pos.x = hit.x + minDist;
            }
          }
        }
      }

      this.speed = Math.hypot(this._vx, this._vz);

      // Face the direction of travel while moving.
      if (this.speed > 0.5) {
        this.heading = Math.atan2(this._vx, this._vz);
      }

      // Jump + gravity; land flat on y = 0.
      if (input.jump && this.pos.y === 0) {
        this.velY = PLAYER.jumpSpeed;
      }
      if (this.pos.y > 0 || this.velY !== 0) {
        this.velY -= PLAYER.gravity * dt;
        this.pos.y += this.velY * dt;
        if (this.pos.y <= 0) {
          this.pos.y = 0;
          this.velY = 0;
        }
      }

      return actionResult;
    },

    // Enter the nearest stealable car, or exit the driven car.
    // Returns 'entered' | 'exited' | null. ctx (with events + police)
    // is optional so the method stays callable standalone.
    tryEnterExit(ctx) {
      ctx = ctx || {};
      const events = ctx.events || null;
      const police = ctx.police || null;

      if (this.onFoot) {
        const car =
          vehicles && typeof vehicles.nearestStealable === 'function'
            ? vehicles.nearestStealable(this.pos, 3.2)
            : null;
        if (!car) return null;
        // Capture the driver BEFORE enterCar reassigns it: only a traffic
        // car (a driver is thrown out) counts as a theft.
        const wasTraffic = car.driver === 'traffic';
        if (typeof vehicles.enterCar === 'function') vehicles.enterCar(car);
        this.car = car;
        this.onFoot = false;
        this.inCar = true;
        this._vx = 0;
        this._vz = 0;
        if (wasTraffic) {
          if (events) events.push({ type: 'car-stolen', car });
          if (police && typeof police.addHeat === 'function') {
            police.addHeat(CAR.stealHeat, 'steal');
          }
        }
        return 'entered';
      }

      // In a car: exit beside it at the first unblocked offset.
      const car = this.car;
      if (car) {
        const c = Math.cos(car.heading);
        const s = Math.sin(car.heading);
        let placed = false;
        for (const off of EXIT_OFFSETS) {
          // Car-relative offset -> world: right = (cos h, -sin h),
          // forward = (sin h, cos h).
          const cx = car.x + off.x * c + off.z * s;
          const cz = car.z + off.x * -s + off.z * c;
          const blocked = city.isBlocked(cx, cz, PLAYER.radius);
          const carThere =
            vehicles &&
            typeof vehicles.carAt === 'function' &&
            vehicles.carAt(cx, cz, PLAYER.radius, car.id);
          if (!blocked && !carThere) {
            this.pos.x = cx;
            this.pos.z = cz;
            placed = true;
            break;
          }
        }
        if (!placed) {
          // No clean spot: step out to the car's right regardless.
          this.pos.x = car.x + 2.4 * c;
          this.pos.z = car.z + 2.4 * -s;
        }
      }
      this.pos.y = 0;
      this.velY = 0;
      if (vehicles && typeof vehicles.exitCar === 'function') vehicles.exitCar();
      this.car = null;
      this.onFoot = true;
      this.inCar = false;
      return 'exited';
    },

    // Returns 'wasted' when this hit kills, else null.
    takeDamage(n) {
      this.health -= n;
      if (this.health <= 0) {
        this.health = 0;
        return 'wasted';
      }
      return null;
    },

    heal(n) {
      this.health = Math.min(PLAYER.health, this.health + n);
    },

    respawn(point) {
      this.pos.x = point.x;
      this.pos.y = 0;
      this.pos.z = point.z;
      this.heading = point.heading || 0;
      this.velY = 0;
      this._vx = 0;
      this._vz = 0;
      this.health = PLAYER.health;
      this.onFoot = true;
      this.inCar = false;
      this.car = null;
      this.speed = 0;
    },
  };

  return player;
}

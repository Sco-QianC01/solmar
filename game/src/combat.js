// SOLMAR — combat.js
// Enemy AI, pistol shooting (ray vs enemies + buildings), punching.
// Plain data + ES modules only: no three.js, no DOM, no Math.random.
// y is up, ground is y = 0. Heading 0 faces +Z.

import { PLAYER, COMBAT, WANTED } from './config.js';

// Enemies are vertical cylinders: radius 0.6 m, height 1.8 m. Shots are
// resolved in 2D against the ray's xz projection.
const ENEMY_RADIUS = 0.6;
const HIT_CHANCE = 0.35; // enemy shot hit probability
const FACE_ARC = 0.6; // radians either side of facing to open fire
const AGGRO_RANGE = 40; // enemies only act inside this range of the player
const EYE_HEIGHT = 1.5; // shot origin height above the player's feet
const FIRE_INTERVAL = 0.28; // seconds between player pistol shots

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Normalise a city collider into {minX, maxX, minZ, maxZ}. city.js may
// express colliders in any of the usual shapes; unknown shapes are skipped.
function normaliseCollider(c) {
  if (!c || typeof c !== 'object') return null;
  if (
    c.minX !== undefined &&
    c.maxX !== undefined &&
    c.minZ !== undefined &&
    c.maxZ !== undefined
  ) {
    return { minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ };
  }
  if (c.x !== undefined && c.z !== undefined) {
    if (c.hw !== undefined && c.hd !== undefined) {
      return { minX: c.x - c.hw, maxX: c.x + c.hw, minZ: c.z - c.hd, maxZ: c.z + c.hd };
    }
    if (c.halfW !== undefined && c.halfD !== undefined) {
      return {
        minX: c.x - c.halfW,
        maxX: c.x + c.halfW,
        minZ: c.z - c.halfD,
        maxZ: c.z + c.halfD,
      };
    }
    if (c.w !== undefined && c.d !== undefined) {
      return {
        minX: c.x - c.w / 2,
        maxX: c.x + c.w / 2,
        minZ: c.z - c.d / 2,
        maxZ: c.z + c.d / 2,
      };
    }
    if (c.r !== undefined) {
      return { minX: c.x - c.r, maxX: c.x + c.r, minZ: c.z - c.r, maxZ: c.z + c.r };
    }
  }
  return null;
}

// 2D slab ray-AABB test. Returns the entry distance along the ray, or
// Infinity when the ray misses (or starts inside, which counts as 0).
function rayAabb(ox, oz, dx, dz, box) {
  let tmin = 0;
  let tmax = Infinity;
  // X slab.
  if (Math.abs(dx) < 1e-9) {
    if (ox < box.minX || ox > box.maxX) return Infinity;
  } else {
    let t1 = (box.minX - ox) / dx;
    let t2 = (box.maxX - ox) / dx;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  // Z slab.
  if (Math.abs(dz) < 1e-9) {
    if (oz < box.minZ || oz > box.maxZ) return Infinity;
  } else {
    let t1 = (box.minZ - oz) / dz;
    let t2 = (box.maxZ - oz) / dz;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export function createCombat(city, rng) {
  const combat = {
    enemies: [],
    ammo: PLAYER.pistolAmmoStart,
    weapon: 'fists',
    hasPistol: false,

    _nextId: 1,
    _fireCooldown: 0,
    _prevShoot: false,
    _prevPunch: false,

    givePistol() {
      this.hasPistol = true;
      this.weapon = 'pistol';
    },

    addAmmo(n) {
      this.ammo += n;
    },

    spawnEnemy(x, z, opts) {
      opts = opts || {};
      const enemy = {
        id: this._nextId++,
        x,
        z,
        heading: opts.heading !== undefined ? opts.heading : rng.range(0, Math.PI * 2),
        health: opts.health !== undefined ? opts.health : COMBAT.enemyHealth,
        state: opts.state || 'idle',
        shootCooldown:
          opts.shootCooldown !== undefined
            ? opts.shootCooldown
            : rng.range(0, COMBAT.enemyShotCooldown),
        speed: opts.speed !== undefined ? opts.speed : COMBAT.enemySpeed,
      };
      this.enemies.push(enemy);
      return enemy;
    },

    clearEnemies() {
      this.enemies.length = 0;
    },

    // Ray vs enemies + buildings. Cars are the caller's job (vehicles is
    // not passed here). Consumes 1 ammo per shot.
    // Returns {hit:'enemy', enemy, dist} | {hit:'wall', dist} |
    //         {hit:null} | {hit:'empty'}.
    playerShoot(origin, dir) {
      if (this.ammo <= 0) return { hit: 'empty' };
      this.ammo -= 1;

      // Normalise the xz projection; a straight-up/down shot hits nothing.
      const len = Math.hypot(dir.x, dir.z);
      if (len < 1e-6) return { hit: null };
      const dx = dir.x / len;
      const dz = dir.z / len;
      const ox = origin.x;
      const oz = origin.z;
      const range = PLAYER.pistolRange;

      // Nearest blocking building distance.
      let wallDist = Infinity;
      const colliders = (city && city.colliders) || [];
      for (const raw of colliders) {
        const box = normaliseCollider(raw);
        if (!box) continue;
        const t = rayAabb(ox, oz, dx, dz, box);
        if (t < wallDist) wallDist = t;
      }

      // Nearest living enemy the ray passes within ENEMY_RADIUS of.
      let bestEnemy = null;
      let bestDist = Infinity;
      for (const e of this.enemies) {
        if (e.state === 'dead' || e.health <= 0) continue;
        const ex = e.x - ox;
        const ez = e.z - oz;
        const tProj = ex * dx + ez * dz; // distance along the ray
        if (tProj < 0 || tProj > range) continue;
        const perpSq = ex * ex + ez * ez - tProj * tProj;
        if (perpSq > ENEMY_RADIUS * ENEMY_RADIUS) continue;
        const tEntry = tProj - Math.sqrt(ENEMY_RADIUS * ENEMY_RADIUS - perpSq);
        if (tEntry < bestDist) {
          bestDist = tEntry;
          bestEnemy = e;
        }
      }

      if (bestEnemy && bestDist < wallDist && bestDist <= range) {
        bestEnemy.health -= PLAYER.pistolDamage;
        if (bestEnemy.health <= 0) {
          bestEnemy.health = 0;
          bestEnemy.state = 'dead';
        }
        return { hit: 'enemy', enemy: bestEnemy, dist: bestDist };
      }
      if (wallDist <= range) return { hit: 'wall', dist: wallDist };
      return { hit: null };
    },

    // Fists: enemies within range and inside the facing arc take damage.
    // Returns the list of enemies hit.
    playerPunch(pos, heading) {
      const hit = [];
      for (const e of this.enemies) {
        if (e.state === 'dead' || e.health <= 0) continue;
        const dx = e.x - pos.x;
        const dz = e.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > PLAYER.punchRange) continue;
        const angleTo = Math.atan2(dx, dz);
        if (Math.abs(angleDiff(angleTo, heading)) > PLAYER.punchArc) continue;
        e.health -= PLAYER.punchDamage;
        if (e.health <= 0) {
          e.health = 0;
          e.state = 'dead';
        }
        hit.push(e);
      }
      return hit;
    },

    update(dt, ctx) {
      ctx = ctx || {};
      const input = ctx.input || {};
      const player = ctx.player;
      const events = ctx.events || null;
      const police = ctx.police || null;

      if (this._fireCooldown > 0) this._fireCooldown -= dt;

      if (!player) return;

      // Player shooting, punching and weapon switching live in world.js
      // (single owner: it also plays the sound, spawns the muzzle flash and
      // adds the wanted heat). This update only runs the enemy AI.

      // ---- Enemy AI ----
      for (const e of this.enemies) {
        if (e.state === 'dead' || e.health <= 0) {
          e.state = 'dead';
          continue;
        }
        const dx = player.pos.x - e.x;
        const dz = player.pos.z - e.z;
        const dist = Math.hypot(dx, dz);

        if (dist > AGGRO_RANGE) {
          e.state = 'idle';
          continue;
        }

        const angleToPlayer = Math.atan2(dx, dz);
        const facing = Math.abs(angleDiff(angleToPlayer, e.heading)) < FACE_ARC;

        if (dist <= COMBAT.enemyShotRange && facing) {
          // Shoot: stand, face the player, fire on cooldown.
          e.state = 'shoot';
          e.heading = angleToPlayer;
          e.shootCooldown -= dt;
          if (e.shootCooldown <= 0) {
            e.shootCooldown = COMBAT.enemyShotCooldown;
            if (rng.chance(HIT_CHANCE)) {
              const result = player.takeDamage(COMBAT.enemyShotDamage);
              if (events) {
                events.push({
                  type: 'player-hit',
                  amount: COMBAT.enemyShotDamage,
                  enemy: e,
                });
              }
              if (result === 'wasted' && events) events.push({ type: 'wasted' });
            }
          }
        } else {
          // Chase: run at the player, sliding around buildings.
          e.state = 'chase';
          e.heading = angleToPlayer;
          const step = e.speed * dt;
          const nx = e.x + Math.sin(e.heading) * step;
          const nz = e.z + Math.cos(e.heading) * step;
          if (!city.isBlocked(nx, e.z, ENEMY_RADIUS)) e.x = nx;
          if (!city.isBlocked(e.x, nz, ENEMY_RADIUS)) e.z = nz;
        }
      }
    },
  };

  return combat;
}

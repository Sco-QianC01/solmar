// SOLMAR particle effects: a single THREE.Points pool (max ~600 particles)
// with per-particle position / velocity / life / colour / size, updated in
// update(dt). No textures, no external assets — plain coloured squares with
// vertex colours and size attenuation.

import * as THREE from 'three';

const MAX_PARTICLES = 600;

export function createEffects(scene) {
  // --- pool storage (structure-of-arrays, plain numbers) ---
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colours = new Float32Array(MAX_PARTICLES * 3);
  const velocities = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES); // seconds remaining
  const maxLife = new Float32Array(MAX_PARTICLES); // seconds at spawn
  const gravity = new Float32Array(MAX_PARTICLES);
  const baseSize = new Float32Array(MAX_PARTICLES);
  const alive = new Uint8Array(MAX_PARTICLES);
  const startColour = new Float32Array(MAX_PARTICLES * 3);
  const endColour = new Float32Array(MAX_PARTICLES * 3);
  let cursor = 0; // round-robin slot for new spawns
  let aliveCount = 0;

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positions, 3);
  const colourAttr = new THREE.BufferAttribute(colours, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  colourAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttr);
  geometry.setAttribute('color', colourAttr);
  // Draw range tracks the highest live slot; dead slots sit far below ground.
  geometry.setDrawRange(0, 0);

  const material = new THREE.PointsMaterial({
    size: 0.35,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  function spawn(x, y, z, vx, vy, vz, r, g, b, er, eg, eb, particleLife, grav, size) {
    const i = cursor;
    cursor = (cursor + 1) % MAX_PARTICLES;
    if (!alive[i]) aliveCount++;
    alive[i] = 1;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    velocities[i * 3] = vx;
    velocities[i * 3 + 1] = vy;
    velocities[i * 3 + 2] = vz;
    startColour[i * 3] = r;
    startColour[i * 3 + 1] = g;
    startColour[i * 3 + 2] = b;
    endColour[i * 3] = er;
    endColour[i * 3 + 1] = eg;
    endColour[i * 3 + 2] = eb;
    colours[i * 3] = r;
    colours[i * 3 + 1] = g;
    colours[i * 3 + 2] = b;
    life[i] = particleLife;
    maxLife[i] = particleLife;
    gravity[i] = grav;
    baseSize[i] = size;
  }

  function randomDir() {
    // Uniform random direction on a sphere.
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return [Math.cos(a) * s, u, Math.sin(a) * s];
  }

  function burst(pos, opts = {}) {
    const count = opts.count ?? 24;
    const speed = opts.speed ?? 6;
    const particleLife = opts.life ?? 0.7;
    const size = opts.size ?? 0.35;
    const grav = opts.gravity ?? -9;
    const c = opts.color ?? 0xffffff;
    const r = ((c >> 16) & 0xff) / 255;
    const g = ((c >> 8) & 0xff) / 255;
    const b = (c & 0xff) / 255;
    for (let n = 0; n < count; n++) {
      const [dx, dy, dz] = randomDir();
      const sp = speed * (0.35 + Math.random() * 0.65);
      spawn(
        pos.x, pos.y, pos.z,
        dx * sp, dy * sp, dz * sp,
        r, g, b, r * 0.25, g * 0.25, b * 0.25,
        particleLife * (0.6 + Math.random() * 0.7), grav, size,
      );
    }
  }

  return {
    // Generic coloured burst.
    burst,

    // Grey smoke: slow, rising, fading to dark.
    smoke(pos, opts = {}) {
      const count = opts.count ?? 10;
      for (let n = 0; n < count; n++) {
        spawn(
          pos.x + (Math.random() - 0.5) * 0.6,
          pos.y + Math.random() * 0.3,
          pos.z + (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 0.5,
          0.8 + Math.random() * 0.9, // rises
          (Math.random() - 0.5) * 0.5,
          0.55, 0.55, 0.55, 0.12, 0.12, 0.12,
          1.4 + Math.random() * 1.2, 1.5, 0.6,
        );
      }
    },

    // Orange-yellow sparks: fast, pulled down by gravity.
    sparks(pos) {
      const count = 18;
      for (let n = 0; n < count; n++) {
        const [dx, dy, dz] = randomDir();
        const sp = 5 + Math.random() * 7;
        const hot = Math.random() < 0.5;
        spawn(
          pos.x, pos.y, pos.z,
          dx * sp, Math.abs(dy) * sp * 0.7 + 1.5, dz * sp,
          1.0, hot ? 0.85 : 0.55, 0.15,
          0.6, 0.1, 0.02,
          0.35 + Math.random() * 0.45, -14, 0.22,
        );
      }
    },

    // Small yellow flash burst along dir (gun muzzle).
    muzzle(pos, dir) {
      const count = 8;
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const nx = dir.x / len, ny = dir.y / len, nz = dir.z / len;
      for (let n = 0; n < count; n++) {
        const along = 2 + Math.random() * 4;
        spawn(
          pos.x + nx * Math.random() * 0.4,
          pos.y + ny * Math.random() * 0.4,
          pos.z + nz * Math.random() * 0.4,
          nx * along + (Math.random() - 0.5) * 1.2,
          ny * along + (Math.random() - 0.5) * 1.2,
          nz * along + (Math.random() - 0.5) * 1.2,
          1.0, 0.9, 0.35, 0.9, 0.25, 0.05,
          0.1 + Math.random() * 0.12, 0, 0.3,
        );
      }
    },

    // Tan dust puff: low, slow, settles.
    dust(pos) {
      const count = 10;
      for (let n = 0; n < count; n++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.6 + Math.random() * 1.4;
        spawn(
          pos.x + (Math.random() - 0.5) * 0.5,
          Math.max(0.05, pos.y + Math.random() * 0.2),
          pos.z + (Math.random() - 0.5) * 0.5,
          Math.cos(a) * sp, 0.25 + Math.random() * 0.5, Math.sin(a) * sp,
          0.82, 0.72, 0.5, 0.55, 0.48, 0.33,
          0.7 + Math.random() * 0.6, -1.2, 0.45,
        );
      }
    },

    // Integrate, fade by life, recycle dead particles.
    update(dt) {
      const step = Math.max(0, Math.min(0.1, dt || 0));
      if (step === 0 || aliveCount === 0) {
        positionAttr.needsUpdate = false;
        colourAttr.needsUpdate = false;
        return;
      }
      let highest = -1;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (!alive[i]) continue;
        life[i] -= step;
        if (life[i] <= 0) {
          alive[i] = 0;
          aliveCount--;
          // Park dead particles far below the ground so they never render.
          positions[i * 3 + 1] = -1000;
          colours[i * 3] = colours[i * 3 + 1] = colours[i * 3 + 2] = 0;
          continue;
        }
        velocities[i * 3 + 1] += gravity[i] * step;
        positions[i * 3] += velocities[i * 3] * step;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * step;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * step;
        // Rest on the ground instead of falling through it.
        if (positions[i * 3 + 1] < 0.03 && gravity[i] < 0) {
          positions[i * 3 + 1] = 0.03;
          velocities[i * 3 + 1] = 0;
          velocities[i * 3] *= 0.9;
          velocities[i * 3 + 2] *= 0.9;
        }
        // Fade: interpolate start -> end colour as life runs out.
        const t = life[i] / maxLife[i]; // 1 at spawn, 0 at death
        colours[i * 3] = endColour[i * 3] + (startColour[i * 3] - endColour[i * 3]) * t;
        colours[i * 3 + 1] = endColour[i * 3 + 1] + (startColour[i * 3 + 1] - endColour[i * 3 + 1]) * t;
        colours[i * 3 + 2] = endColour[i * 3 + 2] + (startColour[i * 3 + 2] - endColour[i * 3 + 2]) * t;
        if (i > highest) highest = i;
      }
      geometry.setDrawRange(0, highest + 1);
      positionAttr.needsUpdate = true;
      colourAttr.needsUpdate = true;
    },

    // Kill every particle immediately.
    clear() {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        alive[i] = 0;
        life[i] = 0;
        positions[i * 3 + 1] = -1000;
        colours[i * 3] = colours[i * 3 + 1] = colours[i * 3 + 2] = 0;
      }
      aliveCount = 0;
      geometry.setDrawRange(0, 0);
      positionAttr.needsUpdate = true;
      colourAttr.needsUpdate = true;
    },
  };
}

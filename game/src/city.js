// SOLMAR city layout: roads, buildings, palms, props, colliders, landmarks.
// Plain data only — no three.js, no window/document. Deterministic per seed:
// the same seed always rebuilds the identical city.
//
// Layout recap (see config.js):
//   - City spans x, z in [-320, 320]. Roads every 40 m on both axes.
//   - Road centrelines at -320 + 40k (k = 0..16); road width 10, sidewalk 3
//     each side, so the buildable block interior between roads is 24 x 24 m.
//   - z > 272 is beach sand; z > 314 is sea (visual only).
//   - Heading 0 faces +Z; forward = (sin(heading), 0, cos(heading)).

import { WORLD, PALETTE } from './config.js';
import { createRandom, hashString } from './random.js';

// Road centreline positions on one axis: -320, -280, ..., 320.
function roadPositions() {
  const positions = [];
  for (let k = 0; k <= 16; k++) positions.push(-WORLD.halfSize + WORLD.roadSpacing * k);
  return positions;
}

// Block centres on one axis: -300, -260, ..., 300 (16 per axis).
function blockCentres() {
  const centres = [];
  for (let k = 0; k < 16; k++) {
    centres.push(-WORLD.halfSize + WORLD.roadSpacing * k + WORLD.roadSpacing / 2);
  }
  return centres;
}

// True when the block centred at (cx, cz) must stay empty of buildings.
function isEmptyBlock(cx, cz) {
  // Central plaza: the 2 x 2 blocks around the (0, 0) intersection.
  if (Math.abs(cx) <= 20 && Math.abs(cz) <= 20) return true;
  // Marina strip: x in [280, 320], z in [-40, 80].
  if (cx >= 280 && cz >= -40 && cz <= 80) return true;
  // Beach: any block whose interior reaches past z = 272.
  if (cz + WORLD.blockSize / 2 > WORLD.beachZ) return true;
  // Docks strip: x in [-320, -280], z in [120, 240].
  if (cx <= -280 && cz >= 120 && cz <= 240) return true;
  return false;
}

function buildRoads() {
  const roads = [];
  for (const at of roadPositions()) {
    roads.push({ axis: 'x', at });
    roads.push({ axis: 'z', at });
  }
  return roads;
}

function buildBuildings(rng) {
  // Collect every buildable block, shuffle, then fill until the target
  // count is reached so the total is stable (150) for every seed.
  const blocks = [];
  for (const cx of blockCentres()) {
    for (const cz of blockCentres()) {
      if (!isEmptyBlock(cx, cz)) blocks.push({ cx, cz });
    }
  }
  rng.shuffle(blocks);

  const TARGET = 150;
  const buildings = [];
  for (const { cx, cz } of blocks) {
    if (buildings.length >= TARGET) break;
    const remaining = TARGET - buildings.length;
    const two = remaining >= 2 && rng.chance(0.3);
    const dist = Math.hypot(cx, cz);
    const centrality = 1 - Math.min(1, dist / 420);
    const hMax = 12 + 48 * centrality;

    const makeBuilding = (x, z, w, d) => {
      let h = rng.range(8, hMax);
      if (cz > 200) h = Math.min(h, 14); // low near the beach
      return {
        x: Math.round(x * 100) / 100,
        z: Math.round(z * 100) / 100,
        w: Math.round(w * 100) / 100,
        d: Math.round(d * 100) / 100,
        h: Math.round(h * 100) / 100,
        color: rng.pick(PALETTE.building),
        roof: rng.pick(PALETTE.roof),
        winCols: Math.max(1, Math.floor(w / 3)),
        winRows: Math.max(1, Math.floor(h / 3.2)),
      };
    };

    if (two) {
      // Split the block into two 12 m halves along x.
      const w = rng.range(7, 10);
      const d = rng.range(10, 18);
      buildings.push(makeBuilding(cx - 6, cz + rng.range(-2, 2), w, d));
      buildings.push(makeBuilding(cx + 6, cz + rng.range(-2, 2), w, d));
    } else {
      const w = rng.range(10, 18);
      const d = rng.range(10, 18);
      buildings.push(makeBuilding(cx + rng.range(-2, 2), cz + rng.range(-2, 2), w, d));
    }
  }
  return buildings;
}

function buildPalms(rng) {
  const palms = [];
  const add = (x, z) => {
    palms.push({
      x: Math.round(x * 100) / 100,
      z: Math.round(z * 100) / 100,
      h: Math.round(rng.range(5, 8) * 100) / 100,
      lean: Math.round(rng.range(-0.12, 0.12) * 1000) / 1000,
    });
  };

  // Beach line: z 278..306, x spread across the whole shore.
  for (let i = 0; i < 36; i++) {
    add(-300 + i * 17 + rng.range(-4, 4), rng.range(278, 306));
  }
  // Plaza edges: 3 per side of the plaza square (x, z in [-32, 32]).
  for (const s of [-30, 30]) {
    for (const t of [-20, 0, 20]) {
      add(s, t);
      add(t, s);
    }
  }
  // Marina promenade: along x = 310, z from -30 to 70.
  for (let i = 0; i < 12; i++) {
    add(310 + rng.range(-1.5, 1.5), -30 + i * 9 + rng.range(-2, 2));
  }
  return palms;
}

function buildProps(rng) {
  const props = [];
  const add = (kind, x, z, rot) => {
    props.push({
      kind,
      x: Math.round(x * 100) / 100,
      z: Math.round(z * 100) / 100,
      rot: Math.round(rot * 1000) / 1000,
    });
  };

  // Lamps every ~40 m along five avenues, alternating sides of the road
  // (offset 6.5 m puts them on the sidewalk, just off the asphalt).
  const lampAvenues = [
    { axis: 'x', at: -160 },
    { axis: 'x', at: 0 },
    { axis: 'x', at: 160 },
    { axis: 'z', at: -160 },
    { axis: 'z', at: 160 },
  ];
  for (const road of lampAvenues) {
    for (let i = 0; i < 16; i++) {
      const along = -300 + i * 40;
      const side = i % 2 === 0 ? 6.5 : -6.5;
      if (road.axis === 'x') add('lamp', road.at + side, along, 0);
      else add('lamp', along, road.at + side, 0);
    }
  }

  // Benches around the plaza: 4 per side, facing the centre.
  for (const t of [-24, -8, 8, 24]) {
    add('bench', -30, t, Math.PI / 2);
    add('bench', 30, t, -Math.PI / 2);
    add('bench', t, -30, Math.PI);
    add('bench', t, 30, 0);
  }

  // Crates at the docks: scattered in the docks strip.
  for (let i = 0; i < 12; i++) {
    add('crate', rng.range(-312, -288), rng.range(130, 230), rng.range(0, Math.PI * 2));
  }

  // Hydrants on sidewalk corners at random intersections (inland only).
  const positions = roadPositions().filter((p) => Math.abs(p) <= 240);
  for (let i = 0; i < 16; i++) {
    const rx = rng.pick(positions);
    const rz = rng.pick(positions);
    const sx = rng.chance(0.5) ? 6.5 : -6.5;
    const sz = rng.chance(0.5) ? 6.5 : -6.5;
    add('hydrant', rx + sx, rz + sz, rng.range(0, Math.PI * 2));
  }

  // One fountain at the plaza centre.
  add('fountain', 0, 0, 0);
  return props;
}

// The fountain is a circular basin: its collider is the rim, four boxes
// around the centre, so the exact plaza centre (0, 0) stays walkable.
const FOUNTAIN_RIM = [
  { minX: -1.5, maxX: 1.5, minZ: 1.8, maxZ: 3.2 },
  { minX: -1.5, maxX: 1.5, minZ: -3.2, maxZ: -1.8 },
  { minX: 1.8, maxX: 3.2, minZ: -1.5, maxZ: 1.5 },
  { minX: -3.2, maxX: -1.8, minZ: -1.5, maxZ: 1.5 },
];

const LANDMARKS = [
  { name: 'plaza', x: 0, z: 0, kind: 'plaza' },
  { name: 'cityHall', x: -80, z: -80, kind: 'civic' },
  { name: 'marina', x: 300, z: 20, kind: 'marina' },
  { name: 'docks', x: -300, z: 180, kind: 'docks' },
  { name: 'mall', x: 120, z: -120, kind: 'mall' },
  { name: 'beach', x: 0, z: 296, kind: 'beach' },
  { name: 'safehouse', x: -200, z: 200, kind: 'house' },
  { name: 'casino', x: 200, z: 120, kind: 'casino' },
  { name: 'garage', x: 40, z: 80, kind: 'garage' },
];

export function createCity(seed) {
  const rng = createRandom(seed);
  const palmRng = createRandom(hashString(`palms:${seed}`));
  const propRng = createRandom(hashString(`props:${seed}`));

  const roads = buildRoads();
  const buildings = buildBuildings(rng);
  const palms = buildPalms(palmRng);
  const props = buildProps(propRng);

  const colliders = buildings.map((b) => ({
    minX: b.x - b.w / 2,
    maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2,
    maxZ: b.z + b.d / 2,
  }));
  for (const rim of FOUNTAIN_RIM) colliders.push({ ...rim });

  function isBlocked(x, z, r = 0.5) {
    // Outside the playable bounds (map-edge handling lives here).
    if (x - r < -316 || x + r > 316 || z - r < -316 || z + r > 312) return true;
    for (const c of colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) {
        return true;
      }
    }
    return false;
  }

  function randomPointOnRoad(rng) {
    const road = rng.pick(roads);
    const along = rng.range(-300, 300);
    const lane = rng.chance(0.5) ? 2.5 : -2.5;
    const heading = rng.chance(0.5);
    if (road.axis === 'x') {
      // Road line x = at, running along z; heading 0 (+Z) or PI (-Z).
      return { x: road.at + lane, z: along, heading: heading ? 0 : Math.PI };
    }
    // Road line z = at, running along x; heading PI/2 (+X) or -PI/2 (-X).
    return { x: along, z: road.at + lane, heading: heading ? Math.PI / 2 : -Math.PI / 2 };
  }

  function nearestRoadPoint(x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const road of roads) {
      let px;
      let pz;
      let dist;
      if (road.axis === 'x') {
        px = road.at;
        pz = Math.max(-320, Math.min(320, z));
        dist = Math.abs(x - road.at);
      } else {
        px = Math.max(-320, Math.min(320, x));
        pz = road.at;
        dist = Math.abs(z - road.at);
      }
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: px, z: pz };
      }
    }
    return best;
  }

  return {
    seed,
    bounds: 320,
    roads,
    buildings,
    palms,
    props,
    colliders,
    isBlocked,
    randomPointOnRoad,
    nearestRoadPoint,
    landmarks: LANDMARKS.map((l) => ({ ...l })),
    beach: { z0: WORLD.beachZ },
    seaZ: WORLD.seaZ,
  };
}

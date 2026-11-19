// SOLMAR shared tuning: one place for every number the systems agree on.
// All distances are metres, all angles radians, y is up, ground is y = 0.
// Heading 0 faces +Z; forward = (sin(heading), 0, cos(heading)).

export const WORLD = {
  halfSize: 320, // city spans x, z in [-320, 320]
  roadSpacing: 40, // roads every 40 m on both axes
  roadWidth: 10, // drivable asphalt width
  sidewalkWidth: 3,
  beachZ: 272, // z > beachZ is sand
  seaZ: 314, // z > seaZ is water (visual only)
  blockSize: 24, // buildings live inside 24 m blocks between roads (40 - 10 road - 2x3 sidewalk)
};

export const PLAYER = {
  walkSpeed: 4.4,
  runSpeed: 7.6,
  accel: 26,
  jumpSpeed: 7.6,
  gravity: 21,
  radius: 0.55,
  eyeHeight: 1.7,
  health: 100,
  punchDamage: 12,
  punchRange: 2.1,
  punchArc: 0.9, // radians either side of facing
  pistolDamage: 34,
  pistolRange: 60,
  pistolAmmoStart: 24,
};

export const CAR = {
  accel: 14,
  brake: 26,
  reverseAccel: 8,
  maxSpeed: 34, // ~122 km/h, sport 40
  maxReverse: 10,
  steer: 0.55, // rad/s at full lock, scaled down with speed
  grip: 6,
  radius: 1.6, // collision circle
  health: 100,
  stealHeat: 0.35, // wanted heat added for stealing a traffic car
};

export const TRAFFIC = {
  count: 14,
  cruiseSpeed: 9,
  minGap: 11, // slow down when a car is this close ahead
  parkedCount: 10,
};

export const PEDS = {
  count: 26,
  walkSpeed: 1.4,
  fleeSpeed: 3.4,
};

export const WANTED = {
  maxStars: 5,
  // heat 0..1; stars are thresholds on heat
  starAt: [0.12, 0.3, 0.5, 0.7, 0.88],
  decayPerSec: 0.012, // heat lost while unseen and crime-free
  decayHiddenBonus: 0.02, // extra decay while no cop can see the player
  crimeHeat: { steal: 0.35, hitPed: 0.45, hitCar: 0.12, shot: 0.3, kill: 0.5 },
  bustRadius: 1.7, // foot cop touching the player busts them
  bustHoldSec: 1.2, // cop must stay in radius this long
  copCarPerStar: 1,
  maxCopCars: 4,
  maxFootCops: 6,
};

export const COMBAT = {
  enemyHealth: 60,
  enemyShotDamage: 8,
  enemyShotCooldown: 1.6,
  enemyShotRange: 26,
  enemySpeed: 3.4,
};

// Sun-soaked Solmar palette: warm plaster, terracotta, white, coral, teal sea.
export const PALETTE = {
  skyTop: 0x2f7fd0,
  skyHorizon: 0xbfd9e8,
  sun: 0xfff2d0,
  sea: 0x1e7f9e,
  sand: 0xe8d3a2,
  asphalt: 0x3a3f46,
  sidewalk: 0xcfc8b8,
  building: [0xf2e6cf, 0xe8b48a, 0xffffff, 0xd96f4e, 0x8fb8a8, 0xf0d060, 0xc98a6b, 0x9db8c8],
  roof: [0xb8542e, 0x7a6a58, 0x4a6a72, 0x8a4a3a],
  car: [0xd23b2e, 0x2e6fd2, 0xe8c832, 0x3aa84f, 0xe8e8e8, 0x222831, 0xd97fb0, 0x7a4fd0],
  grass: 0x7fae62,
  palm: 0x4a8a3f,
};

// Keyboard + mouse. Also read by hud.js for the controls hint.
export const KEYS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  run: 'ShiftLeft',
  jump: 'Space',
  action: 'KeyE', // enter / exit car, pick up, interact
  punch: 'KeyF',
  shoot: 'Mouse0',
  pistol: 'Digit1',
  fists: 'Digit2',
  pause: 'Escape',
  pauseAlt: 'KeyP',
  confirm: 'Enter',
  horn: 'KeyH',
};

export const SAVE_KEY = 'solmar-save-v1';

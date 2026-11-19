// Seeded random numbers (mulberry32). Every deterministic system in SOLMAR
// takes its randomness from here so a fixed seed replays the same city.

// Mulberry32: small, fast, deterministic across engines.
export function createRandom(seed) {
  let a = seed >>> 0;
  function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    // Float in [min, max).
    range(min, max) {
      return min + (max - min) * next();
    },
    // Integer in [min, max] inclusive.
    int(min, max) {
      return Math.floor(min + (max - min + 1) * next());
    },
    // One element of a non-empty array.
    pick(array) {
      return array[Math.floor(next() * array.length)];
    },
    // true with probability p (0..1).
    chance(p) {
      return next() < p;
    },
    // In-place Fisher-Yates shuffle; returns the same array.
    shuffle(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    },
  };
}

// A stable 32-bit hash of a short string, for deriving sub-seeds.
export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

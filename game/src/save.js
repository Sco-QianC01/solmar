// SOLMAR save system: localStorage persistence for the player's progress.
// All three functions are wrapped in try/catch — private mode or a full
// quota may throw, and a failed save must never crash the game.
//
// Data shape:
//   {
//     version: 1,
//     cash: number,            // player cash in dollars
//     missionIndex: number,    // index of the next mission to play
//     playerPos: { x, y, z },  // world position to respawn at
//     health: number,          // 0..100
//     coinsTaken: number[],    // indices of collected world coins
//     storyDone: boolean,      // true once the story missions are finished
//     savedAt: number,         // Date.now() at save time
//   }

import { SAVE_KEY } from './config.js';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null || raw === undefined) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (data.version !== 1) return null;
    if (!isFiniteNumber(data.cash)) return null;
    if (!isFiniteNumber(data.missionIndex)) return null;
    // Normalise the optional fields so callers always get a complete shape.
    return {
      version: 1,
      cash: data.cash,
      missionIndex: Math.floor(data.missionIndex),
      playerPos: data.playerPos && isFiniteNumber(data.playerPos.x)
        && isFiniteNumber(data.playerPos.y) && isFiniteNumber(data.playerPos.z)
        ? { x: data.playerPos.x, y: data.playerPos.y, z: data.playerPos.z }
        : { x: 0, y: 0, z: 0 },
      health: isFiniteNumber(data.health) ? Math.max(0, Math.min(100, data.health)) : 100,
      coinsTaken: Array.isArray(data.coinsTaken)
        ? data.coinsTaken.filter((n) => isFiniteNumber(n))
        : [],
      storyDone: data.storyDone === true,
      savedAt: isFiniteNumber(data.savedAt) ? data.savedAt : 0,
    };
  } catch (e) {
    // Corrupt JSON, missing storage, or a thrown getter: no save.
    return null;
  }
}

export function saveGame(data) {
  try {
    if (!data || typeof data !== 'object') return;
    const payload = {
      version: 1,
      cash: isFiniteNumber(data.cash) ? data.cash : 0,
      missionIndex: isFiniteNumber(data.missionIndex) ? Math.floor(data.missionIndex) : 0,
      playerPos: data.playerPos && isFiniteNumber(data.playerPos.x)
        && isFiniteNumber(data.playerPos.y) && isFiniteNumber(data.playerPos.z)
        ? { x: data.playerPos.x, y: data.playerPos.y, z: data.playerPos.z }
        : { x: 0, y: 0, z: 0 },
      health: isFiniteNumber(data.health) ? Math.max(0, Math.min(100, data.health)) : 100,
      coinsTaken: Array.isArray(data.coinsTaken)
        ? data.coinsTaken.filter((n) => isFiniteNumber(n))
        : [],
      storyDone: data.storyDone === true,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch (e) {
    // Storage unavailable or full: silently no-op.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // Silently no-op.
  }
}

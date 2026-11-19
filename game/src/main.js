// SOLMAR boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between four screens: title, play, paused and game over.
//
// ?seed=N fixes the city. ?shot=cover|street|mission|drive (with &seed=N) stages
// that scene instead of running the loop, paints it a few times and sets
// window.__shotReady for a screenshot.
import { KEYS } from './config.js';
import * as THREE from 'three';
import { createInput } from './input.js';
import { createWorld } from './world.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const CITY_SEED = 20261118;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : CITY_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
// The scene is shared: the world (effects) and the renderer both draw into it.
const scene = new THREE.Scene();
const world = createWorld({ scene, seed });
const renderer = createRenderer(canvas, world, scene);
const input = createInput(canvas);

let screen = 'title';
let cameraHeading = 0;
let cameraPitch = 0.32;
let lastMouseAt = 0;

function announce(message) {
  status.textContent = message;
}

// Shortest signed angle from a to b, in (-PI, PI].
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

function applyMouseLook(dt) {
  const look = input.takeLook();
  if (look.dx !== 0 || look.dy !== 0) {
    cameraHeading -= look.dx * 0.0032;
    cameraPitch = Math.min(1.05, Math.max(0.06, cameraPitch + look.dy * 0.0022));
    lastMouseAt = world.time;
  }
  // Ease the camera behind the player/car when the mouse has been still.
  const target = world.vehicles.playerCar;
  const heading = target ? target.heading : world.player.heading;
  const speed = target ? Math.abs(target.speed) : world.player.speed;
  if (speed > 1 && world.time - lastMouseAt > 1.5) {
    const rate = target ? 2.2 : 1.1;
    cameraHeading += angleDelta(cameraHeading, heading) * Math.min(1, rate * dt);
  }
}

function startFresh() {
  world.toTitle();
  world.missions.cash = 150;
  world.missions.index = -1;
  world.missions.storyDone = false;
  world.setMission(0, 0);
  world.player.respawn({ x: 0, y: 0, z: -10 });
  world.player.health = 100;
  world.combat.weapon = 'fists';
  // Face the first mission marker (Rico at the plaza) so the opening walk
  // heads around the fountain instead of straight into it.
  cameraHeading = Math.atan2(10, 16);
  cameraPitch = 0.32;
  screen = 'play';
  input.requestLock();
  world.audio.setMusic(true);
  announce('Playing. Meet Rico at the plaza.');
}

function continueGame() {
  const loaded = world.loadSave();
  screen = 'play';
  input.requestLock();
  world.audio.setMusic(true);
  announce(loaded ? 'Save loaded. Playing.' : 'No save found. Playing.');
}

function quitToTitle() {
  world.toTitle();
  screen = 'title';
  showTitle();
}

function showTitle() {
  // Peek at the save without applying it: loadSave() validates, so read raw.
  let hasSave = false;
  try {
    hasSave = !!window.localStorage.getItem('solmar-save-v1');
  } catch {
    hasSave = false;
  }
  world.hud.showTitle({
    hasSave,
    onNew: () => {
      try {
        window.localStorage.removeItem('solmar-save-v1');
      } catch {
        // ignore
      }
      startFresh();
    },
    onContinue: continueGame,
    onHowTo: () => {
      world.hud.message('WASD move · Mouse look · E enter/exit car · F punch · 1 pistol · Shift run · Space jump · Esc pause');
    },
  });
  announce('SOLMAR. Press Enter to start.');
}

function pauseGame() {
  if (screen !== 'play') return;
  screen = 'pause';
  input.exitLock();
  world.hud.showPause({
    onResume: () => {
      screen = 'play';
      input.requestLock();
      announce('Playing.');
    },
    onRestart: () => {
      world.respawn();
      world.setMission(Math.max(0, world.missions.index), 0);
      screen = 'play';
      input.requestLock();
      announce('Playing.');
    },
    onQuitToTitle: quitToTitle,
  });
  announce('Paused.');
}

function endGame(kind) {
  screen = 'over';
  input.exitLock();
  world.hud.showGameOver({
    kind,
    cash: world.missions.cash,
    onRetry: () => {
      world.respawn();
      screen = 'play';
      input.requestLock();
      announce('Playing.');
    },
    onTitle: quitToTitle,
  });
  announce(kind === 'busted' ? 'Busted. The cops got you.' : 'Wasted. You are down.');
}

// ---- shot mode: stage one scene, paint it, signal readiness ----------------
function runShot(name) {
  cameraHeading = stageShot(name, world);
  cameraPitch = 0.3;
  // Let the HUD pick up the staged state.
  const idle = {
    forward: false, back: false, left: false, right: false, run: false,
    jump: false, action: false, punch: false, shoot: false, pistol: false,
    fists: false, horn: false, takePressed: () => false, takeLook: () => ({ dx: 0, dy: 0 }),
  };
  for (let i = 0; i < 5; i++) world.update(STEP, idle, cameraHeading, cameraPitch);
  // Snap the camera to the gameplay framing before the first paint.
  renderer.snapCamera(cameraHeading);
  let painted = 0;
  function paint() {
    renderer.draw(STEP, world.time, cameraHeading);
    painted += 1;
    if (painted < 4) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      document.title = 'SHOT-READY';
    }
  }
  requestAnimationFrame(paint);
}

// ---- normal play -------------------------------------------------------------
function runGame() {
  let last = performance.now();
  let accumulator = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    // First gesture unlocks audio.
    if (input.takePressed('Mouse0') || input.takePressed('Enter')) world.audio.unlock();

    if (screen === 'title') {
      if (input.takePressed('Enter') || input.takePressed('Mouse0')) {
        startFresh();
      } else {
        // Attract mode: slow orbit around the plaza.
        cameraHeading += frameDt * 0.05;
        renderer.draw(frameDt, world.time, cameraHeading);
      }
      input.endFrame();
      return;
    }

    if (screen === 'pause' || screen === 'over') {
      renderer.draw(frameDt, world.time, cameraHeading);
      input.endFrame();
      return;
    }

    // screen === 'play'
    if (input.takePressed(KEYS.pause) || input.takePressed(KEYS.pauseAlt)) {
      pauseGame();
      input.endFrame();
      return;
    }
    applyMouseLook(frameDt);
    accumulator += frameDt;
    while (accumulator >= STEP) {
      const result = world.update(STEP, input, cameraHeading, cameraPitch);
      accumulator -= STEP;
      if (result && result.screen) {
        endGame(result.screen);
        break;
      }
    }
    renderer.draw(frameDt, world.time, cameraHeading);
    input.endFrame();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') pauseGame();
  });

  showTitle();
  requestAnimationFrame(frame);
}

if (shot) {
  // Stage the scene, face the camera at the action, and paint.
  runShot(shot);
} else {
  runGame();
}

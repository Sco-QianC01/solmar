// Keyboard + mouse input. One live state object; the loop reads it every frame.
// Mouse look uses pointer lock while playing; click (Mouse0) is also the shoot button.
import { KEYS } from './config.js';

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  let lookDX = 0;
  let lookDY = 0;
  let locked = false;
  let shootHeld = false;

  function codeOf(event) {
    return event.code;
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    down.add(codeOf(event));
    pressed.add(codeOf(event));
    if (codeOf(event) === KEYS.jump) event.preventDefault();
  }

  function onKeyUp(event) {
    down.delete(codeOf(event));
  }

  function onBlur() {
    down.clear();
  }

  function onMouseDown(event) {
    if (event.button === 0) {
      shootHeld = true;
      pressed.add('Mouse0');
      if (!locked && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    }
  }

  function onMouseUp(event) {
    if (event.button === 0) shootHeld = false;
  }

  function onMouseMove(event) {
    if (!locked) return;
    lookDX += event.movementX || 0;
    lookDY += event.movementY || 0;
  }

  function onLockChange() {
    locked = document.pointerLockElement === canvas;
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('contextmenu', onContextMenu);

  const state = {
    get locked() {
      return locked;
    },
    // Live booleans, read every frame.
    get forward() {
      return down.has(KEYS.forward);
    },
    get back() {
      return down.has(KEYS.back);
    },
    get left() {
      return down.has(KEYS.left);
    },
    get right() {
      return down.has(KEYS.right);
    },
    get run() {
      return down.has(KEYS.run);
    },
    get jump() {
      return down.has(KEYS.jump);
    },
    get action() {
      return down.has(KEYS.action);
    },
    get punch() {
      return down.has(KEYS.punch);
    },
    get shoot() {
      return shootHeld;
    },
    get pistol() {
      return down.has(KEYS.pistol);
    },
    get fists() {
      return down.has(KEYS.fists);
    },
    get horn() {
      return down.has(KEYS.horn);
    },
    // True once per physical press; the loop consumes it each frame.
    takePressed(code) {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    // Mouse look deltas since the last call; consuming zeroes them.
    takeLook() {
      const out = { dx: lookDX, dy: lookDY };
      lookDX = 0;
      lookDY = 0;
      return out;
    },
    // End-of-frame housekeeping: drop stale single-press flags.
    endFrame() {
      pressed.clear();
    },
    requestLock() {
      canvas.requestPointerLock?.();
    },
    exitLock() {
      document.exitPointerLock?.();
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
  return state;
}

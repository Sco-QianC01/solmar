// SOLMAR HUD: owns all DOM UI. Creates its own elements and appends them to
// document.body (the page only guarantees a <canvas id="game"> exists).
// DOM-only module: no three.js import. All DOM work happens inside
// createHud(); importing this module has no side effects.

import { WORLD, KEYS } from './config.js';

// Human-readable names for the controls hint, in display order.
const CONTROLS = [
  ['W A S D', 'Move / drive'],
  ['Shift', 'Run'],
  ['Space', 'Jump'],
  ['E', 'Enter / exit car · pick up'],
  ['F', 'Punch'],
  ['Mouse', 'Shoot pistol'],
  ['1 / 2', 'Pistol / fists'],
  ['H', 'Horn'],
  ['Esc', 'Pause'],
];

export function createHud() {
  // ---------- injected stylesheet ----------
  const style = document.createElement('style');
  style.textContent = `
    .solmar-hud { position: fixed; z-index: 20; pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #f5f1e6; user-select: none; }
    .solmar-panel { background: rgba(12, 14, 20, 0.62); border: 1px solid rgba(245, 241, 230, 0.16);
      border-radius: 10px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35); padding: 10px 14px; }
    .solmar-amber { color: #ffb63d; }
    /* top-left: health + cash */
    #solmar-topleft { top: 14px; left: 14px; display: flex; flex-direction: column; gap: 8px; }
    .solmar-healthrow { display: flex; align-items: center; gap: 8px; }
    .solmar-healthlabel { font-size: 11px; letter-spacing: 2px; font-weight: 700; color: #cfd2d6; }
    .solmar-healthbar { width: 190px; height: 12px; border-radius: 6px; background: rgba(255,255,255,0.14);
      overflow: hidden; border: 1px solid rgba(255,255,255,0.18); }
    .solmar-healthfill { height: 100%; width: 100%; border-radius: 6px;
      background: linear-gradient(90deg, #3ecf6a, #9be15d); transition: width 0.18s ease-out; }
    .solmar-healthfill.low { background: linear-gradient(90deg, #e23b2e, #ff7a3d); }
    .solmar-cash { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }
    .solmar-cash small { font-size: 11px; font-weight: 600; color: #b9bdc4; letter-spacing: 2px; margin-left: 6px; }
    /* top-right: wanted stars */
    #solmar-topright { top: 14px; right: 14px; text-align: right; }
    .solmar-stars { font-size: 26px; letter-spacing: 3px; line-height: 1; }
    .solmar-stars .on { color: #ffb63d; text-shadow: 0 0 10px rgba(255, 182, 61, 0.7); }
    .solmar-stars .off { color: rgba(255,255,255,0.22); }
    .solmar-stars.hot .on { color: #ff3b30; text-shadow: 0 0 12px rgba(255, 59, 48, 0.9); }
    .solmar-wantedlabel { font-size: 10px; letter-spacing: 3px; font-weight: 700; color: #b9bdc4; margin-top: 4px; }
    /* top-centre: mission */
    #solmar-topcentre { top: 14px; left: 50%; transform: translateX(-50%); text-align: center; max-width: 46vw; }
    .solmar-missiontitle { font-size: 15px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; }
    .solmar-objective { font-size: 13px; color: #e8e2d2; margin-top: 3px; }
    /* bottom-left: minimap */
    #solmar-minimapwrap { bottom: 14px; left: 14px; padding: 6px; }
    #solmar-minimap { display: block; width: 180px; height: 180px; border-radius: 6px; }
    /* bottom-right: speed + weapon */
    #solmar-bottomright { bottom: 14px; right: 14px; text-align: right; }
    .solmar-speed { font-size: 30px; font-weight: 800; line-height: 1; }
    .solmar-speed small { font-size: 12px; font-weight: 600; color: #b9bdc4; margin-left: 3px; }
    .solmar-weapon { font-size: 13px; font-weight: 700; margin-top: 5px; color: #e8e2d2; }
    .solmar-weapon .ammo { color: #ffb63d; }
    /* centre message */
    #solmar-message { top: 38%; left: 50%; transform: translateX(-50%); text-align: center;
      font-size: 22px; font-weight: 700; letter-spacing: 0.5px; color: #fff;
      text-shadow: 0 2px 10px rgba(0,0,0,0.8); opacity: 0; transition: opacity 0.35s ease; white-space: nowrap; }
    /* bottom-centre: controls hint */
    #solmar-hint { bottom: 14px; left: 50%; transform: translateX(-50%); text-align: center;
      font-size: 11px; color: #cfd2d6; transition: opacity 1s ease; }
    #solmar-hint b { color: #ffb63d; }
    /* wanted vignette pulse */
    #solmar-vignette { position: fixed; inset: 0; z-index: 15; pointer-events: none; opacity: 0;
      background: radial-gradient(ellipse at center, transparent 52%, rgba(255, 30, 20, 0.55) 100%);
      transition: opacity 0.12s ease; }
    /* full-screen screens */
    .solmar-screen { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center;
      background: rgba(8, 10, 16, 0.72); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
      pointer-events: auto; }
    .solmar-card { background: rgba(16, 19, 27, 0.88); border: 1px solid rgba(255, 182, 61, 0.35);
      border-radius: 14px; padding: 34px 42px; max-width: 560px; width: min(92vw, 560px);
      text-align: center; box-shadow: 0 18px 60px rgba(0,0,0,0.6); }
    .solmar-bigtitle { font-size: 64px; font-weight: 900; letter-spacing: 14px; margin: 0 0 4px 10px;
      background: linear-gradient(180deg, #ffe9a8, #ffb63d 55%, #e07b1f);
      -webkit-background-clip: text; background-clip: text; color: transparent; }
    .solmar-subtitle { font-size: 15px; color: #d8d2c2; margin: 0 0 18px; }
    .solmar-blurb { font-size: 13px; line-height: 1.6; color: #b9bdc4; margin: 0 0 22px; text-align: left; }
    .solmar-btn { display: block; width: 100%; margin: 8px 0; padding: 12px 18px; font-size: 16px; font-weight: 700;
      letter-spacing: 1px; color: #1a1408; background: linear-gradient(180deg, #ffcf5e, #f5a623);
      border: none; border-radius: 9px; cursor: pointer; }
    .solmar-btn:hover { filter: brightness(1.1); }
    .solmar-btn.ghost { background: transparent; color: #f5f1e6; border: 1px solid rgba(245,241,230,0.35); }
    .solmar-btn.ghost:hover { background: rgba(255,255,255,0.08); }
    .solmar-controls { text-align: left; font-size: 13px; line-height: 1.9; color: #cfd2d6;
      border-top: 1px solid rgba(255,255,255,0.12); padding-top: 14px; margin-top: 18px; }
    .solmar-controls b { color: #ffb63d; display: inline-block; min-width: 92px; }
    .solmar-card h2 { font-size: 30px; letter-spacing: 4px; margin: 0 0 10px; }
    .solmar-card p { font-size: 14px; color: #cfd2d6; line-height: 1.6; }
    .solmar-busted { color: #ff5a4d; }
    .solmar-wasted { color: #ff5a4d; }
    .solmar-reward { font-size: 24px; font-weight: 800; color: #ffb63d; margin: 10px 0 4px; }
    /* mission complete banner */
    #solmar-missionbanner { position: fixed; top: 22%; left: 50%; transform: translateX(-50%); z-index: 35;
      pointer-events: auto; cursor: pointer; text-align: center; min-width: 320px; }
    #solmar-missionbanner h3 { margin: 0; font-size: 22px; letter-spacing: 3px; color: #ffb63d; }
    #solmar-missionbanner .solmar-reward { margin: 6px 0 0; }
    .solmar-hidden { display: none !important; }
  `;
  document.head.appendChild(style);

  // ---------- helpers ----------
  function el(tag, cls, parent) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (parent) parent.appendChild(node);
    return node;
  }

  // ---------- vignette (wanted pulse) ----------
  const vignette = el('div');
  vignette.id = 'solmar-vignette';
  document.body.appendChild(vignette);

  // ---------- top-left: health + cash ----------
  const topLeft = el('div', 'solmar-hud', document.body);
  topLeft.id = 'solmar-topleft';
  const healthPanel = el('div', 'solmar-panel', topLeft);
  const healthRow = el('div', 'solmar-healthrow', healthPanel);
  el('span', 'solmar-healthlabel', healthRow).textContent = 'HEALTH';
  const healthBar = el('div', 'solmar-healthbar', healthRow);
  const healthFill = el('div', 'solmar-healthfill', healthBar);
  const cashLine = el('div', 'solmar-cash', healthPanel);
  const cashValue = document.createTextNode('$0');
  cashLine.appendChild(cashValue);
  const cashLabel = el('small', '', cashLine);
  cashLabel.textContent = 'CASH';

  // ---------- top-right: wanted stars ----------
  const topRight = el('div', 'solmar-hud solmar-panel', document.body);
  topRight.id = 'solmar-topright';
  const stars = el('div', 'solmar-stars', topRight);
  const starSpans = [];
  for (let i = 0; i < 5; i++) {
    const s = el('span', 'off', stars);
    s.textContent = '★';
    starSpans.push(s);
  }
  el('div', 'solmar-wantedlabel', topRight).textContent = 'WANTED';

  // ---------- top-centre: mission ----------
  const topCentre = el('div', 'solmar-hud solmar-panel', document.body);
  topCentre.id = 'solmar-topcentre';
  const missionTitle = el('div', 'solmar-missiontitle solmar-amber', topCentre);
  missionTitle.textContent = 'SOLMAR';
  const objective = el('div', 'solmar-objective', topCentre);
  objective.textContent = '';

  // ---------- bottom-left: minimap ----------
  const mapWrap = el('div', 'solmar-hud solmar-panel', document.body);
  mapWrap.id = 'solmar-minimapwrap';
  const mapCanvas = el('canvas', '', mapWrap);
  mapCanvas.id = 'solmar-minimap';
  mapCanvas.width = 180;
  mapCanvas.height = 180;
  const mapCtx = mapCanvas.getContext('2d');

  // ---------- bottom-right: speed + weapon ----------
  const bottomRight = el('div', 'solmar-hud solmar-panel', document.body);
  bottomRight.id = 'solmar-bottomright';
  const speedLine = el('div', 'solmar-speed', bottomRight);
  const speedValue = document.createTextNode('0');
  speedLine.appendChild(speedValue);
  el('small', '', speedLine).textContent = 'km/h';
  const weaponLine = el('div', 'solmar-weapon', bottomRight);
  weaponLine.textContent = 'FISTS';

  // ---------- centre message ----------
  const messageEl = el('div', 'solmar-hud', document.body);
  messageEl.id = 'solmar-message';

  // ---------- bottom-centre: controls hint ----------
  const hint = el('div', 'solmar-hud solmar-panel', document.body);
  hint.id = 'solmar-hint';
  hint.innerHTML = CONTROLS.map(([k, v]) => `<b>${k}</b> ${v}`).join(' &nbsp;·&nbsp; ');

  // ---------- screens ----------
  const screens = {}; // name -> root element
  function makeScreen(name) {
    const root = el('div', 'solmar-screen solmar-hidden', document.body);
    root.id = `solmar-screen-${name}`;
    screens[name] = root;
    return root;
  }

  // Title screen
  const titleRoot = makeScreen('title');
  const titleCard = el('div', 'solmar-card', titleRoot);
  el('h1', 'solmar-bigtitle', titleCard).textContent = 'SOLMAR';
  const subtitle = el('p', 'solmar-subtitle', titleCard);
  subtitle.textContent = 'A sun-soaked open-world crime story — an original game';
  const blurb = el('p', 'solmar-blurb', titleCard);
  blurb.textContent =
    'Mara Voss arrives in Solmar with nothing but a duffel bag and a debt to pay. ' +
    'The city smells of salt, petrol and opportunity. Rico, a fixer with a smile ' +
    'like a knife, offers her work — the kind that pays in cash and costs in stars. ' +
    'Drive, fight, and take the city one job at a time.';
  const btnNew = el('button', 'solmar-btn', titleCard);
  btnNew.textContent = 'New Game';
  const btnContinue = el('button', 'solmar-btn', titleCard);
  btnContinue.textContent = 'Continue';
  const btnHowTo = el('button', 'solmar-btn ghost', titleCard);
  btnHowTo.textContent = 'How to Play';
  const titleControls = el('div', 'solmar-controls', titleCard);
  titleControls.innerHTML = CONTROLS.map(([k, v]) => `<b>${k}</b> ${v}`).join('<br>');

  // Pause screen
  const pauseRoot = makeScreen('pause');
  const pauseCard = el('div', 'solmar-card', pauseRoot);
  el('h2', '', pauseCard).textContent = 'PAUSED';
  const pauseSub = el('p', '', pauseCard);
  pauseSub.textContent = 'Solmar waits for no one — except right now.';
  const btnResume = el('button', 'solmar-btn', pauseCard);
  btnResume.textContent = 'Resume';
  const btnRestart = el('button', 'solmar-btn ghost', pauseCard);
  btnRestart.textContent = 'Restart Mission';
  const btnQuit = el('button', 'solmar-btn ghost', pauseCard);
  btnQuit.textContent = 'Quit to Title';

  // Game over screen
  const overRoot = makeScreen('gameover');
  const overCard = el('div', 'solmar-card', overRoot);
  const overTitle = el('h2', '', overCard);
  overTitle.textContent = 'WASTED';
  const overText = el('p', '', overCard);
  overText.textContent = '';
  const overCash = el('div', 'solmar-reward', overCard);
  overCash.textContent = '';
  const btnRetry = el('button', 'solmar-btn', overCard);
  btnRetry.textContent = 'Retry';
  const btnOverTitle = el('button', 'solmar-btn ghost', overCard);
  btnOverTitle.textContent = 'Back to Title';

  // Mission complete banner (small, not full screen)
  const banner = el('div', 'solmar-panel solmar-hidden', document.body);
  banner.id = 'solmar-missionbanner';
  const bannerTitle = el('h3', '', banner);
  bannerTitle.textContent = 'MISSION COMPLETE';
  const bannerName = el('div', '', banner);
  bannerName.textContent = '';
  const bannerReward = el('div', 'solmar-reward', banner);
  bannerReward.textContent = '';

  // ---------- state ----------
  let messageTimer = null;
  let bannerTimer = null;
  let bannerCallback = null;
  let lastMapDraw = 0;
  let playSeconds = 0;
  let lastUpdate = performance.now();

  // Minimap: world [-320, 320] -> canvas [0, 180]. North (-z) is up.
  const MAP_SIZE = 180;
  const HALF = WORLD.halfSize; // 320
  function toMap(x, z) {
    return [(x + HALF) / (2 * HALF) * MAP_SIZE, (z + HALF) / (2 * HALF) * MAP_SIZE];
  }
  function drawMinimap(mm) {
    const c = mapCtx;
    if (!c) return;
    // Dark land base.
    c.fillStyle = '#10151d';
    c.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Beach strip (z > beachZ) and sea strip (z > seaZ): south = bottom of map.
    const [, beachY] = toMap(0, WORLD.beachZ);
    const [, seaY] = toMap(0, WORLD.seaZ);
    c.fillStyle = '#c9a86a';
    c.fillRect(0, beachY, MAP_SIZE, MAP_SIZE - beachY);
    c.fillStyle = '#1e7f9e';
    c.fillRect(0, seaY, MAP_SIZE, MAP_SIZE - seaY);
    // Buildings as blocks (from city data if supplied).
    if (mm && mm.city && Array.isArray(mm.city.buildings)) {
      c.fillStyle = '#3a4150';
      for (const b of mm.city.buildings) {
        const [x0, z0] = toMap(b.x - b.w / 2, b.z - b.d / 2);
        const [x1, z1] = toMap(b.x + b.w / 2, b.z + b.d / 2);
        c.fillRect(x0, z0, Math.max(1, x1 - x0), Math.max(1, z1 - z0));
      }
    }
    // Roads as light lines, every 40 m on both axes.
    c.strokeStyle = 'rgba(220, 224, 232, 0.55)';
    c.lineWidth = 2;
    c.beginPath();
    for (let k = 0; k <= 16; k++) {
      const coord = -HALF + WORLD.roadSpacing * k;
      const [px] = toMap(coord, 0);
      const [, pz] = toMap(0, coord);
      c.moveTo(px, 0); c.lineTo(px, MAP_SIZE);
      c.moveTo(0, pz); c.lineTo(MAP_SIZE, pz);
    }
    c.stroke();
    if (!mm) return;
    // Coins as gold dots.
    if (Array.isArray(mm.coins)) {
      c.fillStyle = '#ffd34d';
      for (const p of mm.coins) {
        const [x, y] = toMap(p.x, p.z);
        c.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
    // Traffic as grey dots.
    if (Array.isArray(mm.cars)) {
      c.fillStyle = '#9aa0aa';
      for (const p of mm.cars) {
        const [x, y] = toMap(p.x, p.z);
        c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill();
      }
    }
    // Pedestrians as tiny pale dots.
    if (Array.isArray(mm.peds)) {
      c.fillStyle = 'rgba(230, 228, 220, 0.8)';
      for (const p of mm.peds) {
        const [x, y] = toMap(p.x, p.z);
        c.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    // Police as flashing blue/red dots (flash by wall clock).
    if (Array.isArray(mm.cops)) {
      const blue = Math.floor(performance.now() / 350) % 2 === 0;
      c.fillStyle = blue ? '#3b82f6' : '#ef4444';
      for (const p of mm.cops) {
        const [x, y] = toMap(p.x, p.z);
        c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
      }
    }
    // Mission marker as a pulsing yellow diamond.
    if (mm.marker) {
      const pulse = 4 + Math.sin(performance.now() / 250) * 1.5;
      const [x, y] = toMap(mm.marker.x, mm.marker.z);
      c.fillStyle = '#ffd34d';
      c.beginPath();
      c.moveTo(x, y - pulse); c.lineTo(x + pulse, y);
      c.lineTo(x, y + pulse); c.lineTo(x - pulse, y);
      c.closePath(); c.fill();
    }
    // Player as a white arrow pointing along heading (0 faces +Z = down on map).
    if (mm.playerPos) {
      const [x, y] = toMap(mm.playerPos.x, mm.playerPos.z);
      const h = mm.playerHeading || 0;
      // Map angle: heading 0 (+Z) points down (+y on canvas).
      const a = Math.atan2(Math.cos(h), Math.sin(h)); // canvas angle from +x axis
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.fillStyle = '#ffffff';
      c.strokeStyle = '#111111';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(7, 0); c.lineTo(-5, -4.5); c.lineTo(-2.5, 0); c.lineTo(-5, 4.5);
      c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
  }

  function hideAllScreens() {
    for (const key of Object.keys(screens)) screens[key].classList.add('solmar-hidden');
    banner.classList.add('solmar-hidden');
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    bannerCallback = null;
  }

  // Dismiss the mission banner (timer or click) and fire its callback once.
  function dismissBanner() {
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    banner.classList.add('solmar-hidden');
    if (bannerCallback) {
      const cb = bannerCallback;
      bannerCallback = null;
      cb();
    }
  }

  return {
    update(state) {
      const now = performance.now();
      const dt = Math.min(0.5, (now - lastUpdate) / 1000);
      lastUpdate = now;
      playSeconds += dt;

      // Controls hint fades after 12 s of play.
      if (playSeconds > 12) hint.style.opacity = '0';

      if (!state) return;

      if (typeof state.health === 'number') {
        const hp = Math.max(0, Math.min(100, state.health));
        healthFill.style.width = hp + '%';
        healthFill.classList.toggle('low', hp <= 30);
      }
      if (typeof state.cash === 'number') {
        cashValue.textContent = '$' + Math.floor(state.cash).toLocaleString('en-US');
      }
      if (typeof state.wanted === 'number') {
        const w = Math.max(0, Math.min(5, Math.floor(state.wanted)));
        for (let i = 0; i < 5; i++) starSpans[i].className = i < w ? 'on' : 'off';
        stars.classList.toggle('hot', w >= 3);
      }
      if (typeof state.missionTitle === 'string') missionTitle.textContent = state.missionTitle;
      if (typeof state.objective === 'string') objective.textContent = state.objective;
      if (typeof state.speedKmh === 'number') {
        speedValue.textContent = String(Math.max(0, Math.round(state.speedKmh)));
      }
      if (typeof state.weapon === 'string') {
        if (state.onFoot === false) {
          weaponLine.textContent = 'DRIVING';
        } else if (state.weapon === 'pistol') {
          const ammo = typeof state.ammo === 'number' ? state.ammo : 0;
          weaponLine.innerHTML = '';
          weaponLine.appendChild(document.createTextNode('PISTOL  '));
          const a = el('span', 'ammo', weaponLine);
          a.textContent = ammo + ' rounds';
        } else {
          weaponLine.textContent = 'FISTS';
        }
      }
      // Minimap redraw, throttled to ~10 Hz.
      if (state.minimap && now - lastMapDraw >= 100) {
        lastMapDraw = now;
        drawMinimap(state.minimap);
      }
    },

    message(text) {
      if (typeof text !== 'string' || !text) return;
      messageEl.textContent = text;
      messageEl.style.opacity = '1';
      if (messageTimer) clearTimeout(messageTimer);
      messageTimer = setTimeout(() => { messageEl.style.opacity = '0'; }, 3000);
    },

    flashWanted() {
      vignette.style.opacity = '1';
      setTimeout(() => { vignette.style.opacity = '0'; }, 160);
      setTimeout(() => { vignette.style.opacity = '0.55'; }, 320);
      setTimeout(() => { vignette.style.opacity = '0'; }, 560);
    },

    showTitle({ hasSave, onNew, onContinue, onHowTo }) {
      hideAllScreens();
      btnContinue.style.display = hasSave ? '' : 'none';
      btnNew.onclick = () => { if (onNew) onNew(); };
      btnContinue.onclick = () => { if (onContinue) onContinue(); };
      btnHowTo.onclick = () => { if (onHowTo) onHowTo(); };
      titleRoot.classList.remove('solmar-hidden');
    },

    hideScreens() {
      hideAllScreens();
    },

    showPause({ onResume, onRestart, onQuitToTitle }) {
      btnResume.onclick = () => { if (onResume) onResume(); };
      btnRestart.onclick = () => { if (onRestart) onRestart(); };
      btnQuit.onclick = () => { if (onQuitToTitle) onQuitToTitle(); };
      pauseRoot.classList.remove('solmar-hidden');
    },

    hidePause() {
      pauseRoot.classList.add('solmar-hidden');
    },

    showGameOver({ kind, cash, onRetry, onTitle }) {
      hideAllScreens();
      const busted = kind === 'busted';
      overTitle.textContent = busted ? 'BUSTED' : 'WASTED';
      overTitle.className = busted ? 'solmar-busted' : 'solmar-wasted';
      overText.textContent = busted
        ? 'The Solmar PD hauled you in. Bail is expensive, and so is your pride.'
        : 'You went down in the streets of Solmar. The city moves on without you.';
      overCash.textContent = typeof cash === 'number'
        ? 'Cash kept: $' + Math.floor(cash).toLocaleString('en-US')
        : '';
      btnRetry.onclick = () => { if (onRetry) onRetry(); };
      btnOverTitle.onclick = () => { if (onTitle) onTitle(); };
      overRoot.classList.remove('solmar-hidden');
    },

    hideGameOver() {
      overRoot.classList.add('solmar-hidden');
    },

    showMissionComplete({ title, reward, onContinue }) {
      bannerTitle.textContent = 'MISSION COMPLETE';
      bannerName.textContent = title || '';
      bannerReward.textContent = typeof reward === 'number'
        ? '+$' + Math.floor(reward).toLocaleString('en-US')
        : '';
      bannerCallback = typeof onContinue === 'function' ? onContinue : null;
      banner.classList.remove('solmar-hidden');
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(dismissBanner, 4000);
      banner.onclick = dismissBanner;
    },

    hideMissionComplete() {
      dismissBanner();
    },
  };
}

// Re-exported for callers that build the hint from config keys.
export { KEYS };

// SOLMAR — missions.js
// Story missions, taxi side activity, collectible coins.
// Original story: protagonist Mara Voss, fixer Rico, set in Solmar.
// Plain data + ES modules only: no three.js, no DOM, no Math.random
// (all randomness comes from deps.rng).

import { WANTED } from './config.js';

// Fallback coordinates for each story location, used when city.landmarks
// does not (yet) carry the name. All inside [-320, 320], on or beside roads.
const FALLBACKS = {
  plaza: [0, 0],
  garage: [40, -80],
  docks: [-240, 260],
  marina: [200, 280],
  mall: [-80, 80],
  safehouse: [120, -160],
  casino: [-160, -40],
  beach: [0, 296],
};

function findLandmark(city, names, fallbackKey) {
  const fb = FALLBACKS[fallbackKey];
  if (city && Array.isArray(city.landmarks)) {
    for (const name of names) {
      const lm = city.landmarks.find(
        (l) => l && typeof l.name === 'string' && l.name.toLowerCase().includes(name),
      );
      if (lm) return { x: lm.x, z: lm.z };
    }
  }
  return { x: fb[0], z: fb[1] };
}

// Heat needed to sit on a given wanted-star threshold (WANTED.starAt:
// 0.12 / 0.3 / 0.5 / 0.7 / 0.88). Target sits just above the threshold.
function heatToReach(police, stars) {
  const target = WANTED.starAt[stars - 1] + 0.05;
  const current = (police && police.heat) || 0;
  return Math.max(0, target - current);
}

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function createMissions(deps) {
  const city = deps.city;
  const player = deps.player;
  const vehicles = deps.vehicles;
  const police = deps.police;
  const combat = deps.combat;
  const rng = deps.rng;

  const plaza = findLandmark(city, ['plaza'], 'plaza');
  const garage = findLandmark(city, ['garage'], 'garage');
  const docks = findLandmark(city, ['dock', 'harbour', 'harbor', 'port'], 'docks');
  const marina = findLandmark(city, ['marina'], 'marina');
  const mall = findLandmark(city, ['mall'], 'mall');
  const safehouse = findLandmark(city, ['safehouse', 'safe house', 'hideout'], 'safehouse');
  const casino = findLandmark(city, ['casino'], 'casino');
  const beach = findLandmark(city, ['beach'], 'beach');

  // The five story missions. Step types:
  //   goto    — reach the marker (on foot or in a car)
  //   drive   — reach the marker; player.pos follows the car, so this
  //             works for driving too; requireCar forces being in a car
  //   steal   — complete as soon as the player is in a car
  //   pickup  — reach the marker, then the item is collected
  //   deliver — reach the marker with the cargo
  //   defeat  — complete when every spawned enemy is dead
  const list = [
    {
      id: 'new-in-town',
      title: 'New in Town',
      briefing:
        'Mara Voss just rolled into Solmar with $150 and a borrowed jacket. ' +
        'Rico, the fixer who runs the garage off the plaza, is waiting to size her up.',
      reward: 300,
      steps: [
        {
          text: 'Meet Rico at the plaza',
          type: 'goto',
          marker: { x: plaza.x + 10, z: plaza.z + 6 },
          radius: 5,
        },
        { text: 'Steal a car', type: 'steal', marker: null },
        {
          text: "Drive to Rico's garage",
          type: 'drive',
          marker: { x: garage.x, z: garage.z },
          radius: 8,
        },
      ],
    },
    {
      id: 'harbor-run',
      title: 'Harbor Run',
      briefing:
        'Rico has a crate sitting on the docks that the harbour police would ' +
        'love to open. Pick it up, keep it quiet, and run it to the marina.',
      reward: 600,
      steps: [
        {
          text: 'Pick up the crate at the docks',
          type: 'pickup',
          marker: { x: docks.x, z: docks.z },
          radius: 6,
          heatOnComplete: 0.35, // pickup draws police attention: +2 stars
          heatReason: 'harbor',
        },
        {
          text: 'Deliver the crate to the marina',
          type: 'deliver',
          marker: { x: marina.x, z: marina.z },
          radius: 8,
        },
      ],
    },
    {
      id: 'the-drop',
      title: 'The Drop',
      briefing:
        'A sealed package, a crowded mall, no car. Walk it in on foot and ' +
        'hand it over, then slip away to the safehouse. If the police are ' +
        'already hunting you, they will be watching the mall.',
      reward: 500,
      steps: [
        {
          text: 'Carry the package to the mall — on foot',
          type: 'goto',
          marker: { x: mall.x, z: mall.z },
          radius: 6,
          onFoot: true,
        },
        {
          text: 'Reach the safehouse',
          type: 'goto',
          marker: { x: safehouse.x, z: safehouse.z },
          radius: 6,
        },
      ],
    },
    {
      id: 'getaway',
      title: 'Getaway',
      briefing:
        'The casino job went loud. Mara has 150 seconds to drive from the ' +
        'casino to the safehouse with every cop in Solmar on her tail.',
      reward: 900,
      timed: 150,
      steps: [
        {
          text: 'Drive to the safehouse before time runs out',
          type: 'drive',
          marker: { x: safehouse.x, z: safehouse.z },
          radius: 8,
        },
      ],
    },
    {
      id: 'the-big-score',
      title: 'The Big Score',
      briefing:
        'The casino vault, three guards, one night. Take the cash, then ' +
        'run for the beach by car while the whole city lights up.',
      reward: 2500,
      steps: [
        {
          text: 'Go to the casino',
          type: 'goto',
          marker: { x: casino.x, z: casino.z },
          radius: 8,
        },
        {
          text: 'Defeat the 3 casino guards',
          type: 'defeat',
          marker: { x: casino.x, z: casino.z },
          radius: 10,
        },
        {
          text: 'Grab the cash inside the casino',
          type: 'pickup',
          marker: { x: casino.x + 6, z: casino.z - 4 },
          radius: 4,
        },
        {
          text: 'Escape by car to the beach',
          type: 'drive',
          marker: { x: beach.x, z: beach.z },
          radius: 10,
          requireCar: true,
        },
      ],
    },
  ];

  // 10 collectible coins at seeded scenic spots (ground level only).
  const coinSpots = [
    [plaza.x, plaza.z],
    [beach.x, beach.z],
    [marina.x, marina.z],
    [mall.x, mall.z],
    [casino.x, casino.z],
    [docks.x, docks.z],
    [safehouse.x, safehouse.z],
    [garage.x, garage.z],
    [-200, 120],
    [0, -300],
  ];
  const coins = coinSpots.map(([x, z]) => ({
    x: x + rng.range(-4, 4),
    z: z + rng.range(-4, 4),
    taken: false,
  }));

  const missions = {
    list,
    index: 0,
    current: list[0],
    stage: 0,
    objective: list[0].steps[0].text,
    marker: list[0].steps[0].marker,
    timer: null,
    cash: 150,
    storyDone: false,
    coins,
    coinsCollected: 0,

    // Taxi side activity.
    taxi: { active: false, fare: null },
    taxiActive: false,

    startMission(i) {
      if (i >= list.length) {
        this.index = -1;
        this.current = null;
        this.stage = 0;
        this.objective = 'Free roam — King of Solmar';
        this.marker = null;
        this.timer = null;
        this.storyDone = true;
        return;
      }
      this.index = i;
      this.current = list[i];
      this.stage = 0;
      this.timer = list[i].timed || null;
      // Fresh run: clear per-step runtime flags.
      for (const step of list[i].steps) {
        step._spawned = false;
        step._warned = false;
      }
      if (list[i].id === 'getaway' && police && typeof police.addHeat === 'function') {
        // Wanted forced to 3 stars for the chase.
        police.addHeat(heatToReach(police, 3), 'getaway');
      }
      this._enterStage();
    },

    // Set objective/marker for the current stage and run its entry hook.
    _enterStage() {
      const step = this.current && this.current.steps[this.stage];
      if (!step) {
        this.objective = this.current ? this.current.title : '';
        this.marker = null;
        return;
      }
      this.objective = step.text;
      this.marker = step.marker || null;

      if (step.type === 'defeat' && !step._spawned) {
        step._spawned = true;
        const c = step.marker || casino;
        const offsets = [
          [-8, 4],
          [8, 4],
          [0, -8],
        ];
        for (const [ox, oz] of offsets) {
          if (combat && typeof combat.spawnEnemy === 'function') {
            combat.spawnEnemy(c.x + ox, c.z + oz);
          }
        }
      }
      // Escaping by car in the finale lights the city up: wanted 4.
      if (step.requireCar && police && typeof police.addHeat === 'function') {
        police.addHeat(heatToReach(police, 4), 'big-score');
      }
    },

    restart() {
      if (combat && typeof combat.clearEnemies === 'function') combat.clearEnemies();
      this.startMission(this.index < 0 ? 0 : this.index);
    },

    _completeStep(ctx) {
      const step = this.current.steps[this.stage];
      const events = (ctx && ctx.events) || null;
      if (step.heatOnComplete && police && typeof police.addHeat === 'function') {
        police.addHeat(step.heatOnComplete, step.heatReason || 'mission');
      }
      if (events) {
        events.push({ type: 'mission-step', mission: this.current.id, stage: this.stage });
      }
      this.stage += 1;
      if (this.stage >= this.current.steps.length) {
        this._completeMission(ctx);
      } else {
        this._enterStage();
      }
    },

    _completeMission(ctx) {
      const mission = this.current;
      const events = (ctx && ctx.events) || null;
      this.cash += mission.reward;
      if (events) {
        events.push({ type: 'mission-done', mission: mission.id, reward: mission.reward });
      }
      if (mission.id === 'new-in-town' && combat && typeof combat.givePistol === 'function') {
        combat.givePistol();
      }
      const next = this.index + 1;
      if (next >= list.length) {
        this.index = -1;
        this.current = null;
        this.stage = 0;
        this.objective = 'Free roam — King of Solmar';
        this.marker = null;
        this.timer = null;
        this.storyDone = true;
      } else {
        this.startMission(next);
      }
    },

    _failMission(ctx, reason) {
      const events = (ctx && ctx.events) || null;
      if (events) {
        events.push({ type: 'mission-failed', mission: this.current.id, reason });
      }
      this.restart();
    },

    update(dt, ctx) {
      ctx = ctx || {};
      const events = ctx.events || null;
      const p = ctx.player || player;
      const pol = ctx.police || police;
      const cmb = ctx.combat || combat;

      this.updateTaxi(dt, ctx);

      // Coins: within 2 m on foot or in a car, the coin is collected.
      if (p) {
        for (const coin of this.coins) {
          if (coin.taken) continue;
          if (dist2D(p.pos, coin) <= 2) {
            coin.taken = true;
            this.coinsCollected += 1;
            this.cash += 50;
            if (events) events.push({ type: 'coin', n: this.coinsCollected });
          }
        }
      }

      if (this.storyDone || !this.current) return;
      const step = this.current.steps[this.stage];
      if (!step) return;

      // Timed missions fail when the clock runs out.
      if (this.timer !== null && this.timer !== undefined) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = null;
          this._failMission(ctx, 'time');
          return;
        }
      }

      // The Drop warns once if the police are already hunting (2+ stars).
      if (
        this.current.id === 'the-drop' &&
        this.stage === 0 &&
        !step._warned &&
        pol &&
        pol.wanted >= 2
      ) {
        step._warned = true;
        if (events) {
          events.push({
            type: 'mission-warning',
            mission: this.current.id,
            stage: this.stage,
            text: 'Police are watching the mall — stay out of sight.',
          });
        }
      }

      if (!p) return;

      switch (step.type) {
        case 'goto':
        case 'deliver':
        case 'pickup':
        case 'drive': {
          if (!step.marker) break;
          if (step.onFoot && p.inCar) break;
          if (step.requireCar && !p.inCar) break;
          if (dist2D(p.pos, step.marker) <= (step.radius || 6)) {
            this._completeStep(ctx);
          }
          break;
        }
        case 'steal': {
          if (p.inCar) this._completeStep(ctx);
          break;
        }
        case 'defeat': {
          const enemies = (cmb && cmb.enemies) || [];
          if (step._spawned && enemies.length > 0 && enemies.every((e) => e.state === 'dead')) {
            this._completeStep(ctx);
          }
          break;
        }
        default:
          break;
      }
    },

    // ---- Taxi side activity ----
    // Allowed any time except during the Getaway and the Big Score.
    startTaxi(ctx) {
      if (this.taxi.active) return false;
      if (
        this.current &&
        (this.current.id === 'getaway' || this.current.id === 'the-big-score')
      ) {
        return false;
      }
      const roadCoord = () => -320 + 40 * rng.int(0, 16);
      const from = { x: roadCoord(), z: roadCoord() };
      let to = { x: roadCoord(), z: roadCoord() };
      let guard = 0;
      while (dist2D(from, to) < 60 && guard < 20) {
        to = { x: roadCoord(), z: roadCoord() };
        guard += 1;
      }
      const dist = dist2D(from, to);
      const reward = 50 + Math.round(dist * 0.6);
      const fare = {
        from,
        to,
        reward,
        timeLeft: 45 + dist / 10,
        phase: 'pickup',
      };
      this.taxi = { active: true, fare };
      this.taxiActive = true;
      const events = (ctx && ctx.events) || null;
      if (events) events.push({ type: 'taxi-start', fare });
      return true;
    },

    updateTaxi(dt, ctx) {
      if (!this.taxi.active || !this.taxi.fare) return;
      const events = (ctx && ctx.events) || null;
      const p = (ctx && ctx.player) || player;
      const fare = this.taxi.fare;

      fare.timeLeft -= dt;
      if (fare.timeLeft <= 0) {
        this.taxi = { active: false, fare: null };
        this.taxiActive = false;
        if (events) events.push({ type: 'taxi-failed', reason: 'time' });
        return;
      }

      if (!p) return;
      const target = fare.phase === 'pickup' ? fare.from : fare.to;
      if (dist2D(p.pos, target) <= 6) {
        if (fare.phase === 'pickup') {
          fare.phase = 'dropoff';
          if (events) events.push({ type: 'taxi-pickup', fare });
        } else {
          this.cash += fare.reward;
          if (events) events.push({ type: 'taxi-done', reward: fare.reward });
          this.taxi = { active: false, fare: null };
          this.taxiActive = false;
        }
      }
    },
  };

  return missions;
}

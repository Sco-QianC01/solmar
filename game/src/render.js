// SOLMAR renderer: three.js scene, sun-soaked look, third-person follow camera.
// Owns every mesh. The simulation stays in world.js; this file only paints it.
import * as THREE from 'three';
import { PALETTE, WORLD } from './config.js';

function makeWindowTexture(cols, rows) {
  // White facade with a dark window grid; the material colour tints it.
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#22303a';
  const cw = 128 / cols;
  const ch = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      g.fillRect(c * cw + cw * 0.24, r * ch + ch * 0.26, cw * 0.52, ch * 0.48);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let r = 0; r < rows; r++) g.fillRect(0, r * ch, 128, 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGroundTexture(city) {
  // One 1024 canvas for the whole 640 m map: roads, sidewalks, beach, plaza.
  const S = 1024;
  const scale = S / (WORLD.halfSize * 2);
  const toPx = (v) => (v + WORLD.halfSize) * scale;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  // Base: dry sun-baked ground.
  g.fillStyle = '#b5ac93';
  g.fillRect(0, 0, S, S);
  // City blocks: slightly varied warm tones.
  g.fillStyle = '#aaa184';
  for (let x = -320; x < 320; x += 40) {
    for (let z = -320; z < 320; z += 40) {
      if (z + 24 > WORLD.beachZ) continue;
      g.fillRect(toPx(x + 8), toPx(z + 8), 24 * scale, 24 * scale);
    }
  }
  // Sidewalks.
  g.fillStyle = '#cfc8b8';
  for (const road of city.roads) {
    if (road.axis === 'x') {
      g.fillRect(0, toPx(road.at - 8), S, 16 * scale);
    } else {
      g.fillRect(toPx(road.at - 8), 0, 16 * scale, S);
    }
  }
  // Asphalt.
  g.fillStyle = '#3a3f46';
  for (const road of city.roads) {
    if (road.axis === 'x') {
      g.fillRect(0, toPx(road.at - 5), S, 10 * scale);
    } else {
      g.fillRect(toPx(road.at - 5), 0, 10 * scale, S);
    }
  }
  // Centre dashes.
  g.fillStyle = '#d8c25a';
  for (const road of city.roads) {
    for (let d = -320; d < 320; d += 16) {
      if (road.axis === 'x') g.fillRect(toPx(d), toPx(road.at) - 1, 8 * scale, 2);
      else g.fillRect(toPx(road.at) - 1, toPx(d), 2, 8 * scale);
    }
  }
  // Beach sand.
  g.fillStyle = '#e8d3a2';
  g.fillRect(0, toPx(WORLD.beachZ), S, S - toPx(WORLD.beachZ));
  // Plaza paving.
  g.fillStyle = '#d8cfb4';
  g.beginPath();
  g.arc(toPx(0), toPx(0), 26 * scale, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildFigure(color, shirtColor) {
  // A simple low-poly person: torso, head, legs, arms. Returns {group, limbs}.
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3240 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.26), pants);
  legL.position.set(-0.16, 0.39, 0);
  legL.castShadow = true;
  const legR = legL.clone();
  legR.position.x = 0.16;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.2), shirt);
  armL.position.set(-0.42, 1.12, 0);
  armL.castShadow = true;
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(torso, head, legL, legR, armL, armR);
  group.userData = { legL, legR, armL, armR, color };
  return group;
}

export function createRenderer(canvas, world, scene) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene.background = new THREE.Color(PALETTE.skyHorizon);
  scene.fog = new THREE.Fog(0xc4d6e2, 180, 620);

  // Sun + sky fill.
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -340;
  sun.shadow.camera.right = 340;
  sun.shadow.camera.top = 340;
  sun.shadow.camera.bottom = -340;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.1));

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(0, 40, 60);

  // ---- ground + sea --------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.halfSize * 2, WORLD.halfSize * 2),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(world.city) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 120),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.92 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.12, WORLD.seaZ + 55);
  scene.add(sea);

  // ---- buildings -----------------------------------------------------------
  const windowTextures = [makeWindowTexture(4, 6), makeWindowTexture(5, 8), makeWindowTexture(3, 5)];
  const buildingMaterials = new Map();
  function buildingMaterial(color, winCols, winRows) {
    const key = `${color}|${winCols}|${winRows}`;
    if (!buildingMaterials.has(key)) {
      const tex = windowTextures[(winCols + winRows) % windowTextures.length].clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(winCols / 2)), Math.max(1, Math.round(winRows / 2)));
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      buildingMaterials.set(
        key,
        new THREE.MeshLambertMaterial({ color, map: tex }),
      );
    }
    return buildingMaterials.get(key);
  }
  const roofMaterials = new Map();
  function roofMaterial(color) {
    if (!roofMaterials.has(color)) {
      roofMaterials.set(color, new THREE.MeshLambertMaterial({ color }));
    }
    return roofMaterials.get(color);
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const b of world.city.buildings) {
    const mesh = new THREE.Mesh(boxGeo, buildingMaterial(b.color, b.winCols, b.winRows));
    mesh.scale.set(b.w, b.h, b.d);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const roof = new THREE.Mesh(boxGeo, roofMaterial(b.roof));
    roof.scale.set(b.w + 0.4, 0.5, b.d + 0.4);
    roof.position.set(b.x, b.h + 0.25, b.z);
    roof.castShadow = true;
    scene.add(roof);
  }

  // ---- palms ----------------------------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const palmMat = new THREE.MeshLambertMaterial({ color: PALETTE.palm });
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6);
  const canopyGeo = new THREE.IcosahedronGeometry(1.6, 0);
  for (const palm of world.city.palms) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.scale.y = palm.h;
    trunk.position.set(palm.x, palm.h / 2, palm.z);
    trunk.rotation.z = palm.lean;
    trunk.castShadow = true;
    const canopy = new THREE.Mesh(canopyGeo, palmMat);
    canopy.scale.set(1.4, 0.7, 1.4);
    canopy.position.set(palm.x + palm.lean * palm.h * 0.8, palm.h + 0.6, palm.z);
    canopy.castShadow = true;
    scene.add(trunk, canopy);
  }

  // ---- props -----------------------------------------------------------------
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c3240 });
  const lampHeadMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0x554411 });
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7a4a });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5, 6);
  const lampHeadGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const benchGeo = new THREE.BoxGeometry(1.8, 0.5, 0.6);
  const hydrantGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.7, 8);
  const crateGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
  const basinGeo = new THREE.CylinderGeometry(3.2, 3.6, 0.9, 20);
  const waterGeo = new THREE.CylinderGeometry(2.9, 2.9, 0.2, 20);
  for (const prop of world.city.props) {
    if (prop.kind === 'lamp') {
      const pole = new THREE.Mesh(poleGeo, lampMat);
      pole.position.set(prop.x, 2.5, prop.z);
      const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
      head.position.set(prop.x, 5.1, prop.z);
      scene.add(pole, head);
    } else if (prop.kind === 'bench') {
      const bench = new THREE.Mesh(benchGeo, benchMat);
      bench.position.set(prop.x, 0.55, prop.z);
      bench.rotation.y = prop.rot;
      bench.castShadow = true;
      scene.add(bench);
    } else if (prop.kind === 'hydrant') {
      const hydrant = new THREE.Mesh(hydrantGeo, hydrantMat);
      hydrant.position.set(prop.x, 0.35, prop.z);
      scene.add(hydrant);
    } else if (prop.kind === 'crate') {
      const crate = new THREE.Mesh(crateGeo, crateMat);
      crate.position.set(prop.x, 0.55, prop.z);
      crate.rotation.y = prop.rot;
      crate.castShadow = true;
      scene.add(crate);
    } else if (prop.kind === 'fountain') {
      const basin = new THREE.Mesh(basinGeo, new THREE.MeshLambertMaterial({ color: 0xcfc8b8 }));
      basin.position.set(prop.x, 0.45, prop.z);
      const water = new THREE.Mesh(waterGeo, new THREE.MeshLambertMaterial({ color: 0x4aa8c8 }));
      water.position.set(prop.x, 0.85, prop.z);
      scene.add(basin, water);
    }
  }

  // ---- cars ------------------------------------------------------------------
  const carGroups = new Map();
  const carPaint = new Map();
  function paintMaterial(color) {
    if (!carPaint.has(color)) {
      carPaint.set(color, new THREE.MeshLambertMaterial({ color }));
    }
    return carPaint.get(color);
  }
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2836 });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0x444422 });
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);

  function buildCar(car) {
    const dims = world.vehicles.KIND_DIMS[car.kind] || world.vehicles.KIND_DIMS.sedan;
    const group = new THREE.Group();
    const body = new THREE.Mesh(boxGeo, paintMaterial(car.color));
    body.scale.set(dims.w, dims.h * 0.55, dims.l);
    body.position.y = dims.h * 0.42;
    body.castShadow = true;
    const cabin = new THREE.Mesh(boxGeo, glassMat);
    cabin.scale.set(dims.w * 0.86, dims.h * 0.5, dims.l * 0.46);
    cabin.position.set(0, dims.h * 0.85, -dims.l * 0.04);
    cabin.castShadow = true;
    group.add(body, cabin);
    const wheels = [];
    for (const [wx, wz] of [
      [-dims.w / 2, dims.l * 0.32],
      [dims.w / 2, dims.l * 0.32],
      [-dims.w / 2, -dims.l * 0.32],
      [dims.w / 2, -dims.l * 0.32],
    ]) {
      const wheel = new THREE.Mesh(wheelGeo, tyreMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.36, wz);
      wheel.castShadow = true;
      group.add(wheel);
      wheels.push(wheel);
    }
    for (const hx of [-dims.w * 0.3, dims.w * 0.3]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
      head.position.set(hx, dims.h * 0.42, dims.l / 2 + 0.02);
      group.add(head);
    }
    if (car.kind === 'police') {
      const barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0x880000 }));
      barR.position.set(-0.35, dims.h * 1.12, 0);
      const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x000088 }));
      barB.position.set(0.35, dims.h * 1.12, 0);
      group.add(barR, barB);
      group.userData.lightBar = [barR, barB];
    }
    group.userData.wheels = wheels;
    group.userData.dims = dims;
    return group;
  }

  // ---- people -----------------------------------------------------------------
  const playerFigure = buildFigure(0x2e8a8a, 0x2e8a8a);
  scene.add(playerFigure);
  const pedFigures = new Map();
  const enemyFigures = new Map();
  const copFigures = new Map();
  function figureFor(map, id, color) {
    if (!map.has(id)) {
      const fig = buildFigure(color, color);
      scene.add(fig);
      map.set(id, fig);
    }
    return map.get(id);
  }

  // ---- coins ------------------------------------------------------------------
  const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12);
  const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd34d, emissive: 0x664411 });
  const coinMeshes = [];
  for (const coin of world.missions.coins) {
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.position.set(coin.x, 1.0, coin.z);
    mesh.rotation.x = Math.PI / 2;
    scene.add(mesh);
    coinMeshes.push(mesh);
  }

  // ---- mission marker -----------------------------------------------------------
  const markerGeo = new THREE.CylinderGeometry(0.9, 0.9, 2.6, 4);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.75 });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.visible = false;
  scene.add(marker);
  const markerRingGeo = new THREE.RingGeometry(2.2, 2.8, 24);
  const markerRingMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
  const markerRing = new THREE.Mesh(markerRingGeo, markerRingMat);
  markerRing.rotation.x = -Math.PI / 2;
  markerRing.position.y = 0.06;
  markerRing.visible = false;
  scene.add(markerRing);

  // ---- camera + frame -------------------------------------------------------------
  const cameraTarget = new THREE.Vector3();
  const desiredPos = new THREE.Vector3();
  let cameraHeading = 0;

  function syncFigure(fig, x, z, heading, speed, time) {
    fig.position.set(x, 0, z);
    fig.rotation.y = heading;
    const swing = Math.min(1, speed / 6) * Math.sin(time * 10) * 0.55;
    fig.userData.legL.rotation.x = swing;
    fig.userData.legR.rotation.x = -swing;
    fig.userData.armL.rotation.x = -swing * 0.8;
    fig.userData.armR.rotation.x = swing * 0.8;
  }

  // Snap the camera straight to its follow spot (used by shot mode so the
  // first painted frame already has the gameplay framing, not the intro
  // position high above the plaza).
  function snapCamera(heading) {
    cameraHeading = heading;
    const player = world.player;
    const inCar = !!world.vehicles.playerCar;
    const target = inCar ? world.vehicles.playerCar : player.pos;
    const dist = inCar ? 11.5 : 7.5;
    const height = inCar ? 4.6 : 3.4;
    const fx = Math.sin(cameraHeading);
    const fz = Math.cos(cameraHeading);
    camera.position.set(target.x - fx * dist, height, target.z - fz * dist);
    cameraTarget.set(target.x + fx * 3, 1.6, target.z + fz * 3);
    camera.lookAt(cameraTarget);
  }

  function draw(dt, time, heading) {
    cameraHeading = heading;
    const player = world.player;
    const inCar = !!world.vehicles.playerCar;
    const target = inCar ? world.vehicles.playerCar : player.pos;
    const speed = inCar ? Math.abs(world.vehicles.playerCar.speed) : player.speed;
    const dist = inCar ? 11.5 : 7.5;
    const height = inCar ? 4.6 : 3.4;

    // Camera: behind the camera heading, eased toward its goal.
    const fx = Math.sin(cameraHeading);
    const fz = Math.cos(cameraHeading);
    desiredPos.set(target.x - fx * dist, height, target.z - fz * dist);
    camera.position.lerp(desiredPos, 1 - Math.exp(-6 * dt));
    cameraTarget.set(target.x + fx * 3, 1.6, target.z + fz * 3);
    camera.lookAt(cameraTarget);

    // Player figure (hidden while driving).
    playerFigure.visible = player.onFoot;
    if (player.onFoot) {
      syncFigure(playerFigure, player.pos.x, player.pos.z, player.heading, player.speed, time);
    }

    // Cars.
    const seen = new Set();
    for (const car of world.vehicles.cars) {
      seen.add(car.id);
      let group = carGroups.get(car.id);
      if (!group) {
        group = buildCar(car);
        scene.add(group);
        carGroups.set(car.id, group);
      }
      group.position.set(car.x, 0, car.z);
      group.rotation.y = car.heading;
      for (const wheel of group.userData.wheels) {
        wheel.rotation.x += (car.speed * dt) / 0.36;
      }
      if (group.userData.lightBar) {
        const phase = Math.floor(time * 6) % 2 === 0;
        group.userData.lightBar[0].material.emissiveIntensity = phase ? 2.2 : 0.2;
        group.userData.lightBar[1].material.emissiveIntensity = phase ? 0.2 : 2.2;
      }
    }
    for (const [id, group] of carGroups) {
      if (!seen.has(id)) {
        scene.remove(group);
        carGroups.delete(id);
      }
    }

    // Pedestrians, enemies, foot cops.
    for (const ped of world.peds.peds) {
      const fig = figureFor(pedFigures, ped.id, ped.color);
      fig.visible = ped.state !== 'down';
      if (fig.visible) syncFigure(fig, ped.x, ped.z, ped.heading, ped.state === 'flee' ? 3.4 : 1.4, time);
      else fig.position.set(ped.x, -0.4, ped.z);
    }
    for (const enemy of world.combat.enemies) {
      const fig = figureFor(enemyFigures, enemy.id, 0x8a2a2a);
      fig.visible = enemy.state !== 'dead';
      if (fig.visible) syncFigure(fig, enemy.x, enemy.z, enemy.heading, 3, time);
    }
    for (const cop of world.police.cops) {
      if (cop.kind !== 'foot') continue;
      const fig = figureFor(copFigures, cop.id, 0x1c2f6e);
      syncFigure(fig, cop.x, cop.z, cop.heading, 4, time);
    }
    for (const [id, fig] of copFigures) {
      if (!world.police.cops.some((c) => c.kind === 'foot' && c.id === id)) {
        scene.remove(fig);
        copFigures.delete(id);
      }
    }

    // Coins + mission marker.
    world.missions.coins.forEach((coin, i) => {
      const mesh = coinMeshes[i];
      if (!mesh) return;
      mesh.visible = !coin.taken;
      if (mesh.visible) {
        mesh.rotation.y += dt * 2;
        mesh.position.y = 1.0 + Math.sin(time * 2 + i) * 0.15;
      }
    });
    const mark = world.missions.marker;
    if (mark) {
      marker.visible = true;
      markerRing.visible = true;
      marker.position.set(mark.x, 1.4 + Math.sin(time * 3) * 0.25, mark.z);
      marker.rotation.y += dt;
      markerRing.position.set(mark.x, 0.06, mark.z);
    } else {
      marker.visible = false;
      markerRing.visible = false;
    }

    // Sea shimmer.
    sea.position.y = -0.12 + Math.sin(time * 0.6) * 0.05;

    renderer.render(scene, camera);
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, draw, snapCamera, resize };
}

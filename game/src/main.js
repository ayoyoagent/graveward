// GRAVEWARD entry point: boots the renderer, runs the fixed-step sim,
// wires the menus, and stages deterministic screenshots.
//
// The sim runs at a fixed 60 Hz, separate from rendering, so a run plays
// the same on any machine and the ?shot= captures are reproducible.
// Rendering just follows the sim state every frame.

import * as THREE from 'three';
import { PALETTE, ZONES } from './palette.js';
import { mulberry32, clamp } from './util.js';
import {
  ARENA, buildArena, makeWardenMesh, makeWeaponMesh, makeEnemyMesh,
  makeBossMesh, makeProjectileMesh, makeCoinMesh, makeBlob,
  makeTelegraphRing, animateWalk,
} from './world.js';
import { createPlayer, stepPlayer, hurtPlayer } from './player.js';
import { WEAPONS, rollDamage, inArc } from './weapons.js';
import { ENEMY_TYPES, makeEnemy, expandWave, stepEnemy, hitsCircle } from './enemies.js';
import { BOSS_TYPES, makeBoss, stepBoss } from './boss.js';
import {
  ROOMS_PER_RUN, BOSS_ROOM, createRun, startRoom,
  onRoomCleared, applyUpgrade, startBossRoom, scoreFor, goldDrop,
} from './rooms.js';
import { initAudio, sfx } from './audio.js';
import { createEffects, flashMesh, unflashMesh } from './effects.js';
import {
  showScreen, renderZoneCards, renderDifficultyCards, renderWeaponCards,
  renderUpgradeCards, updateHud, setBossBar, hideBossBar, showToast,
  flashVignette, showVictory, showDefeat, unlockFlags, setUnlock,
} from './hud.js';

const STEP = 1 / 60;
const VEX_START = 'Vex: The dead don\'t stay buried here, warden. Mind the teeth — and the toll.';
const VEX_LINES = {
  butcher: 'Vex: The Butcher\'s closed for good. The quarter can eat again — on him.',
  lich: 'Vex: The Lich is back in his box. The bones can rest. You, though — there\'s still gold out there.',
  hollowking: 'Vex: The first warden finally clocked out. The Hollow is yours, warden.',
};

// ---------------------------------------------------------------- state ---

let renderer, scene, camera, effects;
let arena = null;
let run = null;
let player = null;
let playerMesh = null;
let playerBlob = null;
let weaponMesh = null;
let enemies = [];
let enemyViews = new Map(); // enemy object -> { mesh, blob, hpBg, hpFg }
let projectiles = [];
let coins = [];
let boss = null;
let bossView = null;
let telegraphs = [];
let slashPool = [];
let screen = 'title';
let paused = false;
let waveTimer = 0;
let wavePending = false;
let spawnQueue = [];
let spawnTimer = 0;
let runSeed = 1;
let chosen = { zone: 'city', difficulty: 'normal', weapon: 'sword' };
let shotFrozen = false;
let shotMode = null;

const keys = {};
const mouse = { x: 0, y: 0, down: false };
const aimPoint = { x: 0, z: -1 };
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ------------------------------------------------------------- helpers ----

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function randPosOnRing(cx, cz, r, rand, minDistFromPlayer = 6) {
  for (let tries = 0; tries < 12; tries++) {
    const a = rand() * Math.PI * 2;
    const x = clamp(cx + Math.cos(a) * r, -ARENA.halfW + 2, ARENA.halfW - 2);
    const z = clamp(cz + Math.sin(a) * r, -ARENA.halfH + 2, ARENA.halfH - 2);
    const dx = x - player.x;
    const dz = z - player.z;
    if (dx * dx + dz * dz >= minDistFromPlayer * minDistFromPlayer) return { x, z };
  }
  return { x: clamp(cx, -ARENA.halfW + 2, ARENA.halfW - 2), z: clamp(cz - r, -ARENA.halfH + 2, ARENA.halfH - 2) };
}

// Circle vs arena colliders: slide along walls instead of sticking.
function makeCollider(colliders) {
  return (x, z, radius) => {
    let nx = clamp(x, -ARENA.halfW + radius, ARENA.halfW - radius);
    let nz = clamp(z, -ARENA.halfH + radius, ARENA.halfH - radius);
    for (const c of colliders) {
      const closestX = clamp(nx, c.x - c.hw, c.x + c.hw);
      const closestZ = clamp(nz, c.z - c.hd, c.z + c.hd);
      const dx = nx - closestX;
      const dz = nz - closestZ;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          nx = closestX + (dx / d) * radius;
          nz = closestZ + (dz / d) * radius;
        } else {
          // Dead centre of the box: push out along the smaller axis.
          const pushX = c.hw + radius - Math.abs(nx - c.x);
          const pushZ = c.hd + radius - Math.abs(nz - c.z);
          if (pushX < pushZ) nx = c.x + (nx >= c.x ? c.hw + radius : -c.hw - radius);
          else nz = c.z + (nz >= c.z ? c.hd + radius : -c.hd - radius);
        }
      }
    }
    return { x: nx, z: nz };
  };
}

// ----------------------------------------------------------------- setup --

function boot() {
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 45, 90);

  // Follow camera: high and far enough that the whole arena depth fits the
  // frame at spawn (north wall visible, no enemy "pop-in" from the top
  // edge). FOV 52 + height 19 + 14 south offset + lookAt 2.5 north of the
  // player: top ray ~23 deg below horizontal, ground reach ~19/tan(23deg)
  // ~ 45 m north of the camera. The outer ground skirt in world.js covers
  // everything past the walls, so the bottom of the frame is never sky.
  camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 19, 24);
  camera.lookAt(0, 0, 0);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, PALETTE.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, PALETTE.sunIntensity);
  sun.position.set(18, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 80;
  scene.add(sun);

  effects = createEffects(scene);

  // Slash arc pool: two flat ring sectors that flash on melee swings.
  for (let i = 0; i < 2; i++) {
    const geo = new THREE.RingGeometry(0.6, 3.0, 24, 1, 0, 1.9);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff2c0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.position.y = 0.4;
    scene.add(m);
    slashPool.push({ mesh: m, life: 0 });
  }

  // Backdrop arena behind the title screen.
  arena = buildArena(scene, 'graveyard');
  player = createPlayer(0, 9);
  playerMesh = makeWardenMesh();
  playerBlob = makeBlob(1.5);
  scene.add(playerMesh, playerBlob);
  equipWeapon('sword');
  syncPlayerMesh();

  wireInput();
  wireMenus();
  showScreen('title');

  const params = new URLSearchParams(location.search);
  shotMode = params.get('shot');
  if (shotMode) {
    runSeed = parseInt(params.get('seed') || '1', 10) || 1;
    setTimeout(() => stageShot(shotMode), 350);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!shotFrozen) {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 5) {
        stepSim(STEP);
        acc -= STEP;
        n += 1;
      }
      if (n === 5) acc = 0;
    }
    updateCamera(dt);
    effects.step(dt);
    renderer.render(scene, camera);
    if (shotFrozen && !window.__shotReady) {
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(frame);
}

function equipWeapon(id) {
  if (weaponMesh) {
    playerMesh.userData.weaponSlot.remove(weaponMesh);
  }
  weaponMesh = makeWeaponMesh(id);
  weaponMesh.rotation.x = Math.PI / 2.4;
  playerMesh.userData.weaponSlot.add(weaponMesh);
}

function syncPlayerMesh() {
  if (!playerMesh || !player) return;
  playerMesh.position.set(player.x, 0, player.z);
  playerMesh.rotation.y = -player.facing + Math.PI / 2;
  playerBlob.position.set(player.x, 0.03, player.z);
  if (player.moving && !player.dead) animateWalk(playerMesh, player.walkPhase);
}

// -------------------------------------------------------------- menus -----

function wireMenus() {
  const byId = (id) => document.getElementById(id);
  byId('btn-title-start').addEventListener('click', () => {
    initAudio();
    sfx.click();
    renderZoneCards((zone) => {
      chosen.zone = zone;
      sfx.click();
      renderDifficultyCards((diff) => {
        chosen.difficulty = diff;
        sfx.click();
        renderWeaponCards((weapon) => {
          chosen.weapon = weapon;
          sfx.click();
          startRun();
        });
        showScreen('weapon');
      });
      showScreen('difficulty');
    });
    showScreen('zone');
  });
  byId('btn-pause-resume').addEventListener('click', () => togglePause(false));
  byId('btn-pause-menu').addEventListener('click', () => { paused = false; backToTitle(); });
  byId('btn-victory-again').addEventListener('click', () => { sfx.click(); startRun(); });
  byId('btn-victory-menu').addEventListener('click', () => { sfx.click(); backToTitle(); });
  byId('btn-defeat-retry').addEventListener('click', () => { sfx.click(); startRun(); });
  byId('btn-defeat-menu').addEventListener('click', () => { sfx.click(); backToTitle(); });
}

function backToTitle() {
  clearField();
  hideBossBar();
  if (playerMesh) playerMesh.visible = true;
  if (playerBlob) playerBlob.visible = true;
  showScreen('title');
  screen = 'title';
}

function togglePause(force) {
  if (screen !== 'playing' && screen !== 'paused') return;
  paused = force !== undefined ? force : !paused;
  if (paused) {
    screen = 'paused';
    showScreen('pause');
  } else {
    screen = 'playing';
    showScreen(null);
  }
}

// -------------------------------------------------------------- input -----

function wireInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'Escape') togglePause();
    if (e.code === 'KeyR' && (screen === 'playing' || screen === 'victory' || screen === 'defeat' || screen === 'paused')) {
      paused = false;
      startRun();
    }
    if (e.code === 'KeyE' && screen === 'playing' && run && run.phase === 'bossDoor') {
      enterBossRoom();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  renderer.domElement.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    updateAim();
  });
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      initAudio();
      updateAim();
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
}

function updateAim() {
  if (!camera) return;
  raycaster.setFromCamera({ x: mouse.x, y: mouse.y }, camera);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, hit)) {
    aimPoint.x = hit.x;
    aimPoint.z = hit.z;
  }
}

// -------------------------------------------------------------- run flow --

function clearField() {
  for (const e of enemies) removeEnemyView(e);
  enemies = [];
  enemyViews.clear();
  spawnQueue = [];
  wavePending = false;
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles = [];
  for (const c of coins) scene.remove(c.mesh);
  coins = [];
  for (const t of telegraphs) scene.remove(t.mesh);
  telegraphs = [];
  if (bossView) {
    scene.remove(bossView.mesh, bossView.blob, bossView.hpBg, bossView.hpFg);
    bossView = null;
  }
  boss = null;
}

function rebuildArena(zoneId) {
  if (arena) scene.remove(arena.group);
  arena = buildArena(scene, zoneId);
  scene.fog.color.setHex(ZONES[zoneId].fogColor);
}

function startRun() {
  runSeed = (Math.random() * 0xffffffff) >>> 0;
  clearField();
  rebuildArena(chosen.zone);
  run = createRun({ zone: chosen.zone, difficulty: chosen.difficulty, weapon: chosen.weapon, seed: runSeed });
  player = createPlayer(0, 9);
  player.dashMax = 1;
  player.dashCharges = 1;
  equipWeapon(chosen.weapon);
  syncPlayerMesh();
  if (playerMesh) playerMesh.visible = true;
  if (playerBlob) playerBlob.visible = true;
  hideBossBar();
  screen = 'playing';
  paused = false;
  showScreen(null);
  showToast(VEX_START);
  startRoom(run, 1);
  spawnWave(run.waves[0]);
}

function spawnWave(spec) {
  if (!spec) return;
  const kinds = expandWave(spec, run.rand);
  const diff = run.diff;
  spawnQueue = kinds.map((kind) => {
    const pos = randPosOnRing(0, -7, 8, run.rand);
    const elite = run.rand() < diff.eliteChance;
    return { kind, x: pos.x, z: pos.z, elite };
  });
  spawnTimer = 0;
  run.enemiesLeft += kinds.length;
}

// A small health bar that rides above an enemy or boss. The two planes
// are re-aimed at the camera every frame in stepSim.
function attachHpBar(mesh, width, y, color = 0x58c96b) {
  const hpBg = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 0.12),
    new THREE.MeshBasicMaterial({ color: 0x301510, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  const hpFg = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 0.12),
    new THREE.MeshBasicMaterial({ color, depthWrite: false }),
  );
  hpBg.position.y = y;
  hpFg.position.y = y;
  hpFg.position.z = 0.01;
  mesh.add(hpBg, hpFg);
  return { hpBg, hpFg };
}

function spawnOneQueued() {
  const s = spawnQueue.shift();
  if (!s) return;
  const e = makeEnemy(s.kind, s.x, s.z, {
    elite: s.elite,
    damageMult: run.diff.enemyDamageMult,
  });
  enemies.push(e);
  const mesh = makeEnemyMesh(s.kind, s.elite);
  mesh.position.set(e.x, 0, e.z);
  const blob = makeBlob(1.3);
  blob.position.set(e.x, 0.03, e.z);
  scene.add(mesh, blob);
  const bar = attachHpBar(mesh, 1.0, 2.1);
  enemyViews.set(e, { mesh, blob, hpBg: bar.hpBg, hpFg: bar.hpFg });
}

function removeEnemyView(e) {
  const v = enemyViews.get(e);
  if (!v) return;
  scene.remove(v.mesh, v.blob);
  enemyViews.delete(e);
}

function enterBossRoom() {
  const zone = ZONES[run.zone];
  startBossRoom(run, zone.boss);
  const bossId = zone.boss;
  boss = makeBoss(bossId, 0, -8, {
    hpMult: run.diff.bossHpMult,
    damageMult: run.diff.bossDamageMult,
  });
  const mesh = makeBossMesh(bossId);
  mesh.position.set(boss.x, 0, boss.z);
  const blob = makeBlob(2.6);
  blob.position.set(boss.x, 0.03, boss.z);
  const bar = attachHpBar(mesh, 1.6, 3.4, 0xe04e3a);
  scene.add(mesh, blob);
  bossView = { mesh, blob, hpBg: bar.hpBg, hpFg: bar.hpFg };
  setBossBar(boss.name, 1);
  sfx.boss();
  showToast(`${boss.name} — ${boss.title}`);
  hideDoorPrompt();
}

function showDoorPrompt() {
  const p = document.getElementById('door-prompt');
  if (p) p.classList.add('visible');
}

function hideDoorPrompt() {
  const p = document.getElementById('door-prompt');
  if (p) p.classList.remove('visible');
}

// -------------------------------------------------------------- combat ----

function tryAttack() {
  if (!run || player.attackCooldown > 0 || player.dead) return;
  const w = WEAPONS[run.weaponId];
  player.attackCooldown = w.cooldown * run.cooldownMult;
  player.swingT = 0.18;
  const facing = player.facing;

  if (w.kind === 'spread') {
    sfx.shoot();
    for (let i = 0; i < w.pellets; i++) {
      const ang = facing + (Math.random() - 0.5) * w.spread * 2;
      spawnProjectile(player.x, player.z, Math.cos(ang), Math.sin(ang), w.projectileSpeed, w, true, 0);
    }
    effects.addShake(0.08);
  } else if (w.kind === 'bolt') {
    sfx.bow();
    spawnProjectile(player.x, player.z, Math.cos(facing), Math.sin(facing), w.projectileSpeed, w, true, w.pierce + run.pierceBonus);
  } else if (w.kind === 'arc') {
    sfx.swing();
    showSlash(facing, w.arc, w.radius);
    for (const e of enemies) {
      if (inArc(player.x, player.z, facing, w.arc, w.radius, e.x, e.z)) {
        damageEnemy(e, w, Math.hypot(e.x - player.x, e.z - player.z));
      }
    }
    if (boss && inArc(player.x, player.z, facing, w.arc, w.radius, boss.x, boss.z)) {
      damageBoss(w, Math.hypot(boss.x - player.x, boss.z - player.z));
    }
  } else if (w.kind === 'thrust') {
    sfx.swing();
    const dx = Math.cos(facing);
    const dz = Math.sin(facing);
    const hitLine = (tx, tz, radius) => {
      const rx = tx - player.x;
      const rz = tz - player.z;
      const along = rx * dx + rz * dz;
      if (along < 0 || along > w.range + radius) return false;
      const perp = Math.abs(rx * dz - rz * dx);
      return perp <= w.width / 2 + radius;
    };
    for (const e of enemies) {
      if (hitLine(e.x, e.z, e.radius)) damageEnemy(e, w, Math.hypot(e.x - player.x, e.z - player.z));
    }
    if (boss && hitLine(boss.x, boss.z, boss.radius)) {
      damageBoss(w, Math.hypot(boss.x - player.x, boss.z - player.z));
    }
    showSlash(facing, 0.5, w.range);
  } else if (w.kind === 'slam') {
    sfx.slam();
    effects.addShake(0.3);
    effects.particles.burst(player.x, 0.3, player.z, 0xd8c8a0, 18, 6);
    for (const e of [...enemies]) {
      if (Math.hypot(e.x - player.x, e.z - player.z) <= w.radius + e.radius) {
        damageEnemy(e, w, Math.hypot(e.x - player.x, e.z - player.z));
      }
    }
    if (boss && Math.hypot(boss.x - player.x, boss.z - player.z) <= w.radius + boss.radius) {
      damageBoss(w, Math.hypot(boss.x - player.x, boss.z - player.z));
    }
  }
}

function showSlash(facing, arc, radius) {
  const s = slashPool.find((x) => x.life <= 0) || slashPool[0];
  const geo = new THREE.RingGeometry(Math.max(0.6, radius * 0.72), radius, 24, 1, -arc / 2, arc);
  s.mesh.geometry.dispose();
  s.mesh.geometry = geo;
  s.mesh.position.set(player.x, 0.4, player.z);
  s.mesh.rotation.z = facing + Math.PI / 2;
  s.mesh.material.opacity = 0.4;
  s.mesh.visible = true;
  s.life = 0.16;
}

function spawnProjectile(x, z, dx, dz, speed, weapon, friendly, pierce) {
  const mesh = makeProjectileMesh(friendly, weapon && weapon.bossBolt);
  mesh.position.set(x, 0.9, z);
  scene.add(mesh);
  projectiles.push({
    x, z, dx, dz, speed,
    damage: weapon ? weapon.damage : 10,
    weapon,
    friendly,
    pierce,
    hitSet: new Set(),
    travelled: 0,
    range: weapon ? weapon.range : 12,
    mesh,
  });
}

function damageEnemy(e, weapon, distance) {
  const { damage, crit } = rollDamage(weapon, distance, run.rand, run.damageMult);
  e.hp -= damage;
  e.flash = 1;
  const v = enemyViews.get(e);
  if (v) flashMesh(v.mesh);
  effects.numbers.show(e.x, 2.0, e.z, `${damage}`, crit ? '#ffd94a' : '#ffffff');
  effects.particles.burst(e.x, 1.0, e.z, 0xff6a5a, crit ? 10 : 5, 3);
  if (crit) effects.addShake(0.05);
  sfx.hit();
  if (e.hp <= 0) killEnemy(e);
}

function damageBoss(weapon, distance) {
  const { damage, crit } = rollDamage(weapon, distance, run.rand, run.damageMult);
  boss.hp -= damage;
  boss.flash = 1;
  if (bossView) flashMesh(bossView.mesh);
  effects.numbers.show(boss.x, 3.2, boss.z, `${damage}`, crit ? '#ffd94a' : '#ffffff');
  effects.particles.burst(boss.x, 1.4, boss.z, 0xff6a5a, crit ? 12 : 6, 4);
  sfx.hit();
  setBossBar(boss.name, Math.max(0, boss.hp / boss.maxHp));
  if (boss.hp <= 0) killBoss();
}

function killEnemy(e) {
  e.dead = true;
  run.kills += 1;
  run.enemiesLeft -= 1;
  const v = enemyViews.get(e);
  if (v) {
    effects.particles.burst(e.x, 1.0, e.z, ENEMY_TYPES[e.kind].color, 16, 5);
    removeEnemyView(e);
  }
  const gold = goldDrop(e.gold, run.difficulty);
  const nCoins = gold >= 8 ? 3 : gold >= 4 ? 2 : 1;
  for (let i = 0; i < nCoins; i++) {
    const value = Math.max(1, Math.round(gold / nCoins));
    const a = Math.random() * Math.PI * 2;
    dropCoin(e.x + Math.cos(a) * 0.5, e.z + Math.sin(a) * 0.5, value);
  }
  sfx.kill();
}

function killBoss() {
  boss.dead = true;
  run.kills += 1;
  const bv = bossView;
  if (bv) {
    effects.particles.burst(boss.x, 1.5, boss.z, BOSS_TYPES[boss.id].color, 40, 8);
    scene.remove(bv.mesh, bv.blob);
    bossView = null;
  }
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    dropCoin(boss.x + Math.cos(a) * 1.2, boss.z + Math.sin(a) * 1.2, 10);
  }
  run.won = true;
  hideBossBar();
  sfx.victory();
  // The victory overlay is semi-transparent, so hide the player mesh (and
  // its blob) — it stood centre-frame behind the "Rooms cleared" stats row.
  // Restored by startRun / backToTitle.
  if (playerMesh) playerMesh.visible = false;
  if (playerBlob) playerBlob.visible = false;
  if (run.difficulty === 'hard') setUnlock('graveward_hardClear');
  setUnlock('graveward_bossClear');
  screen = 'victory';
  showVictory({
    gold: run.gold,
    kills: run.kills,
    time: fmtTime(run.timeSec),
    rooms: ROOMS_PER_RUN + 1,
    score: scoreFor(run),
    vexLine: VEX_LINES[boss.id] || VEX_LINES.lich,
  });
  boss = null;
}

function dropCoin(x, z, value) {
  const mesh = makeCoinMesh();
  mesh.position.set(x, 0.15, z);
  scene.add(mesh);
  coins.push({ x, z, value, mesh, t: Math.random() * Math.PI * 2 });
}

function damagePlayer(amount) {
  const taken = hurtPlayer(player, amount);
  if (taken > 0) {
    sfx.hurt();
    flashVignette();
    effects.addShake(0.25);
    effects.numbers.show(player.x, 2.0, player.z, `-${taken}`, '#ff8a7a');
    if (player.dead) {
      screen = 'defeat';
      sfx.defeat();
      showDefeat({
        gold: run.gold,
        kills: run.kills,
        room: run.room >= BOSS_ROOM ? 'Boss' : `${run.room} / 3`,
        time: fmtTime(run.timeSec),
      });
    }
  }
}

// ---------------------------------------------------------------- sim -----

function stepSim(dt) {
  if (screen !== 'playing' || paused) return;
  if (!run || !player || player.dead) return;
  run.timeSec += dt;

  // Spawn queue: trickle enemies in over the first second of a wave.
  if (spawnQueue.length > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnOneQueued();
      spawnTimer = 0.25;
    }
  }

  // Player movement + dash.
  const mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  stepPlayer(player, {
    mx, mz,
    dash: keys.ShiftLeft || keys.ShiftRight,
    aimX: aimPoint.x,
    aimZ: aimPoint.z,
  }, run, dt, makeCollider(arena.colliders));
  if (keys.ShiftLeft || keys.ShiftRight) {
    if (player.dashTimeLeft > 0) sfx.dash();
    keys.ShiftLeft = false;
    keys.ShiftRight = false;
  }
  if (mouse.down) tryAttack();
  syncPlayerMesh();
  unflashMesh(playerMesh);

  // Enemies.
  const ctx = { dt, player, rand: run.rand, halfW: ARENA.halfW, halfH: ARENA.halfH };
  for (const e of [...enemies]) {
    if (e.dead) continue;
    const events = stepEnemy(e, ctx);
    for (const ev of events) handleEnemyEvent(e, ev);
    const v = enemyViews.get(e);
    if (v) {
      v.mesh.position.set(e.x, 0, e.z);
      v.mesh.rotation.y = -e.facing + Math.PI / 2;
      v.blob.position.set(e.x, 0.03, e.z);
      animateWalk(v.mesh, e.walkPhase, e.kind === 'brute' ? 0.35 : 0.55);
      const frac = Math.max(0, e.hp / e.maxHp);
      if (v.hpFg) {
        v.hpFg.scale.x = Math.max(0.001, frac);
        v.hpFg.position.x = -(1 - frac) * 0.5;
        v.hpBg.quaternion.copy(camera.quaternion);
        v.hpFg.quaternion.copy(camera.quaternion);
      }
      unflashMesh(v.mesh);
    }
  }
  // Separation so enemies never stack.
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i];
      const b = enemies[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const min = a.radius + b.radius + 0.1;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
      }
    }
  }
  enemies = enemies.filter((e) => !e.dead);

  // Boss.
  if (boss && bossView) {
    const events = stepBoss(boss, ctx);
    for (const ev of events) handleBossEvent(ev);
    bossView.mesh.position.set(boss.x, 0, boss.z);
    bossView.mesh.rotation.y = -boss.facing + Math.PI / 2;
    bossView.blob.position.set(boss.x, 0.03, boss.z);
    animateWalk(bossView.mesh, boss.walkPhase, 0.3);
    const frac = Math.max(0, boss.hp / boss.maxHp);
    bossView.hpFg.scale.x = Math.max(0.001, frac);
    bossView.hpFg.position.x = -(1 - frac) * 0.8;
    bossView.hpBg.quaternion.copy(camera.quaternion);
    bossView.hpFg.quaternion.copy(camera.quaternion);
    unflashMesh(bossView.mesh);
  }

  // Projectiles.
  for (const p of [...projectiles]) {
    p.x += p.dx * p.speed * dt;
    p.z += p.dz * p.speed * dt;
    p.travelled += p.speed * dt;
    p.mesh.position.set(p.x, 0.9, p.z);
    let dead = p.travelled > p.range;
    if (!dead && p.friendly) {
      for (const e of enemies) {
        if (e.dead || p.hitSet.has(e)) continue;
        if (hitsCircle(p.x, p.z, 0.25, e.x, e.z, e.radius)) {
          p.hitSet.add(e);
          damageEnemy(e, p.weapon, Math.hypot(e.x - player.x, e.z - player.z));
          if (p.pierce > 0) {
            p.pierce -= 1;
          } else {
            dead = true;
          }
          break;
        }
      }
      if (!dead && boss && !p.hitSet.has(boss) && hitsCircle(p.x, p.z, 0.25, boss.x, boss.z, boss.radius)) {
        p.hitSet.add(boss);
        damageBoss(p.weapon, Math.hypot(boss.x - player.x, boss.z - player.z));
        dead = true;
      }
    } else if (!dead && !p.friendly) {
      if (hitsCircle(p.x, p.z, 0.25, player.x, player.z, player.radius)) {
        damagePlayer(p.damage);
        dead = true;
      }
    }
    if (!dead && (Math.abs(p.x) > ARENA.halfW || Math.abs(p.z) > ARENA.halfH)) dead = true;
    if (dead) {
      scene.remove(p.mesh);
      projectiles.splice(projectiles.indexOf(p), 1);
    }
  }

  // Coins: spin, magnet toward the player, collect on touch.
  const magnetR = 2.5 * run.magnetMult;
  for (const c of [...coins]) {
    c.t += dt * 4;
    c.mesh.rotation.y = c.t;
    const d = Math.hypot(player.x - c.x, player.z - c.z);
    if (d < magnetR) {
      const pull = (1 - d / magnetR) * 14 * dt;
      c.x += ((player.x - c.x) / (d || 1)) * pull;
      c.z += ((player.z - c.z) / (d || 1)) * pull;
      c.mesh.position.set(c.x, 0.15, c.z);
    }
    if (d < 0.9) {
      run.gold += c.value;
      sfx.coin();
      effects.particles.burst(c.x, 0.5, c.z, 0xf2c14e, 5, 2);
      scene.remove(c.mesh);
      coins.splice(coins.indexOf(c), 1);
    }
  }

  // Telegraphs (brute / boss slams): grow brighter, expire on their own.
  for (const t of [...telegraphs]) {
    t.life -= dt;
    if (t.life <= 0) {
      scene.remove(t.mesh);
      telegraphs.splice(telegraphs.indexOf(t), 1);
    } else {
      t.mesh.material.opacity = 0.25 + 0.45 * (1 - t.life / t.maxLife);
    }
  }

  // Slash arcs fade.
  for (const s of slashPool) {
    if (s.life > 0) {
      s.life -= dt;
      s.mesh.material.opacity = Math.max(0, s.life / 0.16) * 0.85;
      if (s.life <= 0) s.mesh.visible = false;
    }
  }

  // Wave / room progression.
  if (run.phase === 'playing' && spawnQueue.length === 0 && enemies.length === 0 && !boss) {
    if (run.waveIndex + 1 < run.waves.length) {
      if (!wavePending) {
        wavePending = true;
        waveTimer = 1.0;
      }
      waveTimer -= dt;
      if (waveTimer <= 0) {
        wavePending = false;
        run.waveIndex += 1;
        spawnWave(run.waves[run.waveIndex]);
      }
    } else {
      const offer = onRoomCleared(run);
      if (offer) {
        screen = 'upgrade';
        renderUpgradeCards(offer, (id) => {
          sfx.upgrade();
          const hpBefore = run.hp;
          applyUpgrade(run, id);
          // The run state holds the numbers; the player object holds the
          // live HP, so carry the upgrade's heal across.
          player.maxHp = run.maxHp;
          player.hp = Math.min(run.maxHp, player.hp + Math.max(0, run.hp - hpBefore));
          player.dashMax = run.dashMax;
          screen = 'playing';
          showScreen(null);
        });
        showScreen('upgrade');
      } else {
        run.phase = 'bossDoor';
        showDoorPrompt();
        showToast('The way north is open. The boss is waiting — press E.');
      }
    }
  }

  updateHud({
    hp: player.hp,
    maxHp: player.maxHp,
    gold: run.gold,
    kills: run.kills,
    room: run.room,
    weaponName: WEAPONS[run.weaponId].name,
    cooldownFrac: player.attackCooldown > 0
      ? player.attackCooldown / (WEAPONS[run.weaponId].cooldown * run.cooldownMult) : 0,
    dashCharges: player.dashCharges,
  });
}

function handleEnemyEvent(e, ev) {
  if (ev.type === 'melee') {
    const d = Math.hypot(player.x - e.x, player.z - e.z);
    if (d <= e.attackRange + player.radius + 0.2) damagePlayer(ev.damage);
  } else if (ev.type === 'shoot') {
    spawnProjectile(ev.x, ev.z, ev.dx, ev.dz, ev.speed, { damage: ev.damage, range: 12 }, false, 0);
  } else if (ev.type === 'slam') {
    sfx.slam();
    effects.addShake(0.2);
    const ring = makeTelegraphRing(ev.radius);
    ring.position.set(ev.x, 0.06, ev.z);
    scene.add(ring);
    telegraphs.push({ mesh: ring, life: 0.3, maxLife: 0.3 });
    const d = Math.hypot(player.x - ev.x, player.z - ev.z);
    if (d <= ev.radius + player.radius) damagePlayer(ev.damage);
    effects.particles.burst(ev.x, 0.3, ev.z, 0xc8b890, 14, 5);
  }
}

function handleBossEvent(ev) {
  if (ev.type === 'shoot') {
    spawnProjectile(ev.x, ev.z, ev.dx, ev.dz, ev.speed, { damage: ev.damage, range: 14, bossBolt: true }, false, 0);
  } else if (ev.type === 'slam') {
    sfx.slam();
    effects.addShake(0.35);
    const ring = makeTelegraphRing(ev.radius);
    ring.position.set(ev.x, 0.06, ev.z);
    scene.add(ring);
    telegraphs.push({ mesh: ring, life: 0.4, maxLife: 0.4 });
    const d = Math.hypot(player.x - ev.x, player.z - ev.z);
    if (d <= ev.radius + player.radius) damagePlayer(ev.damage);
  } else if (ev.type === 'chargeHit') {
    damagePlayer(ev.damage);
  } else if (ev.type === 'summon') {
    for (let i = 0; i < ev.count; i++) {
      const pos = randPosOnRing(boss.x, boss.z, 4, run.rand, 3);
      const e = makeEnemy('shambler', pos.x, pos.z, { damageMult: run.diff.enemyDamageMult });
      enemies.push(e);
      const mesh = makeEnemyMesh('shambler', false);
      mesh.position.set(e.x, 0, e.z);
      const blob = makeBlob(1.3);
      blob.position.set(e.x, 0.03, e.z);
      scene.add(mesh, blob);
      const bar = attachHpBar(mesh, 1.0, 2.1);
      enemyViews.set(e, { mesh, blob, hpBg: bar.hpBg, hpFg: bar.hpFg });
    }
    showToast('The boss calls the dead to its side!');
  } else if (ev.type === 'teleport') {
    const pos = randPosOnRing(0, -7, 8, run.rand, 5);
    effects.particles.burst(boss.x, 1.5, boss.z, 0x7fe0a8, 20, 5);
    boss.x = pos.x;
    boss.z = pos.z;
    effects.particles.burst(boss.x, 1.5, boss.z, 0x7fe0a8, 20, 5);
  }
}

function updateCamera(dt) {
  if (!player) return;
  const tx = player.x;
  const tz = player.z + 1.5;
  const shake = effects ? effects.shake : 0;
  const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  const sz = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  camera.position.x += ((tx + sx) - camera.position.x) * Math.min(1, dt * 5);
  camera.position.z += ((tz + 14 + sz) - camera.position.z) * Math.min(1, dt * 5);
  camera.position.y = 19;
  camera.lookAt(tx + sx, 0, tz - 2.5 + sz);
}

// ------------------------------------------------------------ shot mode ---

function stageShot(kind) {
  if (kind === 'title') {
    // A quiet graveyard behind the title card, a few shamblers idling.
    rebuildArena('graveyard');
    player = createPlayer(0, 9);
    syncPlayerMesh();
    const r = mulberry32(runSeed);
    for (let i = 0; i < 4; i++) {
      const e = makeEnemy(i % 2 === 0 ? 'shambler' : 'spitter', -6 + i * 4, -4, {});
      enemies.push(e);
      const mesh = makeEnemyMesh(e.kind, false);
      mesh.position.set(e.x, 0, e.z);
      scene.add(mesh);
      enemyViews.set(e, { mesh, blob: makeBlob(1.3), hpBg: null, hpFg: null });
    }
    showScreen('title');
    screen = 'title';
    shotFrozen = true;
    return;
  }

  if (kind === 'combat') {
    chosen = { zone: 'graveyard', difficulty: 'normal', weapon: 'axe' };
    startRun();
    run.room = 2;
    run.gold = 120;
    run.kills = 14;
    player.hp = 78;
    // Stage the fight in the middle of the arena, not at the south wall,
    // so the capture frames walls on every side.
    player.x = 0;
    player.z = 0;
    syncPlayerMesh();
    // Clear the room-1 spawns and stage a mid-fight scrum instead.
    clearField();
    const r = mulberry32(runSeed);
    const kinds = ['shambler', 'shambler', 'spitter', 'shambler', 'brute', 'spitter'];
    for (const k of kinds) {
      const pos = randPosOnRing(0, 0, 5.5, r, 3);
      const e = makeEnemy(k, pos.x, pos.z, {});
      enemies.push(e);
      const mesh = makeEnemyMesh(k, false);
      mesh.position.set(e.x, 0, e.z);
      const blob = makeBlob(1.3);
      scene.add(mesh, blob);
      const bar = attachHpBar(mesh, 1.0, 2.1);
      enemyViews.set(e, { mesh, blob, hpBg: bar.hpBg, hpFg: bar.hpFg });
    }
    // Fight for a second and a half so the capture shows motion: swings,
    // particles, enemies closing in.
    mouse.down = true;
    for (let i = 0; i < 90; i++) {
      aimAtNearestEnemy();
      stepSim(STEP);
    }
    mouse.down = false;
    showSlash(player.facing, Math.PI * 2, 3.4);
    clearAllFlashes();
    // If the staged scrum somehow cleared the room mid-staging, put the
    // combat screen back: this capture is a fight, not a boon pick.
    if (screen !== 'playing') {
      screen = 'playing';
      showScreen(null);
    }
    shotFrozen = true;
    return;
  }

  if (kind === 'boss') {
    chosen = { zone: 'graveyard', difficulty: 'normal', weapon: 'sword' };
    startRun();
    run.room = BOSS_ROOM;
    run.gold = 260;
    run.kills = 31;
    player.hp = 64;
    player.x = 0;
    player.z = 5;
    clearField();
    const zone = ZONES[run.zone];
    startBossRoom(run, zone.boss);
    const bossId = zone.boss;
    boss = makeBoss(bossId, 0, -3, {});
    boss.hp = Math.round(boss.maxHp * 0.55);
    const mesh = makeBossMesh(bossId);
    mesh.position.set(boss.x, 0, boss.z);
    const blob = makeBlob(2.6);
    scene.add(mesh, blob);
    const bar = attachHpBar(mesh, 1.6, 3.4, 0xe04e3a);
    bossView = { mesh, blob, hpBg: bar.hpBg, hpFg: bar.hpFg };
    setBossBar(boss.name, boss.hp / boss.maxHp);
    const r = mulberry32(runSeed);
    for (let i = 0; i < 3; i++) {
      const pos = randPosOnRing(0, -2, 4, r, 3);
      const e = makeEnemy('shambler', pos.x, pos.z, {});
      enemies.push(e);
      const em = makeEnemyMesh('shambler', false);
      em.position.set(e.x, 0, e.z);
      const eb = makeBlob(1.3);
      scene.add(em, eb);
      const ebar = attachHpBar(em, 1.0, 2.1);
      enemyViews.set(e, { mesh: em, blob: eb, hpBg: ebar.hpBg, hpFg: ebar.hpFg });
    }
    for (let i = 0; i < 40; i++) {
      aimAtBoss();
      stepSim(STEP);
    }
    mouse.down = false;
    clearAllFlashes();
    shotFrozen = true;
    return;
  }

  if (kind === 'victory') {
    rebuildArena('graveyard');
    player = createPlayer(0, 9);
    syncPlayerMesh();
    // Hide the player mesh: the victory overlay is semi-transparent and
    // the mesh would stand behind the stats row (see killBoss).
    if (playerMesh) playerMesh.visible = false;
    if (playerBlob) playerBlob.visible = false;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      dropCoin(Math.cos(a) * 3, 6 + Math.sin(a) * 2, 10);
    }
    showVictory({
      gold: 480,
      kills: 42,
      time: '7:32',
      rooms: 4,
      score: 1100,
      vexLine: VEX_LINES.lich,
    });
    screen = 'victory';
    shotFrozen = true;
    return;
  }
}

// Restore every flashed material at once (used after shot staging, so a
// frozen capture never catches an enemy mid white-flash).
function clearAllFlashes() {
  const restore = (group) => {
    if (!group) return;
    group.traverse((m) => {
      if (!m.isMesh || !m.material || !m.material.emissive) return;
      if (m.userData.savedEmissive !== undefined) {
        m.material.emissive.setHex(m.userData.savedEmissive);
        m.material.emissiveIntensity = 1;
        m.userData.flashUntil = 0;
      }
    });
  };
  for (const [, v] of enemyViews) restore(v.mesh);
  if (bossView) restore(bossView.mesh);
  restore(playerMesh);
}

function aimAtNearestEnemy() {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = (e.x - player.x) ** 2 + (e.z - player.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (best) {
    aimPoint.x = best.x;
    aimPoint.z = best.z;
  }
}

function aimAtBoss() {
  if (!boss) return;
  aimPoint.x = boss.x;
  aimPoint.z = boss.z;
  mouse.down = true;
}

// State for the play-test driver (and debugging in the console).
window.__game = {
  get screen() { return screen; },
  get hp() { return player ? player.hp : 0; },
  get gold() { return run ? run.gold : 0; },
  get kills() { return run ? run.kills : 0; },
  get room() { return run ? run.room : 0; },
  get enemies() { return enemies.length; },
  get bossHp() { return boss ? boss.hp : null; },
  get phase() { return run ? run.phase : null; },
  get playerPos() { return player ? { x: player.x, z: player.z } : null; },
  get enemyPositions() { return enemies.filter((e) => !e.dead).map((e) => ({ x: e.x, z: e.z })); },
  get bossPos() { return boss ? { x: boss.x, z: boss.z } : null; },
  project(x, z) {
    const v = new THREE.Vector3(x, 1, z).project(camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  },
};

boot();

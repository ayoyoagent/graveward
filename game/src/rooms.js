// Run state machine for GRAVEWARD: the whole loop of a run as pure data.
// A run is 3 arena rooms and then a boss room. Each room spawns its waves;
// clearing a room offers 3 upgrade cards; picking one opens the way on.
// No DOM, no three.js — the logic tests drive this directly.
//
// Phases: 'title' -> 'zone' -> 'difficulty' -> 'weapon' -> 'playing'
//        -> 'upgrade' -> 'playing' ... -> 'victory' | 'defeat'
// main.js owns the DOM screens; this module owns the numbers.

import { mulberry32, pickDistinct, clamp } from './util.js';
import { ROOM_WAVES } from './enemies.js';
import { DIFFICULTIES } from './palette.js';

export const ROOMS_PER_RUN = 3;
export const BOSS_ROOM = 4;

export const UPGRADES = [
  { id: 'damage', name: 'Sharpened Edge', desc: '+15% damage on every attack.', apply: (s) => { s.damageMult *= 1.15; } },
  { id: 'vitality', name: 'Second Wind', desc: '+20 max HP and heal 20 now.', apply: (s) => { s.maxHp += 20; s.hp = Math.min(s.maxHp, s.hp + 20); } },
  { id: 'swift', name: 'Swift Boots', desc: '+10% move speed.', apply: (s) => { s.speedMult *= 1.1; } },
  { id: 'dash', name: 'Twin Dash', desc: '+1 dash charge.', apply: (s) => { s.dashCharges += 1; s.dashMax += 1; } },
  { id: 'crit', name: 'Killer Instinct', desc: '+15% critical chance.', apply: (s) => { s.critBonus += 0.15; } },
  { id: 'rapid', name: 'Quick Hands', desc: 'Attack 20% faster.', apply: (s) => { s.cooldownMult *= 0.8; } },
  { id: 'pierce', name: 'Through and Through', desc: '+1 projectile pierce.', apply: (s) => { s.pierceBonus += 1; } },
  { id: 'magnet', name: 'Gold Sense', desc: 'Coins fly to you from twice as far.', apply: (s) => { s.magnetMult *= 2; } },
];

// Fresh run state. `seed` drives waves, drops and upgrade offers.
export function createRun({ zone = 'city', difficulty = 'normal', weapon = 'sword', seed = 1 } = {}) {
  const diff = DIFFICULTIES[difficulty];
  return {
    seed,
    rand: mulberry32(seed),
    zone,
    difficulty,
    weaponId: weapon,
    diff,
    room: 1,
    phase: 'playing',
    // Player combat stats; upgrades mutate these.
    hp: 100,
    maxHp: 100,
    damageMult: 1,
    speedMult: 1,
    cooldownMult: 1,
    critBonus: 0,
    pierceBonus: 0,
    magnetMult: 1,
    dashCharges: 1,
    dashMax: 1,
    dashCooldown: 0,
    // Run totals.
    gold: 0,
    kills: 0,
    timeSec: 0,
    roomsCleared: 0,
    upgradesTaken: [],
    bossName: null,
    // Room bookkeeping.
    waveIndex: 0,
    waves: ROOM_WAVES[1] || [],
    spawnedThisWave: 0,
    enemiesLeft: 0,
    upgradeOffer: null,
    won: false,
    lost: false,
  };
}

// Wave specs for a room, scaled for Hard (a few extra shamblers).
export function wavesForRoom(room, difficulty) {
  const base = ROOM_WAVES[room] || [];
  if (difficulty !== 'hard') return base.map((w) => ({ ...w }));
  return base.map((w) => ({ ...w, shambler: (w.shambler || 0) + 1 }));
}

// Start a room: reset the wave counter and hand back the first wave spec.
export function startRoom(run, room) {
  run.room = room;
  run.waveIndex = 0;
  run.waves = wavesForRoom(room, run.difficulty);
  run.spawnedThisWave = 0;
  run.enemiesLeft = 0;
  run.phase = 'playing';
  return run.waves[0] || null;
}

// Total enemies a wave spec spawns.
export function waveSize(spec) {
  if (!spec) return 0;
  return Object.values(spec).reduce((a, b) => a + b, 0);
}

// Advance to the next wave in the room; returns the next spec or null when
// the room's waves are done.
export function nextWave(run) {
  run.waveIndex += 1;
  return run.waves[run.waveIndex] || null;
}

// Called when the room is empty: offer 3 upgrade cards (or the boss door
// on room 3). Returns the offer, or null when the boss room is next.
export function onRoomCleared(run) {
  run.roomsCleared += 1;
  if (run.room >= ROOMS_PER_RUN) {
    run.phase = 'bossDoor';
    return null;
  }
  run.phase = 'upgrade';
  run.upgradeOffer = pickDistinct(UPGRADES, 3, run.rand);
  return run.upgradeOffer;
}

// Apply a chosen upgrade card by id, then move to the next room.
export function applyUpgrade(run, upgradeId) {
  const up = UPGRADES.find((u) => u.id === upgradeId);
  if (!up) return false;
  up.apply(run);
  run.upgradesTaken.push(up.id);
  run.upgradeOffer = null;
  startRoom(run, run.room + 1);
  return true;
}

// Enter the boss room (room 4).
export function startBossRoom(run, bossName) {
  run.room = BOSS_ROOM;
  run.bossName = bossName;
  run.phase = 'boss';
  return run;
}

// Score: gold banked + 10 per kill + a time bonus on a win.
export function scoreFor(run) {
  const timeBonus = run.won ? Math.max(0, 600 - Math.floor(run.timeSec)) * 2 : 0;
  return run.gold + run.kills * 10 + timeBonus;
}

// Gold an enemy drops, after the difficulty multiplier.
export function goldDrop(baseGold, difficulty) {
  return Math.round(baseGold * DIFFICULTIES[difficulty].goldMult);
}

// Clamp helper for the HUD: hp fraction 0..1.
export function hpFraction(run) {
  return clamp(run.hp / run.maxHp, 0, 1);
}

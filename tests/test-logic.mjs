// Logic tests for GRAVEWARD (run: node tests/test-logic.mjs).
// Only the pure modules are tested here — weapons, enemies, bosses and the
// run machine — because they import no DOM and no three.js.

import { WEAPONS, WEAPON_ORDER, rollDamage, inArc, weaponIcon } from '../game/src/weapons.js';
import { ENEMY_TYPES, ROOM_WAVES, makeEnemy, expandWave, stepEnemy } from '../game/src/enemies.js';
import { BOSS_TYPES, makeBoss, stepBoss } from '../game/src/boss.js';
import {
  createRun, startRoom, nextWave, waveSize, onRoomCleared, applyUpgrade,
  startBossRoom, scoreFor, goldDrop, UPGRADES,
} from '../game/src/rooms.js';
import { mulberry32 } from '../game/src/util.js';

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`FAIL: ${name}`);
  }
}
function eq(name, a, b) {
  check(`${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, a === b);
}

// ---- weapons ----
check('six weapons defined', WEAPON_ORDER.length === 6);
for (const id of WEAPON_ORDER) {
  const w = WEAPONS[id];
  check(`weapon ${id} has positive damage`, w.damage > 0);
  check(`weapon ${id} has a cooldown`, w.cooldown > 0);
  check(`weapon ${id} has a range`, w.range > 0);
  check(`weapon ${id} has an icon`, weaponIcon(id).includes('<svg') && weaponIcon(id).length > 40);
  check(`weapon ${id} has a description`, typeof w.desc === 'string' && w.desc.length > 10);
}
check('blunderbuss crits only close up', WEAPONS.blunderbuss.critRange === 4.5);
check('axe never crits', WEAPONS.axe.critChance === 0);
check('longbow pierces', WEAPONS.longbow.pierce === 2);

// Damage rolls: crits multiply, jitter stays in band, never below 1.
{
  const rand = mulberry32(7);
  const sword = WEAPONS.sword;
  let critSeen = false;
  for (let i = 0; i < 200; i++) {
    const r = rollDamage(sword, 1, rand, 1);
    if (r.damage < 1 || r.damage > Math.ceil(sword.damage * 2 * 1.1)) check('sword damage in band', false);
    if (r.crit) critSeen = true;
  }
  check('sword crits sometimes', critSeen);
  const axe = WEAPONS.axe;
  let axeCrit = false;
  for (let i = 0; i < 100; i++) if (rollDamage(axe, 1, rand, 1).crit) axeCrit = true;
  check('axe never crits', !axeCrit);
  // Blunderbuss far away: no crit even on a lucky roll.
  let farCrit = false;
  for (let i = 0; i < 200; i++) if (rollDamage(WEAPONS.blunderbuss, 8, rand, 1).crit) farCrit = true;
  check('blunderbuss does not crit at range', !farCrit);
}

// Arc tests.
check('inArc hits ahead', inArc(0, 0, 0, 1.9, 3, 2, 0));
check('inArc misses behind', !inArc(0, 0, 0, 1.9, 3, -2, 0));
check('inArc misses out of range', !inArc(0, 0, 0, 1.9, 3, 4, 0));
check('full-circle arc hits everywhere', inArc(0, 0, 0, Math.PI * 2, 3, -2, 0));

// ---- enemies ----
check('three enemy kinds', Object.keys(ENEMY_TYPES).length === 3);
{
  const e = makeEnemy('shambler', 0, 0, {});
  eq('shambler hp', e.hp, 30);
  eq('shambler gold', e.gold, 3);
  const elite = makeEnemy('brute', 0, 0, { elite: true });
  check('elite brute has more hp', elite.hp > 70);
  check('elite brute drops more gold', elite.gold > 8);
  const hard = makeEnemy('shambler', 0, 0, { damageMult: 1.5 });
  eq('hard shambler damage', hard.damage, 12);
}
{
  const rand = mulberry32(3);
  const kinds = expandWave({ shambler: 4, spitter: 2 }, rand);
  eq('wave expands to 6', kinds.length, 6);
  eq('wave keeps counts', kinds.filter((k) => k === 'shambler').length, 4);
}
// AI: a shambler walks toward the player and swings in range.
{
  const rand = mulberry32(5);
  const e = makeEnemy('shambler', 10, 0, {});
  const ctx = { dt: 1 / 60, player: { x: 0, z: 0 }, rand, halfW: 17, halfH: 13 };
  const before = e.x;
  stepEnemy(e, ctx);
  check('shambler closes distance', e.x < before);
  const close = makeEnemy('shambler', 0.5, 0, {});
  const evs = stepEnemy(close, ctx);
  check('shambler attacks in range', evs.some((ev) => ev.type === 'melee'));
  const spitter = makeEnemy('spitter', 6, 0, {});
  const evs2 = stepEnemy(spitter, ctx);
  check('spitter shoots in range', evs2.some((ev) => ev.type === 'shoot'));
  const brute = makeEnemy('brute', 1, 0, {});
  stepEnemy(brute, ctx);
  check('brute winds up in range', brute.windingUp);
}

// ---- bosses ----
check('three bosses defined', Object.keys(BOSS_TYPES).length === 3);
{
  const lich = makeBoss('lich', 0, -8, {});
  eq('lich hp', lich.hp, 720);
  const hardKing = makeBoss('hollowking', 0, -8, { hpMult: 1.25, damageMult: 1.25 });
  check('hard hollow king is tougher', hardKing.hp > 950 && hardKing.damage > 20);
  // Boss volleys bolts when the player is in range.
  const ctx = { dt: 1 / 60, player: { x: 0, z: 0 }, rand: mulberry32(9), halfW: 17, halfH: 13 };
  lich.cooldown = 0;
  let shots = [];
  for (let i = 0; i < 120; i++) {
    shots = shots.concat(stepBoss(lich, ctx));
    if (shots.length > 0) break;
  }
  check('lich fires a volley', shots.some((s) => s.type === 'shoot'));
  // Mid-fight summon fires once at the threshold.
  const butcher = makeBoss('butcher', 0, -8, {});
  butcher.hp = Math.floor(butcher.maxHp * 0.4);
  const evs = stepBoss(butcher, { ...ctx, player: { x: 0, z: 0 } });
  check('butcher summons below half hp', evs.some((s) => s.type === 'summon'));
}

// ---- run machine ----
{
  const run = createRun({ zone: 'city', difficulty: 'normal', weapon: 'sword', seed: 11 });
  eq('run starts in room 1', run.room, 1);
  eq('run hp', run.hp, 100);
  const first = startRoom(run, 1);
  eq('room 1 first wave size', waveSize(first), 5);
  const offer = onRoomCleared(run);
  check('room clear offers 3 upgrades', offer && offer.length === 3);
  check('upgrade offer is distinct', new Set(offer.map((o) => o.id)).size === 3);
  const before = run.damageMult;
  const dmgUp = offer.find((o) => o.id === 'damage');
  if (dmgUp) {
    applyUpgrade(run, 'damage');
    check('damage upgrade applies', run.damageMult > before);
  } else {
    applyUpgrade(run, offer[0].id);
  }
  eq('upgrade moves to room 2', run.room, 2);
  check('run records the upgrade', run.upgradesTaken.length === 1);
  // Room 3 clear opens the boss door, no offer.
  run.room = 3;
  const noOffer = onRoomCleared(run);
  eq('room 3 clear has no offer', noOffer, null);
  eq('boss door phase', run.phase, 'bossDoor');
  startBossRoom(run, 'butcher');
  eq('boss room is 4', run.room, 4);
  // Score: gold + 10/kill + time bonus on a win.
  run.gold = 100;
  run.kills = 10;
  run.timeSec = 300;
  run.won = true;
  eq('score with time bonus', scoreFor(run), 100 + 100 + 600);
  run.won = false;
  eq('score without win has no time bonus', scoreFor(run), 200);
  eq('hard gold doubles', goldDrop(10, 'hard'), 20);
  eq('normal gold stays', goldDrop(10, 'normal'), 10);
  // Hard waves add a shambler.
  const hardRun = createRun({ zone: 'city', difficulty: 'hard', weapon: 'axe', seed: 2 });
  startRoom(hardRun, 1);
  eq('hard room 1 wave size', waveSize(hardRun.waves[0]), 6);
  // Every upgrade id in the pool is unique and appliable.
  const ids = new Set(UPGRADES.map((u) => u.id));
  eq('upgrade ids unique', ids.size, UPGRADES.length);
  const probe = createRun({ seed: 1 });
  for (const u of UPGRADES) {
    const ok = applyUpgrade(probe, u.id);
    check(`upgrade ${u.id} applies`, ok === true);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

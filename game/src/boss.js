// Boss definitions and AI for GRAVEWARD. Pure logic like enemies.js:
// a boss is a plain object, `stepBoss` returns events for main.js. Each
// boss has two or three readable attacks with a telegraph, so the player
// can learn the pattern instead of being punished by a surprise.
//
//   Pig Butcher — charges across the room, then slams his cleaver.
//   Lich — keeps his distance, throws bone-bolt volleys, raises shamblers.
//   Hollow King — the Lich's moveset with a faster, wider spread and a
//     charge of his own: a reskin with different stats and one extra move.

import { clamp } from './util.js';

export const BOSS_TYPES = {
  butcher: {
    id: 'butcher',
    name: 'PIG BUTCHER',
    title: 'Butcher of the Besieged Quarter',
    hp: 620,
    speed: 2.2,
    radius: 1.1,
    damage: 18,
    color: 0xb06a4a,
    chargeSpeed: 13,
    chargeCooldown: 5,
    slamRadius: 3.2,
    slamDamage: 22,
    summonAt: 0.5,
    summonCount: 2,
  },
  lich: {
    id: 'lich',
    name: 'LICH',
    title: 'King of the Bone Yard',
    hp: 720,
    speed: 1.9,
    radius: 1.0,
    damage: 14,
    color: 0x8fd0b0,
    volleyCount: 3,
    volleySpread: 0.5,
    volleyCooldown: 2.6,
    boltSpeed: 10,
    summonAt: 0.66,
    summonCount: 3,
    teleportCooldown: 6,
  },
  hollowking: {
    id: 'hollowking',
    name: 'HOLLOW KING',
    title: 'The First Warden',
    hp: 950,
    speed: 2.6,
    radius: 1.15,
    damage: 20,
    color: 0x9a7fe0,
    volleyCount: 5,
    volleySpread: 0.7,
    volleyCooldown: 2.2,
    boltSpeed: 11,
    chargeSpeed: 14,
    chargeCooldown: 7,
    slamRadius: 3.4,
    slamDamage: 24,
    summonAt: 0.5,
    summonCount: 3,
  },
};

export function makeBoss(id, x, z, { hpMult = 1, damageMult = 1 } = {}) {
  const t = BOSS_TYPES[id];
  const hp = Math.round(t.hp * hpMult);
  return {
    id,
    name: t.name,
    title: t.title,
    x,
    z,
    hp,
    maxHp: hp,
    speed: t.speed,
    radius: t.radius,
    damage: Math.round(t.damage * damageMult),
    slamRadius: t.slamRadius || 0,
    slamDamage: Math.round((t.slamDamage || 0) * damageMult),
    state: 'chase',
    stateT: 0,
    cooldown: 2,
    chargeCooldown: 0,
    teleportCooldown: 0,
    chargeDx: 0,
    chargeDz: 0,
    summoned: false,
    flash: 0,
    walkPhase: 0,
    dead: false,
  };
}

// One AI tick. States: chase (walk at the player) -> telegraph (pause,
// flash) -> charge (fast dash) or volley (stand and throw) -> recover.
// Returns events: { type:'shoot', ... } bolts, { type:'slam', ... },
// { type:'summon', count }, { type:'teleport' }.
export function stepBoss(b, ctx) {
  const events = [];
  const dt = ctx.dt;
  const t = BOSS_TYPES[b.id];
  b.cooldown = Math.max(0, b.cooldown - dt);
  b.chargeCooldown = Math.max(0, b.chargeCooldown - dt);
  b.teleportCooldown = Math.max(0, b.teleportCooldown - dt);
  b.flash = Math.max(0, b.flash - dt * 4);
  b.stateT += dt;

  const dx = ctx.player.x - b.x;
  const dz = ctx.player.z - b.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 0.001;
  const nx = dx / d;
  const nz = dz / d;
  b.facing = Math.atan2(dz, dx);

  // Mid-fight summon, once, when the boss drops past its threshold.
  if (!b.summoned && b.hp <= b.maxHp * t.summonAt) {
    b.summoned = true;
    events.push({ type: 'summon', count: t.summonCount });
  }

  if (b.state === 'chase') {
    b.x += nx * b.speed * dt;
    b.z += nz * b.speed * dt;
    b.walkPhase += dt * 5;
    if (b.id === 'lich' && d < 3.5 && b.teleportCooldown <= 0) {
      b.teleportCooldown = t.teleportCooldown;
      events.push({ type: 'teleport' });
    } else if (b.cooldown <= 0) {
      if ((b.id === 'butcher' || b.id === 'hollowking') && b.chargeCooldown <= 0 && d > 5) {
        b.state = 'telegraph';
        b.stateT = 0;
        b.chargeDx = nx;
        b.chargeDz = nz;
      } else if ((b.id === 'lich' || b.id === 'hollowking') && d <= 12) {
        b.state = 'volley';
        b.stateT = 0;
      } else if (d <= 2.2) {
        b.state = 'telegraph';
        b.stateT = 0;
      }
    }
  } else if (b.state === 'telegraph') {
    // Stand still and glow: the player sees the charge or slam coming.
    if (b.stateT >= 0.6) {
      if ((b.id === 'butcher' || b.id === 'hollowking') && b.chargeCooldown <= 0 && d > 3) {
        b.state = 'charge';
        b.stateT = 0;
      } else {
        b.state = 'slam';
        b.stateT = 0;
      }
    }
  } else if (b.state === 'charge') {
    b.x += b.chargeDx * t.chargeSpeed * dt;
    b.z += b.chargeDz * t.chargeSpeed * dt;
    b.walkPhase += dt * 12;
    if (b.stateT >= 0.55) {
      b.state = 'slam';
      b.stateT = 0;
      b.chargeCooldown = t.chargeCooldown;
    }
    // Charging into the player hurts.
    if (d <= b.radius + 0.6) {
      events.push({ type: 'chargeHit', damage: b.damage });
      b.state = 'slam';
      b.stateT = 0;
      b.chargeCooldown = t.chargeCooldown;
    }
  } else if (b.state === 'volley') {
    if (b.stateT >= 0.45) {
      const n = t.volleyCount;
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * (t.volleySpread / Math.max(1, n - 1));
        const ang = b.facing + spread;
        events.push({
          type: 'shoot',
          x: b.x,
          z: b.z,
          dx: Math.cos(ang),
          dz: Math.sin(ang),
          speed: t.boltSpeed,
          damage: b.damage,
          hostile: true,
          bossBolt: true,
        });
      }
      b.state = 'recover';
      b.stateT = 0;
      b.cooldown = t.volleyCooldown;
    }
  } else if (b.state === 'slam') {
    if (b.stateT >= 0.25) {
      events.push({ type: 'slam', x: b.x, z: b.z, radius: b.slamRadius, damage: b.slamDamage });
      b.state = 'recover';
      b.stateT = 0;
      b.cooldown = 1.2;
    }
  } else if (b.state === 'recover') {
    if (b.stateT >= 0.8) {
      b.state = 'chase';
      b.stateT = 0;
    }
  }

  b.x = clamp(b.x, -ctx.halfW + 1.5, ctx.halfW - 1.5);
  b.z = clamp(b.z, -ctx.halfH + 1.5, ctx.halfH - 1.5);
  return events;
}

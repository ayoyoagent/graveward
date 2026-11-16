// Enemy definitions and AI for GRAVEWARD. Pure logic: enemies are plain
// objects ({ kind, x, z, hp, ... }) and `stepEnemy` returns events the
// renderer executes (spawn a projectile, play a slam). No DOM, no three.js,
// so the logic tests can import this in Node.
//
// AI is deliberately simple and readable: chasers chase, spitters keep
// their distance and shoot, brutes wind up and slam. Separation is done by
// main.js after the step, so enemies never stack into one pile.

import { clamp, dist2 } from './util.js';

export const ENEMY_TYPES = {
  shambler: {
    kind: 'shambler',
    name: 'Shambler',
    hp: 30,
    speed: 2.6,
    damage: 8,
    radius: 0.55,
    attackRange: 1.2,
    attackCooldown: 0.9,
    gold: 3,
    xp: 1,
    color: 0x7a9a58,
  },
  spitter: {
    kind: 'spitter',
    name: 'Spitter',
    hp: 22,
    speed: 2.0,
    damage: 7,
    radius: 0.5,
    attackRange: 8.5,
    preferredRange: 6,
    attackCooldown: 2.2,
    projectileSpeed: 9,
    gold: 4,
    xp: 1,
    color: 0x9a7ab5,
  },
  brute: {
    kind: 'brute',
    name: 'Brute',
    hp: 70,
    speed: 1.4,
    damage: 16,
    radius: 0.8,
    attackRange: 2.4,
    windUp: 0.7,
    slamRadius: 2.3,
    attackCooldown: 1.8,
    gold: 8,
    xp: 2,
    color: 0x8a5a44,
  },
};

// Waves per room (room numbers are 1-based; room 4 is the boss room and
// spawns no regular wave). Counts scale a little on Hard via rooms.js.
export const ROOM_WAVES = {
  1: [{ shambler: 5 }],
  2: [{ shambler: 4, spitter: 2 }, { shambler: 2, spitter: 1 }],
  3: [{ shambler: 3, spitter: 2, brute: 1 }, { shambler: 3, spitter: 2, brute: 1 }],
};

// Build a fresh enemy from its type. `elite` grows it and gilds it;
// `damageMult` is the difficulty multiplier applied at spawn.
export function makeEnemy(kind, x, z, { elite = false, damageMult = 1, hpMult = 1 } = {}) {
  const t = ENEMY_TYPES[kind];
  const hp = Math.round(t.hp * hpMult * (elite ? 2.2 : 1));
  return {
    kind,
    name: t.name,
    x,
    z,
    hp,
    maxHp: hp,
    speed: t.speed * (elite ? 1.1 : 1),
    damage: Math.round(t.damage * damageMult * (elite ? 1.5 : 1)),
    radius: t.radius * (elite ? 1.35 : 1),
    attackRange: t.attackRange,
    attackCooldown: t.attackCooldown,
    cooldown: 0,
    windUp: 0,
    windingUp: false,
    gold: t.gold * (elite ? 3 : 1),
    elite,
    flash: 0,
    walkPhase: Math.random() * Math.PI * 2,
    dead: false,
  };
}

// Expand a wave spec like { shambler: 4, spitter: 2 } into a shuffled list
// of kinds, so spawn order is never a neat conga line.
export function expandWave(spec, rand) {
  const kinds = [];
  for (const [kind, count] of Object.entries(spec)) {
    for (let i = 0; i < count; i++) kinds.push(kind);
  }
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = kinds[i];
    kinds[i] = kinds[j];
    kinds[j] = tmp;
  }
  return kinds;
}

// One AI tick for one enemy. `ctx` carries the player, dt, the run RNG and
// the arena half-extents (enemies never leave the room). Returns an array
// of events for main.js: { type: 'melee', damage } when a chaser lands a
// hit, { type: 'shoot', x, z, dx, dz, speed, damage } for a spitter bolt,
// { type: 'slam', x, z, radius, damage } when a brute's wind-up lands.
// Movement writes straight onto the enemy object.
export function stepEnemy(e, ctx) {
  const events = [];
  const dt = ctx.dt;
  e.cooldown = Math.max(0, e.cooldown - dt);
  e.flash = Math.max(0, e.flash - dt * 4);
  const dx = ctx.player.x - e.x;
  const dz = ctx.player.z - e.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 0.001;
  const nx = dx / d;
  const nz = dz / d;
  e.facing = Math.atan2(dz, dx);

  if (e.kind === 'shambler') {
    if (d <= e.attackRange && e.cooldown <= 0) {
      e.cooldown = e.attackCooldown;
      events.push({ type: 'melee', damage: e.damage });
    } else if (d > e.attackRange * 0.8) {
      e.x += nx * e.speed * dt;
      e.z += nz * e.speed * dt;
    }
    e.walkPhase += dt * 7;
  } else if (e.kind === 'spitter') {
    const want = ENEMY_TYPES.spitter.preferredRange;
    if (d < want - 1.5) {
      e.x -= nx * e.speed * dt;
      e.z -= nz * e.speed * dt;
    } else if (d > want + 1.5) {
      e.x += nx * e.speed * dt;
      e.z += nz * e.speed * dt;
    } else {
      // Strafe sideways so spitters never stand in a line.
      const strafe = e.strafeDir || 1;
      e.x += -nz * strafe * e.speed * 0.5 * dt;
      e.z += nx * strafe * e.speed * 0.5 * dt;
      if (ctx.rand() < dt * 0.3) e.strafeDir = -strafe;
    }
    if (d <= e.attackRange && e.cooldown <= 0) {
      e.cooldown = e.attackCooldown;
      events.push({
        type: 'shoot',
        x: e.x,
        z: e.z,
        dx: nx,
        dz: nz,
        speed: ENEMY_TYPES.spitter.projectileSpeed,
        damage: e.damage,
        hostile: true,
      });
    }
    e.walkPhase += dt * 5;
  } else if (e.kind === 'brute') {
    if (e.windingUp) {
      e.windUp -= dt;
      if (e.windUp <= 0) {
        e.windingUp = false;
        e.cooldown = e.attackCooldown;
        events.push({ type: 'slam', x: e.x, z: e.z, radius: ENEMY_TYPES.brute.slamRadius, damage: e.damage });
      }
    } else if (d <= e.attackRange && e.cooldown <= 0) {
      e.windingUp = true;
      e.windUp = ENEMY_TYPES.brute.windUp;
    } else if (d > e.attackRange * 0.7) {
      e.x += nx * e.speed * dt;
      e.z += nz * e.speed * dt;
    }
    e.walkPhase += dt * 4;
  }

  // Stay inside the room.
  e.x = clamp(e.x, -ctx.halfW + 1, ctx.halfW - 1);
  e.z = clamp(e.z, -ctx.halfH + 1, ctx.halfH - 1);
  return events;
}

// Gold value of a kill, before the difficulty multiplier.
export function goldFor(e) {
  return e.gold;
}

// Distance check helper for projectile hits: circle vs circle.
export function hitsCircle(px, pz, pr, ex, ez, er) {
  return dist2(px, pz, ex, ez) <= (pr + er) * (pr + er);
}

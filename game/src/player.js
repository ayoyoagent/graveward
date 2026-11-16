// Player state and movement for GRAVEWARD. Pure logic: the player is a
// plain object and `stepPlayer` moves it from an input snapshot. Rendering
// (the warden mesh, held weapon, swing animation) lives in world.js and
// main.js and reads this state.

import { clamp } from './util.js';

export const PLAYER_BASE = {
  maxHp: 100,
  speed: 6.0,
  radius: 0.5,
  dashSpeed: 19,
  dashTime: 0.18,
  dashCooldown: 2.0,
  hurtCooldown: 0.5,
};

export function createPlayer(x = 0, z = 8) {
  return {
    x,
    z,
    vx: 0,
    vz: 0,
    facing: -Math.PI / 2,
    aimX: 0,
    aimZ: -1,
    hp: PLAYER_BASE.maxHp,
    maxHp: PLAYER_BASE.maxHp,
    speed: PLAYER_BASE.speed,
    radius: PLAYER_BASE.radius,
    dashCharges: 1,
    dashMax: 1,
    dashCooldown: 0,
    dashTimeLeft: 0,
    dashDx: 0,
    dashDz: 0,
    hurtCooldown: 0,
    attackCooldown: 0,
    swingT: 0,
    walkPhase: 0,
    moving: false,
    dead: false,
  };
}

// One movement tick. `input` is { mx, mz, dash, aimX, aimZ } where mx/mz
// is the normalized WASD direction and aimX/aimZ the world aim point.
// `stats` carries run multipliers (speedMult, dashMax). `collide` is a
// callback (x, z, radius) -> { x, z } that resolves walls/props; main.js
// supplies the arena-aware version.
export function stepPlayer(p, input, stats, dt, collide) {
  p.hurtCooldown = Math.max(0, p.hurtCooldown - dt);
  p.attackCooldown = Math.max(0, p.attackCooldown - dt);
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  p.swingT = Math.max(0, p.swingT - dt);

  // Aim always faces the mouse.
  const ax = input.aimX - p.x;
  const az = input.aimZ - p.z;
  if (ax * ax + az * az > 0.001) {
    p.facing = Math.atan2(az, ax);
    p.aimX = input.aimX;
    p.aimZ = input.aimZ;
  }

  // Dash: a short burst in the current move direction (or facing, if the
  // player stands still). One charge per press, refilled on cooldown.
  if (input.dash && p.dashCharges > 0 && p.dashTimeLeft <= 0) {
    p.dashCharges -= 1;
    p.dashTimeLeft = PLAYER_BASE.dashTime;
    const len = Math.hypot(input.mx, input.mz);
    if (len > 0.01) {
      p.dashDx = input.mx / len;
      p.dashDz = input.mz / len;
    } else {
      p.dashDx = Math.cos(p.facing);
      p.dashDz = Math.sin(p.facing);
    }
    p.dashCooldown = PLAYER_BASE.dashCooldown;
  }
  if (p.dashCooldown <= 0 && p.dashCharges < p.dashMax) {
    p.dashCharges = p.dashMax;
  }

  let mx = input.mx;
  let mz = input.mz;
  const moving = mx * mx + mz * mz > 0.01;
  p.moving = moving || p.dashTimeLeft > 0;

  if (p.dashTimeLeft > 0) {
    p.dashTimeLeft -= dt;
    mx = p.dashDx;
    mz = p.dashDz;
    const nx = p.x + mx * PLAYER_BASE.dashSpeed * dt;
    const nz = p.z + mz * PLAYER_BASE.dashSpeed * dt;
    const solved = collide(nx, nz, p.radius);
    p.x = solved.x;
    p.z = solved.z;
  } else if (moving) {
    const len = Math.hypot(mx, mz) || 1;
    const speed = p.speed * (stats ? stats.speedMult : 1);
    const nx = p.x + (mx / len) * speed * dt;
    const nz = p.z + (mz / len) * speed * dt;
    const solved = collide(nx, nz, p.radius);
    p.x = solved.x;
    p.z = solved.z;
    p.walkPhase += dt * 10;
  }

  p.x = clamp(p.x, -100, 100);
  p.z = clamp(p.z, -100, 100);
  return p;
}

// Damage the player, respecting the brief invulnerability window after a
// hit. Returns the damage actually taken (0 when invulnerable or dead).
export function hurtPlayer(p, damage) {
  if (p.dead || p.hurtCooldown > 0) return 0;
  p.hp -= damage;
  p.hurtCooldown = PLAYER_BASE.hurtCooldown;
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
  }
  return damage;
}

export function healPlayer(p, amount) {
  if (p.dead) return 0;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  return p.hp - before;
}

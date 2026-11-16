// Shared small helpers for GRAVEWARD: seeded randomness, math, and tiny
// list utilities. Nothing here touches the DOM or three.js, so the logic
// tests can import it in plain Node.

// mulberry32: a small deterministic PRNG. Seed it once per run; the same
// seed always deals the same waves, drops and textures.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed turn from angle `from` toward angle `to`, in radians.
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(from, to, t) {
  return from + angleDelta(from, to) * clamp(t, 0, 1);
}

// Distance squared between two {x, z} points (no sqrt when comparing).
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

// Pick `count` distinct entries from `arr` using `rand`, without mutating it.
export function pickDistinct(arr, count, rand) {
  const copy = arr.slice();
  const out = [];
  while (copy.length > 0 && out.length < count) {
    const i = Math.floor(rand() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

// Fisher-Yates shuffle of a copy.
export function shuffled(arr, rand) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

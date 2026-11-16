// Weapon definitions for GRAVEWARD. Pure data + pure math: no DOM, no
// three.js, so the logic tests can import this in Node.
//
// Each weapon has one job in the player's hands. `kind` tells main.js how
// to fire it: 'spread' (pellets), 'arc' (melee swing), 'bolt' (projectile),
// 'thrust' (line), 'slam' (area). Damage numbers are tuned so every weapon
// can clear room 1 in a few good hits and no weapon is a trap pick.

export const WEAPONS = {
  blunderbuss: {
    id: 'blunderbuss',
    name: 'Blunderbuss',
    kind: 'spread',
    desc: 'Powerful cone-shaped shot. Deals critical damage to nearby enemies.',
    damage: 9,
    pellets: 5,
    spread: 0.38,
    range: 9,
    cooldown: 0.7,
    critChance: 0.5,
    critMult: 2,
    critRange: 4.5,
    projectileSpeed: 30,
    color: 0x8a6a3a,
  },
  axe: {
    id: 'axe',
    name: 'Berserker Axe',
    kind: 'arc',
    desc: 'A deadly 360 degree whirlwind. Does not deal critical damage.',
    damage: 26,
    radius: 3.4,
    arc: Math.PI * 2,
    range: 3.4,
    cooldown: 1.1,
    critChance: 0,
    critMult: 1,
    color: 0x7a8a9a,
  },
  longbow: {
    id: 'longbow',
    name: 'Longbow',
    kind: 'bolt',
    desc: 'Long range, fast arrows. Arrows pierce through enemies.',
    damage: 14,
    pierce: 2,
    range: 16,
    cooldown: 0.32,
    critChance: 0.15,
    critMult: 2,
    projectileSpeed: 26,
    color: 0x9a7a4a,
  },
  sword: {
    id: 'sword',
    name: 'Sword',
    kind: 'arc',
    desc: 'A fast arc slash. Quick, close, and always ready.',
    damage: 18,
    radius: 2.7,
    arc: 1.9,
    range: 2.7,
    cooldown: 0.35,
    critChance: 0.2,
    critMult: 2,
    color: 0xb8c4d0,
  },
  spear: {
    id: 'spear',
    name: 'Spear',
    kind: 'thrust',
    desc: 'A long-reach thrust. Keeps the horde at arm\'s length.',
    damage: 22,
    range: 4.4,
    width: 0.9,
    cooldown: 0.55,
    critChance: 0.2,
    critMult: 2,
    projectileSpeed: 0,
    color: 0x8a9a7a,
  },
  mace: {
    id: 'mace',
    name: 'War Mace',
    kind: 'slam',
    desc: 'A slow, heavy slam that shakes the ground around you.',
    damage: 34,
    radius: 3.1,
    range: 3.1,
    cooldown: 1.3,
    critChance: 0.25,
    critMult: 2,
    color: 0x9a8a6a,
  },
};

export const WEAPON_ORDER = ['blunderbuss', 'axe', 'longbow', 'sword', 'spear', 'mace'];

// Roll one hit's damage. `rand` is the run's seeded RNG. Crits only happen
// inside the weapon's crit range (blunderbuss close-up rule) or always when
// the weapon has no critRange limit. Returns { damage, crit }.
export function rollDamage(weapon, distance, rand, damageMult = 1) {
  let crit = false;
  if (weapon.critChance > 0) {
    const inRange = weapon.critRange === undefined || distance <= weapon.critRange;
    crit = inRange && rand() < weapon.critChance;
  }
  const base = weapon.damage * damageMult * (crit ? weapon.critMult : 1);
  // Small damage jitter so numbers never feel stamped out.
  const jitter = 0.9 + rand() * 0.2;
  return { damage: Math.max(1, Math.round(base * jitter)), crit };
}

// Melee arc test: is `target` inside a swing of `radius` and half-angle
// `arc/2` around `facing` from `origin`?
export function inArc(ox, oz, facing, arc, radius, tx, tz) {
  const dx = tx - ox;
  const dz = tz - oz;
  const d2 = dx * dx + dz * dz;
  if (d2 > radius * radius) return false;
  if (arc >= Math.PI * 2) return true;
  const ang = Math.atan2(dz, dx);
  let diff = ang - facing;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) <= arc / 2;
}

// Procedural SVG side-profile icons, one per weapon. Drawn as data, not
// images: the game inlines these strings into the weapon-select cards.
// Light gunmetal on dark, amber accent — same look as the 3D models.
const ICON_BODY = 'stroke="#d8d3c4" stroke-width="3" stroke-linecap="round" fill="none"';
const ICON_ACCENT = 'stroke="#f5a623" stroke-width="3" stroke-linecap="round" fill="none"';

export function weaponIcon(id) {
  const open = `<svg viewBox="0 0 96 64" xmlns="http://www.w3.org/2000/svg" width="96" height="64">`;
  const close = '</svg>';
  const shapes = {
    blunderbuss:
      `<path d="M12 40 L62 30" ${ICON_BODY}/>` +
      `<path d="M62 30 L86 22 L88 30 L64 38 Z" fill="#d8d3c4" stroke="#8a7a5a" stroke-width="2"/>` +
      `<path d="M20 40 L16 52 L24 50" ${ICON_ACCENT}/>` +
      `<path d="M48 33 L44 44" ${ICON_BODY}/>`,
    axe:
      `<path d="M28 56 L68 14" ${ICON_BODY}/>` +
      `<path d="M62 10 Q84 8 86 26 Q74 34 62 22 Z" fill="#c8d4e0" stroke="#8a7a5a" stroke-width="2"/>` +
      `<path d="M68 16 Q50 22 52 38 Q64 30 68 16" fill="#c8d4e0" stroke="#8a7a5a" stroke-width="2"/>` +
      `<path d="M28 56 L22 60" ${ICON_ACCENT}/>`,
    longbow:
      `<path d="M22 8 Q58 32 22 56" ${ICON_BODY}/>` +
      `<path d="M22 8 L22 56" stroke="#e8e0c8" stroke-width="2"/>` +
      `<path d="M30 32 L82 32" ${ICON_ACCENT}/>` +
      `<path d="M82 32 L74 28 M82 32 L74 36" ${ICON_ACCENT}/>`,
    sword:
      `<path d="M14 52 L70 16" ${ICON_BODY}/>` +
      `<path d="M70 16 L84 8 L78 22 Z" fill="#d8e0ea" stroke="#8a7a5a" stroke-width="2"/>` +
      `<path d="M14 52 L20 46 M10 56 L18 48" ${ICON_ACCENT}/>` +
      `<circle cx="16" cy="52" r="4" fill="#f5a623"/>`,
    spear:
      `<path d="M10 52 L78 16" ${ICON_BODY}/>` +
      `<path d="M78 16 L92 8 L84 24 Z" fill="#d8e0ea" stroke="#8a7a5a" stroke-width="2"/>` +
      `<path d="M52 34 L46 40" ${ICON_ACCENT}/>` +
      `<path d="M30 44 L26 50" ${ICON_BODY}/>`,
    mace:
      `<path d="M24 54 L62 24" ${ICON_BODY}/>` +
      `<circle cx="68" cy="18" r="11" fill="#c8b890" stroke="#8a7a5a" stroke-width="2"/>` +
      `<path d="M68 7 L68 2 M79 18 L84 18 M68 29 L68 34 M57 18 L52 18" ${ICON_ACCENT}/>` +
      `<path d="M24 54 L18 58" ${ICON_ACCENT}/>`,
  };
  return open + (shapes[id] || '') + close;
}

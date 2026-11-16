// DOM HUD and menus for GRAVEWARD. This module owns every HTML overlay:
// the title, zone / difficulty / weapon picks, upgrade cards, pause, and
// the victory / defeat screens, plus the in-run HUD bars. The 3D code never
// touches the DOM directly; it calls these functions.
//
// Unlocks (The Hollow, Nightmare) persist in localStorage, so a boss clear
// in one session opens the next zone in the next.

import { ZONES, DIFFICULTIES } from './palette.js';
import { WEAPONS, WEAPON_ORDER, weaponIcon } from './weapons.js';

const SCREENS = ['title', 'zone', 'difficulty', 'weapon', 'upgrade', 'pause', 'victory', 'defeat'];

export function unlockFlags() {
  try {
    return {
      bossClear: localStorage.getItem('graveward_bossClear') === '1',
      hardClear: localStorage.getItem('graveward_hardClear') === '1',
    };
  } catch {
    return { bossClear: false, hardClear: false };
  }
}

export function setUnlock(key) {
  try {
    localStorage.setItem(key, '1');
  } catch { /* private mode: unlocks just don't persist */ }
}

function el(id) {
  return document.getElementById(id);
}

export function showScreen(name) {
  for (const s of SCREENS) {
    const node = el(`screen-${s}`);
    if (node) node.classList.toggle('visible', s === name);
  }
  const hud = el('hud');
  if (hud) hud.classList.toggle('visible', name === null);
}

function makeCard({ title, sub, body, locked, lockedNote, onPick, icon }) {
  const card = document.createElement('button');
  card.className = 'card' + (locked ? ' locked' : '');
  if (icon) {
    const ic = document.createElement('div');
    ic.className = 'card-icon';
    ic.innerHTML = icon;
    card.appendChild(ic);
  }
  const t = document.createElement('div');
  t.className = 'card-title';
  t.textContent = title;
  card.appendChild(t);
  if (sub) {
    const s = document.createElement('div');
    s.className = 'card-sub';
    s.textContent = sub;
    card.appendChild(s);
  }
  if (body) {
    const b = document.createElement('div');
    b.className = 'card-body';
    b.innerHTML = body;
    card.appendChild(b);
  }
  if (locked) {
    const n = document.createElement('div');
    n.className = 'card-locked-note';
    n.textContent = lockedNote || 'Locked';
    card.appendChild(n);
  } else if (onPick) {
    card.addEventListener('click', onPick);
  }
  return card;
}

export function renderZoneCards(onPick) {
  const host = el('zone-cards');
  if (!host) return;
  host.innerHTML = '';
  const flags = unlockFlags();
  const defs = [
    { id: 'city', locked: false },
    { id: 'graveyard', locked: false },
    { id: 'hollow', locked: !flags.bossClear, lockedNote: 'Clear any boss to unlock' },
  ];
  for (const d of defs) {
    const z = ZONES[d.id];
    host.appendChild(makeCard({
      title: d.locked ? '???' : z.name,
      sub: d.locked ? '' : z.subtitle,
      body: d.locked ? '' : `<p>${z.intro}</p><p class="boss-line">Boss: <b>${z.bossName}</b></p>`,
      locked: d.locked,
      lockedNote: d.lockedNote,
      onPick: () => onPick(d.id),
    }));
  }
}

export function renderDifficultyCards(onPick) {
  const host = el('diff-cards');
  if (!host) return;
  host.innerHTML = '';
  const flags = unlockFlags();
  const defs = [
    { id: 'normal', locked: false },
    { id: 'hard', locked: false, goldNote: '+100% gold' },
    { id: 'nightmare', locked: !flags.hardClear, lockedNote: 'Clear a run on Hard to unlock' },
  ];
  for (const d of defs) {
    const diff = DIFFICULTIES[d.id];
    const lines = diff.lines.map((l) => `<p>${l}</p>`).join('');
    host.appendChild(makeCard({
      title: diff.name,
      body: lines + (d.goldNote ? `<p class="gold-line">${d.goldNote} 🪙</p>` : ''),
      locked: d.locked,
      lockedNote: d.lockedNote,
      onPick: () => onPick(d.id),
    }));
  }
}

export function renderWeaponCards(onPick) {
  const host = el('weapon-cards');
  if (!host) return;
  host.innerHTML = '';
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    host.appendChild(makeCard({
      title: w.name,
      body: `<p>${w.desc}</p>`,
      icon: weaponIcon(id),
      onPick: () => onPick(id),
    }));
  }
}

export function renderUpgradeCards(offer, onPick) {
  const host = el('upgrade-cards');
  if (!host) return;
  host.innerHTML = '';
  for (const up of offer) {
    host.appendChild(makeCard({
      title: up.name,
      body: `<p>${up.desc}</p>`,
      onPick: () => onPick(up.id),
    }));
  }
}

// ---- in-run HUD ----

export function updateHud(state) {
  const hpFill = el('hp-fill');
  if (hpFill) {
    const frac = state.maxHp > 0 ? state.hp / state.maxHp : 0;
    hpFill.style.width = `${Math.max(0, frac * 100)}%`;
    hpFill.classList.toggle('low', frac < 0.3);
  }
  const hpText = el('hp-text');
  if (hpText) hpText.textContent = `${Math.ceil(state.hp)} / ${state.maxHp}`;
  const gold = el('gold-text');
  if (gold) gold.textContent = `${state.gold}`;
  const kills = el('kills-text');
  if (kills) kills.textContent = `${state.kills}`;
  const room = el('room-text');
  if (room) room.textContent = state.room >= 4 ? 'BOSS' : `Room ${state.room} / 3`;
  const weapon = el('weapon-text');
  if (weapon) weapon.textContent = state.weaponName || '';
  const cd = el('cooldown-fill');
  if (cd) cd.style.width = `${Math.round((1 - (state.cooldownFrac || 0)) * 100)}%`;
  const dash = el('dash-text');
  if (dash) dash.textContent = '⬢'.repeat(Math.max(0, state.dashCharges || 0)) || '—';
}

export function setBossBar(name, frac) {
  const bar = el('boss-bar');
  if (!bar) return;
  bar.classList.add('visible');
  const label = el('boss-name');
  if (label) label.textContent = name;
  const fill = el('boss-fill');
  if (fill) fill.style.width = `${Math.max(0, frac * 100)}%`;
}

export function hideBossBar() {
  const bar = el('boss-bar');
  if (bar) bar.classList.remove('visible');
}

let toastTimer = null;
export function showToast(text, ms = 4200) {
  const t = el('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), ms);
}

export function flashVignette() {
  const v = el('vignette');
  if (!v) return;
  v.classList.add('hurt');
  setTimeout(() => v.classList.remove('hurt'), 220);
}

export function showVictory(stats) {
  const host = el('victory-stats');
  if (host) {
    host.innerHTML = [
      ['Gold', stats.gold],
      ['Kills', stats.kills],
      ['Time', stats.time],
      ['Rooms cleared', stats.rooms],
      ['Score', stats.score],
    ].map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
  }
  const line = el('victory-line');
  if (line) line.textContent = stats.vexLine || '';
  showScreen('victory');
}

export function showDefeat(stats) {
  const host = el('defeat-stats');
  if (host) {
    host.innerHTML = [
      ['Gold', stats.gold],
      ['Kills', stats.kills],
      ['Room reached', stats.room],
      ['Time', stats.time],
    ].map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
  }
  showScreen('defeat');
}

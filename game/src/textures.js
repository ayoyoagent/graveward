// Procedural textures for GRAVEWARD: every surface is drawn once on a
// 2D canvas with a fixed seed, so every run looks identical and nothing is
// downloaded. One texture tile covers 2 metres of world (the UV rule):
// world.js scales each mesh's UVs by its size over 2 m, so a cobble stays
// cobble-sized on a 30 m floor and on a 1 m crate alike. Textures are
// near-white by design; material colours tint them, never darken them.
//
// In Node (logic tests) there is no document, so createTextures() returns
// all-null and callers fall back to flat colours.

import { mulberry32 } from './util.js';

const SIZE = 512;

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  return c;
}

// Fill the canvas with a base colour, then jitter every pixel block a
// little so flat areas still read as a surface.
function speckle(ctx, rand, base, vary, block) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let y = 0; y < SIZE; y += block) {
    for (let x = 0; x < SIZE; x += block) {
      const v = (rand() - 0.5) * vary;
      const shade = Math.max(0, Math.min(255, 128 + v));
      ctx.fillStyle = `rgba(${shade},${shade},${shade},0.16)`;
      ctx.fillRect(x, y, block, block);
    }
  }
}

function cobbleTexture(rand) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  speckle(ctx, rand, '#b9b3a4', 46, 8);
  // Cobble rows: rounded stones with mortar gaps, offset every other row.
  const rows = 8;
  const h = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 === 0 ? 0 : SIZE / 12;
    for (let i = -1; i < 7; i++) {
      const w = SIZE / 6;
      const x = i * w + off;
      const y = r * h;
      const tone = 168 + Math.floor(rand() * 46);
      ctx.fillStyle = `rgb(${tone},${tone - 6},${tone - 22})`;
      roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 9);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      roundRect(ctx, x + 5, y + 5, w - 10, 8, 4);
      ctx.fill();
    }
  }
  return c;
}

function grassTexture(rand) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  speckle(ctx, rand, '#7fae62', 40, 6);
  // Blades and clover patches.
  for (let i = 0; i < 2600; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const g = 120 + Math.floor(rand() * 70);
    ctx.fillStyle = `rgba(${40 + rand() * 30},${g},${50 + rand() * 30},0.5)`;
    ctx.fillRect(x, y, 2, 4 + rand() * 4);
  }
  for (let i = 0; i < 26; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const r = 14 + rand() * 30;
    ctx.fillStyle = 'rgba(90,140,70,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function ashTexture(rand) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  speckle(ctx, rand, '#6a6478', 34, 8);
  // Cracked dark slabs.
  for (let i = 0; i < 40; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    ctx.strokeStyle = 'rgba(30,26,40,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 90, y + (rand() - 0.5) * 90);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = 'rgba(154,127,224,0.16)';
    ctx.beginPath();
    ctx.arc(rand() * SIZE, rand() * SIZE, 10 + rand() * 26, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function brickTexture(rand) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  speckle(ctx, rand, '#8a6a58', 30, 8);
  const rows = 10;
  const h = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 === 0 ? 0 : SIZE / 8;
    for (let i = -1; i < 5; i++) {
      const w = SIZE / 4;
      const x = i * w + off;
      const y = r * h;
      const red = 150 + Math.floor(rand() * 42);
      ctx.fillStyle = `rgb(${red},${88 + rand() * 22},${62 + rand() * 16})`;
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 2, y + 2, w - 4, 5);
    }
  }
  return c;
}

function boneTexture(rand) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  speckle(ctx, rand, '#ddd6bd', 30, 8);
  // Pale bone slabs with faint seams and the odd rib curve.
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = 'rgba(120,110,88,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const y = rand() * SIZE;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(SIZE * 0.3, y + 26, SIZE * 0.7, y - 26, SIZE, y + 10);
    ctx.stroke();
  }
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = 'rgba(150,138,108,0.25)';
    ctx.fillRect(rand() * SIZE, rand() * SIZE, 3, 3);
  }
  return c;
}

function obsidianTexture(rand) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  speckle(ctx, rand, '#3a3348', 26, 8);
  for (let i = 0; i < 22; i++) {
    ctx.strokeStyle = 'rgba(154,127,224,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 120, y + (rand() - 0.5) * 120);
    ctx.stroke();
  }
  return c;
}

// Soft radial blob: contact shadow under every walker, and torch glow.
function radialTexture(inner, outer) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 8, SIZE / 2, SIZE / 2, SIZE / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createTextures() {
  if (typeof document === 'undefined') return null;
  const rand = mulberry32(0xe7717);
  return {
    cobble: cobbleTexture(rand),
    grass: grassTexture(rand),
    ash: ashTexture(rand),
    brick: brickTexture(rand),
    bone: boneTexture(rand),
    obsidian: obsidianTexture(rand),
    blob: radialTexture('rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'),
    glow: radialTexture('rgba(255,190,90,0.85)', 'rgba(255,190,90,0)'),
  };
}

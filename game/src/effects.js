// Visual effects for GRAVEWARD: pooled particles, floating damage
// numbers, hit flashes and screen shake. All of it is cheap on purpose:
// a fixed pool, no per-frame allocation in the hot path, and sprites that
// reuse one canvas texture per text colour.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_PARTICLES = 240;

// One pooled particle: a small square that flies, fades and is reused.
class ParticlePool {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    const geo = new THREE.PlaneGeometry(0.22, 0.22);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      this.items.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, spin: 0 });
    }
    this.next = 0;
  }

  burst(x, y, z, color, count = 10, speed = 4) {
    for (let i = 0; i < count; i++) {
      const p = this.items[this.next];
      this.next = (this.next + 1) % this.items.length;
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
      p.mesh.material.color.setHex(color);
      p.mesh.material.opacity = 1;
      const a = Math.random() * Math.PI * 2;
      const up = 1 + Math.random() * 3;
      p.vx = Math.cos(a) * speed * (0.4 + Math.random() * 0.6);
      p.vz = Math.sin(a) * speed * (0.4 + Math.random() * 0.6);
      p.vy = up;
      p.life = 0;
      p.maxLife = 0.4 + Math.random() * 0.35;
      p.spin = (Math.random() - 0.5) * 8;
    }
  }

  step(dt) {
    for (const p of this.items) {
      if (!p.mesh.visible) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.mesh.visible = false;
        continue;
      }
      p.vy -= 9 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.05) p.mesh.position.y = 0.05;
      p.mesh.rotation.z += p.spin * dt;
      p.mesh.material.opacity = 1 - p.life / p.maxLife;
    }
  }
}

// Floating combat text: a sprite drawn from a small canvas. A handful of
// sprites are pooled and recycled; the text is redrawn only when reused.
class NumberPool {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    for (let i = 0; i < 24; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.6, 0.8, 1);
      sprite.visible = false;
      scene.add(sprite);
      this.items.push({ sprite, canvas, tex, life: 0, maxLife: 0.9, vy: 1.6 });
    }
    this.next = 0;
  }

  show(x, y, z, text, color = PALETTE.damageNumber) {
    const n = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    const ctx = n.canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, 64, 32);
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 32);
    n.tex.needsUpdate = true;
    n.sprite.position.set(x, y, z);
    n.sprite.visible = true;
    n.life = 0;
    n.maxLife = 0.9;
  }

  step(dt) {
    for (const n of this.items) {
      if (!n.sprite.visible) continue;
      n.life += dt;
      if (n.life >= n.maxLife) {
        n.sprite.visible = false;
        continue;
      }
      n.sprite.position.y += n.vy * dt;
      n.sprite.material.opacity = 1 - n.life / n.maxLife;
    }
  }
}

// Flash an entity's materials for a beat after a hit: a warm tint at half
// strength, not solid white — a full-white flash turned the Lich into a
// white blob in still captures. The materials are cloned at flash time so
// a shared material never flashes everywhere.
export function flashMesh(group) {
  group.traverse((m) => {
    if (!m.isMesh || !m.material || !m.material.emissive) return;
    if (!m.userData.savedEmissive) m.userData.savedEmissive = m.material.emissive.getHex();
    m.material = m.material.clone();
    m.material.emissive.setHex(0xffe2b0);
    m.material.emissiveIntensity = 0.45;
    m.userData.flashUntil = performance.now() + 70;
  });
}

export function unflashMesh(group) {
  const now = performance.now();
  group.traverse((m) => {
    if (!m.isMesh || !m.userData.flashUntil) return;
    if (now >= m.userData.flashUntil) {
      m.material.emissive.setHex(m.userData.savedEmissive || 0x000000);
      m.material.emissiveIntensity = 1;
      m.userData.flashUntil = 0;
    }
  });
}

export function createEffects(scene) {
  return {
    particles: new ParticlePool(scene),
    numbers: typeof document !== 'undefined' ? new NumberPool(scene) : null,
    shake: 0,
    addShake(amount) {
      this.shake = Math.min(0.6, this.shake + amount);
    },
    step(dt) {
      this.particles.step(dt);
      if (this.numbers) this.numbers.step(dt);
      this.shake = Math.max(0, this.shake - dt * 1.8);
    },
  };
}

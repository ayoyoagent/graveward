// 3D world for GRAVEWARD: the arena, its props, and every entity mesh.
// Builds on three.js only. Textures come from textures.js; when they are
// missing (Node) everything falls back to flat colours.
//
// UV rule (from the practice build): one texture tile covers 2 m. Box and
// cylinder UVs are scaled by the mesh's size over 2 m, so bricks stay
// brick-sized on a 30 m wall and on a 1 m crate. Material colours stay
// near-white so the texture never goes dark.

import * as THREE from 'three';
import { PALETTE, ZONES } from './palette.js';
import { createTextures } from './textures.js';

export const ARENA = { halfW: 17, halfH: 13, wallH: 2.6 };

let TEX = null;
export function textures() {
  if (!TEX) TEX = createTextures();
  return TEX;
}

function lambert(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function textured(color, map, opts = {}) {
  if (!map) return lambert(color, opts);
  return new THREE.MeshLambertMaterial({ color, map, ...opts });
}

// Multiply every UV by (su, sv).
function scaleUVs(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  return geo;
}

// BoxGeometry faces come in order +x, -x, +y, -y, +z, -z (4 verts each).
// Scale each face's UVs by the two world dims that face spans, over 2 m.
function boxGeo(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const dims = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
  ];
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / 2, uv.getY(i) * dims[f][1] / 2);
    }
  }
  return geo;
}

function cylGeo(rt, rb, h, seg = 10) {
  const geo = new THREE.CylinderGeometry(rt, rb, h, seg);
  const circ = Math.PI * (rt + rb);
  scaleUVs(geo, circ / 2, h / 2);
  return geo;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// A soft dark blob that lies flat on the floor under a walker, so nobody
// reads as floating. One shared blob texture, one plane per entity.
export function makeBlob(size = 1.4) {
  const tex = textures();
  let mat;
  if (tex && tex.blob) {
    const t = new THREE.CanvasTexture(tex.blob);
    mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
  } else {
    mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------- arena ---

// Build one arena for `zoneId` into `scene`. Returns the colliders (AABB
// list {x, z, hw, hd}), the player spawn, enemy spawn ring, and the group
// (so main.js can tear it down between runs).
export function buildArena(scene, zoneId) {
  const zone = ZONES[zoneId];
  const tex = textures();
  const group = new THREE.Group();
  const colliders = [];
  const { halfW, halfH, wallH } = ARENA;

  const floorMap = tex ? new THREE.CanvasTexture(tex[zone.floor]) : null;
  if (floorMap) {
    floorMap.wrapS = THREE.RepeatWrapping;
    floorMap.wrapT = THREE.RepeatWrapping;
    floorMap.colorSpace = THREE.SRGBColorSpace;
    floorMap.anisotropy = 4;
  }
  const floorMat = textured(0xffffff, floorMap);
  const floorGeo = new THREE.PlaneGeometry(halfW * 2, halfH * 2);
  scaleUVs(floorGeo, halfW, halfH);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Outer ground: a wide skirt of the same floor texture, darkened, so the
  // frame never shows sky-blue void past the walls. The follow camera looks
  // well beyond the arena when the player hugs the south wall, and without
  // this the bottom of the frame is empty sky. Fog (45-90) fades the far
  // edge out, so there is no hard rim.
  const outerGeo = new THREE.PlaneGeometry(240, 240);
  scaleUVs(outerGeo, 120, 120);
  const outer = new THREE.Mesh(outerGeo, textured(0x8f8f8f, floorMap));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.05;
  outer.receiveShadow = true;
  group.add(outer);

  // Perimeter walls.
  const wallMap = tex ? new THREE.CanvasTexture(tex[zone.wall]) : null;
  if (wallMap) {
    wallMap.wrapS = THREE.RepeatWrapping;
    wallMap.wrapT = THREE.RepeatWrapping;
    wallMap.colorSpace = THREE.SRGBColorSpace;
    wallMap.anisotropy = 4;
  }
  const wallMat = textured(0xf2ede2, wallMap);
  const wallTop = lambert(0xd8d2c2);
  const mkWall = (w, d, x, z) => {
    const m = box(w, wallH, d, wallMat, x, wallH / 2, z);
    group.add(m);
    const cap = box(w + 0.2, 0.25, d + 0.2, wallTop, x, wallH + 0.12, z);
    group.add(cap);
    colliders.push({ x, z, hw: w / 2, hd: d / 2 });
  };
  mkWall(halfW * 2 + 2, 1, 0, -halfH - 0.5);
  mkWall(halfW * 2 + 2, 1, 0, halfH + 0.5);
  mkWall(1, halfH * 2, -halfW - 0.5, 0);
  mkWall(1, halfH * 2, halfW + 0.5, 0);

  // Props: crates, barrels and pillars, placed away from the centre spawn
  // lanes. Each prop is a collider so nothing walks through it.
  const crateMat = textured(0xe8dcc0, tex ? new THREE.CanvasTexture(tex.brick) : null);
  const barrelMat = lambert(0x9a7a4e);
  const stoneMat = lambert(0xb8b4a8);
  const propSpots = [
    { kind: 'crate', x: -12, z: -8 }, { kind: 'crate', x: -11, z: -7 },
    { kind: 'barrel', x: 12, z: -8 }, { kind: 'barrel', x: 13, z: -7 },
    { kind: 'crate', x: 12, z: 8 }, { kind: 'pillar', x: -13, z: 6 },
    { kind: 'pillar', x: 13, z: -2 }, { kind: 'barrel', x: -12, z: 8 },
  ];
  for (const s of propSpots) {
    if (s.kind === 'crate') {
      group.add(box(1.4, 1.4, 1.4, crateMat, s.x, 0.7, s.z));
      colliders.push({ x: s.x, z: s.z, hw: 0.7, hd: 0.7 });
    } else if (s.kind === 'barrel') {
      group.add(cyl(0.55, 0.6, 1.2, barrelMat, s.x, 0.6, s.z, 12));
      colliders.push({ x: s.x, z: s.z, hw: 0.55, hd: 0.55 });
    } else {
      group.add(cyl(0.6, 0.75, 3.2, stoneMat, s.x, 1.6, s.z, 8));
      colliders.push({ x: s.x, z: s.z, hw: 0.6, hd: 0.6 });
    }
  }

  // Zone dressing.
  if (zoneId === 'graveyard') {
    const stone = lambert(0x9a9a8a);
    const bone = lambert(0xe8e2c8);
    for (const [x, z, ry] of [[-8, -9, 0.3], [-5, -10, -0.2], [7, -9, 0.1], [9, 9, 0.5], [-9, 9, -0.4], [4, 10, 0.2]]) {
      const g = new THREE.Group();
      g.add(box(0.9, 1.5, 0.25, stone, 0, 0.75, 0));
      g.add(cyl(0.45, 0.45, 0.25, stone, 0, 1.55, 0, 8));
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      group.add(g);
      colliders.push({ x, z, hw: 0.5, hd: 0.3 });
    }
    // Bone pile in the middle of the north wall.
    const pile = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const b = cyl(0.09, 0.09, 1.1 + Math.random() * 0.5, bone, 0, 0.2, 0, 6);
      b.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
      b.position.set((Math.random() - 0.5) * 1.6, 0.15, (Math.random() - 0.5) * 0.8);
      pile.add(b);
    }
    pile.position.set(0, 0, -halfH + 1.6);
    group.add(pile);
  } else if (zoneId === 'city') {
    // Market stall with a striped awning, north-west corner.
    const stall = new THREE.Group();
    stall.add(box(3.2, 0.25, 1.8, lambert(0x8a5a3a), 0, 1.0, 0));
    const awn = box(3.4, 0.12, 2.0, lambert(0xc94f3d), 0, 2.2, 0);
    stall.add(awn);
    stall.add(box(0.18, 2.2, 0.18, lambert(0x6a4a2e), -1.5, 1.1, -0.8));
    stall.add(box(0.18, 2.2, 0.18, lambert(0x6a4a2e), 1.5, 1.1, -0.8));
    stall.position.set(-11, 0, -9);
    group.add(stall);
    colliders.push({ x: -11, z: -9, hw: 1.7, hd: 1.0 });
  } else {
    // The Hollow: purple crystals jutting from the floor.
    const crystal = lambert(0x9a7fe0);
    for (const [x, z, h] of [[-10, -8, 2.2], [10, -9, 1.7], [-12, 7, 1.9], [11, 8, 2.5]]) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.6, h, 5), crystal);
      m.position.set(x, h / 2, z);
      m.castShadow = true;
      group.add(m);
      colliders.push({ x, z, hw: 0.55, hd: 0.55 });
    }
  }

  // Torches on the walls: flame sprite + point-light look via a glow
  // sprite (cheap; real lights are limited to the sun + one hemi).
  const glowTex = tex ? new THREE.CanvasTexture(tex.glow) : null;
  const torchPositions = [[-8, -halfH + 0.8], [8, -halfH + 0.8], [-halfW + 0.8, 0], [halfW - 0.8, 0]];
  for (const [x, z] of torchPositions) {
    const pole = cyl(0.09, 0.12, 1.8, lambert(0x5a4028), x, 0.9, z, 6);
    group.add(pole);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffb84d }),
    );
    flame.position.set(x, 2.0, z);
    group.add(flame);
    if (glowTex) {
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 2.2),
        new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }),
      );
      glow.position.set(x, 2.0, z);
      glow.renderOrder = 2;
      group.add(glow);
    }
  }

  scene.add(group);
  return {
    group,
    colliders,
    halfW,
    halfH,
    playerSpawn: { x: 0, z: 9 },
    enemyRing: { x: 0, z: -7, r: 8 },
  };
}

// ------------------------------------------------------------ entities ---

// Generic low-poly humanoid: torso, head, two arms, two legs, with named
// parts for the walk cycle. `s` scales the whole figure.
export function makeHumanoid({ torso, legs, head, skin, height = 1.8, s = 1 }) {
  const g = new THREE.Group();
  const legMat = lambert(legs);
  const torsoMat = lambert(torso);
  const skinMat = lambert(skin);
  const headMat = lambert(head);
  const legL = box(0.22, 0.7, 0.24, legMat, -0.16, 0.35, 0);
  const legR = box(0.22, 0.7, 0.24, legMat, 0.16, 0.35, 0);
  legL.geometry.translate(0, -0.35, 0);
  legR.geometry.translate(0, -0.35, 0);
  legL.position.y = 0.7;
  legR.position.y = 0.7;
  const torsoMesh = box(0.62, 0.72, 0.36, torsoMat, 0, 1.06, 0);
  const armL = box(0.18, 0.62, 0.2, torsoMat, -0.42, 1.28, 0);
  const armR = box(0.18, 0.62, 0.2, torsoMat, 0.42, 1.28, 0);
  armL.geometry.translate(0, -0.28, 0);
  armR.geometry.translate(0, -0.28, 0);
  armL.position.y = 1.42;
  armR.position.y = 1.42;
  const headMesh = box(0.4, 0.38, 0.38, skinMat, 0, 1.66, 0);
  const helm = box(0.44, 0.14, 0.42, headMat, 0, 1.88, 0);
  g.add(legL, legR, torsoMesh, armL, armR, headMesh, helm);
  g.scale.setScalar(s);
  g.userData.parts = { legL, legR, armL, armR, torso: torsoMesh, head: headMesh };
  return g;
}

export function animateWalk(mesh, phase, amount = 0.55) {
  const p = mesh.userData.parts;
  if (!p) return;
  const swing = Math.sin(phase) * amount;
  p.legL.rotation.x = swing;
  p.legR.rotation.x = -swing;
  p.armL.rotation.x = -swing * 0.8;
  p.armR.rotation.x = swing * 0.8;
}

// The player: a warden in blue with a gold-trimmed hood and the chosen
// weapon in hand. The weapon mesh is rebuilt when the weapon changes.
export function makeWardenMesh() {
  const g = makeHumanoid({
    torso: PALETTE.player,
    legs: 0x2c4a6e,
    head: PALETTE.playerTrim,
    skin: PALETTE.playerSkin,
  });
  // Blue ring on the floor under the player, like the reference HUD.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 24),
    new THREE.MeshBasicMaterial({ color: 0x4fa8e8, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  g.userData.weaponSlot = new THREE.Group();
  g.userData.weaponSlot.position.set(0.42, 1.25, 0.15);
  g.add(g.userData.weaponSlot);
  return g;
}

// Held weapon meshes: simple low-poly shapes, cylinders for round parts.
export function makeWeaponMesh(id) {
  const g = new THREE.Group();
  const wood = lambert(0x6a4a2e);
  const metal = lambert(0x8a8a92);
  const dark = lambert(0x3a3a40);
  const gold = lambert(0xf2c14e);
  if (id === 'blunderbuss') {
    const barrel = cyl(0.07, 0.09, 0.7, metal, 0, 0, -0.3, 8);
    barrel.rotation.x = Math.PI / 2;
    const bell = cyl(0.16, 0.07, 0.22, metal, 0, 0, -0.75, 8);
    bell.rotation.x = Math.PI / 2;
    const stock = box(0.12, 0.14, 0.5, wood, 0, -0.02, 0.25);
    g.add(barrel, bell, stock);
  } else if (id === 'axe') {
    const handle = cyl(0.05, 0.06, 1.0, wood, 0, 0, 0, 8);
    const head = box(0.5, 0.34, 0.06, metal, 0.2, 0.42, 0);
    const head2 = box(0.5, 0.34, 0.06, metal, -0.2, 0.42, 0);
    g.add(handle, head, head2);
  } else if (id === 'longbow') {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 6, 12, Math.PI), wood);
    arc.rotation.z = Math.PI / 2;
    arc.rotation.y = Math.PI / 2;
    const string = box(0.02, 1.1, 0.02, lambert(0xe8e0c8), 0, 0, 0);
    g.add(arc, string);
  } else if (id === 'sword') {
    const blade = box(0.09, 0.9, 0.03, lambert(0xd8e0ea), 0, 0.45, 0);
    const guard = box(0.3, 0.06, 0.06, gold, 0, 0.02, 0);
    const grip = cyl(0.045, 0.045, 0.25, dark, 0, -0.12, 0, 8);
    g.add(blade, guard, grip);
  } else if (id === 'spear') {
    const shaft = cyl(0.045, 0.045, 1.6, wood, 0, 0, 0, 8);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.35, 6), metal);
    tip.position.y = 0.95;
    g.add(shaft, tip);
  } else {
    const handle = cyl(0.06, 0.07, 0.8, wood, 0, 0, 0, 8);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), metal);
    head.position.y = 0.5;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), metal);
    spike.position.y = 0.72;
    g.add(handle, head, spike);
  }
  return g;
}

export function makeEnemyMesh(kind, elite) {
  let g;
  if (kind === 'shambler') {
    g = makeHumanoid({ torso: 0x7a9a58, legs: 0x4a5a38, head: 0x5a6a42, skin: 0x9ab87a, s: 0.95 });
    g.rotation.x = 0.12; // hunched
  } else if (kind === 'spitter') {
    g = makeHumanoid({ torso: 0x9a7ab5, legs: 0x6a4a7a, head: 0x7a5a95, skin: 0xb59ac8, s: 0.9 });
    const sac = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lambert(0xc98ad0));
    sac.position.set(0, 1.0, 0.25);
    g.add(sac);
  } else {
    g = makeHumanoid({ torso: 0x8a5a44, legs: 0x5a3a2c, head: 0x6a4636, skin: 0xa87a5e, s: 1.35 });
    const padL = box(0.24, 0.18, 0.3, lambert(0x5a3a2c), -0.45, 1.45, 0);
    const padR = box(0.24, 0.18, 0.3, lambert(0x5a3a2c), 0.45, 1.45, 0);
    g.add(padL, padR);
  }
  if (elite) {
    const tint = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.85, 24),
      new THREE.MeshBasicMaterial({ color: PALETTE.eliteTint, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    tint.rotation.x = -Math.PI / 2;
    tint.position.y = 0.05;
    g.add(tint);
    g.traverse((m) => {
      if (m.isMesh && m.material && m.material.color) m.material = m.material.clone();
    });
    g.scale.multiplyScalar(1.18);
  }
  return g;
}

export function makeBossMesh(id) {
  let g;
  if (id === 'butcher') {
    g = makeHumanoid({ torso: 0xb06a4a, legs: 0x6a3a2c, head: 0x8a4a3a, skin: 0xd8a08a, s: 1.9 });
    const apron = box(0.7, 0.7, 0.06, lambert(0xe8e0d0), 0, 1.0, 0.22);
    g.add(apron);
    const cleaver = box(0.5, 0.7, 0.08, lambert(0xc8c8d0), 0.55, 1.2, 0.2);
    g.add(cleaver);
    // Snout.
    const snout = box(0.3, 0.16, 0.2, lambert(0xd8a08a), 0, 1.62, 0.24);
    g.add(snout);
  } else if (id === 'lich') {
    g = makeHumanoid({ torso: 0x3a4a4a, legs: 0x2a3a3a, head: 0xd8d8c8, skin: 0xe8e8d8, s: 1.7 });
    const robe = cyl(0.45, 0.65, 1.1, lambert(0x2a3a3a), 0, 0.55, 0, 8);
    g.add(robe);
    const crown = cyl(0.1, 0.3, 0.35, lambert(0xe8e2c8), 0, 2.05, 0, 6);
    g.add(crown);
    const staff = cyl(0.05, 0.05, 1.9, lambert(0x6a4a2e), 0.55, 1.2, 0.1, 6);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7fe0a8 }));
    orb.position.set(0.55, 2.2, 0.1);
    g.add(staff, orb);
  } else {
    g = makeHumanoid({ torso: 0x5a4a8a, legs: 0x3a2a5a, head: 0x7a5ab5, skin: 0xb5a0d8, s: 2.0 });
    const crown = cyl(0.12, 0.34, 0.4, lambert(0x9a7fe0), 0, 2.05, 0, 6);
    g.add(crown);
    const sword = box(0.14, 1.3, 0.05, lambert(0xc8b8f0), 0.55, 1.1, 0.2);
    g.add(sword);
  }
  return g;
}

export function makeProjectileMesh(friendly, bossBolt) {
  const color = bossBolt ? 0xb08aff : friendly ? 0xffd94a : 0xc98ad0;
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(bossBolt ? 0.22 : 0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color }),
  );
  return m;
}

export function makeCoinMesh() {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.07, 10),
    lambert(PALETTE.gold, { emissive: 0x6a4a00 }),
  );
  m.rotation.x = Math.PI / 2.4;
  m.castShadow = true;
  return m;
}

// A ground-target telegraph ring (brute slam, boss slam): red, grows as
// the wind-up runs out.
export function makeTelegraphRing(radius) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.85, radius, 28),
    new THREE.MeshBasicMaterial({ color: 0xe04e3a, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  return m;
}

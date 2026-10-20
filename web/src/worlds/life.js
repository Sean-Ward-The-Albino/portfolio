import * as THREE from 'three';
import { makeEnv, palette, sunDir, applyPalette, terrain, ridges, water, pines, box, lambert, glow, textTexture, tappable, sstep, fbm2, hash2, rng } from '../kit.js';
import { LOW } from '../engine.js';

// Life: a lake in the mountains at dusk. A campfire with a crate of records, a chessboard on a stump,
// a pan on the fire, a canoe at the shore.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lake = (x, z) => Math.hypot((x + 40) / 1.3, z + 90);
const ground = (x, z) => {
  const d = lake(x, z);
  let y = -4 + sstep(38, 58, d) * 5;                         // the lake bed rising to the shore
  y += sstep(58, 120, d) * 8 * fbm2(x * 0.02, z * 0.02, 3);
  y += sstep(140, 320, d) * 90 * fbm2(x * 0.006, z * 0.006, 4);
  return y;
};

export function buildLife() {
  const scene = new THREE.Scene();
  const env = makeEnv(scene, 0.003);
  const taps = [], tags = [], tick = [];
  const world = { id: 'life', scene, ground, taps, tags, exposure: 1.1, bounds: { minX: -20, maxX: 60, minZ: -110, maxZ: 30 } };

  scene.add(terrain({ size: 900, seg: 150, cx: 0, cz: -60, height: ground, color: (c, x, y, z, ny) => {
    if (y < 0.4) c.set('#7a6a52');
    else if (ny < 0.75) c.set('#6a5e58');
    else if (y > 50) c.set(y > 75 ? '#e8e4ea' : '#7a7a86');
    else c.set(hash2(Math.floor(x / 2), Math.floor(z / 2)) > 0.5 ? '#5a7442' : '#4f6a3c');
    c.offsetHSL(0, 0, (hash2(x, z) - 0.5) * 0.05);
  } }));
  const lakeMesh = water({ size: 260, seg: 50, cx: -40, cz: -90, deep: '#1d3a52', shallow: '#3f6f84' }); lakeMesh.position.y = -0.2; scene.add(lakeMesh);
  ridges(scene, { layers: 3, radius: 480, arc: [-Math.PI, Math.PI * 0.1], base: 0, height: 120, colors: ['#4a4a6e', '#5c5a80', '#726d94'], seed: 31 });

  // Pines around the lake, kept clear of the camp
  const r = rng(11), spots = [];
  for (let i = 0; i < (LOW ? 160 : 300); i++) {
    const x = -140 + r() * 260, z = 40 - r() * 260;
    if (lake(x, z) < 62 || (Math.abs(x - 14) < 18 && z > -50 && z < 20)) continue;
    spots.push([x, z, 0.8 + r() * 1.4]);
  }
  scene.add(pines(spots, ground, { color: '#25402c' }));

  // The camp
  const cx = 14, cz = -20, cy = ground(cx, cz);
  const ring = new THREE.Group(); ring.position.set(cx, cy, cz); scene.add(ring);
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), lambert('#6e6a66')); s.position.set(Math.cos(a) * 0.9, 0.1, Math.sin(a) * 0.9); ring.add(s); }
  for (let k = 0; k < 3; k++) { const l = box(0.18, 0.18, 1.4, '#5a3a24'); l.rotation.y = k * 1.05; l.rotation.x = 0.45; l.position.y = 0.2; ring.add(l); }
  const flame = glow('#ffae55', 2.6, 0.95); flame.position.y = 0.7; ring.add(flame);
  const flame2 = glow('#ff6a2a', 1.6, 0.9); flame2.position.y = 0.45; ring.add(flame2);
  const fire = new THREE.PointLight('#ff9a4a', 6, 16, 2); fire.position.set(cx, cy + 1.2, cz); scene.add(fire);
  tick.push((t) => { const f = Math.sin(t * 9) * 0.15 + Math.sin(t * 13.7) * 0.1; flame.scale.setScalar(2.6 + f); flame2.scale.setScalar(1.6 + f * 0.8); fire.intensity = 6 + f * 4; });
  // Logs to sit on
  for (const [x, z, ry] of [[cx - 2.4, cz, 0], [cx + 2.2, cz + 1.2, 0.9]]) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 2.2, 8), lambert('#6a4a32')); log.rotation.z = Math.PI / 2; log.rotation.y = ry; log.position.set(x, ground(x, z) + 0.3, z); scene.add(log); }
  // Tent
  const tent = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.1, 4), lambert('#c26b3c')); tent.position.set(cx + 4.5, ground(cx + 4.5, cz - 4) + 1.05, cz - 4); tent.rotation.y = 0.6; scene.add(tent);
  const tentGlow = glow('#ffcf8a', 2.4, 0.35); tentGlow.position.copy(tent.position); scene.add(tentGlow);

  // A crate of records by the fire
  const crate = new THREE.Group(); crate.position.set(cx - 1.6, ground(cx - 1.6, cz + 2.2), cz + 2.2); crate.rotation.y = 0.4; scene.add(crate);
  crate.add(box(0.9, 0.55, 0.55, '#9a6a42'));
  const sleeves = ['#d24a8a', '#2f6fdf', '#e8b64a', '#3cc9aa', '#f06a4a', '#9b93ff'];
  sleeves.forEach((c, k) => { const s = box(0.04, 0.5, 0.5, c, -0.36 + k * 0.14, 0.18, 0); s.rotation.z = (k - 2.5) * 0.04; crate.add(s); });
  tappable(crate, { stop: 'records' }); taps.push(crate);
  tags.push({ obj: crate, label: 'Flip through the records', offset: 1, onStop: 'records', stops: ['records'] });

  // Music: a small speaker and guitar case on the log
  const speaker = box(0.5, 0.7, 0.4, '#1d1d22', cx - 2.6, ground(cx - 2.6, cz - 1.4), cz - 1.4); scene.add(speaker);
  const cone = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), lambert('#3a3a44')); cone.position.set(cx - 2.6, ground(cx - 2.6, cz - 1.4) + 0.4, cz - 1.19); scene.add(cone);
  tappable(speaker, { stop: 'music' }); taps.push(speaker);

  // Cooking: a cast-iron pan on a grate over the fire
  const pan = new THREE.Group(); pan.position.set(cx + 0.2, cy + 0.65, cz + 0.1); scene.add(pan);
  pan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.38, 0.12, 16), lambert('#1e1e22')));
  const handle = box(0.08, 0.05, 0.6, '#1e1e22', 0, 0, 0.7); pan.add(handle);
  const steam = glow('#ffffff', 0.9, 0.2); steam.position.y = 0.6; pan.add(steam);
  tick.push((t) => { steam.position.y = 0.6 + (t * 0.5) % 1; steam.material.opacity = 0.25 * (1 - ((t * 0.5) % 1)); });
  tappable(pan, { stop: 'cooking' }); taps.push(pan);

  // Outdoors: a canoe pulled up on the shore
  const canoeGeo = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); canoeGeo.scale(0.55, 0.45, 2.6);
  const canoe = new THREE.Mesh(canoeGeo, lambert('#b8452c', { side: THREE.DoubleSide })); canoe.rotation.z = Math.PI; const kx = -2, kz = -44; canoe.position.set(kx, ground(kx, kz) + 0.4, kz); canoe.rotation.y = 0.7; scene.add(canoe);
  tappable(canoe, { stop: 'outdoors' }); taps.push(canoe);

  // Chess on a stump: tap it to play
  const stump = new THREE.Group(); const sx = cx + 3.4, sz = cz + 3.6; stump.position.set(sx, ground(sx, sz), sz); scene.add(stump);
  stump.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.7, 10), lambert('#7a5a3a')).translateY(0.35));
  const boardTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#7a5638' : '#ecdcc0'; g.fillRect(i * 32, j * 32, 32, 32); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const bd = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.8), [lambert('#3a2a1a'), lambert('#3a2a1a'), new THREE.MeshLambertMaterial({ map: boardTex }), lambert('#3a2a1a'), lambert('#3a2a1a'), lambert('#3a2a1a')]); bd.position.y = 0.73; stump.add(bd);
  for (const [px, pz, c, h] of [[-0.3, 0.3, '#f4efe6', 0.16], [0.2, -0.3, '#1a1a1e', 0.2], [0.3, -0.2, '#1a1a1e', 0.12], [-0.1, 0.1, '#f4efe6', 0.12]]) { const pc = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h, 8), lambert(c)); pc.position.set(px, 0.76 + h / 2, pz); stump.add(pc); }
  tappable(stump, { action: 'chess' }); taps.push(stump);
  tags.push({ obj: stump, label: 'Solve the puzzle', offset: 1.2, action: 'chess', stops: ['chess'] });

  // Fireflies
  const n = LOW ? 40 : 80, fp = new Float32Array(n * 3), seeds = [];
  for (let i = 0; i < n; i++) { const x = cx - 20 + r() * 40, z = cz - 25 + r() * 40; seeds.push([x, z, r() * 6]); fp.set([x, ground(x, z) + 1, z], i * 3); }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  const flies = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#f6ff9a', size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false, fog: false })); scene.add(flies);
  tick.push((t) => { const p = fg.attributes.position; seeds.forEach(([x, z, s], i) => p.setXYZ(i, x + Math.sin(t * 0.4 + s) * 1.6, ground(x, z) + 1.2 + Math.sin(t * 0.7 + s * 2) * 0.6, z + Math.cos(t * 0.33 + s) * 1.6)); p.needsUpdate = true; flies.material.opacity = 0.5 + 0.4 * Math.sin(t * 2.3); });

  world.stops = {
    intro: { cam: V(cx + 9, cy + 3.5, cz + 14), look: V(cx, cy + 0.6, cz) },
    music: { cam: V(cx - 0.6, cy + 1.6, cz + 2.4), look: V(cx - 2.6, cy + 0.4, cz - 1.4) },
    records: { cam: V(cx + 0.4, cy + 1.7, cz + 4.6), look: V(cx - 1.6, cy + 0.3, cz + 2.2) },
    cooking: { cam: V(cx + 1.8, cy + 1.6, cz + 2.6), look: V(cx + 0.2, cy + 0.6, cz + 0.1) },
    outdoors: { cam: V(cx + 6, cy + 3, cz - 6), look: V(-40, 8, -110) },
    chess: { cam: V(sx + 1.2, cy + 1.8, sz + 1.6), look: V(sx, cy + 0.7, sz) },
    stories: { cam: V(cx + 3.5, cy + 1.4, cz + 3.5), look: V(cx, cy + 0.8, cz) },
  };

  const hour = 19.5, pal = palette(hour), sun = sunDir(hour, V(0, 0, 0));
  sun.set(-0.4, -0.02, -1).normalize();
  applyPalette(env, pal, sun);
  // Dusk, but bright enough to see the camp: the sky is still lit after sunset
  env.hemi.intensity = 2.1; env.hemi.groundColor.set('#5a5048'); env.sun.intensity = 0.9; env.sun.position.set(-80, 40, -200);
  const u = lakeMesh.userData.uniforms; u.uSky.value.copy(pal.hor); u.uSun.value.copy(sun); u.uSunCol.value.copy(pal.sun).multiplyScalar(0.5);

  world.update = (t) => { u.uTime.value = t * 0.6; for (const f of tick) f(t); };
  world.dispose = () => scene.traverse((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
  return world;
}

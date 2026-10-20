import * as THREE from 'three';
import { makeEnv, palette, sunDir, applyPalette, terrain, ridges, box, lambert, glow, textTexture, tappable, sstep, fbm2, hash2, rng } from '../kit.js';
import { LOW } from '../engine.js';

// Story: a desert road at golden hour, east of San Diego. Each part of the story stands beside the road.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const roadX = (z) => Math.sin(z * 0.012) * 18 + Math.sin(z * 0.031) * 5;
const ground = (x, z) => {
  const r = Math.abs(x - roadX(z));
  let y = fbm2(x * 0.01, z * 0.01, 4) * 14 - 4;
  y *= sstep(6, 40, r);                                // the road and its shoulders are flat
  y += sstep(60, 220, Math.abs(x)) * 60 * fbm2(x * 0.006, z * 0.006 + 5, 4);
  return y;
};

export function buildStory() {
  const scene = new THREE.Scene();
  const env = makeEnv(scene, 0.0028);
  const taps = [], tags = [], tick = [];
  const world = { id: 'story', scene, ground, taps, tags, exposure: 1.05, bounds: { minX: -80, maxX: 80, minZ: -330, maxZ: 40 } };

  scene.add(terrain({ size: 900, seg: 150, cz: -140, height: ground, color: (c, x, y, z, ny) => {
    const r = Math.abs(x - roadX(z));
    if (r < 3.2) c.set('#3a3438');
    else if (r < 4) c.set('#d8cfa8');
    else if (ny < 0.8) c.set(hash2(Math.floor(y), 1) > 0.5 ? '#b8735a' : '#a8664f');
    else c.set(y > 12 ? '#c98a6a' : hash2(Math.floor(x / 2), Math.floor(z / 2)) > 0.5 ? '#e0b48a' : '#d6a77c');
    c.offsetHSL(0, 0, (hash2(x, z) - 0.5) * 0.05);
  } }));
  // The centre line
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.02, 2), new THREE.MeshBasicMaterial({ color: '#f2d27a' }), 110);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(1, 1, 1), p = V(0, 0, 0);
  for (let i = 0; i < 110; i++) { const z = 30 - i * 3.2; const x = roadX(z), x2 = roadX(z - 1); q.setFromEuler(new THREE.Euler(0, Math.atan2(x - x2, 1), 0)); p.set(x, ground(x, z) + 0.03, z); m4.compose(p, q, sc); dashes.setMatrixAt(i, m4); }
  scene.add(dashes);
  ridges(scene, { layers: 4, radius: 560, arc: [-Math.PI, 0], base: -4, height: 80, colors: ['#8c5a6a', '#9c6a7c', '#b38090', '#c89aa6'], seed: 9 });

  // Desert plants and boulders
  const r = rng(3), rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), lambert('#9a5e48'), LOW ? 60 : 120);
  for (let i = 0; i < rocks.count; i++) {
    let x, z; do { x = (r() - 0.5) * 200; z = 30 - r() * 360; } while (Math.abs(x - roadX(z)) < 8);
    const s = 0.5 + r() * 2.2; p.set(x, ground(x, z) + s * 0.3, z); q.setFromEuler(new THREE.Euler(r(), r() * 6, r())); sc.set(s, s * 0.7, s); m4.compose(p, q, sc); rocks.setMatrixAt(i, m4);
  }
  scene.add(rocks);
  const cactus = new THREE.Group(), cMat = lambert('#5f7a4a');
  for (let i = 0; i < (LOW ? 18 : 34); i++) {
    let x, z; do { x = (r() - 0.5) * 160; z = 20 - r() * 340; } while (Math.abs(x - roadX(z)) < 10);
    const g = new THREE.Group(), h = 2 + r() * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, h, 7), cMat); trunk.position.y = h / 2; g.add(trunk);
    for (const s of [-1, 1]) if (r() > 0.3) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, h * 0.45, 6), cMat); arm.position.set(s * 0.55, h * 0.6, 0); g.add(arm); const el = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 6), cMat); el.rotation.z = Math.PI / 2; el.position.set(s * 0.32, h * 0.4, 0); g.add(el); }
    g.position.set(x, ground(x, z), z); cactus.add(g);
  }
  scene.add(cactus);

  // Milestones beside the road
  const at = (z, side, dist = 9) => { const x = roadX(z) + side * dist; return V(x, ground(x, z), z); };
  const post = (pos, text) => {
    const g = new THREE.Group(); g.position.copy(pos);
    g.add(box(0.2, 2.2, 0.2, '#6a4a32'));
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), new THREE.MeshLambertMaterial({ map: textTexture(text, { w: 512, h: 176, bg: '#2a6a4a', fg: '#ffffff', font: '700 72px Outfit, sans-serif' }) }));
    s.position.y = 2.2; g.add(s); scene.add(g); return g;
  };

  // Age ten: a desk with an old monitor, glowing
  const desk = new THREE.Group(); desk.position.copy(at(-40, -1)); desk.rotation.y = Math.PI / 2 + 0.3; scene.add(desk);
  desk.add(box(2.4, 0.08, 1.2, '#7a5a3a', 0, 1, 0));
  for (const [x, z] of [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]]) desk.add(box(0.08, 1, 0.08, '#5a3a2a', x, 0, z));
  desk.add(box(0.9, 0.75, 0.8, '#d9d2c2', 0, 1.08, -0.1));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.52), new THREE.MeshBasicMaterial({ map: textTexture('print("hi")', { w: 256, h: 192, bg: '#0a1a10', fg: '#5dff8a', font: '600 30px monospace' }) }));
  screen.position.set(0, 1.46, 0.31); desk.add(screen);
  const sg = glow('#6dff9a', 2.2, 0.35); sg.position.set(0, 1.46, 0.5); desk.add(sg);
  desk.add(box(0.7, 0.04, 0.25, '#cfc8b8', 0, 1.08, 0.45));
  post(at(-34, -1, 5), 'AGE 10');
  tappable(desk, { stop: 'ten' }); taps.push(desk);

  // Teaching: a chalkboard on an easel
  const board = new THREE.Group(); board.position.copy(at(-90, 1)); board.rotation.y = -Math.PI / 2 - 0.3; scene.add(board);
  const chalk = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), new THREE.MeshLambertMaterial({ map: textTexture('AP CSA', { w: 512, h: 332, bg: '#23443a', fg: '#f4f1e8', font: '700 70px "Source Serif 4", serif', sub: 'public static void main(String[] args)' }) }));
  chalk.position.y = 2.6; board.add(chalk); board.add(box(4.3, 0.15, 0.2, '#8a6a4a', 0, 1.2, 0.05));
  for (const s of [-1, 1]) { const leg = box(0.12, 4, 0.12, '#8a6a4a', s * 1.8, 0, 0); leg.rotation.z = s * 0.06; board.add(leg); }
  post(at(-84, 1, 5), 'HIGH SCHOOL');
  tappable(board, { stop: 'teaching' }); taps.push(board);

  // Waverate: a record standing on its edge
  const rec = new THREE.Group(); rec.position.copy(at(-145, -1, 12)); rec.position.y += 4.2; rec.rotation.y = Math.PI / 2 + 0.5; scene.add(rec);
  const vinyl = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.25, 48), new THREE.MeshLambertMaterial({ color: '#141418' })); vinyl.rotation.x = Math.PI / 2; rec.add(vinyl);
  for (let k = 1; k < 5; k++) { const g = new THREE.Mesh(new THREE.TorusGeometry(1.4 + k * 0.6, 0.02, 4, 64), new THREE.MeshBasicMaterial({ color: '#2a2a32' })); g.position.z = 0.13; rec.add(g); }
  const lab = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshLambertMaterial({ map: textTexture('WAVERATE', { w: 256, h: 256, bg: '#d4af37', fg: '#1c1607', font: '800 40px Outfit, sans-serif', sub: 'FOR HER' , subColor: '#3a2a07' }) })); lab.position.z = 0.14; rec.add(lab);
  tick.push((t) => { rec.rotation.z = t * 0.3; });
  post(at(-138, -1, 5), 'VALENTINE’S');
  tappable(rec, { stop: 'waverate' }); taps.push(rec);

  // Avlory: the diamond, magenta over blue
  const dia = new THREE.Group(); dia.position.copy(at(-205, 1, 13)); dia.position.y += 7; scene.add(dia);
  const shape = (pts, c) => { const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))); const g = new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: false }); return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.25 })); };
  dia.add(shape([[0, 6], [-6, 0], [6, 0]], '#c41ec4'));
  dia.add(shape([[0, -6], [-6, 0], [6, 0]], '#2459c9'));
  const right = shape([[0, 6], [6, 0], [0, -6]], '#000000'); right.material.opacity = 0.25; right.material.transparent = true; right.position.z = 0.61; dia.add(right);
  const core = shape([[0, 1.5], [-1.5, 0], [0, -1.5], [1.5, 0]], '#0b0b0f'); core.position.z = 0.62; dia.add(core);
  dia.scale.setScalar(0.8);
  tick.push((t) => { dia.rotation.y = -0.4 + Math.sin(t * 0.3) * 0.25; dia.position.y = at(-205, 1, 13).y + 7 + Math.sin(t * 0.8) * 0.3; });
  const dg = glow('#e070ff', 22, 0.35); dg.position.copy(dia.position); scene.add(dg);
  tappable(dia, { stop: 'avlory' }); taps.push(dia);

  // Now: a cafe table with a laptop
  const table = new THREE.Group(); table.position.copy(at(-255, -1, 6)); table.rotation.y = Math.PI / 2; scene.add(table);
  table.add(box(1.6, 0.06, 1.6, '#3a2a24', 0, 0.95, 0)); table.add(box(0.12, 0.95, 0.12, '#2a2a2e'));
  const lid = box(0.9, 0.6, 0.03, '#c8c8d0', 0, 1.0, -0.3); lid.rotation.x = -0.25; table.add(lid);
  table.add(box(0.9, 0.03, 0.6, '#b8b8c0', 0, 1.0, 0));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ color: '#9b7bff' })); scr.position.set(0, 1.3, -0.31); scr.rotation.x = -0.25; table.add(scr);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.2, 10), lambert('#f4efe6')); cup.position.set(0.55, 1.08, 0.3); table.add(cup);
  for (const s of [-1, 1]) table.add(box(0.5, 0.5, 0.5, '#5a3f2c', 0, 0, s * 1.2));
  tappable(table, { stop: 'now' }); taps.push(table);
  post(at(-249, -1, 4), 'NOW');

  world.stops = {
    start: { cam: V(roadX(30), 2.4, 30), look: V(roadX(-40), 3, -40) },
    ten: { cam: V(roadX(-30), 2.2, -30), look: at(-40, -1).add(V(0, 1.2, 0)) },
    teaching: { cam: V(roadX(-80), 2.2, -80), look: at(-90, 1).add(V(0, 2.4, 0)) },
    waverate: { cam: V(roadX(-128) - 1, 2.6, -128), look: at(-145, -1, 12).add(V(0, 4, 0)) },
    avlory: { cam: V(roadX(-188) + 1, 3, -188), look: at(-205, 1, 13).add(V(0, 7, 0)) },
    now: { cam: V(roadX(-246), 2, -246), look: at(-255, -1, 6).add(V(0, 1, 0)) },
    next: { cam: V(roadX(-280), 2.4, -280), look: V(roadX(-420), 6, -420) },
  };

  const sun = new THREE.Vector3();
  const hour = 18.1, pal = palette(hour); sunDir(hour, sun); sun.set(0.15, 0.1, -1).normalize();
  applyPalette(env, pal, sun); env.sky.uniforms.uSunSize.value = 1.6;
  scene.fog.density = 0.0026;

  world.update = (t) => { for (const f of tick) f(t); };
  world.dispose = () => scene.traverse((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
  return world;
}

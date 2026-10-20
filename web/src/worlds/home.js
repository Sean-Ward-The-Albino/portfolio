import * as THREE from 'three';
import { makeEnv, palette, sunDir, applyPalette, terrain, ridges, water, palms, cottage, box, lambert, glow, textTexture, skyPlanet, tappable, sstep, fbm2, hash2, col } from '../kit.js';
import { LOW } from '../engine.js';

// Home: the coast at Mission Beach, composed rather than mapped. The walk heads north (toward -z) along the sand,
// with the Pacific to the west so the sun sets over the water. San Diego places Sean named stand along the way.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const shore = (z) => -12 + 4 * Math.sin(z * 0.02) - sstep(-245, -285, z) * 26;
export const ground = (x, z) => {
  const s = shore(z);
  let y = -3.2 + sstep(s - 26, s + 5, x) * 4.4;
  y += sstep(s + 9, s + 22, x) * (0.5 + 0.8 * fbm2(x * 0.06, z * 0.06, 3));
  y += sstep(55, 170, x) * 70 * fbm2(x * 0.007 + 3, z * 0.007, 4);
  y += Math.exp(-(((x + 34) ** 2) + ((z + 294) ** 2)) / 520) * 11;          // the headland the lighthouse stands on
  return y;
};

export function buildHome({ hour }) {
  const scene = new THREE.Scene();
  const env = makeEnv(scene, 0.0032);
  const night = [];          // things that change with darkness: (k) => void
  const tick = [];           // things that move: (t, dt) => void
  const taps = [];
  const tags = [];
  const world = { id: 'home', scene, ground, taps, tags, exposure: 1.05, bounds: { minX: -40, maxX: 60, minZ: -300, maxZ: 50 } };

  // Ground and water
  const land = terrain({ size: 900, seg: 170, cz: -130, height: ground, color: (c, x, y, z, ny) => {
    const s = shore(z);
    if (y < -0.4) c.set('#b8936c');
    else if (x < s + 6) c.set(x < s + 1.5 ? '#c9a378' : '#ecd0a6');
    else if (y < 3.2) c.set(hash2(Math.floor(x), Math.floor(z)) > 0.5 ? '#b5ab68' : '#a39e5c');
    else if (ny < 0.75) c.set('#b08a68');
    else c.set(y > 40 ? '#8e8d6c' : hash2(Math.floor(x / 3), Math.floor(z / 3)) > 0.5 ? '#9a9466' : '#86865f');
    c.offsetHSL(0, 0, (hash2(x, z) - 0.5) * 0.04);
  } });
  scene.add(land);
  const sea = water({ size: 1800, cx: -700, cz: -150, deep: '#124a6e', shallow: '#3c98ad' });
  scene.add(sea);
  // Inland hills fading into haze, east and north
  const hills = ridges(scene, { layers: 3, radius: 520, arc: [-Math.PI * 0.55, Math.PI * 0.2], base: 0, height: 70, colors: ['#7c7a8c', '#8e8aa0', '#a29db5'], seed: 4 });

  // The boardwalk, with lamps
  const walk = box(3.6, 0.25, 360, '#b9a48e', 5, 0.9, -130); scene.add(walk);
  const lampMat = lambert('#2c2a30');
  for (let z = 30; z > -280; z -= 22) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4, 5), lampMat); post.position.set(7, ground(7, z) + 2, z); scene.add(post);
    const g = glow('#ffcf8a', 3.2, 0); g.position.set(7, ground(7, z) + 4.1, z); scene.add(g);
    night.push((k) => { g.material.opacity = k * 0.9; });
  }

  // Beach cottages: the pastel rows of Mission Beach
  const walls = ['#f2d8c9', '#cfe3e6', '#f5e6c4', '#e3d4ee', '#f6efe6', '#d8ead2'], roofs = ['#a85a44', '#5f6f8a', '#8a5a6a', '#6d7f5a'];
  const winMats = [];
  let i = 0;
  for (let z = 22; z > -250; z -= 9.5) {
    if (Math.abs(z + 40) < 9 || Math.abs(z + 80) < 9 || (z < -124 && z > -212)) continue;
    for (const row of [14, 23]) {
      if (hash2(z, row) > 0.86) continue;
      const c = cottage({ w: 5 + hash2(z, 1) * 1.6, h: 3.2 + hash2(row, z) * 2.2, d: 6, wall: walls[i % walls.length], roof: roofs[(i * 3) % roofs.length] });
      c.position.set(row + hash2(z, 3) * 1.2, ground(row, z) - 0.1, z); c.rotation.y = -Math.PI / 2;
      scene.add(c); winMats.push(c.userData.windows); i++;
    }
  }
  const winDark = col('#3a3438'), winLit = col('#ffcf7a');
  night.push((k) => { for (const m of winMats) m.color.copy(winDark).lerp(winLit, k * 0.95); });

  // Palms along the boardwalk
  const spots = []; for (let z = 34; z > -270; z -= 13 + hash2(z, 9) * 6) spots.push([9.5 + hash2(z, 5) * 1.5, z]);
  scene.add(palms(spots, ground));

  // Loretto's: the 2am taco shop
  const sign = (text, sub, x, y, z, ry, w = 5, bg = '#2b1a14', fg = '#ffd36b') => {
    const mat = new THREE.MeshBasicMaterial({ map: textTexture(text, { bg, fg, sub }), color: '#9a9088' });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), mat); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
    night.push((k) => mat.color.setScalar(0.62 + 0.38 * k)); return m;
  };
  const shop = (x, z, wall, roof, name, sub, fg) => {
    const g = new THREE.Group(); g.position.set(x, ground(x, z) - 0.1, z); g.rotation.y = -Math.PI / 2;
    g.add(box(7, 3.6, 6, wall)); g.add(box(7.6, 0.4, 6.6, roof, 0, 3.6, 0));
    const win = new THREE.MeshBasicMaterial({ color: '#3a3430' });
    const w = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.6), win); w.position.set(0, 1.6, 3.02); g.add(w);
    night.push((k) => win.color.copy(winDark).lerp(winLit, 0.25 + k * 0.75));
    scene.add(g);
    sign(name, sub, x - 3.2, ground(x, z) + 4.7, z, -Math.PI / 2, 5.6, '#1e1612', fg);
    return g;
  };
  const loretto = shop(17, -40, '#f1dcc0', '#b5543c', "LORETTO'S", 'TACOS · OPEN LATE', '#ffd36b');
  const cafe = shop(18, -80, '#d9e2d8', '#3f5a4a', 'LIVING ROOM', 'CAFE', '#f6efe2');
  tappable(loretto, { stop: 'loretto' }); tappable(cafe, { stop: 'cafe' }); taps.push(loretto, cafe);
  tags.push({ obj: loretto, label: "Loretto's", offset: 6, onStop: 'loretto', stops: ['loretto'] });
  tags.push({ obj: cafe, label: 'Living Room Cafe', offset: 6, onStop: 'cafe', stops: ['cafe'] });

  // Vinyl night: a blanket, a portable record player and a lantern on the sand
  const vx = -6, vz = -110, vy = ground(vx, vz);
  const blanket = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.2), lambert('#6a3550')); blanket.rotation.x = -Math.PI / 2; blanket.position.set(vx, vy + 0.03, vz); scene.add(blanket);
  const player = new THREE.Group(); player.position.set(vx + 0.6, vy + 0.03, vz - 0.2); scene.add(player);
  player.add(box(0.9, 0.18, 0.7, '#7a4a32'));
  player.add(box(0.86, 0.02, 0.66, '#2a1c16', 0, 0.18, 0));
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.015, 32), new THREE.MeshLambertMaterial({ color: '#111114' })); disc.position.set(-0.08, 0.21, 0); player.add(disc);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.017, 20), lambert('#d24a8a')); label.position.copy(disc.position); player.add(label);
  const arm = box(0.03, 0.03, 0.42, '#c8c8cc', 0.3, 0.22, 0.05); arm.rotation.y = 0.5; player.add(arm);
  for (const [dx, dz, c] of [[-1.1, 0.5, '#d9a35a'], [-1.0, -0.6, '#5a7aa8']]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.25, 8), lambert(c)); p.position.set(vx + dx, vy + 0.13, vz + dz); scene.add(p); }
  const crate = box(0.6, 0.45, 0.45, '#9a6a42', vx + 1.5, vy, vz + 0.6); scene.add(crate);
  const lantern = glow('#ffbf73', 1.4, 0.3); lantern.position.set(vx - 0.6, vy + 0.5, vz + 1); scene.add(lantern);
  const lanternBody = box(0.18, 0.3, 0.18, '#3a2a20', vx - 0.6, vy, vz + 1); scene.add(lanternBody);
  const ll = new THREE.PointLight('#ffb36b', 0, 9, 2); ll.position.copy(lantern.position); scene.add(ll);
  night.push((k) => { lantern.material.opacity = 0.3 + 0.6 * k; ll.intensity = 2.2 * k; });
  tappable(player, { action: 'vinyl' }); taps.push(player);
  tags.push({ obj: player, label: 'Play a record', offset: 0.9, action: 'vinyl', stops: ['vinyl'] });
  world.vinyl = { playing: false };
  tick.push((t, dt) => { if (world.vinyl.playing) { disc.rotation.y -= dt * 3.5; label.rotation.y = disc.rotation.y; arm.rotation.y = 0.25; } else arm.rotation.y = 0.5; });

  // Writing in the sand: a patch that holds what the visitor wrote, kept only in their browser
  const sx = -9, sz = -131;
  const sandCanvas = document.createElement('canvas'); sandCanvas.width = 1024; sandCanvas.height = 256;
  const sandTex = new THREE.CanvasTexture(sandCanvas); sandTex.colorSpace = THREE.SRGBColorSpace;
  const sandMat = new THREE.MeshLambertMaterial({ map: sandTex, transparent: true });
  const sandPatch = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), sandMat); sandPatch.rotation.x = -Math.PI / 2; sandPatch.rotation.z = Math.PI / 2 + 0.25;
  sandPatch.position.set(sx, ground(sx, sz) + 0.05, sz); scene.add(sandPatch);
  const stick = box(0.06, 0.06, 1.3, '#8a6a4a', sx + 2.2, ground(sx + 2.2, sz) + 0.02, sz + 1.6); stick.rotation.y = 0.8; scene.add(stick);
  world.writeSand = (text) => {
    const g = sandCanvas.getContext('2d'); g.clearRect(0, 0, 1024, 256);
    if (!text) { g.font = 'italic 400 70px "Source Serif 4", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(120, 86, 54, 0.35)'; g.fillText('write here', 512, 132); }
    if (text) {
      g.font = '700 130px "Source Serif 4", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      // A groove: a dark line with a light edge above it, like a finger in damp sand
      g.fillStyle = 'rgba(92, 60, 34, 0.95)'; g.fillText(text, 512, 134, 980);
      g.fillStyle = 'rgba(255, 244, 226, 0.55)'; g.fillText(text, 512, 126, 980);
    }
    sandTex.needsUpdate = true;
  };
  tappable(sandPatch, { action: 'sand' }); taps.push(sandPatch);
  tags.push({ obj: sandPatch, label: 'Write in the sand', offset: 0.8, action: 'sand', stops: ['sand'] });

  // The Giant Dipper at Belmont Park: a white wooden coaster, lit at night, and you can ride it
  const cx = 34, cz = -160, base = ground(cx, cz), tp = [];
  for (let k = 0; k < 160; k++) {
    const a = (k / 160) * Math.PI * 2;
    tp.push(V(cx + Math.cos(a) * 24, base + 3 + 12 * Math.max(0, Math.sin(a * 2 + 0.4)) ** 2.2 + 5 * Math.max(0, Math.sin(a * 5 + 1)) ** 2, cz + Math.sin(a) * 11));
  }
  const track = new THREE.CatmullRomCurve3(tp, true);
  const white = lambert('#efe9df');
  const coaster = new THREE.Group(); scene.add(coaster);
  coaster.add(new THREE.Mesh(new THREE.TubeGeometry(track, LOW ? 220 : 360, 0.3, 5, true), white));
  const N = LOW ? 90 : 130, posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 1, 0.2), white, N * 2), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3();
  for (let k = 0; k < N; k++) {
    const pt = track.getPointAt(k / N), tg = track.getTangentAt(k / N), side = V(-tg.z, 0, tg.x).normalize(), h = pt.y - base;
    for (const sgn of [0, 1]) { pp.copy(pt).addScaledVector(side, sgn ? 0.9 : -0.9); pp.y = base + h / 2; sc.set(1, h, 1); m4.compose(pp, q, sc); posts.setMatrixAt(k * 2 + sgn, m4); }
  }
  coaster.add(posts);
  const lightsGeo = new THREE.BufferGeometry().setFromPoints(track.getSpacedPoints(LOW ? 140 : 220).map((p) => p.setY(p.y + 0.45)));
  const lightsMat = new THREE.PointsMaterial({ color: '#fff0c4', size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  coaster.add(new THREE.Points(lightsGeo, lightsMat));
  night.push((k) => { lightsMat.opacity = k; });
  tappable(coaster, { action: 'coaster' }); taps.push(coaster);
  world.coasterTrack = track;
  tags.push({ obj: { getWorldPosition: (v) => v.set(cx, base + 20, cz) }, label: 'Ride the Giant Dipper', action: 'coaster', stops: ['coaster'] });

  // Balboa Park's California Tower, up on the hill, with a chess table below
  const tower = new THREE.Group(); const tx = 92, tz = -232, ty = ground(tx, tz); tower.position.set(tx, ty, tz); scene.add(tower);
  const stone = lambert('#efe2c8'), tile = lambert('#3f7fa8'), gold = lambert('#d8b36a');
  tower.add(box(9, 6, 9, stone)); tower.add(box(5, 16, 5, stone, 0, 6, 0)); tower.add(box(6, 1, 6, gold, 0, 21.5, 0));
  tower.add(box(4, 5, 4, stone, 0, 22.5, 0));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), tile); dome.position.y = 27.5; tower.add(dome);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 4, 6), gold); spire.position.y = 31.6; tower.add(spire);
  const bell = glow('#ffd9a0', 6, 0); bell.position.y = 24.5; tower.add(bell);
  night.push((k) => { bell.material.opacity = k * 0.8; });
  tower.scale.setScalar(1.3);
  tappable(tower, { stop: 'balboa' }); taps.push(tower);
  tags.push({ obj: tower, label: 'Balboa Park', offset: 46, onStop: 'balboa', stops: ['balboa'] });

  // The lighthouse on the point: tap it to send Sean a message, and its light answers
  const lh = new THREE.Group(); const lx = -34, lz = -294, ly = ground(lx, lz); lh.position.set(lx, ly - 0.3, lz); scene.add(lh);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 11, 10), lambert('#f4f0ea')); shaft.position.y = 5.5; lh.add(shaft);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 1.6, 10), lambert('#b84a3c')); band.position.y = 7.5; lh.add(band);
  lh.add(box(2.6, 0.3, 2.6, '#2a2a30', 0, 11, 0));
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.6, 8), new THREE.MeshBasicMaterial({ color: '#ffe9b0' })); lamp.position.y = 12.1; lh.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.2, 8), lambert('#2a2a30')); cap.position.y = 13.5; lh.add(cap);
  lh.add(box(5, 3, 4, '#efe9df', 3, 0, 0));
  const beam = new THREE.Mesh(new THREE.ConeGeometry(5, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3c8', transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.geometry.translate(0, -30, 0); beam.rotation.z = Math.PI / 2; const beamPivot = new THREE.Group(); beamPivot.position.y = 12.1; beamPivot.add(beam); lh.add(beamPivot);
  const lhGlow = glow('#fff0c0', 8, 0.5); lhGlow.position.y = 12.1; lh.add(lhGlow);
  let nightK = 0; world.flash = 0;
  tick.push((t, dt) => { beamPivot.rotation.y = t * (0.6 + world.flash * 4); world.flash = Math.max(0, world.flash - dt * 0.4); beam.material.opacity = (0.06 + nightK * 0.22) + world.flash * 0.4; lhGlow.material.opacity = 0.35 + nightK * 0.6 + world.flash; });
  tappable(lh, { action: 'feedback' }); taps.push(lh);
  tags.push({ obj: lh, label: 'Send Sean a message', offset: 16, action: 'feedback', stops: ['beacon'] });

  // The other worlds, in the sky. Tap one to go there.
  const skyAt = (az, el, d = 900) => { const a = az * Math.PI / 180, e = el * Math.PI / 180; return V(Math.sin(a) * Math.cos(e) * d, Math.sin(e) * d, -Math.cos(a) * Math.cos(e) * d); };
  const skyG = new THREE.Group(); scene.add(skyG);
  const worlds = [
    ['story', 'Story', skyPlanet({ color: '#f2b57a', dark: '#5a3424', size: 34 }), -26, 30],
    ['craft', 'Craft', skyPlanet({ color: '#e6a6ff', dark: '#3a2052', size: 26, ring: true }), 8, 40],
    ['life', 'Life', skyPlanet({ color: '#9fd3b8', dark: '#244a3e', size: 30 }), 30, 26],
    ['game', 'Game', skyPlanet({ color: '#a9a4ff', dark: '#2a2660', size: 18 }), -6, 18],
  ];
  for (const [id, name, p, az, el] of worlds) {
    p.position.copy(skyAt(az, el)); skyG.add(p);
    tappable(p, { world: id }); taps.push(p);
    tags.push({ obj: p, label: name, world: id, offset: -50, stops: ['sky'], isWorld: true });
  }
  tick.push((t) => { skyG.position.copy(world.camPos || V(0, 0, 0)); for (const [, , p] of worlds) p.rotation.y = t * 0.05; });

  // Stops: where the camera stands for each line, and what it looks at
  // Heights are above the ground at that spot
  const G = (x, h, z) => V(x, ground(x, z) + h, z);
  world.stops = {
    arrive: { cam: G(-34, 10, 42), look: G(6, 3, -40) },
    loretto: { cam: G(4, 1.7, -24), look: G(15, 2.5, -40) },
    cafe: { cam: G(5, 1.7, -64), look: G(16, 2.5, -80) },
    vinyl: { cam: G(-3.4, 1.5, -106.4), look: G(-5.6, 0.2, -110.2) },
    sand: { cam: G(-5, 2.2, -125), look: G(-9, 0, -131) },
    coaster: { cam: G(4, 2, -134), look: G(34, 8, -160) },
    balboa: { cam: G(6, 3, -200), look: G(92, 26, -232) },
    beacon: { cam: G(-12, 2.4, -262), look: G(-34, 8, -294) },
    sky: { cam: G(-6, 1.8, -240), look: V(-30, 160, -520) },
  };

  // Time of day: Home follows San Diego's real time unless the visitor moves the slider
  const sun = new THREE.Vector3();
  world.setHour = (h) => {
    const p = palette(h); sunDir(h, sun); applyPalette(env, p, sun);
    nightK = p.night;
    const u = sea.userData.uniforms; u.uSky.value.copy(p.hor); u.uSun.value.copy(sun); u.uSunCol.value.copy(p.sun).multiplyScalar(sun.y > 0 ? 1 : 0.25);
    hills.forEach((m, k) => m.material.color.copy(p.fog).lerp(p.mid, 0.25 - k * 0.07).multiplyScalar(0.92 + k * 0.04));
    for (const f of night) f(p.night);
  };
  world.setHour(hour);
  world.writeSand('');

  world.update = (t, dt, engine) => {
    world.camPos = engine.camera.position;
    sea.userData.uniforms.uTime.value = t;
    for (const f of tick) f(t, dt);
  };
  world.dispose = () => scene.traverse((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
  return world;
}

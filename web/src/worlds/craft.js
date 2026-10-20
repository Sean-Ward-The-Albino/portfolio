import * as THREE from 'three';
import { makeEnv, palette, applyPalette, terrain, ridges, box, lambert, glow, textTexture, tappable, sstep, fbm2, hash2, col } from '../kit.js';
import { LOW } from '../engine.js';

// Craft: a mesa at night with an observatory, under Avlory's product system. The products are planets you can tap;
// thin threads of light between them are Avlory ID, the one account that ties them together.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ground = (x, z) => {
  const r = Math.hypot(x, z + 40);
  const mesa = 8 * (1 - sstep(70, 95, r));
  return mesa - 18 * sstep(90, 160, r) + fbm2(x * 0.03, z * 0.03, 3) * 2 + sstep(160, 400, r) * 50 * fbm2(x * 0.006, z * 0.006, 4);
};

// Product planets: colours from each product's own palette
const PRODUCTS = [
  { id: 'waverate', name: 'Waverate', color: '#e6dac4', dark: '#4a3a2a', ring: '#d4af37', orbit: 70, size: 13, speed: 0.06 },
  { id: 'penny', name: 'PennySphere', color: '#e8cb68', dark: '#14120c', orbit: 105, size: 10, speed: 0.045 },
  { id: 'next', name: 'Avlory Next', color: '#8fb6ff', dark: '#12244a', orbit: 140, size: 15, speed: 0.033 },
  { id: 'upnext', name: 'UpNext', color: '#b6aaff', dark: '#2a2460', orbit: 175, size: 10, speed: 0.026 },
];

function bandedPlanet(color, dark, size) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: col(color) }, uB: { value: col(dark) }, uLight: { value: new THREE.Vector3() } },
    fog: false,
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uA, uB, uLight; varying vec3 vN; varying vec3 vW;
      void main(){ float l = dot(normalize(vN), normalize(uLight - vW)); float band = floor(smoothstep(-0.25, 0.9, l) * 4.0 + 0.5) / 4.0;
        vec3 c = mix(uB, uA, band); float rim = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))), 3.0);
        gl_FragColor = vec4(c + uA * rim * 0.25, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(new THREE.IcosahedronGeometry(size, 3), mat);
}

export function buildCraft() {
  const scene = new THREE.Scene();
  const env = makeEnv(scene, 0.0022);
  const taps = [], tags = [], tick = [];
  const world = { id: 'craft', scene, ground, taps, tags, exposure: 1.1, bounds: { minX: -70, maxX: 70, minZ: -110, maxZ: 30 } };

  scene.add(terrain({ size: 900, seg: 140, cz: -40, height: ground, color: (c, x, y, z, ny) => {
    if (ny < 0.7) c.set(hash2(Math.floor(y / 2), 3) > 0.5 ? '#6a4a52' : '#5a3e48');
    else if (y > 6) c.set(hash2(Math.floor(x / 3), Math.floor(z / 3)) > 0.5 ? '#8a6e6a' : '#7e6462');
    else c.set('#5e4c58');
  } }));
  ridges(scene, { layers: 3, radius: 600, arc: [-Math.PI, Math.PI], base: -10, height: 70, colors: ['#2a2446', '#332c56', '#3d3566'], seed: 21 });

  // The observatory
  const obs = new THREE.Group(); obs.position.set(18, ground(18, -60), -60); scene.add(obs);
  obs.add(box(9, 5, 9, '#d9d2c8'));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(5.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lambert('#e8e2da')); dome.position.y = 5; obs.add(dome);
  const slit = box(1.4, 0.1, 5.4, '#1a1a22', 0, 5, 0); slit.position.y = 7.4; slit.rotation.x = -0.6; obs.add(slit);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), new THREE.MeshBasicMaterial({ color: '#ffc77a' })); door.position.set(0, 1.2, 4.52); obs.add(door);
  const dl = glow('#ffc77a', 6, 0.5); dl.position.set(0, 1.4, 5.2); obs.add(dl);
  // A telescope outside, pointed at the system
  const scope = new THREE.Group(); scope.position.set(-6, ground(-6, -18), -18); scene.add(scope);
  scope.add(box(0.12, 1.4, 0.12, '#2a2a30', -0.4, 0, 0)); scope.add(box(0.12, 1.4, 0.12, '#2a2a30', 0.4, 0, 0)); scope.add(box(0.12, 1.4, 0.12, '#2a2a30', 0, 0, 0.5));
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.2, 10), lambert('#e8e2da')); tube.position.y = 1.7; tube.rotation.x = -0.9; scope.add(tube);

  // Takes: three standing stones with lamps, one per take
  const takes = new THREE.Group(); scene.add(takes);
  for (let k = 0; k < 3; k++) {
    const x = -22 + k * 5, z = -70 - k * 2;
    const s = box(2.2, 3.4, 0.5, '#9a8e8a', x, ground(x, z), z); s.rotation.y = 0.4; takes.add(s);
    const l = glow('#ffd9a0', 3, 0.7); l.position.set(x + 0.8, ground(x, z) + 3.8, z + 0.6); takes.add(l);
  }
  tappable(takes, { stop: 'takes' }); taps.push(takes);
  tags.push({ obj: takes.children[2], label: 'Takes I’d defend', offset: 3, onStop: 'takes', stops: ['takes'] });

  // Avlory's system, high in the northern sky
  const sys = new THREE.Group(); sys.position.set(0, 230, -330); sys.rotation.x = 0.55; scene.add(sys);
  const star = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 2), new THREE.MeshBasicMaterial({ color: '#fff3ff', fog: false }));
  sys.add(star, glow('#ffe6ff', 70, 1), glow('#c700ff', 210, 0.35));
  const planets = [];
  PRODUCTS.forEach((p, k) => {
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(p.orbit, 0.35, 4, 160), new THREE.MeshBasicMaterial({ color: '#d8b8ff', transparent: true, opacity: 0.22, fog: false }));
    orbit.rotation.x = Math.PI / 2; sys.add(orbit);
    const holder = new THREE.Group(); sys.add(holder);
    const ball = bandedPlanet(p.color, p.dark, p.size); holder.add(ball);
    if (p.ring) { const ring = new THREE.Mesh(new THREE.RingGeometry(p.size * 1.4, p.size * 2.1, 48), new THREE.MeshBasicMaterial({ color: p.ring, transparent: true, opacity: 0.6, side: THREE.DoubleSide, fog: false })); ring.rotation.x = 1.25; holder.add(ring); }
    const a0 = k * 1.7;
    planets.push({ ...p, holder, ball, a0 });
    tappable(holder, { stop: p.id }); taps.push(holder);
    tags.push({ obj: holder, label: p.name, offset: -p.size - 14, onStop: p.id, stops: null, maxDist: 2000 });
  });
  // Avlory ID: light threads joining the planets
  const threadGeo = new THREE.BufferGeometry(); threadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PRODUCTS.length * 2 * 3), 3));
  const thread = new THREE.LineSegments(threadGeo, new THREE.LineBasicMaterial({ color: '#f7c8ff', transparent: true, opacity: 0.0, fog: false })); sys.add(thread);
  const starWorld = V(0, 0, 0);
  tick.push((t) => {
    sys.updateMatrixWorld(); star.getWorldPosition(starWorld);
    const pos = threadGeo.attributes.position;
    planets.forEach((p, k) => {
      const a = p.a0 + t * p.speed; p.holder.position.set(Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit);
      p.ball.rotation.y = t * 0.2; p.ball.material.uniforms.uLight.value.copy(starWorld);
      const n = planets[(k + 1) % planets.length];
      pos.setXYZ(k * 2, p.holder.position.x, 0, p.holder.position.z);
      const b = n.a0 + t * n.speed; pos.setXYZ(k * 2 + 1, Math.cos(b) * n.orbit, 0, Math.sin(b) * n.orbit);
    });
    pos.needsUpdate = true;
    thread.material.opacity = world.threads ?? 0.12;
  });

  // Where to look for each stop; product stops track their moving planet
  const tracking = (cam, id) => {
    const p = planets.find((q) => q.id === id), stop = { cam };
    Object.defineProperty(stop, 'look', { get: () => { sys.updateMatrixWorld(); return p.holder.getWorldPosition(V(0, 0, 0)); } });
    return stop;
  };
  world.stops = {
    intro: { cam: V(0, ground(0, 20) + 2.2, 20), look: V(0, 60, -200) },
    ownership: { cam: V(10, ground(10, -40) + 2.2, -40), look: V(18, 6, -60) },
    ecosystem: { cam: V(-4, ground(-4, -14) + 2.4, -14), look: V(0, 230, -330) },
    waverate: tracking(V(-8, ground(-8, -26) + 2.2, -26), 'waverate'),
    penny: tracking(V(-2, ground(-2, -30) + 2.2, -30), 'penny'),
    next: tracking(V(4, ground(4, -34) + 2.2, -34), 'next'),
    upnext: tracking(V(10, ground(10, -38) + 2.2, -38), 'upnext'),
    takes: { cam: V(-14, ground(-14, -60) + 2.2, -60), look: V(-17, 3, -72) },
  };

  const pal = palette(22.5), sun = V(-0.3, -0.4, 0.5).normalize();
  applyPalette(env, pal, sun);
  env.sky.uniforms.uTop.value.set('#05061a'); env.sky.uniforms.uMid.value.set('#141238'); env.sky.uniforms.uHor.value.set('#3a2a5a');
  env.hemi.intensity = 1.5; env.hemi.color.set('#6a6aa8'); env.sun.color.set('#b8a8ff'); env.sun.intensity = 0.7;
  scene.fog.color.set('#241e44');

  world.update = (t, dt, engine) => {
    for (const f of tick) f(t);
    // Ecosystem stop: the threads brighten while you look at them
    world.threads = engine.order[engine.index] === 'ecosystem' ? 0.7 : 0.12;
  };
  world.dispose = () => scene.traverse((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
  return world;
}

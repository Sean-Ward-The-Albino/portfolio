import * as THREE from 'three';
import { skyPlanet } from './kit.js';
import { LOW } from './engine.js';

// The space between worlds: one small planet per world, on a wide ring, under a field of stars.
// Built the first time someone travels, then kept.
export function buildSpace(worlds) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05040a');
  const n = LOW ? 700 : 1600, pos = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { v.randomDirection().multiplyScalar(1400 + Math.random() * 600); pos.set([v.x, v.y, v.z], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#e8e4ff', size: LOW ? 2.2 : 1.8, sizeAttenuation: false, fog: false })));
  const planets = {};
  worlds.forEach(({ id, color, dark, ring }, i) => {
    const a = (i / worlds.length) * Math.PI * 2, r = 30;
    const p = skyPlanet({ color, dark, ring, size: r });
    p.position.set(Math.sin(a) * 320, (i % 2 ? 1 : -1) * 24, Math.cos(a) * 320);
    scene.add(p);
    planets[id] = { obj: p, r };
  });
  return { scene, planets, update(t) { for (const k in planets) planets[k].obj.userData.ball.rotation.y = t * 0.05; } };
}

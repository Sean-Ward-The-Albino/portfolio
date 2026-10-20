import * as THREE from 'three';
import { glow, col, fbm2, rng, tappable } from '../kit.js';
import { LOW } from '../engine.js';

// The Game planet: a tiny world everyone shares. Visitors leave lanterns with short notes; everyone sees them, live.

const R = 6;
const latLon = (lat, lon, r = R) => {
  const phi = (90 - lat) * Math.PI / 180, th = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
};
export const toLatLon = (v) => {
  const n = v.clone().normalize();
  const lat = 90 - Math.acos(n.y) * 180 / Math.PI;
  let lon = Math.atan2(n.z, -n.x) * 180 / Math.PI - 180;
  if (lon < -180) lon += 360;
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
};

export function buildGame() {
  const scene = new THREE.Scene();
  scene.background = col('#07061a');
  const taps = [];
  const world = { id: 'game', scene, taps, tags: [], orbit: { dist: 17 }, exposure: 1, ground: () => 0 };

  // Stars
  const n = LOW ? 1200 : 2400, pos = new Float32Array(n * 3), r = rng(5);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(300 + r() * 200); pos.set([v.x, v.y, v.z], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.85 })));

  // The planet: faceted land and sea, flat-shaded
  const geo = new THREE.IcosahedronGeometry(R, 5).toNonIndexed();
  const p = geo.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    v.set((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3).normalize();
    const h = fbm2(v.x * 1.6 + v.y * 0.9 + 5, v.z * 1.6 - v.y * 0.8 + v.y * 1.2, 5);
    const lift = h > 0.5 ? (h - 0.5) * 0.6 : 0;
    for (let k = 0; k < 3; k++) { const q = new THREE.Vector3(p.getX(i + k), p.getY(i + k), p.getZ(i + k)); q.multiplyScalar(1 + lift * 0.12); p.setXYZ(i + k, q.x, q.y, q.z); }
    if (Math.abs(v.y) > 0.9) c.set('#eef0f8');
    else if (h < 0.47) c.set(h < 0.42 ? '#2c4f8f' : '#3f6fae');
    else if (h < 0.495) c.set('#e8d3a4');
    else c.set(h > 0.62 ? '#8c8496' : h > 0.56 ? '#4f7f5a' : '#6a9a62');
    c.offsetHSL(0, 0, (fbm2(v.x * 9, v.z * 9, 2) - 0.5) * 0.06);
    for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const planet = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  scene.add(planet);
  tappable(planet, { action: 'lanternAt' }); taps.push(planet);
  const halo = glow('#9a8cff', 22, 0.35); scene.add(halo);
  scene.add(new THREE.HemisphereLight('#d8d0ff', '#2a2050', 1.2));
  const sun = new THREE.DirectionalLight('#fff0e0', 2.2); sun.position.set(20, 12, 14); scene.add(sun);

  // Lanterns: a post with a glowing light, in the visitor's chosen colour
  const lanterns = new Map();
  const postGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.5, 5); postGeo.translate(0, 0.25, 0);
  const postMat = new THREE.MeshLambertMaterial({ color: '#3a3040' });
  world.addLantern = (m, fresh = false) => {
    if (lanterns.has(m.id)) return;
    const g = new THREE.Group(); const at = latLon(m.lat, m.lon, R * 1.03); g.position.copy(at);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), at.clone().normalize());
    g.add(new THREE.Mesh(postGeo, postMat));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: m.color })); lamp.position.y = 0.52; g.add(lamp);
    const gl = glow(m.color, fresh ? 2.4 : 0.9, 0.9); gl.position.y = 0.52; g.add(gl);
    g.userData = { mark: m, glow: gl, born: fresh ? performance.now() : 0 };
    planet.add(g); lanterns.set(m.id, g);
  };
  world.removeLantern = (id) => { const g = lanterns.get(id); if (g) { planet.remove(g); lanterns.delete(id); } };
  world.lanterns = lanterns;
  world.nearest = (point) => { let best = null, bd = 0.6; for (const g of lanterns.values()) { const d = g.getWorldPosition(new THREE.Vector3()).distanceTo(point); if (d < bd) { bd = d; best = g.userData.mark; } } return best; };

  world.toPlanet = (point) => planet.worldToLocal(point.clone());

  // Other visitors on the planet right now: fireflies drifting to where each one is hovering
  const others = new Map();
  world.setOthers = (spots, you) => {
    const keep = new Set();
    for (const s of spots) {
      if (s.id === you) continue;
      keep.add(s.id);
      let f = others.get(s.id);
      if (!f) { f = glow(s.c, 1.1, 0.95); f.userData.at = latLon(s.lat, s.lon, R * 1.18); f.position.copy(f.userData.at); planet.add(f); others.set(s.id, f); }
      f.userData.at = latLon(s.lat, s.lon, R * 1.18);
    }
    for (const [id, f] of others) if (!keep.has(id)) { planet.remove(f); others.delete(id); }
  };
  world.lookingAt = (camera) => toLatLon(planet.worldToLocal(camera.position.clone()));
  world.stops = {};
  world.update = (t) => {
    planet.rotation.y = t * 0.02;
    for (const f of others.values()) { f.position.lerp(f.userData.at, 0.08); f.material.opacity = 0.7 + 0.3 * Math.sin(t * 3 + f.id); }
    const now = performance.now();
    for (const g of lanterns.values()) { const b = g.userData.born; if (b) { const k = Math.min(1, (now - b) / 1500); g.userData.glow.scale.setScalar(2.4 - k * 1.5); if (k >= 1) g.userData.born = 0; } }
  };
  world.dispose = () => scene.traverse((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
  return world;
}

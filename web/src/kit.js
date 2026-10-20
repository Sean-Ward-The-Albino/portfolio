import * as THREE from 'three';
import { LOW } from './engine.js';

// The look: hand-shaped, flat-shaded scenes with strong colour and layered haze, in the spirit of Firewatch.
// Everything here is cheap to draw: vertex colours, no textures to download, no per-pixel noise.

export const col = (h) => new THREE.Color(h);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Deterministic randomness, so a world looks the same on every visit
export function rng(seed = 1) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function hash2(x, z) { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); }
export function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x, z, o = 4) { let s = 0, a = 0.5; for (let i = 0; i < o; i++) { s += a * noise2(x, z); x = x * 2.03 + 17.1; z = z * 2.03 + 9.7; a *= 0.5; } return s; }

// ---------- Sky: a painted gradient with a sun, cheap enough for any phone ----------
export function makeSky(scene) {
  const uniforms = {
    uTop: { value: col('#3b2a6b') }, uMid: { value: col('#c6587a') }, uHor: { value: col('#ffb27a') },
    uSun: { value: new THREE.Vector3(0, 0.1, -1) }, uSunCol: { value: col('#ffd2a0') }, uSunSize: { value: 1 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uTop, uMid, uHor, uSun, uSunCol; uniform float uSunSize; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        vec3 c = mix(uHor, uMid, smoothstep(-0.02, 0.22, h));
        c = mix(c, uTop, smoothstep(0.18, 0.85, h));
        c = mix(c, uHor * 0.75, smoothstep(0.0, -0.3, h));
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += uSunCol * (smoothstep(0.9993 - 0.0006 * uSunSize, 0.9997 - 0.0004 * uSunSize, s) * 1.6 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  mesh.renderOrder = -10;
  scene.add(mesh);
  // Stars, faded in at night
  const n = LOW ? 900 : 1800, pos = new Float32Array(n * 3), r = rng(7);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.05, rad = Math.sqrt(1 - y * y);
    pos.set([Math.cos(th) * rad * 1600, y * 1600, Math.sin(th) * rad * 1600], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  stars.renderOrder = -9;
  scene.add(stars);
  return { mesh, uniforms, stars };
}

// Time-of-day palettes, painted by hand. Hours are local time.
const KEYS = [
  { h: 0, top: '#060a1c', mid: '#121838', hor: '#272352', sun: '#9fb0ff', light: 0.18, amb: '#2a3266', fog: '#1c1d3c', ground: '#28304f', night: 1 },
  { h: 5.2, top: '#0d1230', mid: '#2b2a5a', hor: '#5b4470', sun: '#ffb38a', light: 0.25, amb: '#3d3a6a', fog: '#3a3560', ground: '#363a5a', night: 0.85 },
  { h: 6.4, top: '#3a4f8f', mid: '#c97f8e', hor: '#ffc28f', sun: '#ffb070', light: 0.75, amb: '#8a7aa0', fog: '#e0a89a', ground: '#7b6a7a', night: 0.2 },
  { h: 9, top: '#3f78c8', mid: '#8fbde8', hor: '#f3dcc0', sun: '#fff0d8', light: 1.2, amb: '#9fb5d8', fog: '#c9d8e6', ground: '#a7a08a', night: 0 },
  { h: 13, top: '#3b74c4', mid: '#86bae8', hor: '#dcebf4', sun: '#ffffff', light: 1.35, amb: '#a8c0e0', fog: '#cfe0ee', ground: '#b3ab92', night: 0 },
  { h: 16.8, top: '#4a6fbf', mid: '#a7b6dc', hor: '#f7d3a8', sun: '#ffe2b0', light: 1.15, amb: '#b0a8c8', fog: '#e7cdb6', ground: '#a8987e', night: 0 },
  { h: 18.4, top: '#3b3d86', mid: '#d06f86', hor: '#ffb070', sun: '#ff9a55', light: 0.85, amb: '#9a7a9c', fog: '#e59a88', ground: '#8a6a74', night: 0.1 },
  { h: 19.3, top: '#24215e', mid: '#7c3f78', hor: '#e8766a', sun: '#ff7a50', light: 0.4, amb: '#5c4878', fog: '#8a5070', ground: '#4f4060', night: 0.5 },
  { h: 20.4, top: '#0b0f2a', mid: '#1d1d48', hor: '#3d2c5c', sun: '#a0a8ff', light: 0.2, amb: '#2e3266', fog: '#262448', ground: '#2c3050', night: 0.95 },
  { h: 24, top: '#060a1c', mid: '#121838', hor: '#272352', sun: '#9fb0ff', light: 0.18, amb: '#2a3266', fog: '#1c1d3c', ground: '#28304f', night: 1 },
];
const cA = new THREE.Color(), cB = new THREE.Color();
export function palette(hour) {
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].h <= hour) i++;
  const a = KEYS[i], b = KEYS[i + 1], k = sstep(0, 1, (hour - a.h) / (b.h - a.h));
  const mix = (p) => cA.set(a[p]).lerp(cB.set(b[p]), k).clone();
  return { top: mix('top'), mid: mix('mid'), hor: mix('hor'), sun: mix('sun'), amb: mix('amb'), fog: mix('fog'), ground: mix('ground'),
    light: a.light + (b.light - a.light) * k, night: a.night + (b.night - a.night) * k };
}
export function sunDir(hour, out = new THREE.Vector3()) {
  const a = ((hour - 6) / 12) * Math.PI;
  return out.set(-Math.cos(a), Math.sin(a) * 0.85, -0.45).normalize();
}

// Applies a palette to the sky, lights and fog of a scene
export function applyPalette(env, p, sun) {
  env.sky.uniforms.uTop.value.copy(p.top); env.sky.uniforms.uMid.value.copy(p.mid); env.sky.uniforms.uHor.value.copy(p.hor);
  env.sky.uniforms.uSunCol.value.copy(p.sun).multiplyScalar(sun.y > -0.05 ? 1 : 0.35);
  env.sky.uniforms.uSun.value.copy(sun.y > -0.05 ? sun : env.moon.set(-sun.x, Math.abs(sun.y) * 0.7 + 0.25, -sun.z).normalize());
  env.sky.uniforms.uSunSize.value = sun.y > -0.05 ? 1 : 0.6;
  env.sky.stars.material.opacity = p.night * 0.9;
  env.scene.fog.color.copy(p.fog);
  env.hemi.color.copy(p.amb); env.hemi.groundColor.copy(p.ground); env.hemi.intensity = 0.9 + p.light * 0.6;
  env.sun.color.copy(p.sun); env.sun.intensity = p.light * 2.2;
  env.sun.position.copy(sun.y > -0.05 ? sun : env.moon).multiplyScalar(200);
}

export function makeEnv(scene, fogDensity = 0.0035) {
  scene.fog = new THREE.FogExp2('#c9d8e6', fogDensity);
  const sky = makeSky(scene);
  const hemi = new THREE.HemisphereLight('#a8c0e0', '#5a5040', 1.2);
  const sun = new THREE.DirectionalLight('#ffffff', 2);
  scene.add(hemi, sun, sun.target);
  return { scene, sky, hemi, sun, moon: new THREE.Vector3() };
}

// ---------- Ground: flat-shaded triangles coloured by height and slope ----------
export function terrain({ size = 800, seg = 160, cx = 0, cz = 0, height, color }) {
  const s = LOW ? Math.round(seg * 0.65) : seg;
  const geo = new THREE.PlaneGeometry(size, size, s, s);
  geo.rotateX(-Math.PI / 2); geo.translate(cx, 0, cz);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  const fp = flat.attributes.position, fn = flat.attributes.normal, cols = new Float32Array(fp.count * 3), c = new THREE.Color();
  for (let i = 0; i < fp.count; i += 3) {
    // One colour per triangle, from its centre: the faceted look
    const x = (fp.getX(i) + fp.getX(i + 1) + fp.getX(i + 2)) / 3, y = (fp.getY(i) + fp.getY(i + 1) + fp.getY(i + 2)) / 3, z = (fp.getZ(i) + fp.getZ(i + 1) + fp.getZ(i + 2)) / 3;
    color(c, x, y, z, fn.getY(i));
    for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const mesh = new THREE.Mesh(flat, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  return mesh;
}

// Distant ridgelines: flat bands of colour that fade into the haze, layer by layer
export function ridges(scene, { layers = 4, radius = 700, arc = [-Math.PI, Math.PI], base = -2, height = 60, colors, seed = 1 }) {
  const out = [];
  for (let l = 0; l < layers; l++) {
    const r = radius + l * 140, n = 120, pts = [], shape = new THREE.Shape(), rnd = rng(seed + l * 13);
    const h0 = height * (0.6 + l * 0.35);
    const geo = new THREE.BufferGeometry(); const pos = [];
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const a = arc[0] + (arc[1] - arc[0]) * (i / n);
      const y = base + h0 * (0.35 + 0.65 * fbm2(i * 0.09 + l * 5, l * 2.3 + seed, 4)) + (rnd() - 0.5) * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (prev) pos.push(prev.x, base - 40, prev.z, x, base - 40, z, x, y, z, prev.x, base - 40, prev.z, x, y, z, prev.x, prev.y, prev.z);
      prev = { x, y, z };
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[l % colors.length], fog: true, side: THREE.DoubleSide }));
    mesh.userData.layer = l;
    scene.add(mesh); out.push(mesh);
  }
  return out;
}

// ---------- Water: low-poly waves, coloured toward the sky at a glance ----------
export function water({ size = 1600, seg = 90, cx = 0, cz = 0, deep = '#16486a', shallow = '#3f8fa8' }) {
  const s = LOW ? 50 : seg;
  const geo = new THREE.PlaneGeometry(size, size, s, s); geo.rotateX(-Math.PI / 2); geo.translate(cx, 0, cz);
  const uniforms = { uTime: { value: 0 }, uDeep: { value: col(deep) }, uShallow: { value: col(shallow) }, uSky: { value: col('#cfe0ee') }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: col('#ffffff') },
    fogColor: { value: col('#cfe0ee') }, fogDensity: { value: 0.003 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, extensions: {},
    vertexShader: `uniform float uTime; varying vec3 vW; varying float vFogDepth;
      void main(){ vec3 p = position;
        p.y += sin(p.x * 0.08 + uTime * 0.9) * 0.35 + sin(p.z * 0.11 - uTime * 0.7) * 0.28 + sin((p.x + p.z) * 0.21 + uTime * 1.6) * 0.12;
        vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vFogDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uDeep, uShallow, uSky, uSun, uSunCol, fogColor; uniform float fogDensity; varying vec3 vW; varying float vFogDepth;
      void main(){
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 c = mix(uDeep, uShallow, 0.35 + 0.35 * n.y);
        c = mix(c, uSky, 0.15 + fres * 0.55);
        c += uSunCol * pow(max(dot(reflect(-normalize(uSun), n), V), 0.0), 60.0) * 0.8;
        float f = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        gl_FragColor = vec4(mix(c, fogColor, f), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.uniforms = uniforms;
  return mesh;
}

// ---------- Small things ----------
let glowTex;
export function glow(color, size, opacity = 1) {
  if (!glowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.setScalar(size);
  return s;
}

export function textTexture(text, { w = 512, h = 128, bg = '#2b1a14', fg = '#ffd36b', font = '800 64px Outfit, sans-serif', sub = '', subColor = '#f4efe6' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
  if (sub) { g.fillStyle = subColor; g.font = '600 22px Outfit, sans-serif'; g.fillText(sub, w / 2, h * 0.8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export const lambert = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });

export function box(w, h, d, c, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? lambert(c) : c); m.position.set(x, y + h / 2, z); return m; }

// A cottage: a box with a pitched roof and windows that light up at night
export function cottage({ w = 5, h = 3.5, d = 5, wall = '#efe3d0', roof = '#a85a44', trim = '#ffffff' }) {
  const g = new THREE.Group();
  g.add(box(w, h, d, wall));
  const roofGeo = new THREE.CylinderGeometry(0.01, w * 0.62, 1.6, 4, 1); roofGeo.rotateY(Math.PI / 4); roofGeo.scale(1, 1, d / w);
  const r = new THREE.Mesh(roofGeo, lambert(roof)); r.position.y = h + 0.8; g.add(r);
  const winMat = new THREE.MeshBasicMaterial({ color: '#3a3438' });
  for (const sx of [-1, 1]) { const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.22, h * 0.28), winMat); win.position.set(sx * w * 0.24, h * 0.55, d / 2 + 0.02); g.add(win); }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.16, h * 0.5), lambert(trim)); door.position.set(0, h * 0.25, d / 2 + 0.02); g.add(door);
  g.userData.windows = winMat;
  return g;
}

// A palm, shaped so it reads as a silhouette at any distance
export function palmGeometries() {
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 9, 6, 6); trunk.translate(0, 4.5, 0);
  const tp = trunk.attributes.position; for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) + (y / 9) ** 2 * 1.1); }
  trunk.computeVertexNormals();
  const frond = new THREE.PlaneGeometry(0.9, 3.8, 1, 5); frond.translate(0, 1.9, 0);
  const fp = frond.attributes.position; for (let i = 0; i < fp.count; i++) { const y = fp.getY(i); fp.setZ(i, -((y / 3.8) ** 2) * 1.9); fp.setX(i, fp.getX(i) * (1 - y / 4)); }
  frond.rotateX(-Math.PI / 2 + 0.55); frond.computeVertexNormals();
  return { trunk, frond };
}

export function palms(spots, ground, { trunk = '#5d4a38', leaf = '#2f4a2a' } = {}) {
  const { trunk: tg, frond: fg } = palmGeometries();
  const t = new THREE.InstancedMesh(tg, lambert(trunk), spots.length);
  const f = new THREE.InstancedMesh(fg, lambert(leaf, { side: THREE.DoubleSide }), spots.length * 8);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach(([x, z], i) => {
    const k = 0.85 + hash2(x, z) * 0.45, ry = hash2(z, x) * 6.28;
    q.setFromEuler(new THREE.Euler(0, ry, 0)); p.set(x, ground(x, z) - 0.2, z); s.setScalar(k); m.compose(p, q, s); t.setMatrixAt(i, m);
    const top = new THREE.Vector3(1.1 * k, 9 * k, 0).applyQuaternion(q).add(p);
    for (let j = 0; j < 8; j++) { const fq = new THREE.Quaternion().setFromEuler(new THREE.Euler(hash2(i, j) * 0.25, ry + j * 0.785, 0)); m.compose(top, fq, s); f.setMatrixAt(i * 8 + j, m); }
  });
  const g = new THREE.Group(); g.add(t, f); return g;
}

export function pines(spots, ground, { color = '#2c4a33', trunk = '#4a3a2a' } = {}) {
  const cone = new THREE.ConeGeometry(1, 2.6, 6); cone.translate(0, 2.6, 0);
  const cone2 = new THREE.ConeGeometry(0.75, 2.1, 6); cone2.translate(0, 4.1, 0);
  const t = new THREE.InstancedMesh(cone, lambert(color), spots.length), t2 = new THREE.InstancedMesh(cone2, lambert(color), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach(([x, z, k = 1], i) => { q.setFromEuler(new THREE.Euler(0, hash2(x, z) * 6, 0)); p.set(x, ground(x, z) - 0.2, z); s.set(k, k * (0.9 + hash2(z, x) * 0.5), k); m.compose(p, q, s); t.setMatrixAt(i, m); t2.setMatrixAt(i, m); });
  const g = new THREE.Group(); g.add(t, t2); return g;
}

// A planet in the sky that you can tap to travel there
export function skyPlanet({ color = '#d8a0c0', dark = '#3a2440', ring = false, size = 30 }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: col(color) }, uB: { value: col(dark) }, uSun: { value: new THREE.Vector3(1, 0.4, 0.3).normalize() } },
    fog: false,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uA, uB, uSun; varying vec3 vN;
      void main(){ float l = dot(normalize(vN), normalize(uSun)); float band = floor(smoothstep(-0.2, 0.9, l) * 4.0) / 4.0;
        gl_FragColor = vec4(mix(uB, uA, band), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 3), mat); g.add(ball);
  if (ring) { const r = new THREE.Mesh(new THREE.RingGeometry(size * 1.35, size * 2, 48), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false })); r.rotation.x = 1.2; g.add(r); }
  g.userData.ball = ball;
  return g;
}

// Marks an object as tappable; the engine looks for userData.tap
export function tappable(obj, tap) { obj.userData.tap = tap; return obj; }

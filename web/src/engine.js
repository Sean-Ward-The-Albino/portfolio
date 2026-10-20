import * as THREE from 'three';

// The engine runs one world at a time. It owns the camera and every way of moving it:
// the guided tour (stop to stop), free walking, and orbiting (for the Game planet).
// Worlds only describe what's in them; see worlds/*.js.

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isPhone = () => matchMedia('(max-width: 760px)').matches;
export const coarse = matchMedia('(pointer: coarse)').matches;
// Phones and modest machines get a lighter build from the start.
export const LOW = isPhone() || (navigator.deviceMemory || 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (rate, dt) => (reduceMotion ? 1 : 1 - Math.exp(-rate * dt));

export class Engine {
  constructor(host, { onStop, onTap, onFrame }) {
    this.host = host;
    this.onStop = onStop;
    this.onTap = onTap;
    this.onFrame = onFrame;
    const dprMax = Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2);
    this.dprMax = dprMax;
    this.dpr = Math.min(dprMax, LOW ? 1.25 : 1.5);
    this.renderer = new THREE.WebGLRenderer({ antialias: this.dpr < 2, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    host.append(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
    this.world = null;
    this.order = [];         // stop ids in reading order
    this.index = 0;
    this.mode = 'tour';      // tour | walk | orbit | ride
    this.look = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.yawT = 0; this.pitchT = 0;
    this.move = null;        // an in-progress flight between stops
    this.trip = null;        // travel between worlds (lift off, then space)
    this.keys = new Set();
    this.stick = { x: 0, y: 0 };
    this.orbit = { theta: 0.6, phi: 1.1, dist: 14, thetaT: 0.6, phiT: 1.1, distT: 14 };
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.tags = [];
    this.tagLayer = document.body;
    this.t = 0;
    this.last = performance.now();
    this.ft = 16; this.ftN = 0;
    this.paused = false;
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3(); this.sph = new THREE.Spherical();
    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(host);
    this.resize();
    this.bindInput();
    document.addEventListener('visibilitychange', () => { this.paused = document.hidden; if (!this.paused) this.last = performance.now(); });
    requestAnimationFrame((n) => this.frame(n));
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 68 : 55;
    this.camera.updateProjectionMatrix();
  }

  // ---------- Worlds ----------
  setWorld(world, order, startIndex = 0) {
    this.trip = null;
    document.body.classList.remove('traveling');
    for (const tag of this.tags) tag.el.remove();
    this.tags = [];
    if (this.world && this.world !== world) this.world.dispose?.();
    this.world = world;
    this.order = order;
    this.index = clamp(startIndex, 0, order.length - 1);
    this.yaw = this.yawT = this.pitch = this.pitchT = 0;
    this.renderer.toneMappingExposure = world.exposure ?? 1;
    for (const t of world.tags || []) this.addTag(t);
    if (world.orbit) {
      this.mode = 'orbit';
      Object.assign(this.orbit, { distT: world.orbit.dist, dist: world.orbit.dist * 1.8, phiT: 1.15, theta: 0.4, thetaT: 0.4 });
    } else {
      this.mode = 'tour';
      const p = this.pose(this.order[this.index]);
      // Come down from above into the first stop
      this.camera.position.copy(p.cam).add(new THREE.Vector3(0, reduceMotion ? 0 : 40, reduceMotion ? 0 : 30));
      this.look.copy(p.look);
      this.flyTo(this.index, reduceMotion ? 0.01 : 2.4);
    }
    this.onStop?.(this.index);
  }

  pose(id) {
    const s = this.world.stops[id];
    if (s) return s;
    // A stop added in the admin panel that this world has no place for yet: put it after the last known one.
    const known = Object.values(this.world.stops);
    const last = known[known.length - 1];
    const k = this.order.indexOf(id) - known.length + 1;
    return { cam: last.cam.clone().add(new THREE.Vector3(0, 0, -12 * k)), look: last.look.clone().add(new THREE.Vector3(0, 0, -12 * k)) };
  }

  go(i) {
    if (!this.world || this.mode === 'ride') return;
    i = clamp(i, 0, this.order.length - 1);
    if (this.mode === 'walk') this.setWalk(false);
    if (this.mode === 'orbit') { this.index = i; this.onStop?.(i); return; }
    if (i === this.index && !this.move) return;
    this.index = i;
    this.flyTo(i);
    this.onStop?.(i);
  }

  flyTo(i, dur) {
    const p = this.pose(this.order[i]);
    const from = this.camera.position.clone();
    const d = from.distanceTo(p.cam);
    this.move = { from, fromLook: this.look.clone(), to: p.cam.clone(), toLook: p.look.clone(), t: 0, dur: dur ?? (reduceMotion ? 0.01 : clamp(0.9 + d / 40, 1.1, 2.6)), lift: Math.min(8, d * 0.12) };
    this.yawT = 0; this.pitchT = 0;
  }

  setWalk(on) {
    if (!this.world || this.world.orbit) return false;
    if (on && this.mode !== 'walk') {
      this.mode = 'walk';
      this.move = null;
      // Keep looking where we were looking
      const dir = this.tmp.copy(this.look).sub(this.camera.position);
      this.sph.setFromVector3(dir);
      this.walkYaw = this.sph.theta + this.yaw; this.walkPitch = clamp(Math.PI / 2 - this.sph.phi - this.pitch, -0.6, 0.6);
      this.yaw = this.yawT = this.pitch = this.pitchT = 0;
    } else if (!on && this.mode === 'walk') {
      this.mode = 'tour';
      // Return to the nearest stop
      let best = 0, bd = Infinity;
      this.order.forEach((id, k) => { const d = this.pose(id).cam.distanceTo(this.camera.position); if (d < bd) { bd = d; best = k; } });
      this.look.copy(this.camera.position).add(this.tmp.set(Math.sin(this.walkYaw), Math.tan(this.walkPitch), Math.cos(this.walkYaw)).multiplyScalar(10));
      this.index = best; this.flyTo(best); this.onStop?.(best);
    }
    return this.mode === 'walk';
  }

  // A ride follows a curve (the coaster). It ends on its own, or with stopRide().
  ride(curve, seconds, onEnd) {
    this.mode = 'ride';
    this.rideState = { curve, t: 0, dur: seconds, onEnd };
  }

  stopRide() {
    if (this.mode !== 'ride') return;
    const end = this.rideState.onEnd;
    this.rideState = null; this.mode = 'tour';
    this.flyTo(this.index, 1.2);
    end?.();
  }

  // ---------- Travel between worlds ----------
  // Lift off: the camera rises out of the current world.
  lift(dur) {
    document.body.classList.add('traveling');
    return new Promise((done) => { this.trip = { phase: 'lift', t: 0, dur, done, from: this.camera.position.clone(), look: this.look.clone() }; });
  }

  // Cross space from one world's planet to the next. Resolves when the flight arrives; the camera keeps
  // drifting closer until setWorld() lands it, in case the next world is still loading.
  cross(space, fromId, toId) {
    const a = space.planets[fromId] || Object.values(space.planets)[0], b = space.planets[toId];
    const pa = a.obj.position, pb = b.obj.position, r = b.r;
    const dir = pb.clone().sub(pa).normalize(), up = new THREE.Vector3(0, 1, 0);
    // Start just above the planet we're leaving, so it falls away beneath us
    const start = pa.clone().addScaledVector(dir, -a.r * 0.35).addScaledVector(up, a.r * 1.25);
    const end = pb.clone().addScaledVector(dir, -r * 2.6).addScaledVector(up, r * 0.35);
    const mid = start.clone().lerp(end, 0.5).addScaledVector(up, 40);
    const near = pb.clone().addScaledVector(dir, -r * 1.7).addScaledVector(up, r * 0.2);
    // Light every planet from over the traveller's shoulder, so the side we see is lit
    const sun = dir.clone().negate().addScaledVector(up, 0.6).add(new THREE.Vector3().crossVectors(dir, up).multiplyScalar(0.5)).normalize();
    for (const k in space.planets) space.planets[k].obj.userData.ball.material.uniforms.uSun.value.copy(sun);
    const dur = clamp(1.3 + start.distanceTo(end) / 700, 1.4, 2.2);
    return new Promise((done) => { this.trip = { phase: 'space', space, t: 0, dur, done, curve: new THREE.QuadraticBezierCurve3(start, mid, end), near, end, startLook: start.clone().addScaledVector(dir, 200).addScaledVector(up, -90), target: pb.clone() }; });
  }

  runTrip(dt) {
    const tr = this.trip, cam = this.camera;
    tr.t += dt;
    const k = Math.min(1, tr.t / tr.dur);
    if (tr.phase === 'lift') {
      const e = k * k;
      cam.position.copy(tr.from); cam.position.y += e * 70;
      cam.lookAt(this.tmp.copy(tr.look).setY(tr.look.y + e * 120));
      this.world.update?.(this.t, dt, this);
      this.renderer.render(this.world.scene, cam);
    } else {
      if (k < 1) tr.curve.getPoint(ease(k), cam.position);
      else cam.position.lerpVectors(tr.end, tr.near, 1 - Math.exp(-(tr.t - tr.dur) * 0.9));
      cam.lookAt(this.tmp.lerpVectors(tr.startLook, tr.target, ease(Math.min(1, k * 1.4))));
      tr.space.update(this.t);
      this.renderer.render(tr.space.scene, cam);
    }
    if (k >= 1 && tr.done) { tr.done(); tr.done = null; }
  }

  // ---------- Tags: real buttons pinned to things in the world ----------
  addTag({ obj, label, onClick, world = false, stops = null, maxDist = 400, offset = 0 }) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tag' + (world ? ' world' : '');
    el.textContent = label;
    el.style.opacity = '0';
    el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    this.tagLayer.append(el);
    const tag = { el, obj, stops, maxDist, offset, shown: false };
    this.tags.push(tag);
    return tag;
  }

  updateTags() {
    const w = this.host.clientWidth, h = this.host.clientHeight, stopId = this.order[this.index];
    const placed = [];
    for (const tag of this.tags) {
      let show = this.mode !== 'ride' && !this.move;
      if (show && tag.stops && this.mode !== 'walk' && this.mode !== 'orbit') show = tag.stops.includes(stopId);
      if (show) {
        tag.obj.getWorldPosition(this.tmp); this.tmp.y += tag.offset;
        const dist = this.tmp.distanceTo(this.camera.position);
        this.tmp.project(this.camera);
        show = dist < tag.maxDist && this.tmp.z < 1 && Math.abs(this.tmp.x) < 0.94 && this.tmp.y > -0.6 && this.tmp.y < 0.9;
        if (show) {
          let x = (this.tmp.x + 1) / 2 * w, y = (1 - this.tmp.y) / 2 * h;
          tag.w ||= tag.el.offsetWidth || 100;
          // Never let two tags overlap, so each stays easy to tap
          for (let g = 0; g < 6; g++) { const hit = placed.find((q) => Math.abs(q.x - x) < (q.w + tag.w) / 2 + 6 && Math.abs(q.y - y) < 42); if (!hit) break; y = hit.y + 44; }
          placed.push({ x, y, w: tag.w });
          tag.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        }
      }
      if (show !== tag.shown) { tag.shown = show; tag.el.style.opacity = show ? '1' : '0'; tag.el.style.pointerEvents = show ? 'auto' : 'none'; tag.el.tabIndex = show ? 0 : -1; }
    }
  }

  // ---------- Input ----------
  bindInput() {
    const el = this.host;
    let down = null;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      down = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), touch: e.pointerType !== 'mouse', axis: null, pinch: 0 };
    });
    el.addEventListener('pointermove', (e) => {
      if (!down) { this.hover(e); return; }
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      down.x = e.clientX; down.y = e.clientY;
      const tx = e.clientX - down.sx, ty = e.clientY - down.sy;
      if (!down.axis && Math.hypot(tx, ty) > 10) down.axis = Math.abs(ty) > Math.abs(tx) * 1.2 ? 'v' : 'h';
      if (this.mode === 'orbit') {
        this.orbit.thetaT -= dx * 0.006; this.orbit.phiT = clamp(this.orbit.phiT - dy * 0.005, 0.25, 2.9);
        return;
      }
      // On a touch screen in the tour, a vertical swipe moves between stops; everything else looks around.
      if (down.touch && this.mode === 'tour' && down.axis === 'v') return;
      if (this.mode === 'walk') { this.walkYaw -= dx * 0.005; this.walkPitch = clamp(this.walkPitch - dy * 0.004, -0.7, 0.7); }
      else { this.yawT += dx * 0.004; this.pitchT = clamp(this.pitchT + dy * 0.003, -0.6, 0.8); }
    });
    const up = (e) => {
      if (!down) return;
      const tx = e.clientX - down.sx, ty = e.clientY - down.sy, dt = performance.now() - down.t;
      if (Math.hypot(tx, ty) < 8 && dt < 600) this.tap(e);
      else if (down.touch && this.mode === 'tour' && down.axis === 'v' && Math.abs(ty) > 40) this.go(this.index + (ty < 0 ? 1 : -1));
      down = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { down = null; });
    let acc = 0, cool = 0;
    addEventListener('wheel', (e) => {
      if (e.target.closest?.('.sheet, .tod')) return;
      if (this.mode === 'orbit') { this.orbit.distT = clamp(this.orbit.distT * Math.exp(e.deltaY * 0.001), 8, 40); return; }
      if (this.mode !== 'tour') return;
      const now = performance.now();
      if (now < cool) return;
      acc += e.deltaY;
      if (Math.abs(acc) > 55) { this.go(this.index + Math.sign(acc)); acc = 0; cool = now + 700; }
    }, { passive: true });
    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, textarea, .sheet')) return;
      const k = e.key.toLowerCase();
      if (['arrowdown', 'pagedown', ' '].includes(k) && this.mode === 'tour') { e.preventDefault(); this.go(this.index + 1); return; }
      if (['arrowup', 'pageup'].includes(k) && this.mode === 'tour') { e.preventDefault(); this.go(this.index - 1); return; }
      if (['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'shift'].includes(k) || (this.mode === 'walk' && ['arrowup', 'arrowdown'].includes(k))) {
        if (['w', 'a', 's', 'd'].includes(k) && this.mode === 'tour') this.onWalkKey?.();
        this.keys.add(k);
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  pick(e) {
    if (!this.world?.taps?.length) return null;
    const r = this.host.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects(this.world.taps, true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o && !o.userData.tap) o = o.parent;
    return o ? { target: o, point: hit.point, hit } : null;
  }

  hover(e) {
    if (coarse) return;
    this.host.classList.toggle('can-tap', !!this.pick(e));
  }

  tap(e) {
    const p = this.pick(e);
    if (p) this.onTap?.(p.target.userData.tap, p);
  }

  // ---------- Frame ----------
  govern(ms) {
    this.ft += (ms - this.ft) * 0.05;
    if (++this.ftN < 90) return;
    this.ftN = 0;
    const next = this.ft > 22 ? Math.max(0.7, this.dpr - 0.15) : this.ft < 12 ? Math.min(this.dprMax, this.dpr + 0.1) : this.dpr;
    if (Math.abs(next - this.dpr) > 0.01) { this.dpr = next; this.renderer.setPixelRatio(next); this.resize(); }
  }

  frame(now) {
    requestAnimationFrame((n) => this.frame(n));
    if (this.paused || !this.world) return;
    const real = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (real > 0 && real < 0.1) this.govern(real * 1000);
    const dt = real;
    this.t += reduceMotion ? 0 : dt;
    if (this.trip) { this.runTrip(dt); return; }
    const cam = this.camera, w = this.world;

    if (this.mode === 'tour') {
      if (this.move) {
        const m = this.move;
        m.t = Math.min(1, m.t + dt / m.dur);
        const k = ease(m.t);
        cam.position.lerpVectors(m.from, m.to, k); cam.position.y += Math.sin(Math.PI * k) * m.lift;
        this.look.lerpVectors(m.fromLook, m.toLook, ease(Math.min(1, m.t * 1.15)));
        if (m.t >= 1) this.move = null;
      } else {
        // Idle: a slow breath of movement so the world never looks frozen
        const p = this.pose(this.order[this.index]);
        cam.position.lerp(this.tmp.copy(p.cam).add(this.tmp2.set(0, Math.sin(this.t * 0.5) * 0.05, 0)), damp(2, dt));
        this.look.lerp(p.look, damp(2, dt));
      }
      this.yaw += (this.yawT - this.yaw) * damp(10, dt); this.pitch += (this.pitchT - this.pitch) * damp(10, dt);
      const dir = this.tmp.copy(this.look).sub(cam.position);
      this.sph.setFromVector3(dir); this.sph.theta -= this.yaw; this.sph.phi = clamp(this.sph.phi - this.pitch, 0.1, Math.PI - 0.1);
      cam.lookAt(this.tmp2.setFromSpherical(this.sph).add(cam.position));
    } else if (this.mode === 'walk') {
      const fwd = (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) - (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) + -this.stick.y;
      const side = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0) + this.stick.x;
      const speed = (this.keys.has('shift') ? 16 : 8) * dt;
      const sy = Math.sin(this.walkYaw), cy = Math.cos(this.walkYaw);
      cam.position.x += (sy * fwd - cy * side) * speed;
      cam.position.z += (cy * fwd + sy * side) * speed;
      const b = w.bounds;
      if (b) { cam.position.x = clamp(cam.position.x, b.minX, b.maxX); cam.position.z = clamp(cam.position.z, b.minZ, b.maxZ); }
      const gy = w.ground(cam.position.x, cam.position.z) + 1.7;
      cam.position.y += (gy - cam.position.y) * damp(10, dt);
      this.tmp.set(Math.sin(this.walkYaw) * Math.cos(this.walkPitch), Math.sin(this.walkPitch), Math.cos(this.walkYaw) * Math.cos(this.walkPitch));
      cam.lookAt(this.tmp2.copy(cam.position).add(this.tmp));
    } else if (this.mode === 'orbit') {
      const o = this.orbit;
      o.theta += (o.thetaT - o.theta) * damp(6, dt); o.phi += (o.phiT - o.phi) * damp(6, dt); o.dist += (o.distT - o.dist) * damp(3, dt);
      if (!reduceMotion) o.thetaT += dt * 0.03;
      cam.position.setFromSphericalCoords(o.dist, o.phi, o.theta);
      cam.lookAt(0, 0, 0);
    } else if (this.mode === 'ride') {
      const r = this.rideState;
      r.t += dt / r.dur;
      if (r.t >= 1) { this.stopRide(); }
      else {
        r.curve.getPointAt(r.t, cam.position); cam.position.y += 1.4;
        r.curve.getPointAt(Math.min(0.9999, r.t + 0.012), this.tmp); this.tmp.y += 1.2;
        cam.lookAt(this.tmp);
      }
    }

    w.update?.(this.t, dt, this);
    this.updateTags();
    this.onFrame?.(this.t, dt);
    this.renderer.render(w.scene, cam);
  }
}

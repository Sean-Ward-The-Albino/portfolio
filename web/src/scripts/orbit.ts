// The Avlory orbit: the logo's two circles become a glowing core, and each product orbits it at its real status.
// Drag to turn it, hover a planet to light it up, click to jump to that product. three.js is loaded only here,
// only when the scene is on screen, and the static SVG underneath stays for reduced motion or no WebGL.
import {
  AdditiveBlending, AmbientLight, BufferGeometry, CanvasTexture, Color, EllipseCurve, Float32BufferAttribute, Group,
  Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PointLight, Points,
  PointsMaterial, Raycaster, Scene, SphereGeometry, Sprite, SpriteMaterial, Vector2, Vector3, WebGLRenderer,
} from 'three';

export interface OrbitProduct { slug: string; name: string; color: string; status: 'live' | 'building' | 'soon' }

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

export function startOrbit(host: HTMLElement, products: OrbitProduct[]) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reading === 'on') return;
  const canvas = document.createElement('canvas');
  canvas.className = 'orbit-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true });
  } catch {
    return;
  }
  // On a software renderer the scene would run on the CPU and block the page; the static SVG stays instead.
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  if (info && /swiftshader|llvmpipe|software|basic render/i.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)))) {
    renderer.dispose();
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  host.append(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 2.2, 11);
  camera.lookAt(0, 0, 0);
  const glow = glowTexture();

  // The core: Sean's magenta and Avlory blue, overlapping like the logo.
  const world = new Group();
  world.rotation.x = 0.38;
  scene.add(world);
  const core = new Group();
  world.add(core);
  const coreParts: [string, number][] = [['#fd00de', -0.42], ['#2f71fd', 0.42]];
  for (const [color, x] of coreParts) {
    const sphere = new Mesh(new SphereGeometry(0.62, 64, 64), new MeshBasicMaterial({ color, transparent: true, opacity: 0.92 }));
    sphere.position.x = x * 0.8;
    core.add(sphere);
    const halo = new Sprite(new SpriteMaterial({ map: glow, color, blending: AdditiveBlending, transparent: true, opacity: 0.7, depthWrite: false }));
    halo.scale.setScalar(3.2);
    halo.position.x = x * 0.8;
    core.add(halo);
    // The core lights the planets in its two colors, so each one shades magenta on one side and blue on the other.
    const light = new PointLight(color, 40, 0, 1.6);
    light.position.x = x * 2;
    core.add(light);
  }
  scene.add(new AmbientLight('#ffffff', 0.35));

  // Rings and planets.
  const planets: { mesh: Mesh; halo: Sprite; radius: number; speed: number; angle: number; tilt: number; p: OrbitProduct; label: HTMLAnchorElement }[] = [];
  const labels = document.createElement('div');
  labels.className = 'orbit-labels';
  host.append(labels);
  products.forEach((p, i) => {
    const radius = 2.1 + i * 0.72;
    const tilt = (i % 2 ? 1 : -1) * (0.06 + i * 0.03);
    const ringPoints = new EllipseCurve(0, 0, radius, radius).getPoints(160).map((v) => new Vector3(v.x, 0, v.y));
    const ring = new Line(new BufferGeometry().setFromPoints(ringPoints), new LineBasicMaterial({ color: p.color, transparent: true, opacity: p.status === 'soon' ? 0.14 : 0.28 }));
    ring.rotation.z = tilt;
    world.add(ring);

    const size = p.status === 'live' ? 0.2 : p.status === 'building' ? 0.17 : 0.13;
    const mesh = new Mesh(new SphereGeometry(size, 48, 48), new MeshStandardMaterial({
      color: p.color, roughness: 0.35, metalness: 0.15, emissive: p.color, emissiveIntensity: p.status === 'live' ? 0.35 : 0.15,
      wireframe: p.status === 'soon',
    }));
    const halo = new Sprite(new SpriteMaterial({ map: glow, color: p.color, blending: AdditiveBlending, transparent: true, opacity: p.status === 'soon' ? 0.25 : 0.55, depthWrite: false }));
    halo.scale.setScalar(size * 6);
    world.add(mesh, halo);

    const label = document.createElement('a');
    label.href = `#${p.slug}`;
    label.className = 'orbit-label ui';
    label.tabIndex = -1;
    label.textContent = p.name;
    label.dataset.status = p.status;
    labels.append(label);
    planets.push({ mesh, halo, radius, speed: 0.16 / Math.sqrt(radius), angle: i * 1.9, tilt, p, label });
  });

  // A field of stars, mostly white with a little magenta.
  const starCount = 900;
  const positions: number[] = [], colors: number[] = [];
  const white = new Color('#f6eaf2'), magenta = new Color('#ff74ea');
  for (let i = 0; i < starCount; i++) {
    const r = 18 + Math.random() * 22, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    positions.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
    const c = Math.random() < 0.18 ? magenta : white;
    colors.push(c.r, c.g, c.b);
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  starGeo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const stars = new Points(starGeo, new PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
  scene.add(stars);

  // Interaction: drag turns the system, the pointer tilts it, hovering a planet lights it.
  const raycaster = new Raycaster();
  const pointer = new Vector2(10, 10);
  let dragging = false, lastX = 0, spin = 0, spinVelocity = 0, tiltX = 0, tiltY = 0, hovered: (typeof planets)[number] | null = null;
  host.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; host.setPointerCapture(e.pointerId); });
  host.addEventListener('pointerup', (e) => {
    dragging = false;
    host.releasePointerCapture(e.pointerId);
    if (hovered && Math.abs(spinVelocity) < 0.002) location.hash = hovered.p.slug;
  });
  host.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    tiltX = pointer.y * 0.12;
    tiltY = pointer.x * 0.2;
    if (dragging) { spinVelocity = (e.clientX - lastX) * 0.004; lastX = e.clientX; }
  }, { passive: true });
  host.addEventListener('pointerleave', () => { pointer.set(10, 10); tiltX = tiltY = 0; });

  let w = 0, h = 0, baseTilt = 0.38;
  const resize = () => {
    w = host.clientWidth;
    h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Back the camera off just far enough that the outermost orbit fits the width, and tilt the system toward
    // the viewer on tall screens so the rings fill the height instead of flattening into a line.
    const aspect = w / h;
    const outer = 2.1 + (planets.length - 1) * 0.72 + 0.6;
    camera.position.z = Math.max(11, outer / (Math.tan((camera.fov * Math.PI) / 360) * aspect));
    baseTilt = aspect < 0.9 ? 0.95 : 0.38;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host);
  resize();

  const v = new Vector3();
  let raf = 0, last = performance.now(), t = 0;
  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;
    if (!dragging) spinVelocity *= 0.95;
    spin += spinVelocity + dt * 0.04;
    world.rotation.y = spin + tiltY;
    world.rotation.x = baseTilt + tiltX;
    core.scale.setScalar(1 + Math.sin(t * 1.4) * 0.03);
    stars.rotation.y = t * 0.004;

    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(planets.map((p) => p.mesh))[0];
    hovered = planets.find((p) => p.mesh === hit?.object) ?? null;
    host.style.cursor = hovered ? 'pointer' : dragging ? 'grabbing' : 'grab';

    for (const pl of planets) {
      pl.angle += pl.speed * dt;
      const x = Math.cos(pl.angle) * pl.radius, z = Math.sin(pl.angle) * pl.radius;
      pl.mesh.position.set(x * Math.cos(pl.tilt), x * Math.sin(pl.tilt), z);
      pl.halo.position.copy(pl.mesh.position);
      const target = pl === hovered ? 1.6 : 1;
      pl.mesh.scale.setScalar(pl.mesh.scale.x + (target - pl.mesh.scale.x) * 0.15);
      // Labels follow their planet in screen space and fade when it passes behind the core.
      v.copy(pl.mesh.position);
      world.localToWorld(v);
      const behind = v.z < -0.5;
      v.project(camera);
      const sx = ((v.x + 1) / 2) * w;
      pl.label.style.transform = `translate(${sx}px, ${((1 - v.y) / 2) * h}px)`;
      pl.label.classList.toggle('is-left', sx > w - 150);
      pl.label.style.opacity = behind ? '0.35' : '1';
      pl.label.classList.toggle('is-hovered', pl === hovered);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  let visible = true;
  const play = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? play() : stop(); }).observe(host);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : play()));
  play();
  host.classList.add('is-live');
}

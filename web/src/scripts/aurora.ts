// The magenta aurora behind the home page hero. WebGPU where the browser has it, WebGL2 otherwise, and the CSS
// gradient underneath when neither runs or motion is reduced. Hand-written shaders, no libraries.
// Renders at reduced resolution (it's soft light, so nobody can tell), pauses off screen and in background tabs.

let renderScale = 0.5;
const MAX_DPR = 1.5;

const GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes; uniform vec2 uPointer; uniform vec3 uInk; uniform float uTime; uniform float uLight;
out vec4 o;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec2(1.7, 9.2); a *= 0.5; } return v; }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  // Portrait screens: frame by the width and lift the curtains above the text.
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  if (uRes.x < uRes.y) p.y = p.y * 0.5 - 0.15;
  float t = uTime * 0.05;
  vec2 q = vec2(fbm(p * 1.6 + t), fbm(p * 1.6 - t + 3.1));
  float n = fbm(p * 1.2 + q * 1.8 + vec2(t * 0.6, -t * 0.3));
  float bx = uRes.x < uRes.y ? p.x * 2.4 : p.x;
  float band = sin((bx * 1.4 + n * 1.6 + t * 2.0) * 3.0) * 0.5 + 0.5;
  float shape = smoothstep(0.5, 1.0, band);
  float vertical = smoothstep(-0.55, 0.25, p.y + n * 0.5) * (1.0 - smoothstep(0.15, 0.95, p.y + 0.1 - n * 0.3));
  float rays = noise(vec2(bx * 22.0 + n * 6.0, p.y * 0.8 - t * 2.0));
  vec3 magenta = vec3(0.99, 0.0, 0.87), violet = vec3(0.51, 0.0, 0.65), blue = vec3(0.18, 0.44, 0.99);
  vec3 col = mix(violet, magenta, smoothstep(0.35, 0.75, n));
  col = mix(col, blue, smoothstep(0.55, 0.95, q.x) * 0.7);
  float glow = shape * vertical * (0.3 + 0.9 * rays) * (0.6 + 0.6 * n);
  glow *= max(0.35 + 0.65 * smoothstep(-0.25, 0.35, p.x), smoothstep(0.5, 0.85, uv.y));
  glow = min(glow, 0.9);
  vec2 pp = (uPointer * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);
  if (uRes.x < uRes.y) pp.y = pp.y * 0.5 - 0.15;
  float d = length(p - pp);
  glow += 0.35 * exp(-d * d * 9.0) * uLight;
  vec3 c = mix(uInk, col, clamp(glow * 0.8, 0.0, 1.0));
  c += col * pow(max(glow - 0.5, 0.0), 2.0) * 1.2;
  c = mix(uInk, c, smoothstep(0.0, 0.4, uv.y));
  c += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

const WGSL = /* wgsl */ `
struct U { res: vec2f, pointer: vec2f, ink: vec3f, time: f32, light: f32 };
@group(0) @binding(0) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
}
fn hash(p0: vec2f) -> f32 { var p = fract(p0 * vec2f(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
fn noise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1, 0)), w.x), mix(hash(i + vec2f(0, 1)), hash(i + vec2f(1, 1)), w.x), w.y);
}
fn fbm(p0: vec2f) -> f32 {
  var v = 0.0; var a = 0.5; var p = p0;
  for (var i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec2f(1.7, 9.2); a *= 0.5; }
  return v;
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let frag = vec2f(pos.x, u.res.y - pos.y);
  let uv = frag / u.res;
  var p = (frag - 0.5 * u.res) / min(u.res.x, u.res.y);
  if (u.res.x < u.res.y) { p.y = p.y * 0.5 - 0.15; }
  let t = u.time * 0.05;
  let q = vec2f(fbm(p * 1.6 + t), fbm(p * 1.6 - t + 3.1));
  let n = fbm(p * 1.2 + q * 1.8 + vec2f(t * 0.6, -t * 0.3));
  let bx = select(p.x, p.x * 2.4, u.res.x < u.res.y);
  var band = sin((bx * 1.4 + n * 1.6 + t * 2.0) * 3.0) * 0.5 + 0.5;
  var shape = smoothstep(0.5, 1.0, band);
  var vertical = smoothstep(-0.55, 0.25, p.y + n * 0.5) * (1.0 - smoothstep(0.15, 0.95, p.y + 0.1 - n * 0.3));
  var rays = noise(vec2f(bx * 22.0 + n * 6.0, p.y * 0.8 - t * 2.0));
  let magenta = vec3f(0.99, 0.0, 0.87); let violet = vec3f(0.51, 0.0, 0.65); let blue = vec3f(0.18, 0.44, 0.99);
  var col = mix(violet, magenta, smoothstep(0.35, 0.75, n));
  col = mix(col, blue, smoothstep(0.55, 0.95, q.x) * 0.7);
  var glow = shape * vertical * (0.3 + 0.9 * rays) * (0.6 + 0.6 * n);
  glow *= max(0.35 + 0.65 * smoothstep(-0.25, 0.35, p.x), smoothstep(0.5, 0.85, uv.y));
  glow = min(glow, 0.9);
  var pp = (u.pointer * u.res - 0.5 * u.res) / min(u.res.x, u.res.y);
  if (u.res.x < u.res.y) { pp.y = pp.y * 0.5 - 0.15; }
  let d = length(p - pp);
  glow += 0.35 * exp(-d * d * 9.0) * u.light;
  var c = mix(u.ink, col, clamp(glow * 0.8, 0.0, 1.0));
  c += col * pow(max(glow - 0.5, 0.0), 2.0) * 1.2;
  c = mix(u.ink, c, smoothstep(0.0, 0.4, uv.y));
  c += (hash(frag + u.time) - 0.5) / 255.0;
  return vec4f(c, 1.0);
}`;

interface Renderer { frame(res: [number, number], pointer: [number, number], ink: [number, number, number], time: number, light: number): void }

async function webgpu(canvas: HTMLCanvasElement): Promise<Renderer | null> {
  const gpu = (navigator as Navigator & { gpu?: any }).gpu;
  if (!gpu) return null;
  const adapter = await gpu.requestAdapter({ powerPreference: 'low-power' });
  if (!adapter || adapter.info?.isFallbackAdapter || adapter.isFallbackAdapter || /swiftshader/i.test(adapter.info?.vendor + adapter.info?.architecture)) return null;
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext('webgpu') as any;
  if (!ctx) return null;
  const format = gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });
  const module = device.createShaderModule({ code: WGSL });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const buffer = device.createBuffer({ size: 48, usage: 64 /* UNIFORM */ | 8 /* COPY_DST */ });
  const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer } }] });
  const data = new Float32Array(12);
  device.lost.then(() => canvas.dispatchEvent(new Event('gpu-lost')));
  device.pushErrorScope('validation');
  const write = (res: [number, number], pointer: [number, number], ink: [number, number, number], time: number, light: number) => {
    data.set([res[0], res[1], pointer[0], pointer[1], ink[0], ink[1], ink[2], time, light]);
    device.queue.writeBuffer(buffer, 0, data);
  };
  write([1, 1], [0, 0], [0, 0, 0], 0, 0);
  if (await device.popErrorScope()) { device.destroy(); return null; }
  return {
    frame(res, pointer, ink, time, light) {
      write(res, pointer, ink, time, light);
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.draw(3);
      pass.end();
      device.queue.submit([enc.finish()]);
    },
  };
}

function webgl2(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true });
  if (!gl) return null;
  // A software renderer would draw this on the CPU and block the page; the CSS gradient is better there.
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return null;
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}');
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, GLSL);
  gl.compileShader(fs);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const loc = (n: string) => gl.getUniformLocation(prog, n);
  const [uRes, uPointer, uInk, uTime, uLight] = ['uRes', 'uPointer', 'uInk', 'uTime', 'uLight'].map(loc);
  return {
    frame(res, pointer, ink, time, light) {
      gl.viewport(0, 0, res[0], res[1]);
      gl.uniform2f(uRes, res[0], res[1]);
      gl.uniform2f(uPointer, pointer[0], pointer[1]);
      gl.uniform3f(uInk, ink[0], ink[1], ink[2]);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uLight, light);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

function inkColor(): [number, number, number] {
  const hex = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0.047, 0.016, 0.063];
}

export async function startAurora(canvas: HTMLCanvasElement) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  if (reduce.matches || root.dataset.reading === 'on') return;

  let renderer: Renderer | null = null;
  try { renderer = await webgpu(canvas); } catch { renderer = null; }
  if (renderer) canvas.dataset.engine = 'webgpu';
  else {
    // A canvas that has a WebGPU context can't switch to WebGL, so start fresh.
    const fresh = canvas.cloneNode() as HTMLCanvasElement;
    canvas.replaceWith(fresh);
    canvas = fresh;
    renderer = webgl2(canvas);
    if (!renderer) return;
    canvas.dataset.engine = 'webgl2';
  }

  let w = 0, h = 0, ink = inkColor();
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, MAX_DPR) * renderScale;
    w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    canvas.width = w;
    canvas.height = h;
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  new MutationObserver(() => { ink = inkColor(); if (root.dataset.reading === 'on') stop(); }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-reading'] });

  // The pointer light eases toward the cursor and fades out when it leaves.
  const target = [0.7, 0.6], pointer = [0.7, 0.6];
  let light = 0, lightTarget = 0;
  canvas.parentElement!.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    target[0] = (e.clientX - r.left) / r.width;
    target[1] = 1 - (e.clientY - r.top) / r.height;
    lightTarget = 1;
  }, { passive: true });
  canvas.parentElement!.addEventListener('pointerleave', () => { lightTarget = 0; });

  let visible = true, raf = 0, last = performance.now(), time = (Date.now() / 1000) % 1000;
  // If frames run slow, drop the resolution; if they're still slow, stop and leave the CSS gradient.
  let slowFrames = 0, sampled = 0;
  const govern = (ms: number) => {
    if (sampled++ < 10) return; // skip warm-up frames
    slowFrames = ms > 28 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames < 20) return;
    slowFrames = 0;
    if (renderScale > 0.26) { renderScale /= 2; resize(); }
    else { stop(); canvas.classList.remove('is-live'); stopped = true; }
  };
  let stopped = false;
  const loop = (now: number) => {
    govern(now - last);
    if (stopped) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;
    pointer[0] += (target[0] - pointer[0]) * 0.06;
    pointer[1] += (target[1] - pointer[1]) * 0.06;
    light += (lightTarget - light) * 0.04;
    renderer!.frame([w, h], [pointer[0], pointer[1]], ink, time, light);
    raf = requestAnimationFrame(loop);
  };
  const play = () => { if (!stopped && !raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? play() : stop(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : play()));
  reduce.addEventListener('change', () => (reduce.matches ? stop() : play()));
  canvas.addEventListener('gpu-lost', () => { stop(); canvas.classList.remove('is-live'); });
  play();
  canvas.classList.add('is-live');
}

// Two of Sean's recipes you can actually make: the Spanish latte in a Greca, and the reverse-sear steak judged
// by touch. Totals across all visitors are kept by the Java server.
import { api, local } from './api.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Press-and-hold helper: calls onTick(progress 0..1) while held, onDone when full
function holdButton(btn, seconds, onTick, onDone) {
  let start = null, raf = null, got = 0;
  const tick = (t) => {
    if (start == null) return;
    const p = clamp(got + (t - start) / 1000 / seconds, 0, 1);
    onTick(p);
    if (p >= 1) { start = null; onDone(); return; }
    raf = requestAnimationFrame(tick);
  };
  const down = (e) => { e.preventDefault(); if (start != null) return; start = performance.now(); raf = requestAnimationFrame(tick); btn.classList.add('holding'); };
  const up = () => { if (start == null) return; got = clamp(got + (performance.now() - start) / 1000 / seconds, 0, 1); start = null; cancelAnimationFrame(raf); btn.classList.remove('holding'); };
  btn.addEventListener('pointerdown', down);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, up));
  // Keyboard: hold Space or Enter
  btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) down(e); });
  btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') up(); });
}

// ---------------- Spanish latte ----------------
export function brewLatte({ openSheet, hint, world }) {
  const host = openSheet(`<p class="k">Coffee</p><h2 id="sheetTitle">Make my Spanish latte</h2>
    <div class="latte"><div class="glass" id="glass" aria-hidden="true"><i class="layer milk"></i><i class="layer coffee"></i><i class="layer foam"></i><i class="salt"></i></div>
    <div class="steps"><p class="stepn" id="stepN"></p><p id="stepT" class="lede"></p><div id="stepUI" class="stepui"></div></div></div>
    <p class="note" id="latteFoot"></p>`);
  const $ = (id) => host.querySelector('#' + id);
  const glass = $('glass'), layer = (n) => glass.querySelector('.' + n);
  const set = (n, h, color) => { const el = layer(n); el.style.height = h + '%'; if (color) el.style.background = color; };
  let grind = 'fine', vanilla = true, spices = new Set();

  const steps = [
    { t: 'Put a little sweetened condensed milk in the glass.', ui: '<button class="btn" data-go>Pour it in</button>', go: () => set('milk', 18, '#f2e6cf') },
    { t: 'Sprinkle salt on top, and let it sit.', ui: '<button class="btn" data-go>Add a pinch of salt</button>', go: () => glass.querySelector('.salt').classList.add('on') },
    { t: 'Fill the Greca with espresso. How fine is the grind?', ui: '<div class="row2"><button class="btn" data-grind="fine">Fine, like I like it</button><button class="btn ghostbtn" data-grind="coarse">Coarse</button></div>' },
    { t: 'At the top, where the coffee comes out: cinnamon, a dash of brown sugar, a pinch of nutmeg.', ui: '<div class="chips"><button class="chip" data-sp="cinnamon">Cinnamon</button><button class="chip" data-sp="brown sugar">Brown sugar</button><button class="chip" data-sp="nutmeg">Nutmeg</button></div><button class="btn" data-go>Done</button>' },
    { t: 'Brew it slowly. Hold to keep it on low heat.', ui: '<button class="btn hold" id="brewBtn"><span>Hold to brew</span><i class="fill"></i></button>' },
    { t: 'Pour it over the condensed milk and froth until it’s all mixed in. Tap fast.', ui: '<button class="btn" id="frothBtn">Froth</button><div class="meter"><i id="frothFill"></i></div>' },
    { t: 'Froth milk in a separate cup for the foam. Vanilla? I skip it when I don’t want it too sweet.', ui: '<div class="row2"><button class="btn" data-van="1">With vanilla</button><button class="btn ghostbtn" data-van="0">No vanilla</button></div>' },
  ];
  let i = 0;
  const show = () => {
    const s = steps[i];
    $('stepN').textContent = `Step ${i + 1} of ${steps.length}`;
    $('stepT').textContent = s.t;
    $('stepUI').innerHTML = s.ui;
    const ui = $('stepUI');
    ui.querySelector('[data-go]')?.addEventListener('click', () => { s.go?.(); next(); });
    ui.querySelectorAll('[data-grind]').forEach((b) => b.addEventListener('click', () => { grind = b.dataset.grind; next(); }));
    ui.querySelectorAll('[data-sp]').forEach((b) => b.addEventListener('click', () => { b.classList.toggle('on'); b.setAttribute('aria-pressed', String(b.classList.contains('on'))); spices.has(b.dataset.sp) ? spices.delete(b.dataset.sp) : spices.add(b.dataset.sp); }));
    ui.querySelectorAll('[data-van]').forEach((b) => b.addEventListener('click', () => { vanilla = b.dataset.van === '1'; set('foam', 16, vanilla ? '#fbf3e4' : '#ffffff'); finish(); }));
    const brew = ui.querySelector('#brewBtn');
    if (brew) {
      if (world) world.brewing = true;
      holdButton(brew, 3.2, (p) => { brew.querySelector('.fill').style.width = p * 100 + '%'; set('coffee', 44 * p, grind === 'fine' ? '#5a3826' : '#7a5a44'); },
        () => { if (world) world.brewing = false; next(); });
    }
    const froth = ui.querySelector('#frothBtn');
    if (froth) {
      let m = 0;
      froth.addEventListener('click', () => {
        m = Math.min(1, m + 0.14); $('frothFill').style.width = m * 100 + '%';
        // The layers blend as you froth
        const mix = `color-mix(in srgb, #5a3826 ${Math.round(100 - m * 45)}%, #f2e6cf)`;
        set('milk', 18 * (1 - m), '#f2e6cf'); set('coffee', 44 + 18 * m, mix);
        if (m >= 1) next();
      });
    }
  };
  const next = () => { i++; if (i < steps.length) show(); };
  const finish = async () => {
    $('stepN').textContent = 'Done';
    const notes = [];
    if (grind === 'coarse') notes.push('A little weak from the coarse grind, but still good.');
    if (spices.size < 3) notes.push(`Next time try all three spices${spices.size ? '' : ' at the top'}.`);
    $('stepT').textContent = `Your Spanish latte${vanilla ? '' : ', not too sweet'}. ${notes.join(' ')}`;
    $('stepUI').innerHTML = '<button class="btn ghostbtn" data-again>Make another</button>';
    $('stepUI').querySelector('[data-again]').addEventListener('click', () => brewLatte({ openSheet, hint, world }));
    local.set('lattes', (local.get('lattes', 0) || 0) + 1);
    try { const { count } = await api.count('latte'); $('latteFoot').textContent = `${count} Spanish latte${count === 1 ? '' : 's'} made on this site so far.`; } catch { /* offline */ }
    hint('Latte made.');
  };
  show();
}

// ---------------- Reverse-sear steak ----------------
const CUTS = {
  strip: { name: '1-inch New York strip', rate: 1.0 },
  filet: { name: 'Filet', rate: 0.85 },
  ribeye: { name: 'Ribeye', rate: 0.92 },
};
// How it feels at a given internal temperature, by touch the way Sean judges it
function feel(t) {
  if (t < 95) return 'Soft and cold. Not even close.';
  if (t < 108) return 'Still very soft. Give it time.';
  if (t < 115) return 'Starting to firm up at the edges. Almost.';
  if (t <= 121) return 'Gives a little and springs back slowly. Feels right.';
  if (t <= 128) return 'Firmer, springs back fast. You might be past it.';
  return 'Firm. This is going to be medium or worse.';
}

export function cookSteak({ openSheet, hint }) {
  const host = openSheet(`<p class="k">Cooking</p><h2 id="sheetTitle">Reverse-sear a steak</h2>
    <p>Pull it out when it feels right. No thermometer, just touch.</p>
    <canvas id="steakCv" width="320" height="200" class="steakcv" aria-hidden="true"></canvas>
    <p class="stepn" id="sN"></p><p class="lede" id="sT"></p><div id="sUI" class="stepui"></div><p class="note" id="sFoot"></p>`);
  const $ = (id) => host.querySelector('#' + id);
  const cv = $('steakCv'), g = cv.getContext('2d');
  let cut = CUTS.strip, temp = 40, crust = 0, rendered = false, basted = false, rested = 0, timer = null;

  // A cross-section: crust on the outside, then a grey band, then the pink centre
  const drawSteak = (done = false) => {
    g.clearRect(0, 0, 320, 200);
    const cx = 160, cy = 100;
    g.fillStyle = crust > 0.1 ? `rgb(${120 - crust * 60}, ${70 - crust * 40}, ${40 - crust * 20})` : '#b9606a';
    g.beginPath(); g.ellipse(cx, cy, 140, 70, 0, 0, Math.PI * 2); g.fill();
    if (done) {
      const band = clamp((temp - 125) / 25, 0.05, 0.9);
      g.fillStyle = '#9a7a6a'; g.beginPath(); g.ellipse(cx, cy, 132, 62, 0, 0, Math.PI * 2); g.fill();
      const pink = temp < 122 ? '#c4384a' : temp < 138 ? '#d4606a' : temp < 146 ? '#c98a84' : '#a08070';
      g.fillStyle = pink; g.beginPath(); g.ellipse(cx, cy, 132 * (1 - band), 62 * (1 - band * 0.8), 0, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.ellipse(cx - 30, cy - 20, 60, 18, -0.2, 0, Math.PI * 2); g.fill();
    }
    // The fat cap
    g.strokeStyle = rendered ? '#c89a5a' : '#f2e6d8'; g.lineWidth = 12; g.beginPath(); g.ellipse(cx, cy, 140, 70, 0, -2.6, -0.6); g.stroke();
  };

  const step = (n, text, ui) => { $('sN').textContent = n; $('sT').textContent = text; $('sUI').innerHTML = ui; };

  const chooseCut = () => {
    step('Step 1', 'Pick a cut. It’s brined, or marinated and patted dry.', Object.entries(CUTS).map(([k, c]) => `<button class="btn ${k === 'strip' ? '' : 'ghostbtn'}" data-cut="${k}">${c.name}</button>`).join(''));
    $('sUI').querySelectorAll('[data-cut]').forEach((b) => b.addEventListener('click', () => { cut = CUTS[b.dataset.cut]; oven(); }));
  };

  // In the oven at 225°F on a wire rack. One second here is about one minute in the kitchen.
  const oven = () => {
    let minutes = 0;
    step('Step 2', `${cut.name} in the oven at 225°F on a wire rack. Touch it to check; pull it when it feels right.`,
      '<p class="clock" id="clock">0 min</p><div class="row2"><button class="btn ghostbtn" id="touch">Touch it</button><button class="btn" id="pull">Pull it</button></div><p id="feel" class="feel" aria-live="polite"></p>');
    timer = setInterval(() => {
      minutes += 1;
      // Rises fast at first, then slows as it approaches the oven's temperature
      temp = 225 - (225 - 40) * Math.exp(-minutes * 0.0205 * cut.rate);
      $('clock').textContent = `${minutes} min`;
      if (minutes > 70) { clearInterval(timer); pull(true); }
    }, 1000);
    $('touch').addEventListener('click', () => { $('feel').textContent = feel(temp); });
    $('pull').addEventListener('click', () => pull(false));
    drawSteak();
  };

  const pull = (forgot) => {
    clearInterval(timer);
    if (forgot) $('sFoot').textContent = 'You forgot it in the oven. Extra-flavourful bark incoming.';
    step('Step 3', 'Cast iron on high with avocado oil, preheated. Render the fat cap first: hold it against the pan.', '<button class="btn hold" id="fat"><span>Hold to render the fat cap</span><i class="fill"></i></button>');
    holdButton($('fat'), 2.5, (p) => { $('fat').querySelector('.fill').style.width = p * 100 + '%'; }, () => { rendered = true; drawSteak(); sear(); });
  };

  const sear = () => {
    let sides = 0;
    step('Step 4', 'Sear about two minutes a side. Hold for each side.', '<button class="btn hold" id="sear"><span>Hold to sear side 1</span><i class="fill"></i></button><button class="btn ghostbtn" id="baste">Baste with butter (optional)</button>');
    const run = () => holdButton($('sear'), 2, (p) => { $('sear').querySelector('.fill').style.width = p * 100 + '%'; crust = Math.min(1, (sides + p) / 2); drawSteak(); }, () => {
      sides++; temp += 3.5;
      if (sides < 2) { const b = $('sear'); b.querySelector('span').textContent = 'Hold to sear side 2'; b.querySelector('.fill').style.width = '0'; const nb = b.cloneNode(true); b.replaceWith(nb); run(); }
      else rest();
    });
    run();
    $('baste').addEventListener('click', (e) => { basted = true; e.target.disabled = true; e.target.textContent = 'Basted'; });
  };

  const rest = () => {
    step('Step 5', 'Let it rest about eight minutes before cutting.', '<p class="clock" id="restClock">8:00</p><button class="btn ghostbtn" id="cut">Cut it now</button>');
    let left = 8;
    timer = setInterval(() => { left--; rested = 8 - left; temp += 0.9; $('restClock').textContent = `${left}:00`; if (left <= 0) { clearInterval(timer); done(); } }, 700);
    $('cut').addEventListener('click', () => { clearInterval(timer); done(); });
  };

  const done = async () => {
    const t = Math.round(temp);
    const result = t < 120 ? 'Medium raw. It happens.' : t < 128 ? 'Rare. Close.' : t <= 137 ? 'Medium rare. Perfect.' : t <= 145 ? 'Medium. Still good with chimichurri.' : 'Well done, with some extra-flavourful bark.';
    drawSteak(true);
    const notes = [];
    if (rested < 6) notes.push('Rest it longer next time so it keeps its juices.');
    if (basted) notes.push('The butter baste paid off.');
    step('Done', `${result} ${notes.join(' ')}`, '<button class="btn" id="again">Cook another</button>');
    $('again').addEventListener('click', () => cookSteak({ openSheet, hint }));
    $('sFoot').textContent = `It finished around ${t}°F inside. Top it with chimichurri.`;
    try {
      await api.count(t >= 128 && t <= 137 ? 'steak-medium-rare' : 'steak-other');
      const c = await api.counts();
      const mr = c['steak-medium-rare'] || 0, all = mr + (c['steak-other'] || 0);
      if (all) $('sFoot').textContent += ` Visitors have hit medium rare ${mr} out of ${all} times.`;
    } catch { /* offline */ }
  };

  drawSteak(); chooseCut();
  // Stop timers if the sheet closes
  return () => clearInterval(timer);
}

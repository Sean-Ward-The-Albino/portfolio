import * as THREE from 'three';
import { Engine, isPhone, coarse, reduceMotion } from './engine.js';
import { api, local } from './api.js';
import * as audio from './audio.js';
import { buildHome } from './worlds/home.js';
import fallback from '../../content/site.json';

// ---------- Setup ----------
const $ = (id) => document.getElementById(id);
// Home is in the first download; every other world loads the first time someone goes there
const BUILDERS = {
  home: async () => buildHome,
  story: () => import('./worlds/story.js').then((m) => m.buildStory),
  craft: () => import('./worlds/craft.js').then((m) => m.buildCraft),
  life: () => import('./worlds/life.js').then((m) => m.buildLife),
  game: () => import('./worlds/game.js').then((m) => { toLatLon = m.toLatLon; return m.buildGame; }),
};
let toLatLon = null;
const ORDER = ['home', 'story', 'craft', 'life', 'game'];
let content = fallback;
let worldId = null, world = null, stops = [];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// [Brackets] are lines Sean hasn't written yet: shown quietly, in italics
const rich = (s) => esc(s).replace(/\[([^\]]+)\]/g, '<span class="ph">[$1]</span>');

const sdHour = () => { try { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()); return +p.find((x) => x.type === 'hour').value + +p.find((x) => x.type === 'minute').value / 60; } catch { return 17; } };
let hour = Math.round(sdHour() * 4) / 4;

const engine = new Engine($('stage'), {
  onStop: (i) => showStop(i),
  onTap: (tap, hit) => onTap(tap, hit),
  onFrame: () => {},
});
engine.onWalkKey = () => setWalk(true);

// ---------- Worlds ----------
const THEME = {
  home: ['#140c12', '#21141d', '#f08fc4', '#1b0f15'], story: ['#1a100c', '#2a1a14', '#f2b57a', '#2a1406'],
  craft: ['#0e0c1c', '#1a1730', '#d6a6ff', '#1a0a2a'], life: ['#0b1411', '#14221d', '#7fd8b4', '#06231a'], game: ['#0c0b20', '#181636', '#a9a4ff', '#121040'],
};
function theme(id) { const [bg, surface, accent, ink] = THEME[id]; const s = document.documentElement.style; s.setProperty('--bg', bg); s.setProperty('--surface', surface); s.setProperty('--accent', accent); s.setProperty('--accent-ink', ink); }

async function enter(id, stopId = null, { instant = false } = {}) {
  if (!BUILDERS[id]) id = 'home';
  if (id === worldId) { if (stopId) goStop(stopId); return; }
  closeSheet(); audio.stop(); deck?.pause(); setWalk(false);
  if (id !== 'game') { leavePresence(); live?.close(); live = null; }
  const data = content.worlds[id];
  const veil = $('veil');
  if (!instant && !reduceMotion) { $('veilText').textContent = data.title; veil.classList.add('on'); await wait(520); }
  const build = await BUILDERS[id]();
  world = build({ hour });
  // Compile the world's shaders before it shows, so the first frames don't stutter
  await engine.renderer.compileAsync?.(world.scene, engine.camera).catch(() => {});
  worldId = id;
  stops = data.stops;
  theme(id);
  const order = stops.map((s) => s.id);
  // Pin each world's tags to the engine, wired to what they do
  world.tags = (world.tags || []).map((t) => ({ ...t, onClick: () => tagClick(t) }));
  const start = Math.max(0, order.indexOf(stopId));
  engine.setWorld(world, order, start);
  $('tod').hidden = id !== 'home';
  $('walk').hidden = !!world.orbit;
  document.querySelectorAll('[data-world]').forEach((b) => b.setAttribute('aria-current', b.dataset.world === id && b.closest('.dock') ? 'true' : 'false'));
  if (location.hash.slice(1) !== id) history.replaceState(null, '', id === 'home' ? location.pathname : '#' + id);
  if (id === 'home') { const s = local.get('sand'); if (s) world.writeSand?.(s); }
  if (id === 'game') loadGame();
  await wait(60);
  veil.classList.remove('on');
  local.set('seen:' + id, true);
  // While the visitor looks around, fetch the next world's code so travelling there is instant
  const nextId = ORDER[(ORDER.indexOf(id) + 1) % ORDER.length];
  (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => BUILDERS[nextId]().catch(() => {}));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function goStop(id) { const i = stops.findIndex((s) => s.id === id); if (i >= 0) engine.go(i); }

// ---------- The subtitle line ----------
const ACTION_LABEL = { vinyl: () => (audio.playing() || (deck && !deck.paused)) ? 'Stop the record' : 'Play the record', sand: () => 'Write in the sand', coaster: () => 'Ride it', feedback: () => 'Send a message',
  worlds: () => 'Pick a world', rate: () => 'Rate an album', budget: () => 'Try the numbers', chess: () => 'Solve it', lantern: () => 'Leave a lantern', records: () => 'Flip through', latte: () => 'Make it', steak: () => 'Cook it' };
function showStop(i) {
  const s = stops[i]; if (!s) return;
  const sub = $('sub');
  sub.classList.add('swap');
  setTimeout(() => {
    $('subText').innerHTML = rich(s.sub);
    const acts = [];
    if (s.action) acts.push(`<button class="act" type="button" data-act="${esc(s.action)}">${esc(ACTION_LABEL[s.action]?.() || 'Open')}</button>`);
    if (s.detail) acts.push(`<button class="act ${s.action ? 'ghost' : ''}" type="button" data-more="${esc(s.id)}">More</button>`);
    if (i === stops.length - 1 && !world.orbit) {
      const next = ORDER[(ORDER.indexOf(worldId) + 1) % ORDER.length];
      acts.push(`<button class="act ghost" type="button" data-goworld="${next}">${esc(content.worlds[next].title)} ›</button>`);
    }
    $('acts').innerHTML = acts.join('');
    $('prev').disabled = i === 0; $('next').disabled = i === stops.length - 1;
    sub.classList.remove('swap');
  }, reduceMotion ? 0 : 160);
  $('where').textContent = `${content.worlds[worldId].title} · ${content.worlds[worldId].kicker}`;
  $('dots').innerHTML = stops.map((st, k) => `<button type="button" data-stop="${k}" aria-label="${esc(st.sub)}" aria-current="${k === i}"></button>`).join('');
  if (i > 0) hint(null);
}
$('prev').addEventListener('click', () => engine.go(engine.index - 1));
$('next').addEventListener('click', () => engine.go(engine.index + 1));
$('dots').addEventListener('click', (e) => { const b = e.target.closest('[data-stop]'); if (b) engine.go(+b.dataset.stop); });
$('acts').addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'), m = e.target.closest('[data-more]'), w = e.target.closest('[data-goworld]');
  if (a) act(a.dataset.act); else if (m) more(m.dataset.more); else if (w) enter(w.dataset.goworld);
});
document.addEventListener('click', (e) => { const b = e.target.closest('[data-world]'); if (b && !b.closest('.sheet')) enter(b.dataset.world); });

function hint(text, ms = 4200) {
  const h = $('hint');
  if (!text) { h.classList.remove('show'); return; }
  h.textContent = text; h.classList.add('show');
  clearTimeout(hint.t); hint.t = setTimeout(() => h.classList.remove('show'), ms);
}

// ---------- Taps on things in the world ----------
function onTap(tap, hit) {
  if (tap.world) return enter(tap.world);
  if (tap.action === 'lanternAt') return lanternAt(hit.point);
  if (tap.action) return act(tap.action);
  if (tap.stop) { const s = stops.find((x) => x.id === tap.stop); if (s?.detail) more(s.id); else goStop(tap.stop); }
}
function tagClick(t) {
  if (t.world) return enter(t.world);
  if (t.action) return act(t.action);
  if (t.onStop) { goStop(t.onStop); const s = stops.find((x) => x.id === t.onStop); if (s?.detail) setTimeout(() => more(s.id), 600); }
}

// ---------- The sheet ----------
let lastFocus = null;
function openSheet(html) {
  lastFocus = document.activeElement;
  $('sheetBody').innerHTML = html;
  $('sheet').hidden = false;
  $('sheetBody').scrollTop = 0;
  setTimeout(() => $('sheetX').focus(), 30);
}
function closeSheet() { if ($('sheet').hidden) return; $('sheet').hidden = true; sheetClosed?.(); sheetClosed = null; lastFocus?.focus?.(); }
let sheetClosed = null;
$('sheetX').addEventListener('click', closeSheet);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
  if (e.key === 'Tab' && !$('sheet').hidden) {
    const f = [...$('sheet').querySelectorAll('button, a, input, textarea, [tabindex="0"]')].filter((x) => !x.disabled);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});
// Swipe the sheet down to close it on a phone
{ let y0 = null; $('sheet').addEventListener('touchstart', (e) => { if ($('sheetBody').scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  $('sheet').addEventListener('touchend', (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 90 && isPhone()) closeSheet(); y0 = null; }); }

function more(stopId) {
  const s = stops.find((x) => x.id === stopId); if (!s?.detail) return;
  const d = s.detail;
  let html = `<p class="k">${rich(d.kicker)}</p><h2 id="sheetTitle">${rich(d.title)}</h2>`;
  html += (d.body || []).map((p, k) => `<p class="${k === 0 ? 'lede' : ''}">${rich(p)}</p>`).join('');
  for (const r of d.recipes || []) {
    html += `<section class="recipe"><h3>${rich(r.title)}</h3>${r.intro ? `<p>${rich(r.intro)}</p>` : ''}${r.steps?.length ? `<ol>${r.steps.map((x) => `<li>${rich(x)}</li>`).join('')}</ol>` : ''}</section>`;
  }
  if (d.shots?.length) {
    html += `<div class="shots">${d.shots.map((n) => `<figure class="shot ${n.startsWith('next-') ? 'wide' : ''}"><img src="/img/${esc(n)}.webp" alt="${esc(d.title)} screen" loading="lazy"></figure>`).join('')}</div>`;
    if (d.preview) html += '<p class="note">Design previews from the app’s real colours and screens, not screenshots.</p>';
  }
  if (d.photos?.length) html += `<div class="photos">${d.photos.map((p) => p.src
    ? `<img class="pic" src="${esc(p.small || p.src)}" srcset="${esc(p.small || p.src)} 720w, ${esc(p.src)} 1800w" sizes="(max-width: 760px) 50vw, 220px" alt="${esc(p.label)}" loading="lazy">`
    : `<div class="photo">[Photo: ${esc(typeof p === 'string' ? p : p.label)}]</div>`).join('')}</div>`;
  if (stopId === 'music' && content.music?.tracks?.length) html += `<div class="tracks">${content.music.tracks.map((t) => `<div><p class="note">${esc(t.title)}</p><audio controls preload="none" src="${esc(t.src)}"></audio></div>`).join('')}</div>`;
  if (d.links?.length) html += `<div class="links">${d.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} <span aria-hidden="true">↗</span></a>`).join('')}</div>`;
  if (s.action) html += `<button class="btn" type="button" data-sheetact="${esc(s.action)}">${esc(ACTION_LABEL[s.action]?.() || 'Open')}</button>`;
  openSheet(html);
  $('sheetBody').querySelector('[data-sheetact]')?.addEventListener('click', (e) => act(e.target.dataset.sheetact));
}

// ---------- Things you can do ----------
function act(name) {
  ({ vinyl, sand, coaster, feedback, worlds: pickWorld, rate, budget, chess, lantern: lanternHelp, records, latte, steak }[name] || (() => {}))();
}

// The record player: Sean's own tracks once they're uploaded, a loop made in the browser until then
let deck = null, trackNo = 0;
function vinyl() {
  const tracks = content.music?.tracks || [];
  const playing = audio.playing() || (deck && !deck.paused);
  if (playing) { audio.stop(); deck?.pause(); if (world.vinyl) world.vinyl.playing = false; hint('Record stopped.'); }
  else if (tracks.length) {
    deck ||= new Audio(); const t = tracks[trackNo % tracks.length];
    deck.src = t.src; deck.play().catch(() => {}); deck.onended = () => { trackNo++; vinyl(); };
    if (world.vinyl) world.vinyl.playing = true; hint(`Playing “${t.title}”.`);
  } else { audio.play(); if (world.vinyl) world.vinyl.playing = true; hint('Playing. A loop made in your browser until my tracks are up.'); }
  showStop(engine.index);
}

function sand() {
  const current = local.get('sand', '');
  openSheet(`<p class="k">Mission Beach</p><h2 id="sheetTitle">Write in the sand</h2><p>Whatever you write stays in this browser. Nobody else sees it, and the tide doesn’t take it.</p>
    <form id="sandForm"><label for="sandIn">Your words</label><input id="sandIn" type="text" maxlength="24" value="${esc(current)}" autocomplete="off"><button class="btn" type="submit">Write it</button></form>`);
  $('sandForm').addEventListener('submit', (e) => {
    e.preventDefault(); const v = $('sandIn').value.trim().slice(0, 24);
    local.set('sand', v); world.writeSand?.(v); closeSheet(); hint(v ? 'Written in the sand.' : 'Wiped clean.');
  });
}

function coaster() {
  if (!world.coasterTrack) return;
  hint('Hold on. Tap anywhere to get off.', 3000);
  engine.ride(world.coasterTrack, reduceMotion ? 0.1 : 26, () => hint(null));
  const off = () => { engine.stopRide(); $('stage').removeEventListener('pointerdown', off); };
  setTimeout(() => $('stage').addEventListener('pointerdown', off, { once: true }), 300);
}

function feedback() {
  openSheet(`<p class="k">The lighthouse</p><h2 id="sheetTitle">Tell me anything</h2><p>It comes straight to me and never shows on the site.</p>
    <form id="fbForm"><label for="fbMsg">Your message</label><textarea id="fbMsg" rows="5" maxlength="2000" required></textarea>
    <label for="fbName">Your name (optional)</label><input id="fbName" type="text" maxlength="80" autocomplete="name">
    <input class="hp" id="fbWeb" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button class="btn" type="submit">Send</button><p id="fbNote" role="status"></p></form>`);
  $('fbForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
    try { await api.feedback($('fbMsg').value.trim(), $('fbName').value.trim(), $('fbWeb').value); $('fbNote').textContent = 'Sent. Watch the lighthouse.'; if (world) world.flash = 1.5; setTimeout(closeSheet, 1400); }
    catch (err) { $('fbNote').textContent = err.status === 429 ? 'That’s a lot of messages. Try again in a bit.' : 'Couldn’t send right now. Please try again.'; btn.disabled = false; }
  });
}

function pickWorld() {
  openSheet(`<p class="k">Look up</p><h2 id="sheetTitle">Where to?</h2><div class="links">${ORDER.filter((w) => w !== worldId).map((w) => `<button class="pick" type="button" data-world="${w}">${esc(content.worlds[w].title)} <small>${esc(content.worlds[w].kicker)}</small></button>`).join('')}</div>`);
  $('sheetBody').addEventListener('click', (e) => { const b = e.target.closest('[data-world]'); if (b) { closeSheet(); enter(b.dataset.world); } });
}

// Waverate, for real: find any album, rate it from 0.00 to 10.00, see what other visitors gave it
function rate() {
  const mine = local.get('ratings', {});
  openSheet(`<p class="k">Waverate</p><h2 id="sheetTitle">Rate it like Waverate</h2><p>Find any album and give it a score from 0.00 to 10.00. Your scores stay in this browser; the average comes from everyone who’s visited.</p>
    <form id="albumForm" role="search"><label for="albumQ">Album or artist</label><input id="albumQ" type="search" maxlength="80" autocomplete="off" placeholder="e.g. Channel Orange"><button class="btn" type="submit">Search</button></form>
    <div id="albumOut" class="albums" aria-live="polite"></div>`);
  const out = $('albumOut');
  const listMine = () => { const e = Object.values(mine); if (e.length) out.innerHTML = '<p class="note">Your ratings</p>' + e.slice(-5).reverse().map((a) => albumRow(a, `${a.score.toFixed(2)}`)).join(''); };
  listMine();
  $('albumForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const q = $('albumQ').value.trim(); if (q.length < 2) return;
    out.innerHTML = '<p class="note">Searching…</p>';
    try { const { albums } = await api.searchAlbums(q); out.innerHTML = albums.length ? albums.map((a) => albumRow(a, a.year)).join('') : '<p class="note">Nothing found. Try another name.</p>'; out._albums = albums; }
    catch (err) { out.innerHTML = `<p class="note">${err.status === 502 ? 'Album search is down right now. Try again in a minute.' : 'Search needs the server. Start it with ./dev.sh.'}</p>`; }
  });
  out.addEventListener('click', (e) => { const b = e.target.closest('[data-album]'); if (!b) return; const a = (out._albums || []).find((x) => x.id === b.dataset.album) || mine[b.dataset.album]; if (a) rateOne(a); });
}
const albumRow = (a, right) => `<button class="album" type="button" data-album="${esc(a.id)}">${a.artwork ? `<img src="${esc(a.artwork)}" alt="">` : '<img alt="">'}<div><b>${esc(a.title)}</b><span>${esc(a.artist)}${right ? ' · ' + esc(right) : ''}</span></div></button>`;
async function rateOne(a) {
  const mine = local.get('ratings', {}); const prev = mine[a.id]?.score ?? 7.5;
  openSheet(`<p class="k">${esc(a.artist)}</p><h2 id="sheetTitle">${esc(a.title)}</h2>${a.artwork ? `<img class="cover" src="${esc(a.artwork)}" alt="">` : ''}
    <p class="score" id="scoreOut">${prev.toFixed(2)}</p><label for="scoreIn">Your score</label><input id="scoreIn" class="rate" type="range" min="0" max="10" step="0.01" value="${prev}">
    <button class="btn" id="scoreGo" type="button">Rate it</button><p id="scoreNote" role="status"></p>`);
  const inp = $('scoreIn');
  inp.addEventListener('input', () => { $('scoreOut').textContent = (+inp.value).toFixed(2); });
  try { const st = await api.album(a.id); if (st.count) $('scoreNote').textContent = `${st.count} visitor${st.count === 1 ? '' : 's'} gave it ${st.average.toFixed(2)} on average.`; } catch { /* offline */ }
  $('scoreGo').addEventListener('click', async () => {
    const score = Math.round(+inp.value * 100) / 100;
    mine[a.id] = { ...a, score }; local.set('ratings', mine);
    try { const st = await api.rate(a.id, score); $('scoreNote').textContent = `Saved. Visitors average ${st.average.toFixed(2)} from ${st.count} rating${st.count === 1 ? '' : 's'}.`; }
    catch { $('scoreNote').textContent = 'Saved in your browser. The visitor average needs the server.'; }
  });
}

// The crate by the fire: Sean's highest-rated records on Waverate, pulled live by the server
async function records() {
  openSheet('<p class="k">Life · vinyl</p><h2 id="sheetTitle">Records I love</h2><div id="crate" class="albums" aria-live="polite"><p class="note">Pulling from Waverate…</p></div>');
  try {
    const res = await api.ratings();
    const list = (res?.ratings || []).slice().sort((a, b) => b.value - a.value);
    $('crate').innerHTML = list.length
      ? list.map((r) => `<div class="album">${r.artwork ? `<img src="${esc(r.artwork)}" alt="">` : '<img alt="">'}<div><b>${esc(r.album || r.title)}</b><span>${esc(r.artist)} · ${r.value.toFixed(2)} on Waverate</span></div></div>`).join('') + '<p class="note">Live from my Waverate ratings.</p>'
      : '<p class="note">The crate fills from my Waverate ratings once the site is connected to Waverate.</p>';
  } catch { $('crate').innerHTML = '<p class="note">The crate fills from my Waverate ratings once the server is running.</p>'; }
}

// PennySphere's idea in miniature: what's safe to spend, with roommates splitting the rent
function budget() {
  const v = local.get('budget', { pay: 2400, rent: 2100, people: 3, bills: 220, save: 200, days: 14 });
  openSheet(`<p class="k">PennySphere</p><h2 id="sheetTitle">What’s safe to spend?</h2><p>Put in rough numbers. Nothing leaves this browser.</p>
    <form id="bForm"><div class="row2"><div><label for="bPay">Take-home pay</label><input id="bPay" type="number" min="0" inputmode="decimal" value="${v.pay}"></div><div><label for="bDays">Days until payday</label><input id="bDays" type="number" min="1" max="31" value="${v.days}"></div></div>
    <div class="row2"><div><label for="bRent">Total rent</label><input id="bRent" type="number" min="0" value="${v.rent}"></div><div><label for="bPeople">Splitting with (people)</label><input id="bPeople" type="number" min="1" max="12" value="${v.people}"></div></div>
    <div class="row2"><div><label for="bBills">Your bills</label><input id="bBills" type="number" min="0" value="${v.bills}"></div><div><label for="bSave">Saving</label><input id="bSave" type="number" min="0" value="${v.save}"></div></div></form>
    <p class="big" id="bOut"></p><p id="bNote"></p>`);
  const calc = () => {
    const n = (id) => Math.max(0, +$(id).value || 0);
    const pay = n('bPay'), rent = n('bRent') / Math.max(1, n('bPeople')), left = pay - rent - n('bBills') - n('bSave'), days = Math.max(1, n('bDays'));
    local.set('budget', { pay, rent: n('bRent'), people: n('bPeople'), bills: n('bBills'), save: n('bSave'), days });
    $('bOut').textContent = left > 0 ? `$${(left / days).toFixed(2)} a day` : '$0.00 a day';
    $('bNote').textContent = left > 0 ? `Your share of rent is $${rent.toFixed(2)}. That leaves $${left.toFixed(2)} until payday.` : 'Your share of rent and bills is more than this paycheck. PennySphere flags this before it happens.';
  };
  $('bForm').addEventListener('input', calc); calc();
}

// Sean's recipes, made step by step. Loaded only when someone opens them.
const sheetHost = (html) => { openSheet(html); return $('sheetBody'); };
async function latte() { const { brewLatte } = await import('./kitchen.js'); brewLatte({ openSheet: sheetHost, hint, world }); }
async function steak() { const { cookSteak } = await import('./kitchen.js'); const stop = cookSteak({ openSheet: sheetHost, hint }); sheetClosed = stop; }

// Chess by the full rules, worked out on the Java server. Loaded only when someone opens it.
async function chess() {
  const { openChess } = await import('./chess.js');
  openChess({ openSheet: (html) => { openSheet(html); return $('sheetBody'); }, hint });
}

// ---------- The Game planet ----------
let live = null;
async function loadGame() {
  try {
    const { marks, here } = await api.marks();
    marks.forEach((m) => world.addLantern?.(m));
    hint(`${marks.length} lantern${marks.length === 1 ? '' : 's'} on the planet. ${Math.max(1, here)} here now. Tap the planet to leave yours.`, 6000);
  } catch { hint('The shared planet needs the server. Start it with ./dev.sh.', 6000); }
  live?.close();
  joinPresence();
  if ('EventSource' in window) {
    live = new EventSource('/api/game/live');
    live.addEventListener('mark', (e) => { if (worldId === 'game') world.addLantern?.(JSON.parse(e.data), true); });
    live.addEventListener('removed', (e) => { if (worldId === 'game') world.removeLantern?.(JSON.parse(e.data)); });
  }
}
// Live presence: who else is on the planet, over the Java server's WebSocket
let presence = null, presenceTimer = null;
function joinPresence() {
  leavePresence();
  try { presence = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/game/presence`); } catch { return; }
  let you = null, lastSent = '';
  presence.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'hello') you = m.you;
    if (m.t === 'here' && worldId === 'game') {
      world.setOthers?.(m.spots, you);
      const n = m.n - 1; $('where').textContent = n > 0 ? `Game · ${n} other${n === 1 ? '' : 's'} here now` : 'Game · just you right now';
    }
  };
  presenceTimer = setInterval(() => {
    if (presence?.readyState !== 1 || worldId !== 'game' || !world.lookingAt) return;
    const at = world.lookingAt(engine.camera), msg = JSON.stringify(at);
    if (msg !== lastSent) { presence.send(msg); lastSent = msg; }
  }, 300);
}
function leavePresence() { clearInterval(presenceTimer); presence?.close(); presence = null; }

function lanternHelp() { hint('Tap a spot on the planet to place your lantern.'); }
function lanternAt(point) {
  const near = world.nearest?.(point);
  if (near) { openSheet(`<p class="k">A lantern</p><h2 id="sheetTitle">${esc(near.note)}</h2><p class="note">Left ${new Date(near.at).toLocaleDateString()}.</p>`); return; }
  const where = toLatLon(world.toPlanet(point));
  const colors = ['#ff74ea', '#ffd36b', '#7fd8b4', '#8fb6ff', '#ff8a6a', '#ffffff'];
  openSheet(`<p class="k">The Game planet</p><h2 id="sheetTitle">Leave a lantern</h2><p>Everyone who visits will see it. Keep it kind; links aren’t allowed.</p>
    <form id="lForm"><label for="lNote">Your note</label><input id="lNote" type="text" maxlength="60" required autocomplete="off">
    <fieldset class="swatches"><legend>Colour</legend>${colors.map((c, k) => `<label><input type="radio" name="lc" value="${c}" ${k ? '' : 'checked'} aria-label="${['Pink', 'Gold', 'Mint', 'Blue', 'Coral', 'White'][k]}"><span class="sw" data-c="${c}"></span></label>`).join('')}</fieldset>
    <input class="hp" id="lWeb" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button class="btn" type="submit">Place it</button><p id="lNoteOut" role="status"></p></form>`);
  // Swatch colours are set through the DOM, since the page's security policy blocks inline styles
  $('lForm').querySelectorAll('.sw').forEach((el) => { el.style.background = el.dataset.c; });
  $('lForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    try { const m = await api.addMark({ ...where, note: $('lNote').value.trim(), color: e.target.lc.value, website: $('lWeb').value }); world.addLantern?.(m, true); local.set('myLantern', m.id); closeSheet(); hint('Your lantern is lit. Everyone can see it.'); }
    catch (err) { $('lNoteOut').textContent = err.status === 422 ? 'That note isn’t allowed. Try different words.' : err.status === 429 ? 'You’ve placed a few already. Try again later.' : 'Couldn’t place it right now.'; btn.disabled = false; }
  });
}

// ---------- Walking ----------
function setWalk(on) {
  const ok = on ? engine.setWalk(true) : (engine.mode === 'walk' ? (engine.setWalk(false), false) : false);
  $('walk').setAttribute('aria-pressed', String(!!ok));
  $('walk').textContent = ok ? 'Tour' : 'Walk';
  $('stick').hidden = !(ok && coarse);
  if (ok) hint(coarse ? 'Use the stick to walk. Drag to look around.' : 'WASD or arrow keys to walk. Drag to look. Shift to run.', 5000);
}
$('walk').addEventListener('click', () => setWalk(engine.mode !== 'walk'));
{ // On-screen stick for phones
  const st = $('stick'), knob = st.querySelector('i'); let id = null;
  const move = (e) => { const r = st.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } engine.stick.x = x; engine.stick.y = y; knob.style.transform = `translate(${x * 32}px, ${y * 32}px)`; };
  st.addEventListener('pointerdown', (e) => { id = e.pointerId; st.setPointerCapture(id); move(e); });
  st.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = () => { id = null; engine.stick.x = engine.stick.y = 0; knob.style.transform = ''; };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
}

// ---------- Reading mode and time ----------
$('read').addEventListener('click', (e) => { const on = document.body.classList.toggle('reading'); e.currentTarget.setAttribute('aria-pressed', String(on)); local.set('reading', on); });
if (local.get('reading')) { document.body.classList.add('reading'); $('read').setAttribute('aria-pressed', 'true'); }
const fmt = (h) => { const hh = Math.floor(h) % 24, mm = Math.round((h - Math.floor(h)) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`; };
$('todIn').value = hour; $('todOut').textContent = fmt(hour);
$('todIn').addEventListener('input', () => { hour = +$('todIn').value; $('todOut').textContent = fmt(hour); world?.setHour?.(hour); });

// ---------- Start ----------
addEventListener('hashchange', () => enter(location.hash.slice(1) || 'home'));
// Return visits load instantly: the service worker keeps the site's files (never the API's answers)
if (import.meta.env.PROD && 'serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
(async () => {
  try { const c = await api.content(); if (c?.worlds) content = c; } catch { /* use the copy built in */ }
  await enter(location.hash.slice(1) || 'home', null, { instant: true });
  $('boot').classList.add('gone');
  setTimeout(() => $('boot').remove(), 700);
  hint(isPhone() ? 'Swipe up for the next stop. Tap anything that glows.' : 'Scroll for the next stop. Drag to look. Tap things.', 5200);
})();

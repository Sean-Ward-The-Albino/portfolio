// The admin panel: edit the words on every world, read feedback, remove lanterns.
// Everything goes through /api/admin with the token kept only for this browser tab.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let token = sessionStorage.getItem('admin-token') || '';
let content = null;

async function call(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
  if (res.status === 401) { signOut('That token didn’t work.'); throw new Error('unauthorized'); }
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}
function signOut(msg) { token = ''; sessionStorage.removeItem('admin-token'); $('app').hidden = true; $('signin').hidden = false; $('tokMsg').textContent = msg || ''; }

$('tokForm').addEventListener('submit', async (e) => {
  e.preventDefault(); token = $('tok').value.trim();
  try { await load(); sessionStorage.setItem('admin-token', token); } catch { /* message shown */ }
});

async function load() {
  content = await call('/api/admin/content');
  $('signin').hidden = true; $('app').hidden = false;
  $('worldSel').innerHTML = Object.entries(content.worlds).map(([id, w]) => `<option value="${id}">${esc(w.title)}</option>`).join('');
  $('working').value = content.person?.workingOn || '';
  content.music ||= { tracks: [] };
  renderTracks();
  renderWorld();
}

// Each stop: the one-line subtitle, and the longer "More" text (one paragraph per line)
function renderWorld() {
  const w = content.worlds[$('worldSel').value];
  $('stops').innerHTML = w.stops.map((s, i) => `<div class="card" data-i="${i}">
    <h3>${i + 1}. ${esc(s.id)}${s.action ? ` · does: ${esc(s.action)}` : ''}</h3>
    <label for="sub${i}">Subtitle line</label><input id="sub${i}" data-f="sub" value="${esc(s.sub)}" maxlength="200">
    <div class="row"><div><label for="k${i}">More: small heading</label><input id="k${i}" data-f="kicker" value="${esc(s.detail?.kicker)}"></div>
    <div><label for="t${i}">More: title</label><input id="t${i}" data-f="title" value="${esc(s.detail?.title)}"></div></div>
    <label for="b${i}">More: text (one paragraph per line)</label><textarea id="b${i}" data-f="body">${esc((s.detail?.body || []).join('\n'))}</textarea>
    ${photoSlots(s, i)}
  </div>`).join('') + '<p class="hint">Text in [square brackets] shows in grey italics on the site, as a reminder it still needs writing.</p>';
}
$('worldSel').addEventListener('change', () => { collect(); renderWorld(); });

// Tracks for the record player on Home and the music stop on Life
function renderTracks() {
  const t = content.music.tracks;
  $('tracks').innerHTML = t.length ? t.map((x, k) => `<div class="item"><div><p>${esc(x.title)}</p><audio controls preload="none" src="${esc(x.src)}"></audio></div><button class="danger" data-deltrack="${k}">Remove</button></div>`).join('') : '<p class="hint">No tracks yet. Until there are, the record player plays a loop made in the browser.</p>';
}
$('trackForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = $('trackFile').files[0], title = $('trackTitle').value.trim();
  if (!file || !title) return;
  $('saveMsg').textContent = 'Uploading the track…';
  try {
    const f = new FormData(); f.append('file', file);
    const r = await upload('/api/admin/media/track', f);
    content.music.tracks.push({ title, src: r.src }); renderTracks(); e.target.reset();
    $('saveMsg').textContent = 'Uploaded. Press Publish to put it on the site.';
  } catch (err) { $('saveMsg').textContent = 'Upload failed: ' + err.message; }
});

// Photo slots: each one shows its photo, or its label until a photo is uploaded
function photoSlots(s, i) {
  const photos = s.detail?.photos || [];
  return `<div class="slots">${photos.map((p, k) => {
    const label = typeof p === 'string' ? p : p.label;
    return `<div class="slot">${p.src ? `<img src="${esc(p.small || p.src)}" alt="">` : `<span>${esc(label)}</span>`}
      <label class="up">${p.src ? 'Replace' : 'Upload'}<input type="file" accept="image/*" data-photo="${i}:${k}" hidden></label>
      ${p.src ? `<button class="ghost" data-unphoto="${i}:${k}">Remove</button>` : ''}</div>`;
  }).join('')}<button class="ghost" data-addphoto="${i}">Add a photo slot</button></div>`;
}

// Photos are resized here in the browser, so any photo works (including iPhone HEIC, in Safari)
async function resize(file, max) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.84));
  // Some browsers can't make WebP; fall back to JPEG
  return blob && blob.type === 'image/webp' ? blob : new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
}

async function upload(path, form) {
  const res = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

document.addEventListener('change', async (e) => {
  const inp = e.target.closest('[data-photo]'); if (!inp || !inp.files[0]) return;
  collect();
  const [i, k] = inp.dataset.photo.split(':').map(Number), s = content.worlds[$('worldSel').value].stops[i];
  $('saveMsg').textContent = 'Resizing and uploading…';
  try {
    const f = new FormData();
    f.append('large', await resize(inp.files[0], 1800), 'large');
    f.append('small', await resize(inp.files[0], 720), 'small');
    const r = await upload('/api/admin/media/photo', f);
    const old = s.detail.photos[k];
    s.detail.photos[k] = { label: typeof old === 'string' ? old : old.label, src: r.src, small: r.small };
    renderWorld(); $('saveMsg').textContent = 'Uploaded. Press Publish to put it on the site.';
  } catch (err) { $('saveMsg').textContent = 'Upload failed: ' + err.message; }
});

function collect() {
  const w = content.worlds[$('worldSel').value];
  document.querySelectorAll('#stops [data-i]').forEach((card) => {
    const s = w.stops[+card.dataset.i], v = (f) => card.querySelector(`[data-f="${f}"]`).value;
    s.sub = v('sub').trim();
    const kicker = v('kicker').trim(), title = v('title').trim(), body = v('body').split('\n').map((x) => x.trim()).filter(Boolean);
    if (kicker || title || body.length || s.detail?.photos?.length || s.detail?.recipes?.length) s.detail = { ...(s.detail || {}), kicker, title, body };
    else delete s.detail;
  });
  content.person = { ...(content.person || {}), workingOn: $('working').value.trim() };
}

$('save').addEventListener('click', async () => {
  collect();
  try { await call('/api/admin/content', { method: 'PUT', body: JSON.stringify(content) }); $('saveMsg').textContent = 'Published. It shows on the site within a minute.'; }
  catch (e) { $('saveMsg').textContent = 'Couldn’t publish: ' + e.message; }
});
$('reset').addEventListener('click', async () => {
  if (!confirm('Put back the starting words for every world? Your edits will be lost.')) return;
  await call('/api/admin/content', { method: 'DELETE' }); await load(); $('saveMsg').textContent = 'Reset to the starting words.';
});

async function loadInbox() {
  const { feedback } = await call('/api/admin/feedback');
  $('inbox').innerHTML = feedback.length ? feedback.map((f) => `<div class="card item"><div><p>${esc(f.message)}</p><small>${esc(f.name || 'No name')} · ${new Date(f.at).toLocaleString()}</small></div><button class="danger" data-del-fb="${esc(f.id)}">Delete</button></div>`).join('') : '<p class="hint">No feedback yet.</p>';
}
async function loadLanterns() {
  const { marks } = await call('/api/admin/marks');
  $('lanterns').innerHTML = marks.length ? marks.map((m) => `<div class="card item"><div><p>${esc(m.note)}</p><small>${new Date(m.at).toLocaleString()} · ${m.lat.toFixed(1)}, ${m.lon.toFixed(1)}</small></div><button class="danger" data-del-mark="${esc(m.id)}">Remove</button></div>`).join('') : '<p class="hint">No lanterns yet.</p>';
}
document.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
    if (tab.dataset.tab === 'inbox') loadInbox(); if (tab.dataset.tab === 'lanterns') loadLanterns();
  }
  const un = e.target.closest('[data-unphoto]');
  if (un) { collect(); const [i, k] = un.dataset.unphoto.split(':').map(Number), s = content.worlds[$('worldSel').value].stops[i]; s.detail.photos[k] = s.detail.photos[k].label || 'Photo'; renderWorld(); }
  const add = e.target.closest('[data-addphoto]');
  if (add) { collect(); const s = content.worlds[$('worldSel').value].stops[+add.dataset.addphoto]; s.detail ||= { kicker: '', title: '', body: [] }; (s.detail.photos ||= []).push('Photo'); renderWorld(); }
  const delTrack = e.target.closest('[data-deltrack]');
  if (delTrack) { content.music.tracks.splice(+delTrack.dataset.deltrack, 1); renderTracks(); $('saveMsg').textContent = 'Removed. Press Publish.'; }
  const fb = e.target.closest('[data-del-fb]'); if (fb) { await call(`/api/admin/feedback/${encodeURIComponent(fb.dataset.delFb)}`, { method: 'DELETE' }); loadInbox(); }
  const mk = e.target.closest('[data-del-mark]'); if (mk) { await call(`/api/admin/marks/${encodeURIComponent(mk.dataset.delMark)}`, { method: 'DELETE' }); loadLanterns(); }
});

if (token) load().catch(() => {});

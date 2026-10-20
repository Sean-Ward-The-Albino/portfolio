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
  </div>`).join('') + '<p class="hint">Text in [square brackets] shows in grey italics on the site, as a reminder it still needs writing.</p>';
}
$('worldSel').addEventListener('change', () => { collect(); renderWorld(); });

function collect() {
  const w = content.worlds[$('worldSel').value];
  document.querySelectorAll('#stops [data-i]').forEach((card) => {
    const s = w.stops[+card.dataset.i], v = (f) => card.querySelector(`[data-f="${f}"]`).value;
    s.sub = v('sub').trim();
    const kicker = v('kicker').trim(), title = v('title').trim(), body = v('body').split('\n').map((x) => x.trim()).filter(Boolean);
    if (kicker || title || body.length) s.detail = { ...(s.detail || {}), kicker, title, body };
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
  const fb = e.target.closest('[data-del-fb]'); if (fb) { await call(`/api/admin/feedback/${encodeURIComponent(fb.dataset.delFb)}`, { method: 'DELETE' }); loadInbox(); }
  const mk = e.target.closest('[data-del-mark]'); if (mk) { await call(`/api/admin/marks/${encodeURIComponent(mk.dataset.delMark)}`, { method: 'DELETE' }); loadLanterns(); }
});

if (token) load().catch(() => {});

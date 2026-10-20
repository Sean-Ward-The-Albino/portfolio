// Talks to the Spring Boot server. Every call fails soft: the worlds still work without the server.
async function call(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || res.statusText), { status: res.status, body });
  return body;
}
export const api = {
  content: () => call('/api/content'),
  feedback: (message, name, website) => call('/api/feedback', { method: 'POST', body: JSON.stringify({ message, name, website }) }),
  searchAlbums: (q) => call(`/api/albums/search?q=${encodeURIComponent(q)}`),
  album: (id) => call(`/api/albums/${encodeURIComponent(id)}`),
  rate: (id, score) => call(`/api/albums/${encodeURIComponent(id)}/rating`, { method: 'POST', body: JSON.stringify({ score }) }),
  ratings: () => call('/api/now/ratings'),
  marks: () => call('/api/game/marks'),
  addMark: (m) => call('/api/game/marks', { method: 'POST', body: JSON.stringify(m) }),
};

// What a visitor does stays in their browser: sand writing, their own ratings, where they've been.
export const local = {
  get(k, d = null) { try { const v = localStorage.getItem('sdw:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sdw:' + k, JSON.stringify(v)); } catch { /* private mode: fine */ } },
};

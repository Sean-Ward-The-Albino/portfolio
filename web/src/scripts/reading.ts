// Reading mode (larger high-contrast text, Atkinson Hyperlegible, a guide line that follows your place) and the
// light/dark switch. Both are remembered on this device only.
import '@fontsource-variable/atkinson-hyperlegible-next';

const root = document.documentElement;
const save = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } };

function syncButtons() {
  const on = root.dataset.reading === 'on';
  document.querySelectorAll('[data-reading-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
}

function toggleReading() {
  const on = root.dataset.reading !== 'on';
  if (on) root.dataset.reading = 'on'; else delete root.dataset.reading;
  save('reading', on ? 'on' : null);
  syncButtons();
}

function toggleTheme() {
  const current = root.dataset.theme ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const next = current === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  save('theme', next);
}

document.querySelectorAll('[data-reading-toggle]').forEach((b) => b.addEventListener('click', toggleReading));
document.addEventListener('toggle-reading', toggleReading);
document.addEventListener('toggle-theme', toggleTheme);
syncButtons();

// The guide band follows the pointer, or the focused element when using a keyboard.
const guide = document.querySelector<HTMLElement>('.reading-guide');
if (guide) {
  const place = (y: number) => guide.style.setProperty('--guide-y', `${Math.round(y - guide.offsetHeight / 2)}px`);
  addEventListener('pointermove', (e) => { if (root.dataset.reading === 'on') place(e.clientY); }, { passive: true });
  addEventListener('focusin', (e) => {
    if (root.dataset.reading !== 'on') return;
    const r = (e.target as HTMLElement).getBoundingClientRect();
    place(r.top + r.height / 2);
  });
}

// The only two scripts that must run before the first paint. They are rendered inline by Base.astro and their
// SHA-256 hashes are added to the Content-Security-Policy by astro.config.mjs, from this same text.
import { createHash } from 'node:crypto';

// Applies the saved reading mode and theme, so the page never flashes the wrong one.
export const PREFS = `try{var r=localStorage.getItem('reading'),t=localStorage.getItem('theme');if(r==='on')document.documentElement.dataset.reading='on';if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

// Names the elements that morph between pages (a post card into its page), through the CSS object model.
export const VIEW_TRANSITION_NAMES = `document.querySelectorAll('[data-vt]').forEach(function(e){e.style.viewTransitionName=e.dataset.vt})`;

/** @type {`sha256-${string}`[]} */
export const inlineHashes = /** @type {any} */ ([PREFS, VIEW_TRANSITION_NAMES].map((s) => `sha256-${createHash('sha256').update(s).digest('base64')}`));

import type { APIRoute } from 'astro';
import { getPosts, postUrl } from '../lib/posts';
import { profile } from '../lib/data';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

export const GET: APIRoute = async ({ site }) => {
  const posts = await getPosts();
  const items = posts.map((p) => {
    const url = new URL(postUrl(p), site).toString();
    return `<item><title>${esc(p.data.title)}</title><link>${url}</link><guid>${url}</guid><pubDate>${p.data.date.toUTCString()}</pubDate><description>${esc(p.data.summary)}</description></item>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(profile.name)}</title><link>${site}</link><description>${esc(profile.description)}</description><language>en</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
};

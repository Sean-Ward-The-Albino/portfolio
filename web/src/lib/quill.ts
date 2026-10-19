// Turns a Quill doc (ProseMirror JSON from a .quill file) into safe HTML for a post.
// Everything is escaped; only known nodes and marks become tags. Comments, suggested deletions, private
// colors and fonts never reach the page. Avlory items (tables, charts, canvas frames) become live embeds.

type Mark = { type: string; attrs?: Record<string, unknown> };
export type QNode = { type: string; text?: string; attrs?: Record<string, unknown>; content?: QNode[]; marks?: Mark[] };

const ITEM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_URL = /^(https?:\/\/|mailto:)/i;
const SLUG = /[^a-z0-9]+/g;

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface QuillRender { html: string; subtitle?: string; headings: { depth: number; slug: string; text: string }[] }

export function renderQuill(doc: QNode): QuillRender {
  const footnotes: string[] = [];
  const headings: QuillRender['headings'] = [];
  let subtitle: string | undefined;

  const text = (n: QNode): string => (n.text ?? '') + (n.content ?? []).map(text).join('');
  const kids = (n: QNode) => (n.content ?? []).map(node).join('');

  function inline(n: QNode): string {
    const marks = n.marks ?? [];
    if (marks.some((m) => m.type === 'deletion')) return '';
    let out = esc(n.text);
    for (const m of marks) {
      switch (m.type) {
        case 'bold': out = `<strong>${out}</strong>`; break;
        case 'italic': out = `<em>${out}</em>`; break;
        case 'underline': out = `<u>${out}</u>`; break;
        case 'strike': out = `<s>${out}</s>`; break;
        case 'code': out = `<code>${out}</code>`; break;
        case 'superscript': out = `<sup>${out}</sup>`; break;
        case 'subscript': out = `<sub>${out}</sub>`; break;
        case 'highlight': out = `<mark>${out}</mark>`; break;
        case 'link': {
          const href = String(m.attrs?.href ?? '');
          if (SAFE_URL.test(href)) out = `<a href="${esc(href)}" rel="noopener">${out}</a>`;
          break;
        }
        // comment, insertion, textStyle: shown as plain text
      }
    }
    return out;
  }

  function embed(item: unknown, label: string) {
    const id = String(item ?? '');
    if (!ITEM_ID.test(id)) return `<p class="mute">${esc(label)}</p>`;
    return `<figure class="embed"><avlory-embed src="https://embed.avlory.com/v1/i/${id}" mode="view" autoresize></avlory-embed>` +
      `<figcaption>${esc(label)}, live from Avlory</figcaption></figure>`;
  }

  function node(n: QNode): string {
    const a = n.attrs ?? {};
    switch (n.type) {
      case 'doc': return kids(n);
      case 'text': return inline(n);
      case 'paragraph':
        if (a.kind === 'title') return '';
        if (a.kind === 'subtitle') { subtitle = text(n); return ''; }
        return `<p>${kids(n)}</p>`;
      case 'heading': {
        const depth = Math.min(Math.max(Number(a.level) || 1, 1) + 1, 4);
        const t = text(n);
        const slug = t.toLowerCase().replace(SLUG, '-').replace(/^-|-$/g, '');
        headings.push({ depth, slug, text: t });
        return `<h${depth} id="${esc(slug)}">${kids(n)}</h${depth}>`;
      }
      case 'hardBreak': return '<br>';
      case 'bulletList': return `<ul>${kids(n)}</ul>`;
      case 'orderedList': return `<ol${Number(a.start) > 1 ? ` start="${Number(a.start)}"` : ''}>${kids(n)}</ol>`;
      case 'listItem': return `<li>${kids(n)}</li>`;
      case 'taskList': return `<ul>${kids(n)}</ul>`;
      case 'taskItem': return `<li class="task"><input type="checkbox" disabled${a.checked ? ' checked' : ''} aria-label="${a.checked ? 'Done' : 'Not done'}">${kids(n)}</li>`;
      case 'blockquote': return `<blockquote>${kids(n)}</blockquote>`;
      case 'codeBlock': return `<pre data-language="${esc(a.language)}"><code>${esc(text(n))}</code></pre>`;
      case 'horizontalRule': case 'pageBreak': return '<hr>';
      case 'table': return `<table>${kids(n)}</table>`;
      case 'tableRow': return `<tr>${kids(n)}</tr>`;
      case 'tableHeader': return `<th>${kids(n)}</th>`;
      case 'tableCell': return `<td${['left', 'center', 'right'].includes(String(a.align)) ? ` class="align-${a.align}"` : ''}>${kids(n)}</td>`;
      case 'footnote': {
        footnotes.push(String(a.text ?? ''));
        const k = footnotes.length;
        return `<sup id="fnref-${k}"><a href="#fn-${k}" aria-describedby="footnotes-label">${k}</a></sup>`;
      }
      case 'mathInline': return `<code class="math">${esc(a.latex)}</code>`;
      case 'mathBlock': return `<pre class="math"><code>${esc(a.latex)}</code></pre>`;
      case 'mermaid': return `<pre class="diagram"><code>${esc(text(n))}</code></pre>`;
      case 'chord': return `<strong class="chord">${esc(a.name)}</strong>`;
      case 'score': return `<pre class="score"><code>${esc(a.abc)}</code></pre>`;
      case 'songDetails': return `<p class="mute ui">${[a.key && `Key ${a.key} ${a.mode ?? ''}`, a.tempo && `${a.tempo} bpm`, a.time, a.capo && `Capo ${a.capo}`].filter(Boolean).map(esc).join(', ')}</p>`;
      case 'tableEmbed': return embed(a.item, String(a.name ?? 'Table'));
      case 'chartEmbed': return embed(a.item, String(a.name ?? 'Chart'));
      case 'canvasFrame': return embed(a.item, String(a.name ?? 'Canvas'));
      case 'webEmbed': {
        const url = String(a.url ?? '');
        return SAFE_URL.test(url) ? `<p><a class="web-embed" href="${esc(url)}" rel="noopener">${esc(a.title || url)}</a></p>` : '';
      }
      case 'xref': return '';
      case 'bookmark': return a.id ? `<span id="${esc(a.id)}"></span>` : '';
      case 'fileLink': return `<span>${esc(a.title)}</span>`;
      case 'citation': case 'bibliography': return '';
      default: return kids(n);
    }
  }

  let html = node(doc);
  if (footnotes.length) {
    html += `<section class="footnotes" aria-labelledby="footnotes-label"><h2 id="footnotes-label" class="visually-hidden">Footnotes</h2><ol>` +
      footnotes.map((f, i) => `<li id="fn-${i + 1}">${esc(f)} <a href="#fnref-${i + 1}" aria-label="Back to the text">↩</a></li>`).join('') +
      `</ol></section>`;
  }
  return { html, subtitle, headings };
}

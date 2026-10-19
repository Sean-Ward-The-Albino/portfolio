// Posts live in ../content/posts as Markdown (.md, .mdx) or Quill docs (.quill, with an optional .yaml beside them).
import fs from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { defineCollection } from 'astro:content';
import { glob, type Loader } from 'astro/loaders';
import { z } from 'astro/zod';
import { readPackage } from './vendor/avlory-formats/package';
import { renderQuill, type QNode } from './lib/quill';

const POSTS = path.resolve(process.cwd(), '../content/posts');

const meta = z.object({
  title: z.string().min(1),
  summary: z.string().min(1).max(240),
  kind: z.enum(['avlory', 'life', 'take']),
  verdict: z.string().optional(),
  date: z.coerce.date(),
  updated: z.coerce.date().optional(),
  draft: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  source: z.enum(['markdown', 'quill']).default('markdown'),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: POSTS }),
  schema: meta,
});

// A loader for .quill files: reads them with Avlory's own formats library and renders them to HTML.
function quillLoader(): Loader {
  return {
    name: 'quill-loader',
    async load({ store, parseData, generateDigest, watcher, logger }) {
      async function sync() {
        store.clear();
        for (const file of fs.readdirSync(POSTS).filter((f) => f.endsWith('.quill'))) {
          const id = file.replace(/\.quill$/, '');
          const bytes = fs.readFileSync(path.join(POSTS, file));
          const sidecarPath = path.join(POSTS, `${id}.yaml`);
          const sidecar = fs.existsSync(sidecarPath) ? (parseYaml(fs.readFileSync(sidecarPath, 'utf8')) as Record<string, unknown>) : {};
          let pkg;
          try {
            pkg = await readPackage(bytes);
          } catch (e) {
            throw new Error(`content/posts/${file} could not be read as a Quill doc (is it password-protected?): ${(e as Error).message}`);
          }
          if (pkg.manifest.kind !== 'quill') throw new Error(`content/posts/${file} is a ${pkg.manifest.kind} file, not a Quill doc.`);
          const rendered = renderQuill((pkg.content as { doc: QNode }).doc);
          const data = await parseData({
            id,
            data: {
              title: pkg.manifest.title,
              summary: rendered.subtitle,
              date: pkg.manifest.createdAt,
              updated: pkg.manifest.modifiedAt,
              kind: 'avlory',
              ...sidecar,
              source: 'quill',
            },
          });
          store.set({ id, data, digest: generateDigest(bytes.toString('base64') + JSON.stringify(sidecar)), rendered: { html: rendered.html, metadata: { headings: rendered.headings } } });
        }
        logger.info('Quill posts loaded');
      }
      await sync();
      watcher?.on('change', (p) => { if (p.startsWith(POSTS)) sync(); });
      watcher?.on('add', (p) => { if (p.startsWith(POSTS)) sync(); });
    },
  };
}

const quillPosts = defineCollection({ loader: quillLoader(), schema: meta });

export const collections = { posts, quillPosts };

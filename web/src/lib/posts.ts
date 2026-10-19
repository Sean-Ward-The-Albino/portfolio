import { getCollection, render, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'> | CollectionEntry<'quillPosts'>;
export const KIND_LABEL = { avlory: 'On Avlory', life: 'Life', take: 'Take' } as const;

/** Every published post, newest first. Drafts show only in `npm run dev`. */
export async function getPosts(): Promise<Post[]> {
  const showDrafts = import.meta.env.DEV;
  const all = [...(await getCollection('posts')), ...(await getCollection('quillPosts'))];
  return all
    .filter((p) => showDrafts || !p.data.draft)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export const postUrl = (p: Post) => `/writing/${p.id}`;
export const renderPost = (p: Post) => render(p);

/** Minutes to read, from the rendered words. */
export function readingTime(p: Post) {
  const raw = 'body' in p && p.body ? p.body : (p.rendered?.html ?? '').replace(/<[^>]+>/g, ' ');
  return Math.max(1, Math.round(raw.split(/\s+/).filter(Boolean).length / 230));
}

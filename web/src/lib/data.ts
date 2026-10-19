// Reads the hand-edited files in ../content and the synced Avlory facts. Runs at build time only.
import fs from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';

export const CONTENT_DIR = path.resolve(process.cwd(), '../content');

function load<T>(file: string): T {
  return parseYaml(fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8')) as T;
}

export interface Social { kind: string; label: string; url: string }
export interface Profile {
  name: string; short_name: string; role: string; location: string;
  tagline: string; description: string; socials: Social[]; cv?: string;
}
export interface About {
  intro: string;
  story: { heading: string; body: string }[];
  milestones: { when: string; what: string }[];
  interests: { name: string; detail: string }[];
  aspirations: string[];
  people: { name: string; role: string; note: string; links: { label: string; url: string }[] }[];
  thanks: string;
  values: string[];
}
export interface Now { updated: string | Date; building: string; focus: string[]; show_waverate: boolean }

export type Status = 'live' | 'building' | 'soon';
export interface RoadmapItem { name: string; state: 'done' | 'now' | 'next'; when: string; theme: string; detail: string; product: string | null }
export interface Product {
  slug: string; name: string; color: string; logo?: string; summary: string; platforms: string[];
  link?: { label: string; url: string }; site?: string;
  // From the sync
  status: Status; version?: string; build?: number; latest?: string; next?: { name: string; when: string }; androidBeta?: boolean;
  roadmap: RoadmapItem[];
}
export interface Generated {
  syncedAt: string; avloryCommit: string | null;
  company: { tagline: string; description: string };
  products: Record<string, Partial<Product>>;
  roadmap: RoadmapItem[];
  stats: {
    files: number; apps: number; flutterApps: number; springServices: number; packages: number;
    springBoot: string; java: string; languages: Record<string, { files: number; lines: number }>;
  };
}

export const profile = load<Profile>('profile.yaml');
export const about = load<About>('about.yaml');
export const now = load<Now>('now.yaml');

const generatedPath = path.join(CONTENT_DIR, 'avlory/generated.json');
export const avlory: Generated = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));

type ProductSource = Omit<Product, 'status' | 'roadmap'> & { status?: Status; pubspec?: string; roadmap?: string[] };
export const products: Product[] = load<ProductSource[]>('avlory/products.yaml').map((p) => {
  const facts = avlory.products[p.slug] ?? {};
  return {
    ...p,
    ...facts,
    status: (p.status ?? facts.status ?? 'soon') as Status,
    roadmap: avlory.roadmap.filter((r) => r.product === p.slug),
  };
});

export const STATUS_LABEL: Record<Status, string> = { live: 'Live', building: 'In progress', soon: 'Coming soon' };

export function formatDate(d: Date | string, style: 'long' | 'short' = 'long') {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', style === 'long'
    ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }
    : { year: 'numeric', month: 'short', timeZone: 'UTC' });
}

export const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 0 }).format(n);

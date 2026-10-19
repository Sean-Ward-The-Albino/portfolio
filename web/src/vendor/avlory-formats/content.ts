// @ts-nocheck
// Copied from Avlory's avlory/packages/avlory_formats_js/src/content.ts (v1.2.0, Apache-2.0) by scripts/sync-avlory.mjs. Don't edit.
// content.json for Tables, Stage, Canvas and Survey (spec/content.md): reading the CRDT snapshot without the CRDT,
// and the plain view.
import type { Kind } from './package.js';

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface SnapshotValues {
  /** Each sequence's visible elements, in order. */
  seq: Record<string, Json[]>;
  /** Each map's live entries. */
  map: Record<string, Record<string, Json>>;
}

/** The values of a compacted CRDT snapshot, read with the spec's simple rules ("Reading a snapshot without the CRDT"). */
export function snapshotValues(crdt: any): SnapshotValues {
  const seq: Record<string, Json[]> = {};
  for (const [name, runs] of Object.entries<any[]>(crdt?.seq ?? {})) {
    const values: Json[] = [];
    for (const run of runs) {
      if (run[3] === 1) continue;
      if (run.length > 4) values.push(...(run[2] as Json[]));
      else {
        // One element per UTF-16 code unit
        const s = run[2] as string;
        for (let i = 0; i < s.length; i++) values.push(s[i]);
      }
    }
    seq[name] = values;
  }
  const map: Record<string, Record<string, Json>> = {};
  for (const [name, entries] of Object.entries<Record<string, any[]>>(crdt?.map ?? {})) {
    map[name] = {};
    for (const [k, e] of Object.entries(entries)) if (e.length <= 2) map[name][k] = e[0];
  }
  return { seq, map };
}

interface Level {
  key: string;
  list: string;
  map: string;
  children?: Level[];
  side?: Record<string, string>;
  valueLists?: Record<string, string>;
}

const trees: Record<'stage' | 'canvas' | 'survey', { maps: Record<string, string>; levels: Level[] }> = {
  stage: {
    maps: { deck: 'deck' },
    levels: [
      {
        key: 'slides',
        list: 'slides',
        map: 'slide:{id}',
        side: { notes: 'notes' },
        children: [
          { key: 'elements', list: 'els:{id}', map: 'el:{id}' },
          { key: 'builds', list: 'builds:{id}', map: 'build:{id}' },
        ],
      },
      { key: 'comments', list: 'comments', map: 'comment:{id}', valueLists: { replies: 'replies:{id}' } },
    ],
  },
  canvas: { maps: { board: 'board' }, levels: [{ key: 'elements', list: 'els', map: 'el:{id}' }] },
  survey: {
    maps: { settings: 'settings' },
    levels: [{ key: 'sections', list: 'sections', map: 'section:{id}', children: [{ key: 'questions', list: 'questions:{id}', map: 'q:{id}' }] }],
  },
};

const named = (pattern: string, id: string) => pattern.replaceAll('{id}', id);

/**
 * The plain view of a Stage, Canvas or Survey snapshot, exactly as the reference library makes it. Tables' plain
 * view needs the formula engine (it shows formulas in A1 form with their results), so it isn't worked out here:
 * read `plain` from the file (every file the Hub writes has it) or use [tablesFromSnapshot].
 */
export function plainFromSnapshot(kind: 'stage' | 'canvas' | 'survey', crdt: any): Record<string, Json> {
  const v = snapshotValues(crdt);
  const t = trees[kind];
  const mapOf = (name: string) => v.map[name] ?? {};
  const level = (l: Level, parent: string): Json[] => {
    const seen = new Set<string>();
    const out: Json[] = [];
    for (const id of v.seq[named(l.list, parent)] ?? []) {
      if (typeof id !== 'string' || seen.has(id)) continue;
      seen.add(id);
      const item: Record<string, Json> = { id, fields: mapOf(named(l.map, id)) };
      for (const [field, map] of Object.entries(l.side ?? {})) {
        const x = mapOf(map)[id];
        if (x !== undefined && x !== null) item[field] = x;
      }
      for (const [field, list] of Object.entries(l.valueLists ?? {})) item[field] = v.seq[named(list, id)] ?? [];
      for (const c of l.children ?? []) item[c.key] = level(c, id);
      out.push(item);
    }
    return out;
  };
  const plain: Record<string, Json> = {};
  for (const [field, map] of Object.entries(t.maps)) plain[field] = mapOf(map);
  for (const l of t.levels) plain[l.key] = level(l, '');
  return plain;
}

/** A Tables snapshot as rows of stored cell values. Formula cells come back as `{ formula }` in stored form (references
 * by row and column id), without results: the plain view has them as typed, with results. */
export function tablesFromSnapshot(crdt: any): { id: string; name: string; rows: Json[][] }[] {
  const v = snapshotValues(crdt);
  const out: { id: string; name: string; rows: Json[][] }[] = [];
  const seen = new Set<string>();
  for (const t of v.seq['tables'] ?? []) {
    if (typeof t !== 'string' || seen.has(t)) continue;
    seen.add(t);
    const rows = (v.seq[`rows:${t}`] ?? []) as string[];
    const cols = (v.seq[`cols:${t}`] ?? []) as string[];
    const cells = v.map[`cells:${t}`] ?? {};
    out.push({
      id: t,
      name: String(v.map[`table:${t}`]?.name ?? ''),
      rows: rows.map((r) =>
        cols.map((c) => {
          const cell = cells[`${r}|${c}`] as any;
          if (cell === undefined || cell === null) return null;
          return typeof cell.f === 'string' ? { formula: cell.f } : (cell.v ?? null);
        }),
      ),
    });
  }
  return out;
}

/** The plain view of [content]: from the file when it has one, else worked out from the snapshot (not for Tables). */
export function plainOf(kind: Kind, content: Record<string, unknown>): Record<string, Json> | null {
  if (content.plain && typeof content.plain === 'object') return content.plain as Record<string, Json>;
  if (kind === 'stage' || kind === 'canvas' || kind === 'survey') return content.crdt ? plainFromSnapshot(kind, content.crdt) : null;
  return null;
}

/** [content] with its plain view added when it can be worked out here (Stage, Canvas, Survey) and is missing. */
export function withPlainFromSnapshot(kind: Kind, content: Record<string, unknown>): Record<string, unknown> {
  if (content.plain !== undefined || !content.crdt || (kind !== 'stage' && kind !== 'canvas' && kind !== 'survey')) return content;
  return { ...content, plain: plainFromSnapshot(kind, content.crdt) };
}

/** A Tables plain view from rows of values: the first row bold, a string starting with `=` a formula. */
export function tablesPlain(tables: { name: string; rows: (string | number | boolean | null)[][] }[]): Record<string, Json> {
  return {
    tables: tables.map((t) => {
      const width = Math.max(0, ...t.rows.map((r) => r.length));
      const typeOf = (c: number) => {
        const vs = t.rows.slice(1).map((r) => r[c]).filter((v) => v !== null && v !== undefined && !(typeof v === 'string' && v.startsWith('=')));
        if (vs.length && vs.every((v) => typeof v === 'number')) return 'number';
        if (vs.length && vs.every((v) => typeof v === 'boolean')) return 'checkbox';
        return 'text';
      };
      return {
        name: t.name,
        columns: Array.from({ length: width }, (_, c) => ({ type: typeOf(c) })),
        rows: t.rows.map((r, i) =>
          r.map((v): Json => {
            if (typeof v === 'string' && v.startsWith('=') && v.length > 1) return i === 0 ? { f: v, style: { b: 1 } } : { f: v };
            if (i === 0 && v !== null) return { v, style: { b: 1 } };
            return v ?? null;
          }),
        ),
      };
    }),
  };
}

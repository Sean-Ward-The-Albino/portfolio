// @ts-nocheck
// Copied from Avlory's avlory/packages/avlory_formats_js/src/package.ts (v1.2.0, Apache-2.0) by scripts/sync-avlory.mjs. Don't edit.
// Reading and writing Avlory packages (spec/container.md, manifest.md, encryption.md, limits.md).
import { AvloryFileError } from './errors.js';
import { SafeZip, writeZip, type ZipLimits } from './zip.js';
import { withPlainFromSnapshot } from './content.js';

export type Kind = 'quill' | 'tables' | 'stage' | 'canvas' | 'survey';
export type FormatId = `avlory.${Kind}`;

export const formats: Record<Kind, { id: FormatId; ext: string; mime: string; label: string }> = {
  quill: { id: 'avlory.quill', ext: 'quill', mime: 'application/vnd.avlory.quill+zip', label: 'Quill doc' },
  tables: { id: 'avlory.tables', ext: 'avtables', mime: 'application/vnd.avlory.tables+zip', label: 'Tables' },
  stage: { id: 'avlory.stage', ext: 'stage', mime: 'application/vnd.avlory.stage+zip', label: 'Stage deck' },
  canvas: { id: 'avlory.canvas', ext: 'canvas', mime: 'application/vnd.avlory.canvas+zip', label: 'Canvas board' },
  survey: { id: 'avlory.survey', ext: 'survey', mime: 'application/vnd.avlory.survey+zip', label: 'Survey' },
};

export function kindOfFormat(id: unknown): Kind | null {
  for (const [k, f] of Object.entries(formats)) if (f.id === id) return k as Kind;
  return null;
}

export function kindOfFileName(name: string): Kind | null {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  for (const [k, f] of Object.entries(formats)) if (f.ext === ext) return k as Kind;
  return null;
}

/** The format version this library writes and reads: newer minor versions open, newer major ones don't. */
export const packageMajor = 1;
export const packageMinor = 2;
export const libraryVersion = '1.2.0';

/** Limits (spec/limits.md). */
export const maxPackageBytes = 200 * 1024 * 1024;
export const maxPackageJsonDepth = 128;
export const packageZipLimits: ZipLimits = {
  maxEntries: 2000,
  maxEntryBytes: 100 * 1024 * 1024,
  maxTotalBytes: 300 * 1024 * 1024,
  maxRatio: 1100,
  ratioFloor: 1024 * 1024,
};
export const defaultKdfRounds = 310000;
const minRounds = 10000;
const maxRounds = 5000000;

export interface PackageAsset {
  path: string;
  name: string;
  type: string;
  ref?: string;
  size: number;
}

export interface PackageSource {
  repo: string;
  branch: string;
  path: string;
  commit?: string;
  version?: string;
}

export interface Manifest {
  kind: Kind;
  format: FormatId;
  major: number;
  minor: number;
  title: string;
  createdAt?: string;
  modifiedAt?: string;
  exportedAt?: string;
  appName: string;
  appVersion: string;
  itemId?: string;
  use?: 'business' | 'personal';
  encrypted: boolean;
  assets: PackageAsset[];
  hasPreview: boolean;
  /** Optional JSON parts beside content.json (e.g. a survey's responses.json). */
  parts: string[];
  source?: PackageSource;
}

/** A package's whole content, opened. */
export interface AvloryPackage {
  manifest: Manifest;
  /** content.json. For Tables, Stage, Canvas and Survey: `crdt` (the snapshot) and/or `plain` (format 1.2). */
  content: Record<string, unknown>;
  /** Asset bytes by path. */
  assets: Map<string, Uint8Array>;
  preview?: Uint8Array;
  /** Other JSON parts by name. */
  parts: Map<string, unknown>;
}

const damaged = (m = 'This file is damaged.') => new AvloryFileError('damaged', m);

/** How deep a JSON value nests, counted without recursion, giving up past [stop]. */
export function jsonDepth(v: unknown, stop = 1 << 30): number {
  let deepest = 0;
  const todo: [unknown, number][] = [[v, 0]];
  while (todo.length) {
    const [x, d] = todo.pop()!;
    if (x === null || typeof x !== 'object') continue;
    if (d + 1 > deepest) deepest = d + 1;
    if (deepest > stop) return deepest;
    for (const c of Array.isArray(x) ? x : Object.values(x)) if (c !== null && typeof c === 'object') todo.push([c, d + 1]);
  }
  return deepest;
}

function parseJson(bytes: Uint8Array): unknown {
  let v: unknown;
  try {
    v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw damaged();
  }
  if (jsonDepth(v, maxPackageJsonDepth) > maxPackageJsonDepth) throw damaged();
  return v;
}

async function readJson(zip: SafeZip, name: string): Promise<unknown | undefined> {
  const b = await zip.read(name);
  return b === null ? undefined : parseJson(b);
}

const isObject = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Reads a manifest; fields it doesn't know are ignored. */
export function parseManifest(raw: unknown): Manifest {
  if (!isObject(raw)) throw damaged("This file's manifest is damaged.");
  const kind = kindOfFormat(raw.format);
  if (!kind) throw new AvloryFileError('notPackage', "This isn't an Avlory file.");
  const v = String(raw.formatVersion ?? '1.0').split('.');
  const major = Number.parseInt(v[0], 10) || 1;
  const minor = v.length > 1 ? Number.parseInt(v[1], 10) || 0 : 0;
  if (major > packageMajor) {
    throw new AvloryFileError('newerVersion', `This ${formats[kind].label} file was made by a newer version of Avlory (format ${major}.${minor}). Update to open it.`);
  }
  const item = isObject(raw.item) ? raw.item : {};
  const app = isObject(raw.app) ? raw.app : {};
  const contents: unknown[] = Array.isArray(raw.contents) ? raw.contents : [];
  const str = (x: unknown, max = Infinity) => (typeof x === 'string' && x.length > 0 && x.length <= max ? x : undefined);
  const assets: PackageAsset[] = [];
  for (const a of Array.isArray(raw.assets) ? raw.assets : []) {
    if (!isObject(a) || typeof a.path !== 'string') continue;
    if (!a.path.startsWith('assets/') || a.path.includes('..')) continue;
    assets.push({
      path: a.path,
      name: typeof a.name === 'string' ? a.name : a.path.slice(7),
      type: typeof a.type === 'string' ? a.type : 'application/octet-stream',
      ...(typeof a.ref === 'string' ? { ref: a.ref } : {}),
      size: typeof a.size === 'number' ? Math.trunc(a.size) : 0,
    });
  }
  let source: PackageSource | undefined;
  if (isObject(raw.source) && typeof raw.source.repo === 'string' && typeof raw.source.path === 'string') {
    const s = raw.source;
    source = { repo: s.repo, branch: str(s.branch, 200) ?? '', path: s.path, commit: str(s.commit, 200), version: str(s.version, 200) };
  }
  const time = (x: unknown) => (typeof x === 'string' ? x : undefined);
  return {
    kind,
    format: formats[kind].id,
    major,
    minor,
    title: typeof raw.title === 'string' ? raw.title : '',
    createdAt: time(raw.createdAt),
    modifiedAt: time(raw.modifiedAt),
    exportedAt: time(raw.exportedAt),
    appName: typeof app.name === 'string' ? app.name : '',
    appVersion: typeof app.version === 'string' ? app.version : '',
    itemId: str(item.id, 64),
    use: item.use === undefined || item.use === null ? undefined : item.use === 'personal' ? 'personal' : 'business',
    encrypted: raw.encrypted === true,
    assets,
    hasPreview: contents.includes('preview.png'),
    parts: contents.filter((c): c is string => typeof c === 'string' && c !== 'content.json' && c !== 'manifest.json' && /^[a-z][a-z0-9_-]{0,40}\.json$/.test(c)),
    source,
  };
}

function manifestJson(m: Manifest, encrypted: boolean): Record<string, unknown> {
  const drop = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  return {
    format: m.format,
    formatVersion: `${m.major}.${m.minor}`,
    kind: m.kind,
    title: m.title,
    createdAt: m.createdAt ?? null,
    modifiedAt: m.modifiedAt ?? null,
    exportedAt: m.exportedAt ?? null,
    app: { name: m.appName, version: m.appVersion },
    item: drop({ id: m.itemId, use: m.use }),
    encrypted,
    contents: ['content.json', ...m.parts, ...(m.hasPreview ? ['preview.png'] : [])],
    assets: m.assets.map((a) => drop({ path: a.path, name: a.name, type: a.type, ref: a.ref, size: a.size })),
    ...(m.source ? { source: drop({ ...m.source }) } : {}),
  };
}

async function outer(bytes: Uint8Array): Promise<[Record<string, unknown>, SafeZip]> {
  if (bytes.length > maxPackageBytes) throw damaged('This file is too big to open (at most 200 MB).');
  const zip = SafeZip.open(bytes, packageZipLimits);
  if (!zip.has('manifest.json')) throw new AvloryFileError('notPackage', "This isn't an Avlory file.");
  const raw = await readJson(zip, 'manifest.json');
  return [raw as Record<string, unknown>, zip];
}

/** What a package shows without its password: the whole manifest of a clear package, the outer one of an encrypted one. */
export async function inspectPackage(bytes: Uint8Array): Promise<Record<string, unknown>> {
  const [raw] = await outer(bytes);
  parseManifest(raw);
  return raw;
}

function aad(format: FormatId, rounds: number, salt: string): Uint8Array {
  return new TextEncoder().encode(`avlory-package-v1|${format}|${rounds}|${salt}`);
}

async function passwordKey(password: string, salt: Uint8Array, rounds: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function b64decode(s: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw damaged();
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64encode(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export interface ReadOptions {
  password?: string;
  /** Refuse (wrongKind) a package of another app. */
  expect?: Kind;
}

/** Opens a package. An encrypted one needs [password]; a wrong one is a `wrongPassword` problem. */
export async function readPackage(bytes: Uint8Array, opts: ReadOptions = {}): Promise<AvloryPackage> {
  const [rawOuter, zip] = await outer(bytes);
  const outerManifest = parseManifest(rawOuter);
  if (opts.expect && outerManifest.kind !== opts.expect) {
    throw new AvloryFileError('wrongKind', `That's a ${formats[outerManifest.kind].label} file, not a ${formats[opts.expect].label} file.`);
  }
  let files = zip;
  if (outerManifest.encrypted) {
    if (!opts.password) throw new AvloryFileError('needsPassword', 'This file is encrypted. Enter its password to open it.');
    const enc = isObject(rawOuter.encryption) ? rawOuter.encryption : {};
    const rounds = typeof enc.rounds === 'number' ? Math.trunc(enc.rounds) : 0;
    const payload = await zip.read('payload.bin');
    if (enc.cipher !== 'AES-256-GCM' || enc.kdf !== 'PBKDF2-HMAC-SHA256' || typeof enc.salt !== 'string' || typeof enc.nonce !== 'string' || !payload) {
      throw damaged("This file's encryption isn't one this library knows.");
    }
    if (rounds < minRounds || rounds > maxRounds) throw damaged("This file's encryption settings are damaged.");
    if (payload.length < 16) throw damaged();
    const salt = b64decode(enc.salt), nonce = b64decode(enc.nonce);
    let clear: Uint8Array;
    try {
      const key = await passwordKey(opts.password, salt, rounds);
      clear = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(outerManifest.format, rounds, enc.salt), tagLength: 128 }, key, payload));
    } catch {
      throw new AvloryFileError('wrongPassword', "That password isn't right for this file.");
    }
    // The ZIP inside shares the outer one's budget, so nesting doesn't double what can be unpacked
    files = SafeZip.open(clear, packageZipLimits, zip.unpacked, 'damaged');
  }
  const mf = await readJson(files, 'manifest.json');
  if (mf === undefined) throw damaged();
  const parsed = parseManifest(mf);
  if (parsed.format !== outerManifest.format) throw damaged();
  const manifest: Manifest = { ...parsed, encrypted: outerManifest.encrypted };
  const content = await readJson(files, 'content.json');
  if (!isObject(content)) throw damaged('This file has no content.');
  const assets = new Map<string, Uint8Array>();
  for (const a of manifest.assets) {
    const b = await files.read(a.path);
    if (b) assets.set(a.path, b);
  }
  const parts = new Map<string, unknown>();
  for (const name of manifest.parts) if (files.has(name)) parts.set(name, await readJson(files, name));
  const preview = (await files.read('preview.png')) ?? undefined;
  return { manifest, content, assets, preview, parts };
}

/** JSON with keys sorted and one value per line, so the same content is always the same bytes. */
export function stableJson(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort) : isObject(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v;
  return JSON.stringify(sort(value), null, 1);
}

export interface WriteOptions {
  password?: string;
  rounds?: number;
  /** Tables, Stage, Canvas and Survey: add the plain view worked out from the snapshot when it's missing (default true). */
  addPlain?: boolean;
}

/** A manifest for a new package. */
export function newManifest(kind: Kind, title: string, extra: Partial<Manifest> = {}): Manifest {
  const now = new Date().toISOString();
  return {
    kind,
    format: formats[kind].id,
    major: packageMajor,
    minor: packageMinor,
    title,
    createdAt: now,
    modifiedAt: now,
    exportedAt: now,
    appName: '@avlory/formats',
    appVersion: libraryVersion,
    encrypted: false,
    assets: [],
    hasPreview: false,
    parts: [],
    ...extra,
  };
}

/** Writes a package; with a password everything but the format's name is sealed. */
export async function writePackage(pkg: { manifest: Manifest; content: Record<string, unknown>; assets?: Map<string, Uint8Array>; preview?: Uint8Array; parts?: Map<string, unknown> }, opts: WriteOptions = {}): Promise<Uint8Array> {
  const m = pkg.manifest;
  const enc = new TextEncoder();
  let content = pkg.content;
  if (opts.addPlain !== false && m.kind !== 'quill') content = withPlainFromSnapshot(m.kind, content);
  if (m.kind !== 'quill' && content.crdt === undefined && content.plain !== undefined && (m.major < 1 || (m.major === 1 && m.minor < 2))) {
    throw new Error('A file with only the plain view must say format 1.2 or later');
  }
  const inner: [string, Uint8Array][] = [
    ['manifest.json', enc.encode(JSON.stringify(manifestJson(m, opts.password !== undefined), null, 2))],
    ['content.json', enc.encode(stableJson(content))],
  ];
  for (const a of m.assets) {
    const b = pkg.assets?.get(a.path);
    if (b) inner.push([a.path, b]);
  }
  for (const name of m.parts) if (pkg.parts?.has(name)) inner.push([name, enc.encode(stableJson(pkg.parts.get(name)))]);
  if (pkg.preview && m.hasPreview) inner.push(['preview.png', pkg.preview]);
  const mime = enc.encode(formats[m.kind].mime);
  if (opts.password === undefined) return writeZip([['mimetype', mime], ...inner], new Set(['mimetype']));
  if (opts.password === '') throw new Error('Choose a password');
  const rounds = opts.rounds ?? defaultKdfRounds;
  if (rounds < minRounds || rounds > maxRounds) throw new Error(`rounds must be from ${minRounds} to ${maxRounds}`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const saltB64 = b64encode(salt);
  const key = await passwordKey(opts.password, salt, rounds);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(m.format, rounds, saltB64), tagLength: 128 }, key, await writeZip(inner)),
  );
  const outerManifest = {
    format: m.format,
    formatVersion: `${m.major}.${m.minor}`,
    kind: m.kind,
    encrypted: true,
    encryption: { cipher: 'AES-256-GCM', kdf: 'PBKDF2-HMAC-SHA256', rounds, salt: saltB64, nonce: b64encode(nonce) },
    app: { name: m.appName, version: m.appVersion },
    contents: ['payload.bin'],
  };
  return writeZip(
    [
      ['mimetype', mime],
      ['manifest.json', enc.encode(JSON.stringify(outerManifest, null, 2))],
      ['payload.bin', sealed],
    ],
    new Set(['mimetype']),
  );
}

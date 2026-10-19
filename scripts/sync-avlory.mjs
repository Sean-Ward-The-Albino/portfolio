#!/usr/bin/env node
/**
 * Pulls the public facts about Avlory out of an Avlory checkout and into this site.
 *
 *   node scripts/sync-avlory.mjs ../avlory          (path to the Avlory repo; defaults to ../avlory)
 *   node scripts/sync-avlory.mjs ../avlory --check  (report what would change, write nothing)
 *
 * Writes:
 *   content/avlory/generated.json   versions, roadmap, engineering stats (never edit by hand)
 *   web/public/brand/               current logos and Avlory Next space icons
 *   web/src/vendor/avlory-formats/  the @avlory/formats reader, used to render .quill posts
 *
 * It reads only public-facing sources: the avlory.com site files, app pubspecs, build files and file counts.
 * It never reads Money's decisions, internal economics, security docs or user data. When a source can't be
 * parsed, the previous value is kept and a warning is printed, so a markup change at Avlory never blanks the site.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const REPO = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(ROOT, '..', 'avlory'));
const OUT = path.join(ROOT, 'content/avlory/generated.json');
const yaml = createRequire(path.join(ROOT, 'web/package.json'))('js-yaml');

const warnings = [];
const warn = (msg) => warnings.push(msg);
const read = (rel) => {
  const p = path.join(REPO, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

if (!fs.existsSync(path.join(REPO, 'avlory/apps'))) {
  console.error(`No Avlory checkout at ${REPO}. Pass its path: node scripts/sync-avlory.mjs /path/to/avlory`);
  process.exit(1);
}

const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const products = yaml.load(fs.readFileSync(path.join(ROOT, 'content/avlory/products.yaml'), 'utf8'));
const WEB = 'avlory/apps/avlory_web/public';

// ---------- Roadmap, from avlory.com's ecosystem page ----------

const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();

function parseRoadmap(html) {
  const section = html?.match(/<section id="roadmap"[\s\S]*?<\/section>/)?.[0];
  if (!section) return null;
  const rows = section.split(/<div class="timeline-row\b/).slice(1);
  const items = rows.map((row) => {
    const node = row.match(/class="timeline-node([^"]*)"/)?.[1] ?? '';
    const front = row.match(/class="flip-front">([\s\S]*?)<div class="flip-back">/)?.[1] ?? '';
    const back = row.match(/class="flip-back">([\s\S]*)/)?.[1] ?? '';
    const name = strip(front.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? '');
    const label = strip(front.match(/<p class="label"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');
    const theme = strip(back.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? '');
    const detail = strip(back.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');
    const state = /\bactive\b/.test(node) ? 'done' : /in-progress/.test(node) ? 'now' : 'next';
    const when = label.replace(/^Launched:?\s*/i, '') || (detail.match(/Launched ([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?, \d{4})/)?.[1] ?? '');
    return { name, state, when: when.replace(/(\d)(st|nd|rd|th)/, '$1'), theme, detail };
  });
  return items.every((i) => i.name) && items.length ? items : null;
}

let roadmap = parseRoadmap(read(`${WEB}/ecosystem.html`));
if (!roadmap) {
  warn('Roadmap: could not read the timeline in ecosystem.html; kept the previous roadmap.');
  roadmap = previous.roadmap ?? [];
}
for (const item of roadmap) item.product = products.find((p) => p.roadmap?.includes(item.name))?.slug ?? null;

// ---------- Products: versions and status ----------

const productFacts = {};
for (const p of products) {
  const facts = {};
  if (p.pubspec) {
    const version = read(p.pubspec)?.match(/^version:\s*([^\s#]+)/m)?.[1];
    if (version) {
      const [semver, build] = version.split('+');
      facts.version = semver;
      if (build) facts.build = Number(build);
    } else warn(`${p.name}: no version in ${p.pubspec}; kept the previous one.`);
  }
  const mine = roadmap.filter((r) => r.product === p.slug);
  const shipped = mine.filter((r) => r.state === 'done');
  if (p.status) facts.status = p.status;
  else if (shipped.length) facts.status = 'live';
  else if (mine.some((r) => r.state === 'now')) facts.status = 'building';
  else facts.status = 'soon';
  if (shipped.length) facts.latest = shipped.at(-1).name;
  const upcoming = mine.find((r) => r.state !== 'done');
  if (upcoming) facts.next = { name: upcoming.name, when: upcoming.when };
  productFacts[p.slug] = { ...previous.products?.[p.slug], ...facts };
}

// Waverate on Android is a closed beta until the site says otherwise.
const waverateHome = read(`${WEB}/waverate/index.html`) ?? '';
if (productFacts.waverate) productFacts.waverate.androidBeta = /closed beta/i.test(waverateHome);

// ---------- Engineering stats, from the files themselves ----------

function git(...a) {
  return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const GENERATED = [/\.g\.dart$/, /\.freezed\.dart$/, /\.mocks\.dart$/, /\/generated\//, /\/vendor\//, /\.min\.(js|css)$/,
  /converters\/converters\.js$/, /\/build\//, /\/node_modules\//, /package-lock\.json$/,
  // compiled output and bundled third-party code shipped as app assets
  /\.dart\.js$/, /\/firebasejs\//, /admin_app\/assets\//];
const LANGS = { '.dart': 'Dart', '.java': 'Java', '.ts': 'TypeScript', '.js': 'JavaScript', '.mjs': 'JavaScript',
  '.py': 'Python', '.swift': 'Swift', '.kt': 'Kotlin', '.html': 'HTML', '.css': 'CSS', '.sql': 'SQL' };

let stats = previous.stats ?? {};
try {
  const files = git('ls-files').split('\n').filter(Boolean);
  const languages = {};
  for (const f of files) {
    const lang = LANGS[path.extname(f)];
    if (!lang || GENERATED.some((r) => r.test(f))) continue;
    const full = path.join(REPO, f);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    const entry = (languages[lang] ??= { files: 0, lines: 0 });
    entry.files += 1;
    entry.lines += text.split('\n').filter((l) => l.trim()).length;
  }
  const apps = fs.readdirSync(path.join(REPO, 'avlory/apps'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const has = (app, file) => fs.existsSync(path.join(REPO, 'avlory/apps', app, file));
  const pom = read('avlory/apps/identity_gateway/pom.xml') ?? '';
  stats = {
    files: files.length,
    languages: Object.fromEntries(Object.entries(languages).sort((a, b) => b[1].lines - a[1].lines)),
    apps: apps.length,
    flutterApps: apps.filter((a) => has(a, 'pubspec.yaml') && (has(a, 'android') || has(a, 'ios') || has(a, 'lib/main.dart'))).length,
    springServices: apps.filter((a) => has(a, 'pom.xml') || has(a, 'build.gradle') || has(a, 'build.gradle.kts')).length,
    packages: fs.readdirSync(path.join(REPO, 'avlory/packages'), { withFileTypes: true }).filter((d) => d.isDirectory()).length,
    springBoot: pom.match(/<artifactId>spring-boot-starter-parent<\/artifactId>\s*<version>([^<]+)/)?.[1] ?? stats.springBoot,
    java: pom.match(/<java\.version>([^<]+)/)?.[1] ?? stats.java,
  };
} catch (e) {
  warn(`Stats: ${e.message.split('\n')[0]}; kept the previous stats.`);
}

// ---------- Company words, from avlory.com's home page ----------

const home = read(`${WEB}/index.html`) ?? '';
const company = {
  tagline: strip(home.match(/<h1[^>]*hero-title[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '') || previous.company?.tagline,
  description: home.match(/property="og:description"\s+content="([^"]+)"/)?.[1] ?? previous.company?.description,
};

// ---------- Logos and space icons ----------

const brandDir = path.join(ROOT, 'web/public/brand');
const LOGOS = {
  'avlory.svg': `${WEB}/assets/avlory-logo-icon.svg`,
  'waverate.svg': `${WEB}/assets/explore/waverate-logo-round.svg`,
  'pennysphere.svg': `${WEB}/assets/explore/pennysphere-logo-round.svg`,
  'upnext.svg': `${WEB}/assets/explore/upnext.svg`,
};
const SPACES = ['calendar', 'projects', 'messages', 'mail', 'connect', 'quill', 'tables', 'stage', 'survey', 'canvas', 'cloud'];
for (const s of SPACES) LOGOS[`spaces/${s}.svg`] = `${WEB}/assets/explore/${s}.svg`;

const copies = [];
for (const [name, src] of Object.entries(LOGOS)) {
  const svg = read(src);
  if (!svg) { warn(`Logo missing: ${src}`); continue; }
  // These are shown with <img>, where scripts never run, but refuse anything active all the same.
  if (/<script|\son\w+\s*=|javascript:|<foreignObject/i.test(svg)) { warn(`Logo refused (active content): ${src}`); continue; }
  copies.push([path.join(brandDir, name), svg]);
}

// ---------- The @avlory/formats reader, for .quill posts ----------

const FORMATS_SRC = 'avlory/packages/avlory_formats_js';
const vendorDir = path.join(ROOT, 'web/src/vendor/avlory-formats');
const formatsFiles = ['errors.ts', 'zip.ts', 'content.ts', 'package.ts'];
const formatsVersion = JSON.parse(read(`${FORMATS_SRC}/package.json`) ?? '{}').version;
for (const f of formatsFiles) {
  const src = read(`${FORMATS_SRC}/src/${f}`);
  if (src) copies.push([path.join(vendorDir, f), `// @ts-nocheck\n// Copied from Avlory's ${FORMATS_SRC}/src/${f} (v${formatsVersion}, Apache-2.0) by scripts/sync-avlory.mjs. Don't edit.\n${src}`]);
  else warn(`Formats library file missing: ${f}`);
}
const license = read(`${FORMATS_SRC}/LICENSE`);
if (license) copies.push([path.join(vendorDir, 'LICENSE'), license]);

// ---------- Write ----------

let commit = null;
try { commit = git('rev-parse', '--short', 'HEAD').trim(); } catch { /* not a git checkout */ }

const generated = {
  $comment: 'Written by scripts/sync-avlory.mjs. Do not edit; change content/avlory/products.yaml or re-run the sync.',
  syncedAt: new Date().toISOString(),
  avloryCommit: commit,
  company,
  products: productFacts,
  roadmap,
  stats,
  formatsVersion,
};

const before = JSON.stringify({ ...previous, syncedAt: null, avloryCommit: null });
const after = JSON.stringify({ ...generated, syncedAt: null, avloryCommit: null });

if (CHECK) {
  console.log(before === after ? 'Avlory facts: up to date.' : 'Avlory facts: would change. Run without --check to update.');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(generated, null, 2) + '\n');
  for (const [file, text] of copies) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  const live = Object.entries(productFacts).map(([k, v]) => `${k} ${v.status}${v.version ? ` v${v.version}` : ''}`).join(', ');
  console.log(`Synced from Avlory ${commit ?? ''}: ${roadmap.length} roadmap items; ${live}.`);
  console.log(`Stats: ${stats.apps} apps, ${stats.files} files. Logos: ${copies.filter(([f]) => f.startsWith(brandDir)).length}.`);
  console.log(before === after ? 'Nothing changed.' : 'Changed: rebuild and deploy to publish.');
}
for (const w of warnings) console.warn(`warning: ${w}`);

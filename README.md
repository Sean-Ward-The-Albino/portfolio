# seanward.dev

Sean D. Ward's site: Astro builds the pages, Spring Boot serves them and runs the small API.

```
content/       everything you write: profile, about, now, posts, Avlory product words
web/           the Astro site (pages, design, the aurora, the orbit, the wheel)
server/        the Spring Boot app (serves the site, reactions, feedback, Waverate "Now rating")
scripts/       sync-avlory.mjs, which pulls the latest facts from the Avlory repo
Dockerfile     builds the whole thing into one container for Cloud Run
```

## Everyday edits

Almost everything you'll change is in `content/`. Edit, then preview (below), then deploy.

| To change | Edit |
|---|---|
| Your name, role, tagline, social links, CV link | `content/profile.yaml` |
| The About page: story, milestones, interests, people, thanks | `content/about.yaml` |
| The Now page and the "Right now" line on Home | `content/now.yaml` (bump `updated:`) |
| How each Avlory product is described, its color, its order | `content/avlory/products.yaml` |
| Versions, roadmap, statuses, code stats, logos | Don't edit: run the Avlory sync |

Delete a section in a YAML file and it disappears from the page. Put text with a colon in quotes.

## Writing a post

Make a file in `content/posts/`. Its name becomes the address: `my-first-post.md` is `/writing/my-first-post`.

```markdown
---
title: "What I learned shipping Waverate V3"
summary: "One or two sentences. Shown in lists, search and link previews."
kind: avlory          # avlory (On Avlory), life (Life) or take (Takes)
date: 2026-10-20
verdict: "Bullish"    # optional, for takes
draft: true           # optional: shows only while previewing locally
---

Write in Markdown here.
```

Always put `title` and `summary` in quotes.

**Live Avlory items in a post.** Name the file `.mdx` instead of `.md`, then:

```mdx
<AvloryEmbed link="https://hub.avlory.com/#/drive?item=0199..." caption="Our launch plan" />
```

It works for Quill docs, Tables, Stage decks, Canvas boards and published Surveys. In Avlory, turn embedding on for
the item and add this site to its list of allowed sites.

**Writing in Quill.** Save a Quill doc into `content/posts/` (for example `on-privacy.quill`). It becomes a post, with
the doc's own title. Add `on-privacy.yaml` beside it for the rest:

```yaml
summary: "Why Avlory will never sell your data."
kind: avlory
date: 2026-10-20
```

Tables, charts and Canvas frames in the doc become live embeds. Comments and suggested deletions are left out.
Password-protected docs can't be published. Export a copy without a password.

## Keeping Avlory facts current

When something ships at Avlory, run this from this folder with the Avlory repo next to it:

```bash
node scripts/sync-avlory.mjs ../avlory
```

It updates `content/avlory/generated.json` (app versions, the roadmap from avlory.com, statuses, code stats), copies
the current logos into `web/public/brand/`, and refreshes the Quill reader. It reads only public-facing files: the
avlory.com pages, pubspecs and build files. It never reads Money's decisions, economics, security docs or user data.
If a source changes shape, it keeps the last good value and prints a warning instead of blanking the site.

Add `--check` to see whether anything changed without writing.

## Preview on your machine

```bash
cd web && npm install && npm run dev        # http://localhost:4321, drafts included, live reload
```

To run it exactly as production does (Spring Boot serving the built site):

```bash
cd web && npm run build
cd ../server && ./mvnw spring-boot:run      # http://localhost:8080
cd ../server && ./mvnw test                 # the server's tests (build the site first)
```

## Deploying to Cloud Run

One container, built from the repo root.

```bash
gcloud run deploy seanward-site --source . --region us-central1 --allow-unauthenticated \
  --min-instances 0 --max-instances 3 --memory 256Mi \
  --set-env-vars SITE_STORE=firestore,GOOGLE_CLOUD_PROJECT=<project> \
  --set-secrets WAVERATE_API_KEY=waverate-api-key:latest,WAVERATE_UID=waverate-uid:latest,TURNSTILE_SECRET=turnstile-secret:latest
```

- The default image is a GraalVM native executable: it starts in about 50 ms, so scaling to zero costs nothing in
  speed. For a quicker build, use `docker build --target jvm .` instead.
- Set your real domain at build time: `SITE_URL` (build arg, default `https://seanward.dev`).

**Settings**

| Variable | What it does |
|---|---|
| `SITE_STORE` | `firestore` in production (reactions and feedback survive restarts); `memory` locally |
| `GOOGLE_CLOUD_PROJECT` | The Firestore project. Give the Cloud Run service account the "Cloud Datastore User" role |
| `WAVERATE_API_KEY`, `WAVERATE_UID` | Turns on the "Now rating" card. Create a `read:waverate` key in Avlory; the UID is your Waverate user id. Secrets only, never in the repo |
| `TURNSTILE_SECRET` + build arg `PUBLIC_TURNSTILE_SITE_KEY` | Turns on Cloudflare's bot check for the feedback box |

Feedback lands in the Firestore `feedback` collection; read it in the Firebase console.

**Cloudflare in front (recommended).** Point the domain at Cloud Run through Cloudflare. Pages are sent with
`s-maxage=600, stale-while-revalidate=86400`, so Cloudflare answers almost every visit without waking the server.
Purge the cache after each deploy. Add a rate-limiting rule on `/api/*`.

## What's where in the code

- `web/src/content.config.ts`: how posts are read, including the `.quill` loader built on Avlory's own formats library.
- `web/src/scripts/aurora.ts`: the home page light, in hand-written WebGPU and WebGL2 shaders.
- `web/src/scripts/orbit.ts`: the 3D Avlory orbit (three.js, loaded only on that page).
- `web/src/components/Wheel.astro`, `CommandPalette.astro`: the wheel menu and Cmd/Ctrl+K search.
- `web/src/styles/global.css`: colors, type scale, reading mode.
- `web/src/inline-scripts.mjs`: the only two inline scripts, whose hashes go into the Content-Security-Policy.
- `server/src/main/java/dev/seanward/site/`: `web/` serves pages and security headers; `api/` holds reactions,
  feedback and rate limits; `waverate/` holds the Now rating; `store/` holds memory and Firestore storage.

## Security, in short

- Every script and style on a page is allowed by hash in a strict Content-Security-Policy. No inline code runs
  without a hash, and no third-party scripts load except Avlory embeds and Turnstile where used.
- HSTS, no framing, nosniff, a locked-down Permissions-Policy, and a deny-everything policy on API responses.
- No cookies and no trackers. Rate limits use a daily-salted hash of the visitor's address that is never stored.
- Feedback is validated and size-limited, has a honeypot, and can require Turnstile. Reactions only count for posts
  that exist.
- The Waverate API key stays on the server. The container runs as a non-root user on a distroless image.
- npm dependencies are pinned to releases at least two weeks old.

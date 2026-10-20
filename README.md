# Sean D. Ward

My site: a set of small worlds you can walk through. Home is the coast at Mission Beach; above it are Story, Craft (with Avlory's products), Life, and a Game planet everyone shares.

- **Front end:** `web/`, built with Vite and three.js. The art is hand-shaped and flat-shaded, with no textures to download, so it runs smoothly on phones.
- **Back end:** `server/`, Spring Boot 4 on Java 21. It serves the site and runs everything behind it: the words on every world, uploads, feedback, album ratings, a chess engine with the full FIDE rules, site-wide counts, the shared Game planet with live presence over WebSockets, and my latest Waverate ratings.
- **Words:** `content/site.json` holds the starting text. Edit it there, or live from the admin panel.

## Run it

You need Node.js 20+ and Java 21+.

```
./dev.sh
```

Then open http://localhost:8080. The admin panel is at http://localhost:8080/admin, and the token is `local` (set `ADMIN_TOKEN` to change it).

To work on the front end with live reload, run `./dev.sh watch` and open http://localhost:5173.

Anything saved (feedback, ratings, lanterns, counts, edits) goes in `data/site-data.json`, and uploads go in `data/media/`. Delete the `data` folder to start fresh.

In the admin panel you can edit every line, upload photos into each stop's photo slots (they're resized in your browser first, so iPhone photos work), and upload tracks for the record player.

## What visitors can do

| Where | What |
|---|---|
| Everywhere | Scroll or swipe up for the next stop. Drag to look around. Tap anything with a glowing tag. Press **Walk** to wander freely (WASD on a keyboard, the stick on a phone). |
| Home | Change the time of day (it follows San Diego's real time), play the record, write in the sand (kept only in your browser), ride the Giant Dipper, send me a message from the lighthouse. |
| Craft | Rate any album the way Waverate does, try PennySphere's safe-to-spend numbers, see the real app screens. |
| Life | Chess by the full rules: a daily puzzle, a trainer for my openings, and a free board. Make my Spanish latte step by step, reverse-sear a steak by touch, flip through my top-rated records. |
| Game | Leave a lantern with a note, and see everyone else who's on the planet right now as fireflies. |

Only the Game planet is shared between visitors. Everything else a visitor does stays in their own browser.

## Settings

All settings are environment variables. None of them are needed to run locally.

| Variable | What it does |
|---|---|
| `ADMIN_TOKEN` | The admin panel's token. Without it, a random one is printed in the log at startup. |
| `SITE_DATA_DIR` | Where saved data goes. Defaults to `data`. |
| `WAVERATE_API_KEY`, `WAVERATE_UID` | Turn on the "just rated" shelf with my live Waverate ratings. The key stays on the server. |
| `TURNSTILE_SECRET` | Makes feedback pass Cloudflare Turnstile. |
| `MEDIA_BUCKET` | A Cloud Storage bucket for uploaded photos and tracks (allow public reads). Without it, uploads go to `data/media`. |
| `MEDIA_PUBLIC_BASE` | Optional CDN or custom domain in front of the bucket. |

## Tests

```
cd server && ./mvnw test
```

## Deploy

`docker build --target jvm -t seanward-site .` builds a JVM image. A plain `docker build` makes a GraalVM native image instead, which starts in about 50 ms. On Cloud Run, mount a volume for `SITE_DATA_DIR` (or move the store to Firestore) so saved data survives new instances.

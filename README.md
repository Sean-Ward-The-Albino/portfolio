# Sean D. Ward

My site: a set of small worlds you can walk through. Home is the coast at Mission Beach; above it are Story, Craft (with Avlory's products), Life, and a Game planet everyone shares.

- **Front end:** `web/`, built with Vite and three.js. The art is hand-shaped and flat-shaded, with no textures to download, so it runs smoothly on phones.
- **Back end:** `server/`, Spring Boot 4 on Java 21. It serves the site and runs the API: the words on every world, feedback, album ratings, the shared Game planet, and my latest Waverate ratings.
- **Words:** `content/site.json` holds the starting text. Edit it there, or live from the admin panel.

## Run it

You need Node.js 20+ and Java 21+.

```
./dev.sh
```

Then open http://localhost:8080. The admin panel is at http://localhost:8080/admin, and the token is `local` (set `ADMIN_TOKEN` to change it).

To work on the front end with live reload, run `./dev.sh watch` and open http://localhost:5173.

Anything saved (feedback, ratings, lanterns, edits) goes in `data/site-data.json`. Delete that file to start fresh.

## What visitors can do

| Where | What |
|---|---|
| Everywhere | Scroll or swipe up for the next stop. Drag to look around. Tap anything with a glowing tag. Press **Walk** to wander freely (WASD on a keyboard, the stick on a phone). |
| Home | Change the time of day (it follows San Diego's real time), play the record, write in the sand (kept only in your browser), ride the Giant Dipper, send me a message from the lighthouse. |
| Craft | Rate any album the way Waverate does, try PennySphere's safe-to-spend numbers, see the real app screens. |
| Life | Solve a chess puzzle, flip through the records. |
| Game | Leave a lantern with a note. Everyone sees everyone's lanterns, live. |

Only the Game planet is shared between visitors. Everything else a visitor does stays in their own browser.

## Settings

All settings are environment variables. None of them are needed to run locally.

| Variable | What it does |
|---|---|
| `ADMIN_TOKEN` | The admin panel's token. Without it, a random one is printed in the log at startup. |
| `SITE_DATA_DIR` | Where saved data goes. Defaults to `data`. |
| `WAVERATE_API_KEY`, `WAVERATE_UID` | Turn on the "just rated" shelf with my live Waverate ratings. The key stays on the server. |
| `TURNSTILE_SECRET` | Makes feedback pass Cloudflare Turnstile. |

## Tests

```
cd server && ./mvnw test
```

## Deploy

`docker build --target jvm -t seanward-site .` builds a JVM image. A plain `docker build` makes a GraalVM native image instead, which starts in about 50 ms. On Cloud Run, mount a volume for `SITE_DATA_DIR` (or move the store to Firestore) so saved data survives new instances.

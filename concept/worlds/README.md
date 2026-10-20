# Worlds concept (v7)

A prototype of the new site: you land on a San Diego coast, Avlory's products orbit in the sky, and scrolling walks you from stop to stop with one subtitle line at a time. Tap things in the world, or the button next to the line, to open more.

This is a concept, not the production site. three.js loads from a CDN, so you need an internet connection.

## Run it

The app screens load as images, which browsers block when you open the file directly. Serve the folder instead. From this folder, run either:

```
python3 -m http.server 8000
```

or

```
npx serve .
```

Then open http://localhost:8000 (or the address `serve` prints).

The arrival flight plays only on your first visit. To see it again, clear the site's storage in your browser or open a private window.

## What's real and what isn't

- Waverate screens are real screenshots from avlory.com.
- Avlory Next screens are the real designs captured from avlory.com/explore.
- PennySphere and UpNext screens are design previews drawn from each app's colours and labels. They're marked "Preview".
- [Brackets] mark text Sean still needs to write. Photo slots are empty until photos arrive.

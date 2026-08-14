# Monkey Island Web

Render a normal website as a point-and-click adventure game (SCUMM-era interface).

The page becomes a SCENE, links become HOTSPOTS (clickable objects/verbs — "look at", "go to", "talk to"), the article text becomes the scene description/narration, and clicking a link is the game's movement/verb.

## How to play
- **Mouse**: Click a verb on the bottom-left ("Look at", "Go to", "Talk to", "Use"), then click an object/hotspot on the bottom-right.
- **Keyboard**: Use keys 1, 2, 3, 4 to select verbs.
- Watch the top panel for narration and story log as you interact with the page!

## Architecture
- `engine.js`: Base engine. Manages state, verbs, history, and executing actions on hotspots.
- `adapter.js`: The Site Adapter. Takes a URL and an HTML DOM document, extracts paragraphs for narration and links/images as hotspots. Runs purely client-side.
- `aifocus-fixture.js`: Adapter for aifoc.us. Cross-origin DOM fetching is blocked by CORS. This provides a curated mapping (article titles → scene names, links → hotspots) for aifoc.us as a sample fixture.
- `ui.js`: Wires the interface to the engine and handles fetch/DOM parsing.
- `sample-site/`: A self-contained tiny multi-page site used as the default starting scene to demo the functionality without CORS issues.

## CORS Limitations
Because this runs client-side without a proxy, fetching cross-origin sites (like `example.com`) directly via `fetch()` will generally fail due to CORS. 
- Same-origin links (like the included `sample-site/`) work perfectly via the DOM adapter.
- Specific cross-origin sites can be supported by building curated adapters containing pre-fetched structural data, like the included `aifocus-fixture.js`.

## Running locally

No build step required (Vanilla JS). You can serve it using Deno:

```bash
deno run --allow-net --allow-read serve.ts
```

Then visit `http://localhost:8000/`

## Deployment
Can be deployed to Deno Deploy or any static file host (Vercel, Netlify, GitHub Pages) since the entire engine is static HTML/CSS/JS.

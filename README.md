# Monkey Island Web

Render a website as a point-and-click adventure game (SCUMM-era interface).

The primary playable path is **"The Unshipped Essay"** — a complete mini-adventure built on a snapshot of the real [aifoc.us](https://aifoc.us) (fetched 2026-08-14). Real post titles, real text, real links; an authored story on top: an essay refuses to ship, and only a sentence-shaped audit can unlock it.

## How to play
- **Mouse**: click a verb ("Look at", "Go to", "Talk to", "Use"), then click a hotspot. Colours: blue = places, pink = people, grey = things.
- **Inventory**: some actions put items in your inventory. Click an inventory chip to hold it, then **Use** it on a target ("Use a sentence-shaped audit on the blinking drafts folder").
- **Keyboard**: `1` Look at · `2` Go to · `3` Talk to · `4` Use. `Tab`/`Enter` operate every control natively.
- **Goal**: talk to the author, read the lighthouse essay, get the sentence, ship the draft. Reach "The shipped essay" to win.

## Architecture
- `engine.js` — the game engine: verbs, state (flags, inventory, held item), state-dependent dialogue, item/verb sockets, dynamic hotspot reveals, win condition. Fully data-driven: every hotspot declares per-verb behaviour (`look`, `talk[]`, `use`).
- `aifocus-fixture.js` — the aifoc.us adapter: maps real aifoc.us URLs to playable scenes (real titles/dates/reading-times/quotes; the one invented page is the ending, `/shipped-essay/`). Unknown aifoc.us URLs get an honest "uncharted" fallback scene.
- `adapter.js` — generic DOM adapter: any same-origin HTML page can become a scene (headings/paragraphs → narration, links → exits, images → objects).
- `art.js` — the procedural pixel-art renderer: each location gets a rendered 320×180 scene (dithered backgrounds, animated details — blinking drafts folder, sweeping lighthouse beam, swaying URLs, confetti), drawn crunchy at any DPR via ResizeObserver + `image-rendering: pixelated`, static single frame under `prefers-reduced-motion`. Hotspot glyphs are drawn AT the fixture's hotspot regions, so the visible object and its transparent native-button overlay can never drift apart.
- `ui.js` / `index.html` / `style.css` — the interface. Graphical SCUMM layout: rendered scene viewport with transparent hotspot buttons (hover/focus → dashed highlight + floating object label), narration/history log, verb/inventory bar. Movement model: every scene change is a real hash navigation (`#/scene/<url>`), so browser **back/forward walk the game**; quest flags, inventory, the log and the win state persist across reloads via `localStorage` (revealed hotspots re-derive from flags on scene load). Accessibility per the modern-web-guidance bundle (accessibility + html guides): landmarks + skip link, append-only visual log with a separate `aria-live="polite"` announcer for incremental updates only, hotspots as native `<button>`s inside a real `<ul>`, `aria-pressed` verbs, visible `:focus-visible` outlines.

## CORS Limitations
Cross-origin fetching is blocked by CORS, so the primary game runs on the curated aifoc.us snapshot. Same-origin pages work through the generic DOM adapter.

## Running locally

No build step (vanilla HTML/CSS/JS — static-host compatible, including GitHub Pages):

```bash
deno run --allow-net --allow-read serve.ts   # or any static file server
```

## Functional tests

CDP-driven headless-Chrome tests that play the whole game end-to-end (verbs via `Input.dispatchKeyEvent`, clicks via `Input.dispatchMouseEvent` at real element coordinates — no synthetic DOM calls):

```bash
npm ci        # installs puppeteer + its pinned Chrome (reproducible, lockfile-pinned)
npm test
```

190 assertions (189 in evidence mode, which by design writes into the repo and so omits the clean-tree assertion; incl. graphical gates: canvas pixel variance, hotspot bounds inside the scene, hover highlight + cursor label, scene pixel-hash change on navigation and on the unlock, reduced-motion static frame): boot scene, keyboard verb selection, per-object Look/Use refusals, dialogue with state flags, item pickup, real hash navigation, **back/forward walking the game**, **reload persistence** (inventory, flags, log, revealed hotspot, win state), terminal-dialogue authority after winning (no quest re-opening, no re-acquiring the consumed item), the win banner, and the full history chain in order. Evidence screenshots land in `tests/shots/` (committed evidence is opt-in: `MIW_EVIDENCE=tests/shots npm test`; default runs use temp dirs, run the whole journey twice under a frozen art clock (`?fixedclock`), and byte-compare every screenshot pair).

## Deployment
Static files only — deploy the repo root to GitHub Pages, Deno Deploy, Vercel, or Netlify as-is.

// art.js — procedural pixel-art scene renderer.
// The scene is drawn on a low-res buffer (320×180) and blitted to the display
// canvas with smoothing off, so it stays crunchy at any size. Hotspot glyphs
// are drawn AT the hotspot regions from the fixture, so the visible object
// and its semantic overlay button can never drift apart.

export const ART_W = 320;
export const ART_H = 180;

function makeCtx(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c.getContext("2d");
}

// --- tiny pixel helpers -------------------------------------------------------
function R(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0)); }
function DITHER(ctx, x, y, w, h, c1, c2) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    ctx.fillStyle = (i + j) % 2 ? c1 : c2;
    ctx.fillRect((x + i) | 0, (y + j) | 0, 1, 1);
  }
}
function FRAME(ctx, x, y, w, h, c) {
  R(ctx, x, y, w, 2, c); R(ctx, x, y + h - 2, w, 2, c);
  R(ctx, x, y, 2, h, c); R(ctx, x + w - 2, y, 2, h, c);
}

// --- glyphs (drawn inside hotspot regions) ------------------------------------
const glyphs = {
  door(ctx, x, y, w, h, t, glow) {
    R(ctx, x, y, w, h, glow ? "#7a5c1e" : "#3a2c18");
    FRAME(ctx, x, y, w, h, glow ? "#ffd94d" : "#8a6b3a");
    R(ctx, x + w / 2 - 2, y + h / 2, 4, 4, glow ? "#fff2b0" : "#c9a25e"); // knob
    R(ctx, x + 5, y + 5, w - 10, 8, glow ? "#e8c860" : "#5a462a");        // sign plate
    if (glow) { DITHER(ctx, x - 3, y - 3, w + 6, 3, "#ffd94d", "#7a5c1e"); }
  },
  person(ctx, x, y, w, h, t, glow, seed = 1) {
    const skin = "#e8b890", shirt = ["#2e6fd8", "#d84a8a", "#3aa655", "#d88a2e"][seed % 4];
    const headW = Math.min(w * 0.55, 20);
    R(ctx, x + (w - headW) / 2, y, headW, headW * 0.9, skin);              // head
    R(ctx, x + (w - headW) / 2, y, headW, 4, "#4a3018");                   // hair
    R(ctx, x + (w - headW) / 2 + 3, y + headW * 0.4, 3, 3, "#1a1a1a");     // eye
    R(ctx, x + (w + headW) / 2 - 6, y + headW * 0.4, 3, 3, "#1a1a1a");     // eye
    R(ctx, x + w * 0.15, y + headW, w * 0.7, h * 0.45, shirt);             // torso
    R(ctx, x + w * 0.15, y + headW, w * 0.7, 5, glow ? "#ffd94d" : "#ffffff33");
    R(ctx, x + w * 0.18, y + headW + h * 0.45, w * 0.24, h * 0.45, "#2a2a3e"); // leg
    R(ctx, x + w * 0.58, y + headW + h * 0.45, w * 0.24, h * 0.45, "#2a2a3e"); // leg
    if (glow) FRAME(ctx, x - 2, y - 2, w + 4, h + 4, "#ffd94d");
  },
  folder(ctx, x, y, w, h, t, glow, open) {
    if (open) {
      R(ctx, x, y + h * 0.3, w, h * 0.7, "#c9a25e");
      FRAME(ctx, x, y + h * 0.3, w, h * 0.7, "#ffd94d");
      R(ctx, x + 4, y, w - 8, h * 0.35, "#fff2b0"); // papers spilling out
      DITHER(ctx, x - 4, y - 4, w + 8, h + 8, "#ffd94d22", "#00000000");
    } else {
      const blink = glow || (Math.floor(t / 500) % 2 === 0);
      R(ctx, x, y + 3, w, h - 3, blink ? "#d8b25e" : "#a07f42");
      R(ctx, x, y, w * 0.4, 6, blink ? "#e8c25e" : "#b08f4a"); // tab
      FRAME(ctx, x, y + 3, w, h - 3, blink ? "#ffe9a0" : "#6a542c");
      if (blink) R(ctx, x + w - 8, y + 8, 4, 4, "#ff5555"); // blinking "!" dot
    }
  },
  crate(ctx, x, y, w, h, t, glow) {
    R(ctx, x, y, w, h, "#5a6a7a");
    FRAME(ctx, x, y, w, h, glow ? "#ffd94d" : "#8fa2b5");
    R(ctx, x + 4, y + h / 2 - 1, w - 8, 2, "#39434d");
    R(ctx, x + w / 2 - 1, y + 4, 2, h - 8, "#39434d");
  },
  gap(ctx, x, y, w, h, t, glow) {
    R(ctx, x, y, w, h, "#0a0a12");                       // the void
    DITHER(ctx, x, y, w, 6, "#ffd94d", "#1a1a1a");       // hazard stripe top
    DITHER(ctx, x, y + h - 6, w, 6, "#ffd94d", "#1a1a1a");
    if (glow) FRAME(ctx, x - 2, y - 2, w + 4, h + 4, "#ffd94d");
  },
  card(ctx, x, y, w, h, t, glow) {
    const sway = Math.round(Math.sin(t / 600) * 3);
    R(ctx, x + w / 2 + sway / 2, 0, 1, y, "#666");       // string from ceiling
    R(ctx, x + sway, y, w, h, glow ? "#1e3a5e" : "#16222e");
    FRAME(ctx, x + sway, y, w, h, glow ? "#7fd4ff" : "#3e5a72");
    R(ctx, x + sway + 5, y + 6, w - 10, 4, "#7fbfff");   // url line
    R(ctx, x + sway + 5, y + 13, w - 16, 3, "#4a7ba6");
  },
  trophy(ctx, x, y, w, h, t, glow) {
    R(ctx, x + w * 0.2, y, w * 0.6, h * 0.45, "#ffd94d");
    FRAME(ctx, x + w * 0.2, y, w * 0.6, h * 0.45, "#c9a22e");
    R(ctx, x + w * 0.42, y + h * 0.45, w * 0.16, h * 0.3, "#c9a22e");
    R(ctx, x + w * 0.25, y + h * 0.75, w * 0.5, h * 0.2, "#8a6b1e");
  },
};

// --- scene backgrounds --------------------------------------------------------
const backgrounds = {
  home(ctx, t) {
    R(ctx, 0, 0, ART_W, ART_H, "#181226");
    DITHER(ctx, 0, 0, ART_W, 46, "#241a3a", "#1c1430");       // upper wall
    DITHER(ctx, 0, 132, ART_W, 48, "#221610", "#1a100a");     // floorboards
    R(ctx, 110, 118, 120, 10, "#4a3620");                     // desk
    R(ctx, 116, 100, 34, 22, "#0a2012");                      // monitor
    FRAME(ctx, 116, 100, 34, 22, "#2fae5e");
    R(ctx, 120, 104, 26, 2, "#33ff33"); R(ctx, 120, 108, 20, 2, "#33ff33aa");
  },
  lighthouse(ctx, t) {
    R(ctx, 0, 0, ART_W, ART_H, "#0a0e22");
    for (let i = 0; i < 24; i++) R(ctx, (i * 53) % ART_W, (i * 29) % 80, 1, 1, "#cfd8ff"); // stars
    DITHER(ctx, 0, 140, ART_W, 40, "#102a3a", "#0c2030");     // sea
    R(ctx, 40, 30, 40, 115, "#c8c0b0");                       // tower
    for (let j = 0; j < 5; j++) R(ctx, 40, 40 + j * 22, 40, 8, "#a84838"); // stripes
    R(ctx, 48, 14, 24, 16, "#ffe9a0");                        // lamp room
    FRAME(ctx, 48, 14, 24, 16, "#7a7260");
    // sweeping beam
    const ang = (t / 1400) % (Math.PI * 2);
    const bx = 60 + Math.cos(ang) * 90, by = 22 + Math.sin(ang) * 26;
    ctx.save(); ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#fff2b0"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(60, 22); ctx.lineTo(bx, by); ctx.stroke();
    ctx.restore();
  },
  gap(ctx, t) {
    R(ctx, 0, 0, ART_W, ART_H, "#14161e");
    R(ctx, 0, 96, ART_W, 12, "#3a3f4d");                      // platform edge line
    DITHER(ctx, 0, 108, 120, 40, "#262a34", "#1e222b");       // left platform
    DITHER(ctx, 210, 108, 110, 40, "#262a34", "#1e222b");     // right platform
    R(ctx, 0, 30, ART_W, 40, "#20242f");                      // train body
    for (let i = 0; i < 6; i++) R(ctx, 12 + i * 52, 38, 34, 22, "#ffd94d66"); // windows
    const blink = Math.floor(t / 600) % 2 === 0;
    R(ctx, 120, 12, 96, 12, blink ? "#d8b25e" : "#6a542c");   // MIND THE GAP sign
  },
  urls(ctx, t) {
    R(ctx, 0, 0, ART_W, ART_H, "#101820");
    DITHER(ctx, 0, 0, ART_W, 24, "#1c2836", "#141e2a");       // ceiling band
    for (let i = 0; i < 5; i++) {                              // background hanging cards
      const x = 30 + i * 58, sway = Math.round(Math.sin(t / 700 + i) * 3);
      R(ctx, x + sway, 0, 1, 60 + (i % 3) * 14, "#444");
      R(ctx, x - 8 + sway, 60 + (i % 3) * 14, 20, 12, "#22303e");
      FRAME(ctx, x - 8 + sway, 60 + (i % 3) * 14, 20, 12, "#33465a");
    }
    DITHER(ctx, 0, 150, ART_W, 30, "#18222c", "#121a22");     // floor
  },
  shipped(ctx, t) {
    R(ctx, 0, 0, ART_W, ART_H, "#1c1226");
    DITHER(ctx, 0, 120, ART_W, 60, "#2c1e3a", "#221630");     // floor
    R(ctx, 120, 96, 80, 26, "#4a3620");                       // podium
    FRAME(ctx, 120, 96, 80, 26, "#6a542c");
    R(ctx, 100, 20, 120, 40, "#0a2012");                      // scoreboard
    FRAME(ctx, 100, 20, 120, 40, "#2fae5e");
    R(ctx, 112, 30, 20, 20, "#33ff33"); R(ctx, 138, 30, 20, 20, "#33ff33"); R(ctx, 164, 30, 20, 20, "#33ff33"); // "100"
    // confetti
    for (let i = 0; i < 30; i++) {
      const cx = (i * 37 + Math.floor(t / 90) * (2 + (i % 3))) % ART_W;
      const cy = (i * 23 + Math.floor(t / 60) * (1 + (i % 4))) % 120;
      R(ctx, cx, cy, 2, 2, ["#ffd94d", "#ff33ff", "#33ff33", "#66ccff"][i % 4]);
    }
  },
  unknown(ctx) {
    R(ctx, 0, 0, ART_W, ART_H, "#16161a");
    DITHER(ctx, 0, 130, ART_W, 50, "#1e1e24", "#16161a");
  },
};

// --- renderer -----------------------------------------------------------------
export function createSceneArt(canvas, labelEl) {
  const buffer = makeCtx(ART_W, ART_H);
  const dctx = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Deterministic mode (?fixedclock): every frame paints the same art time,
  // no animation loop — evidence screenshots become byte-reproducible.
  const FIXED_CLOCK = new URLSearchParams(location.search).has("fixedclock");
  const FIXED_T = 1000;
  let scene = null;
  let flags = {};
  let highlightId = null;
  let bubbleUntil = 0;
  let bubbleRegion = null;
  let bubbleSceneId = null; // bubble persists on the scene where it was spoken; cleared on an actual scene change
  let raf = 0;
  let observing = null;

  function paint(t) {
    if (!scene) return;
    const bg = backgrounds[scene.art ?? "unknown"] ?? backgrounds.unknown;
    bg(buffer, t);
    for (const hs of scene.hotspots ?? []) {
      if (!hs.region) continue;
      const g = glyphs[hs.glyph ?? (hs.kind === "link" ? "door" : hs.kind === "character" ? "person" : "crate")];
      const [x, y, w, h] = hs.region;
      const open = hs.id === "drafts" && flags.shipped;
      const glowDoor = hs.id === "to-shipped";
      g(buffer, x, y, w, h, t, highlightId === hs.id || glowDoor, open);
      if (highlightId === hs.id) FRAME(buffer, x - 3, y - 3, w + 6, h + 6, "#ffffff");
    }
    const bubbleVisible = bubbleRegion && bubbleSceneId === scene?.url && (FIXED_CLOCK ? bubbleUntil > 0 : performance.now() < bubbleUntil);
    if (bubbleVisible) {
      const [x, y, w] = bubbleRegion;
      const bw = 46, bh = 16;
      const bx = Math.min(Math.max(2, x + w / 2 - bw / 2), ART_W - bw - 2);
      const by = Math.max(2, y - bh - 6);
      R(buffer, bx, by, bw, bh, "#f2f2f2");
      FRAME(buffer, bx, by, bw, bh, "#1a1a1a");
      R(buffer, bx + 6, by + 6, 5, 3, "#1a1a1a"); R(buffer, bx + 14, by + 6, 5, 3, "#1a1a1a"); R(buffer, bx + 22, by + 6, 5, 3, "#1a1a1a");
      R(buffer, bx + bw / 2 - 2, by + bh, 4, 5, "#f2f2f2");
    }
    // blit scaled, crunchy
    dctx.imageSmoothingEnabled = false;
    dctx.clearRect(0, 0, canvas.width, canvas.height);
    dctx.drawImage(buffer.canvas, 0, 0, canvas.width, canvas.height);
  }

  function frame(t) {
    paint(t);
    window.__artAnimating = true;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (FIXED_CLOCK || reduced.matches) {
      window.__artAnimating = false;
      paint(FIXED_T); // single static frame
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    paint(FIXED_CLOCK ? FIXED_T : performance.now());
  }

  observing = new ResizeObserver(resize);
  observing.observe(canvas);
  reduced.addEventListener?.("change", start);

  return {
    render(nextScene, nextFlags) {
      scene = nextScene;
      flags = nextFlags ?? {};
      highlightId = null;
      if (nextScene.url !== bubbleSceneId) { bubbleUntil = 0; bubbleRegion = null; bubbleSceneId = null; }
      canvas.setAttribute("aria-label", `Pixel-art scene: ${nextScene.title}`);
      if (labelEl) labelEl.textContent = `Scene: ${nextScene.title}`;
      resize();
      start();
    },
    setHighlight(id) {
      highlightId = id;
      if (!window.__artAnimating) paint(FIXED_CLOCK ? FIXED_T : performance.now());
    },
    speechBubble(region) {
      bubbleRegion = region;
      bubbleSceneId = scene?.url ?? null;
      bubbleUntil = FIXED_CLOCK ? 1 : performance.now() + 2600; // frozen clock: persist until scene change (no nondeterministic timers)
      if (!window.__artAnimating) paint(FIXED_CLOCK ? FIXED_T : performance.now());
    },
    stop() {
      cancelAnimationFrame(raf);
      observing?.disconnect();
      window.__artAnimating = false;
    },
  };
}

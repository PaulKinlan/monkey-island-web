// Functional browser tests for Monkey Island Web — driven over the Chrome
// DevTools Protocol (CDP): keys via Input.dispatchKeyEvent, clicks/hovers via
// Input.dispatchMouseEvent at real element coordinates. No synthetic DOM calls.
//
// Reproducible: `npm ci` installs puppeteer + its pinned Chrome.
// Deterministic evidence: the suite runs the whole journey TWICE with the art
// clock frozen (?fixedclock) and byte-compares every screenshot pair. Default
// runs write screenshots to a temp dir (never dirty the repo); committed
// evidence is opt-in:  MIW_EVIDENCE=tests/shots npm test
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const ROOT = path.resolve(import.meta.dirname, "..");
const EVIDENCE_DIR = process.env.MIW_EVIDENCE ?? null; // committed evidence: opt-in
const SUBPATH = "/monkey-island-web"; // GitHub Pages project-site subpath

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (pathname.startsWith(SUBPATH + "/") || pathname === SUBPATH) pathname = pathname.slice(SUBPATH.length);
  const p = path.join(ROOT, pathname.replace(/^\/+/, "") || "index.html");
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!fs.existsSync(file)) { res.writeHead(404); res.end("nope"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}`;

const writtenShots = new Map(); // shotDir -> filenames written this run
let passed = 0, failed = 0;
function assert(cond, name, detail = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ FAIL: ${name} ${detail}`); }
}

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox"],
  defaultViewport: { width: 1280, height: 900 },
});

async function newTrackedPage() {
  const page = await browser.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 120)));
  page.on("requestfailed", (r) => problems.push("requestfailed: " + r.url().slice(0, 90)));
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url().slice(0, 90)}`); });
  return { page, problems };
}

// --- per-page helpers ---------------------------------------------------------
function helpers(page, cdp, shotDir) {
  const h = {};
  h.cdpClick = async (selector) => {
    const rect = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, selector);
    if (!rect) throw new Error(`element not found: ${selector}`);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await cdp.send("Input.dispatchMouseEvent", { type, x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    }
    await new Promise((r) => setTimeout(r, 250));
  };
  const KEYDEFS = {
    Tab: { code: "Tab", keyCode: 9 },
    Enter: { code: "Enter", keyCode: 13, text: "\r" },
  };
  h.cdpKey = async (key) => {
    // Full key definition so Chrome applies native default actions (Tab moves
    // focus, Enter activates a focused button). text only for text producers.
    const def = KEYDEFS[key] ?? { code: key, keyCode: key.charCodeAt(0), text: key.length === 1 ? key : undefined };
    const base = { key, code: def.code, windowsVirtualKeyCode: def.keyCode, nativeVirtualKeyCode: def.keyCode };
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...(def.text ? { text: def.text } : {}) });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await new Promise((r) => setTimeout(r, 200));
  };
  h.cdpHover = async (selector) => {
    const rect = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, selector);
    if (!rect) throw new Error(`element not found: ${selector}`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
    await new Promise((r) => setTimeout(r, 250));
  };
  h.shot = async (name) => {
    await page.screenshot({ path: path.join(shotDir, `${name}.png`) });
    const list = writtenShots.get(shotDir) ?? [];
    list.push(`${name}.png`); // track this run's set (evidence dirs may contain older files)
    writtenShots.set(shotDir, list);
  };
  h.sceneText = () => page.$eval("#scene-view", (el) => el.textContent);
  h.actionLine = () => page.$eval("#action-line", (el) => el.textContent);
  h.historyHas = (needle) => page.evaluate((n) => window.__engine?.history.some((l) => l.includes(n)) ?? false, needle);
  h.historyCount = (needle) => page.evaluate((n) => window.__engine?.history.filter((l) => l.includes(n)).length ?? 0, needle);
  h.objectExists = (id) => page.evaluate((i) => !!document.querySelector(`[data-hotspot-id="${i}"]`), id);
  // FNV-1a over a sampled pixel grid of the scene canvas; optional clip in
  // art coordinates (320×180 space) mapped onto the canvas backing store.
  h.canvasHash = (artClip) => page.evaluate((cl) => {
    const c = document.getElementById("scene-canvas");
    const ctx = c.getContext("2d");
    const x0 = cl ? Math.round((cl[0] / 320) * c.width) : 0;
    const y0 = cl ? Math.round((cl[1] / 180) * c.height) : 0;
    const w = cl ? Math.max(2, Math.round((cl[2] / 320) * c.width)) : c.width;
    const hgt = cl ? Math.max(2, Math.round((cl[3] / 180) * c.height)) : c.height;
    const d = ctx.getImageData(x0, y0, w, hgt).data;
    let hash = 0x811c9dc5;
    const stride = Math.max(4, Math.floor(d.length / 4000) * 4);
    for (let i = 0; i < d.length; i += stride) {
      hash ^= d[i] + (d[i + 1] << 8) + (d[i + 2] << 16);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash;
  }, artClip ?? null);
  // Pixel helpers over an art-coordinate clip (320×180 space, mapped onto the backing store).
  h.canvasWhiteFraction = (artClip) => page.evaluate((cl) => {
    const c = document.getElementById("scene-canvas");
    const ctx = c.getContext("2d");
    const x0 = Math.round((cl[0] / 320) * c.width), y0 = Math.round((cl[1] / 180) * c.height);
    const w = Math.max(2, Math.round((cl[2] / 320) * c.width)), hgt = Math.max(2, Math.round((cl[3] / 180) * c.height));
    const d = ctx.getImageData(x0, y0, w, hgt).data;
    let white = 0, total = 0;
    for (let i = 0; i < d.length; i += 4) { total++; if (d[i] > 230 && d[i + 1] > 230 && d[i + 2] > 230) white++; }
    return white / total;
  }, artClip);
  h.canvasDarkCount = (artClip) => page.evaluate((cl) => {
    const c = document.getElementById("scene-canvas");
    const ctx = c.getContext("2d");
    const x0 = Math.round((cl[0] / 320) * c.width), y0 = Math.round((cl[1] / 180) * c.height);
    const w = Math.max(2, Math.round((cl[2] / 320) * c.width)), hgt = Math.max(2, Math.round((cl[3] / 180) * c.height));
    const d = ctx.getImageData(x0, y0, w, hgt).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 90) dark++;
    return dark;
  }, artClip);
  h.canvasVariance = () => page.evaluate(() => {
    const c = document.getElementById("scene-canvas");
    const ctx = c.getContext("2d");
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, sq = 0, n = 0;
    for (let i = 0; i < d.length; i += 397 * 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      sum += lum; sq += lum * lum; n++;
    }
    const mean = sum / n;
    return Math.sqrt(sq / n - mean * mean);
  });
  h.stageBoundsOk = () => page.evaluate(() => {
    const st = document.getElementById("stage").getBoundingClientRect();
    return [...document.querySelectorAll(".stage-hotspot")].every((b) => {
      const r = b.getBoundingClientRect();
      return r.left >= st.left - 1 && r.right <= st.right + 1 && r.top >= st.top - 1 && r.bottom <= st.bottom + 1 && r.width > 4 && r.height > 4;
    });
  });
  return h;
}

// --- the full journey (run twice for determinism comparison) ------------------
const sceneHashes = {};
async function runJourney(roundLabel, shotDir) {
  console.log(`\n=== Journey ${roundLabel} ===`);
  const { page, problems } = await newTrackedPage();
  const cdp = await page.createCDPSession();
  const h = helpers(page, cdp, shotDir);

  await page.goto(`${BASE}/?fixedclock=1`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".object-btn", { timeout: 15000 });
  await page.evaluate(() => localStorage.removeItem("miw-save-v1"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".object-btn", { timeout: 15000 });

  console.log("Step 1: boot on the aifoc.us home scene (graphical)");
  let txt = await h.sceneText();
  assert(txt.includes("AI Focus"), "home narration shows real site title");
  assert(txt.includes("a drafts folder blinks"), "home narration includes the story hook");
  assert(await h.objectExists("to-lighthouse"), "real post hotspot: lighthouse essay");
  assert(await h.objectExists("to-model-gap"), "real post hotspot: model gap");
  assert(await h.objectExists("to-urls"), "real post hotspot: url steering");
  assert(await h.objectExists("paul"), "character hotspot: Paul Kinlan");
  assert(await page.evaluate(() => document.querySelector("#objects-panel").tagName === "UL"), "hotspot list uses a real <ul>");
  assert(await page.evaluate(() => [...document.querySelectorAll(".object-btn")].every((b) => b.tagName === "BUTTON" && !b.hasAttribute("role"))), "hotspots are native buttons, no role overrides");
  assert((await h.canvasVariance()) > 12, "scene canvas has substantial pixel content (not blank)");
  assert(await h.stageBoundsOk(), "all stage hotspot regions sit inside the scene viewport");
  assert(await page.evaluate(() => [...document.querySelectorAll(".stage-hotspot")].every((b) => (b.getAttribute("aria-label") ?? "").length > 6)), "stage hotspots carry descriptive accessible names");
  assert((await page.evaluate(() => document.querySelectorAll(".stage-hotspot").length)) === 5, "5 visible objects embedded in the home scene");
  sceneHashes.home = await h.canvasHash();
  await h.shot("01-home-scene");

  console.log("Step 2: CDP mouse journey — hover → highlight+label, verb, click scene object");
  await h.cdpKey("1");
  assert((await h.actionLine()) === "Look at", "key '1' selects Look at");
  await h.cdpHover('[data-stage-hotspot="drafts"]');
  assert(await page.evaluate(() => {
    const cl = document.getElementById("cursor-label");
    return !cl.hidden && cl.textContent.includes("Look at the blinking drafts folder");
  }), "hover shows the object label near the cursor with the armed verb");
  assert(await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('[data-stage-hotspot="drafts"]'));
    return cs.outlineStyle !== "none" && cs.outlineWidth !== "0px";
  }), "hovered scene object shows a visible highlight outline");
  await h.shot("02-hover-highlight");
  await h.cdpClick('[data-stage-hotspot="drafts"]');
  txt = await h.sceneText();
  assert(txt.includes("FINAL(7).md"), "clicking the scene object runs Look at → description in the log");
  assert(await h.historyHas("> Look at the blinking drafts folder"), "history logs the Look at action");
  await h.shot("02b-look-at-drafts");

  console.log("Step 3: Use without the item fails with a per-object refusal");
  await h.cdpKey("4");
  assert((await h.actionLine()) === "Use", "key '4' selects Use");
  await h.cdpClick('[data-stage-hotspot="drafts"]');
  txt = await h.sceneText();
  assert(txt.includes("locked by perfectionism"), "Use drafts without item → specific refusal");

  console.log("Step 4: Talk to Paul — dialogue + flag");
  await h.cdpKey("3");
  await h.cdpClick('[data-stage-hotspot="paul"]');
  txt = await h.sceneText();
  assert(txt.includes("The audit has no sentence."), "Paul's opening dialogue renders");
  assert(txt.includes("sentence-shaped audit"), "Paul gives the quest hint");
  assert(await h.historyHas("> Talk to Paul Kinlan"), "history logs the Talk to action");
  await h.shot("03-talk-to-paul");

  console.log("Step 4b: IMMEDIATE reload right after dialogue — flag must persist");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".object-btn", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
  assert(await page.evaluate(() => window.__engine.flags.metPaul === true), "metPaul flag saved atomically with the dialogue (no navigation needed)");
  await h.cdpKey("3");
  await h.cdpClick('[data-stage-hotspot="paul"]');
  txt = await h.sceneText();
  assert(txt.includes("The lighthouse post. The sentence."), "Paul advances to the follow-up line after reload");
  assert((await h.historyCount("You're wandering my site")) === 1, "Paul does not reopen his initial dialogue after reload");

  console.log("Step 5: scene tour — model-gap and url-steering scenes render and navigate");
  await h.cdpKey("2");
  await h.cdpClick('[data-stage-hotspot="to-model-gap"]');
  txt = await h.sceneText();
  assert(txt.includes("[Arrived at: please mind the model gap]"), "navigated to the model-gap scene");
  assert(txt.includes("trained on the web that was"), "real model-gap essay text in narration");
  assert((await h.canvasVariance()) > 12, "model-gap scene has substantial pixel content");
  sceneHashes.gap = await h.canvasHash();
  assert(sceneHashes.gap !== sceneHashes.home, "model-gap scene pixels differ from home");
  assert((await h.canvasWhiteFraction([4, 4, 312, 60])) < 0.05, "Paul's speech bubble did not leak into the model-gap scene");
  assert(await h.stageBoundsOk(), "model-gap hotspot regions inside the scene");
  await h.shot("04b-model-gap-scene");
  await h.cdpClick('[data-stage-hotspot="back-gap"]');
  assert((await h.sceneText()).includes("[Arrived at: AI Focus]"), "model-gap → back home");
  await h.cdpClick('[data-stage-hotspot="to-urls"]');
  txt = await h.sceneText();
  assert(txt.includes("[Arrived at: does a url in a prompt"), "navigated to the url-steering scene");
  assert(txt.includes("Spent a lot of tokens"), "real url-steering essay text in narration");
  assert((await h.canvasVariance()) > 12, "url-steering scene has substantial pixel content");
  sceneHashes.urls = await h.canvasHash();
  assert(![sceneHashes.home, sceneHashes.gap].includes(sceneHashes.urls), "url-steering scene pixels distinct from home and model-gap");
  assert(await h.stageBoundsOk(), "url-steering hotspot regions inside the scene");
  await h.shot("04c-urls-scene");
  await h.cdpClick('[data-stage-hotspot="back-urls"]');
  assert((await h.sceneText()).includes("[Arrived at: AI Focus]"), "url-steering → back home");

  console.log("Step 6: genuine keyboard journey — Tab to a scene object, label/outline, Enter");
  await h.cdpKey("2");
  let focused = null;
  for (let i = 0; i < 15 && !focused; i++) {
    await h.cdpKey("Tab");
    focused = await page.evaluate(() => document.activeElement?.dataset?.stageHotspot === "to-lighthouse" ? "to-lighthouse" : null);
  }
  assert(focused === "to-lighthouse", "Tab reaches the lighthouse scene object (keyboard focusable)");
  assert(await page.evaluate(() => {
    const cl = document.getElementById("cursor-label");
    return !cl.hidden && cl.textContent.includes("Go to how might a modern lighthouse");
  }), "keyboard focus shows the same object label as hover");
  assert(await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement);
    return cs.outlineStyle !== "none" && cs.outlineWidth !== "0px";
  }), "keyboard focus shows the visible highlight outline");
  await h.shot("05-keyboard-focus");
  await h.cdpKey("Enter");
  txt = await h.sceneText();
  assert(txt.includes("[Arrived at: how might a modern lighthouse"), "Enter activates the focused scene object → navigation");
  assert(txt.includes("what if the audit was just a sentence?"), "real essay text in narration");
  assert(await h.objectExists("auditor"), "The Auditor hotspot present in lighthouse scene");
  assert(await page.evaluate(() => location.hash.includes(encodeURIComponent("how-might-a-modern-lighthouse-work-with-llms"))), "URL hash reflects the scene (real navigation)");
  sceneHashes.lighthouse = await h.canvasHash();
  assert(![sceneHashes.home, sceneHashes.gap, sceneHashes.urls].includes(sceneHashes.lighthouse), "lighthouse scene pixels distinct from the other scenes");
  assert((await h.canvasVariance()) > 12, "lighthouse scene has substantial pixel content");
  await h.shot("04-lighthouse-scene");

  console.log("Step 7: browser Back/Forward walk the game");
  await page.goBack({ waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 400));
  assert((await page.evaluate(() => window.__engine.currentScene.url)) === "https://aifoc.us/", "Back returns to the home scene");
  assert(await h.objectExists("drafts"), "home hotspots re-rendered after Back");
  await page.goForward({ waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 400));
  assert(await h.objectExists("auditor"), "Forward returns to the lighthouse scene");

  console.log("Step 8: Talk to The Auditor — dialogue gives the item + speech bubble");
  await h.cdpKey("3");
  await h.cdpClick('[data-stage-hotspot="auditor"]');
  txt = await h.sceneText();
  assert(txt.includes("It is shaped exactly like an audit."), "Auditor dialogue renders");
  assert(txt.includes("(Picked up: a sentence-shaped audit)"), "item granted into inventory");
  assert(await page.evaluate(() => !!document.querySelector('[data-item-id="sentence-audit"]')), "inventory chip visible");
  // Pixel-level: the unmistakable white ellipsis bubble painted above the
  // Auditor's head. Auditor region [216,96,34,52] -> bubble art coords
  // (210,74)-(256,90); dots at (216-237, 80-83).
  assert((await h.canvasWhiteFraction([210, 74, 46, 16])) > 0.5, "speech bubble visibly painted (white bubble pixels over the Auditor)");
  assert((await h.canvasDarkCount([216, 80, 21, 4])) > 8, "ellipsis dots painted inside the bubble");
  await h.shot("05b-auditor-speech-bubble");
  await h.shot("05-inventory-has-sentence");

  console.log("Step 9: RELOAD mid-quest — state persists");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".object-btn", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
  assert(await page.evaluate(() => !!document.querySelector('[data-item-id="sentence-audit"]')), "inventory chip present after reload");
  assert(await h.objectExists("auditor"), "still on the lighthouse scene after reload (hash restore)");
  assert(await page.evaluate(() => window.__engine.flags.metPaul === true), "quest flags survive reload");
  assert(await h.historyHas("> Talk to Paul Kinlan"), "history log survives reload");
  await h.cdpKey("3");
  await h.cdpClick('[data-stage-hotspot="auditor"]');
  txt = await h.sceneText();
  assert(txt.includes("You carry the sentence now"), "Auditor remembers the pickup after reload");
  assert((await h.historyCount("(Picked up: a sentence-shaped audit)")) === 1, "no duplicate pickup after reload (idempotent)");

  console.log("Step 10: Use the held item on the drafts folder — scene visibly changes");
  await h.cdpKey("2");
  await h.cdpClick('[data-stage-hotspot="back-lighthouse"]');
  assert((await h.sceneText()).includes("[Arrived at: AI Focus]"), "navigated back home");
  await h.cdpClick('[data-item-id="sentence-audit"]');
  assert((await h.actionLine()).includes("Use a sentence-shaped audit on"), "holding item arms 'Use X on …'");
  // With the art clock frozen (?fixedclock) both regions are truly static:
  // the door region paints bare wall before the unlock and the glowing door
  // after it; the folder region paints closed-then-open. Hash diffs are the
  // state change, not idle animation.
  const doorClip = [274, 118, 38, 56];
  const folderClip = [128, 126, 44, 26];
  const doorBefore = await h.canvasHash(doorClip);
  const folderBefore = await h.canvasHash(folderClip);
  await h.cdpClick('[data-stage-hotspot="drafts"]');
  txt = await h.sceneText();
  assert(txt.includes("publishes itself"), "Use sentence on drafts folder → unlock narration");
  assert(await h.objectExists("to-shipped"), "new hotspot 'The shipped essay' revealed");
  assert(await page.evaluate(() => !!document.querySelector('[data-stage-hotspot="to-shipped"]')), "revealed door appears as a visible scene object");
  assert((await h.canvasHash(doorClip)) !== doorBefore, "the revealed door visibly appeared (static-region pixel hash)");
  assert((await h.canvasHash(folderClip)) !== folderBefore, "the folder visibly opened (static-region pixel hash)");
  await h.shot("06-drafts-unlocked");

  console.log("Step 11: RELOAD after unlock — reveal persists");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".object-btn", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
  assert(await h.objectExists("to-shipped"), "revealed hotspot survives reload (flag-driven re-reveal)");
  assert(await page.evaluate(() => window.__engine.flags.shipped === true), "shipped flag survives reload");

  console.log("Step 12: Go to the shipped essay — win state (5th scene)");
  await h.cdpKey("2");
  await h.cdpClick('[data-stage-hotspot="to-shipped"]');
  txt = await h.sceneText();
  assert(txt.includes("[Arrived at: The shipped essay]"), "final scene reached by navigation");
  assert(txt.includes("You shipped it."), "ending narration renders");
  assert(await page.evaluate(() => !document.getElementById("win-banner").hidden), "win banner visible");
  assert(await h.historyHas("★ THE END"), "history contains THE END");
  assert((await h.canvasVariance()) > 12, "shipped scene has substantial pixel content");
  sceneHashes.shipped = await h.canvasHash();
  assert(!["home", "gap", "urls", "lighthouse"].map((k) => sceneHashes[k]).includes(sceneHashes.shipped), "shipped scene pixels distinct from every other scene");
  await h.shot("07-the-end");

  console.log("Step 13: terminal dialogue is authoritative after winning");
  await h.cdpKey("2");
  await h.cdpClick('[data-stage-hotspot="back-shipped"]');
  await h.cdpKey("3");
  await h.cdpClick('[data-stage-hotspot="paul"]');
  txt = await h.sceneText();
  assert(txt.includes("It's live. Ship fast, ship honest."), "Paul's terminal line after shipping (quest not re-opened)");
  assert((await h.historyCount("(Picked up: a sentence-shaped audit)")) === 1, "consumed sentence never re-acquired");

  console.log("Step 14: RELOAD at the end — win state persists");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".object-btn", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
  assert(await page.evaluate(() => window.__engine.won === true), "won flag survives reload");
  assert(await page.evaluate(() => !document.getElementById("win-banner").hidden), "win banner restored after reload");

  console.log("Step 15: incremental live announcements + full history chain");
  const liveOk = await page.evaluate(() => {
    const la = document.getElementById("live-announce");
    const sv = document.getElementById("scene-view");
    return la.getAttribute("aria-live") === "polite" && !sv.hasAttribute("aria-live") && la.textContent.length > 0;
  });
  assert(liveOk, "live region is incremental (visual log not aria-live; announcer has latest line)");
  const chain = await page.evaluate(() => window.__engine?.history ?? []);
  const needles = [
    "[Arrived at: AI Focus]",
    "> Look at the blinking drafts folder",
    "> Talk to Paul Kinlan",
    "[Arrived at: how might a modern lighthouse",
    "(Picked up: a sentence-shaped audit)",
    "publishes itself",
    "[Arrived at: The shipped essay]",
    "★ THE END",
  ];
  let idx = -1, ordered = true;
  for (const n of needles) {
    const at = chain.findIndex((l, i) => i > idx && l.includes(n));
    if (at === -1) { ordered = false; console.log(`    missing/out-of-order: ${n}`); break; }
    idx = at;
  }
  assert(ordered, "history contains the whole objective chain in order");
  assert(problems.length === 0, "zero page errors / failed requests on the journey", JSON.stringify(problems.slice(0, 3)));
  await page.close();
}

// --- run the journey twice, then byte-compare every screenshot pair ----------
const tmp1 = fs.mkdtempSync(path.join(os.tmpdir(), "miw-r1-"));
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "miw-r2-"));
const evidenceShots = EVIDENCE_DIR ?? tmp1;
if (EVIDENCE_DIR) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

await runJourney("round 1", evidenceShots);
await runJourney("round 2", tmp2);

console.log("\n=== Determinism: round 1 vs round 2 screenshot hashes ===");
const shots1 = (writtenShots.get(evidenceShots) ?? []).sort();
const shots2 = (writtenShots.get(tmp2) ?? []).sort();
assert(shots1.length >= 10, `evidence set captured (${shots1.length} screenshots)`);
assert(JSON.stringify(shots1) === JSON.stringify(shots2), "both rounds captured the same screenshot set");
let identical = true;
for (const f of shots1) {
  const a = fs.readFileSync(path.join(evidenceShots, f));
  const b = fs.readFileSync(path.join(tmp2, f));
  if (!a.equals(b)) { identical = false; console.log(`    differs: ${f}`); }
}
assert(identical, "two consecutive frozen-clock runs yield byte-identical screenshots");

// --- GitHub Pages project-subpath run -----------------------------------------
console.log("\n=== Pages project-subpath run ===");
{
  const { page, problems } = await newTrackedPage();
  const cdp = await page.createCDPSession();
  const h = helpers(page, cdp, tmp2);
  await page.goto(`${BASE}${SUBPATH}/?fixedclock=1`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".object-btn", { timeout: 15000 });
  await page.evaluate(() => localStorage.removeItem("miw-save-v1"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".object-btn", { timeout: 15000 });
  const txt = await h.sceneText();
  assert(txt.includes("AI Focus"), "game boots from the project subpath");
  assert((await h.canvasVariance()) > 12, "scene renders from the subpath");
  await h.cdpKey("2");
  await h.cdpClick('[data-stage-hotspot="to-model-gap"]');
  assert((await h.sceneText()).includes("[Arrived at: please mind the model gap]"), "navigation works from the subpath");
  assert(problems.length === 0, "zero 404s/failed requests/page errors under the subpath", JSON.stringify(problems.slice(0, 3)));
  await page.close();
}

// --- responsive / DPR matrix ---------------------------------------------------
console.log("\n=== Responsive/DPR matrix ===");
for (const vp of [
  { name: "mobile-narrow-dpr2", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
  { name: "desktop-dpr2", width: 1440, height: 900, deviceScaleFactor: 2 },
]) {
  const { page, problems } = await newTrackedPage();
  const cdp = await page.createCDPSession();
  const h = helpers(page, cdp, tmp2);
  await page.setViewport(vp);
  await page.goto(`${BASE}/?fixedclock=1`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".object-btn", { timeout: 15000 });
  const sizing = await page.evaluate(() => {
    const c = document.getElementById("scene-canvas");
    const r = c.getBoundingClientRect();
    return { backingW: c.width, backingH: c.height, clientW: r.width, clientH: r.height, dpr: window.devicePixelRatio };
  });
  assert(Math.abs(sizing.backingW - Math.round(sizing.clientW * sizing.dpr)) <= 2, `${vp.name}: canvas backing store matches client size × DPR (${sizing.backingW}≈${Math.round(sizing.clientW * sizing.dpr)})`);
  assert(sizing.dpr >= 2, `${vp.name}: DPR >= 2 active`);
  assert(await h.stageBoundsOk(), `${vp.name}: every hotspot remains inside the scene`);
  assert((await h.canvasVariance()) > 12, `${vp.name}: scene paints at this size`);
  assert(problems.length === 0, `${vp.name}: zero page errors`, JSON.stringify(problems.slice(0, 2)));
  await page.close();
}

// --- animation modes (unfrozen clock) ------------------------------------------
console.log("\n=== Animation modes (unfrozen clock) ===");
{
  const { page, problems } = await newTrackedPage();
  const cdp = await page.createCDPSession();
  const h = helpers(page, cdp, tmp2);
  await page.goto(`${BASE}/#/scene/${encodeURIComponent("https://aifoc.us/how-might-a-modern-lighthouse-work-with-llms/")}`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".object-btn", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 500));
  assert(await page.evaluate(() => window.__artAnimating === true), "animation loop runs normally");
  const f1 = await h.canvasHash();
  await new Promise((r) => setTimeout(r, 700));
  const f2 = await h.canvasHash();
  assert(f1 !== f2, "animated scene pixels change over time (lighthouse beam)");
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".object-btn", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 500));
  assert(await page.evaluate(() => window.__artAnimating === false), "animation loop stopped under prefers-reduced-motion");
  const r1 = await h.canvasHash();
  await new Promise((r) => setTimeout(r, 700));
  const r2 = await h.canvasHash();
  assert(r1 === r2, "reduced-motion scene is static (identical frames 700ms apart)");
  assert((await h.canvasVariance()) > 12, "static frame still paints the scene under reduced motion");
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "" }] });
  assert(problems.length === 0, "zero page errors in animation-mode checks", JSON.stringify(problems.slice(0, 2)));
  await page.close();
}

// --- repo hygiene: default runs must not dirty the tree -------------------------
if (!EVIDENCE_DIR) {
  const dirty = execSync("git status --porcelain", { cwd: ROOT }).toString().trim();
  assert(dirty === "", "git status clean after a default (temp-dir) run", dirty.slice(0, 200));
}

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed${EVIDENCE_DIR ? ` — evidence written to ${EVIDENCE_DIR}` : " — screenshots in temp dirs (repo untouched)"}`);
process.exit(failed ? 1 : 0);

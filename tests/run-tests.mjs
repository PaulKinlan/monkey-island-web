// Functional browser tests for Monkey Island Web — driven over the Chrome
// DevTools Protocol (CDP): keys via Input.dispatchKeyEvent, clicks via
// Input.dispatchMouseEvent at real element coordinates. No synthetic DOM calls.
// Reproducible: `npm ci` installs puppeteer (+ its pinned Chrome); the game
// itself is static files served over a local static server.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const ROOT = path.resolve(import.meta.dirname, "..");
const SHOTS = path.join(ROOT, "tests", "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html");
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!fs.existsSync(file)) { res.writeHead(404); res.end("nope"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

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
const page = await browser.newPage();
const cdp = await page.createCDPSession();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

// --- CDP input helpers -------------------------------------------------------
async function cdpClick(selector) {
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
  await new Promise((r) => setTimeout(r, 200));
}
async function cdpKey(key) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, text: key });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key });
  await new Promise((r) => setTimeout(r, 200));
}
async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}
const sceneText = () => page.$eval("#scene-view", (el) => el.textContent);
const actionLine = () => page.$eval("#action-line", (el) => el.textContent);
const historyHas = (needle) => page.evaluate((n) => window.__engine?.history.some((l) => l.includes(n)) ?? false, needle);
const historyCount = (needle) => page.evaluate((n) => window.__engine?.history.filter((l) => l.includes(n)).length ?? 0, needle);
const objectExists = (id) => page.evaluate((i) => !!document.querySelector(`[data-hotspot-id="${i}"]`), id);

// --- The end-to-end objective: ship the unshipped essay ----------------------
console.log("Monkey Island Web — functional tests (CDP-driven)\n");
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle0" });
await page.waitForSelector(".object-btn", { timeout: 15000 });
// clean slate for the deterministic run
await page.evaluate(() => localStorage.removeItem("miw-save-v1"));
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector(".object-btn", { timeout: 15000 });

console.log("Step 1: boot on the aifoc.us home scene");
let txt = await sceneText();
assert(txt.includes("AI Focus"), "home narration shows real site title");
assert(txt.includes("a drafts folder blinks"), "home narration includes the story hook");
assert(await objectExists("to-lighthouse"), "real post hotspot: lighthouse essay");
assert(await objectExists("to-model-gap"), "real post hotspot: model gap");
assert(await objectExists("to-urls"), "real post hotspot: url steering");
assert(await objectExists("paul"), "character hotspot: Paul Kinlan");
assert(await page.evaluate(() => document.querySelector("#objects-panel").tagName === "UL"), "hotspot list uses a real <ul>");
assert(await page.evaluate(() => [...document.querySelectorAll(".object-btn")].every((b) => b.tagName === "BUTTON" && !b.hasAttribute("role"))), "hotspots are native buttons, no role overrides");
await shot("01-home-scene");

console.log("Step 2: keyboard verb select + Look at (keyboard path)");
await cdpKey("1");
assert((await actionLine()) === "Look at", "key '1' selects Look at");
await cdpClick('[data-hotspot-id="drafts"]');
txt = await sceneText();
assert(txt.includes("FINAL(7).md"), "Look at drafts folder shows its description");
assert(await historyHas("> Look at the blinking drafts folder"), "history logs the Look at action");
await shot("02-look-at-drafts");

console.log("Step 3: Use without the item fails with a per-object refusal");
await cdpKey("4");
assert((await actionLine()) === "Use", "key '4' selects Use");
await cdpClick('[data-hotspot-id="drafts"]');
txt = await sceneText();
assert(txt.includes("locked by perfectionism"), "Use drafts without item → specific refusal");

console.log("Step 4: Talk to Paul — dialogue + flag");
await cdpKey("3");
await cdpClick('[data-hotspot-id="paul"]');
txt = await sceneText();
assert(txt.includes("The audit has no sentence."), "Paul's opening dialogue renders");
assert(txt.includes("sentence-shaped audit"), "Paul gives the quest hint");
assert(await historyHas("> Talk to Paul Kinlan"), "history logs the Talk to action");
await shot("03-talk-to-paul");

console.log("Step 4b: IMMEDIATE reload right after dialogue — flag must persist");
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector(".object-btn", { timeout: 15000 });
await new Promise((r) => setTimeout(r, 400));
assert(await page.evaluate(() => window.__engine.flags.metPaul === true), "metPaul flag saved atomically with the dialogue (no navigation needed)");
await cdpKey("3");
await cdpClick('[data-hotspot-id="paul"]');
txt = await sceneText();
assert(txt.includes("The lighthouse post. The sentence."), "Paul advances to the follow-up line after reload");
assert((await historyCount("You're wandering my site")) === 1, "Paul does not reopen his initial dialogue after reload");

console.log("Step 5: Go to the lighthouse essay — real hash navigation");
await cdpKey("2");
await cdpClick('[data-hotspot-id="to-lighthouse"]');
txt = await sceneText();
assert(txt.includes("[Arrived at: how might a modern lighthouse"), "navigated: lighthouse scene arrival logged");
assert(txt.includes("what if the audit was just a sentence?"), "real essay text in narration");
assert(await objectExists("auditor"), "The Auditor hotspot present in scene 2");
assert(await page.evaluate(() => location.hash.includes(encodeURIComponent("how-might-a-modern-lighthouse-work-with-llms"))), "URL hash reflects the scene (real navigation)");
await shot("04-lighthouse-scene");

console.log("Step 6: browser Back/Forward walk the game");
await page.goBack({ waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 400));
txt = await sceneText();
assert((await page.evaluate(() => window.__engine.currentScene.url)) === "https://aifoc.us/", "Back returns to the home scene");
assert(await objectExists("drafts"), "home hotspots re-rendered after Back");
await page.goForward({ waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 400));
assert(await objectExists("auditor"), "Forward returns to the lighthouse scene");

console.log("Step 7: Talk to The Auditor — dialogue gives the item");
await cdpKey("3");
await cdpClick('[data-hotspot-id="auditor"]');
txt = await sceneText();
assert(txt.includes("It is shaped exactly like an audit."), "Auditor dialogue renders");
assert(txt.includes("(Picked up: a sentence-shaped audit)"), "item granted into inventory");
assert(await page.evaluate(() => !!document.querySelector('[data-item-id="sentence-audit"]')), "inventory chip visible");
await shot("05-inventory-has-sentence");

console.log("Step 8: RELOAD mid-quest — state persists");
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector(".object-btn", { timeout: 15000 });
await new Promise((r) => setTimeout(r, 400));
assert(await page.evaluate(() => !!document.querySelector('[data-item-id="sentence-audit"]')), "inventory chip present after reload");
assert(await objectExists("auditor"), "still on the lighthouse scene after reload (hash restore)");
assert(await page.evaluate(() => window.__engine.flags.metPaul === true), "quest flags survive reload");
assert(await historyHas("> Talk to Paul Kinlan"), "history log survives reload");
// dialogue state persisted: Auditor acknowledges the carried sentence, no re-gift
await cdpKey("3");
await cdpClick('[data-hotspot-id="auditor"]');
txt = await sceneText();
assert(txt.includes("You carry the sentence now"), "Auditor remembers the pickup after reload");
assert((await historyCount("(Picked up: a sentence-shaped audit)")) === 1, "no duplicate pickup after reload (idempotent)");

console.log("Step 9: Go home, Use the held item on the drafts folder");
await cdpKey("2");
await cdpClick('[data-hotspot-id="back-lighthouse"]');
txt = await sceneText();
assert(txt.includes("[Arrived at: AI Focus]"), "navigated back home");
await cdpClick('[data-item-id="sentence-audit"]');
assert((await actionLine()).includes("Use a sentence-shaped audit on"), "holding item arms 'Use X on …'");
await cdpClick('[data-hotspot-id="drafts"]');
txt = await sceneText();
assert(txt.includes("publishes itself"), "Use sentence on drafts folder → unlock narration");
assert(await objectExists("to-shipped"), "new hotspot 'The shipped essay' revealed");
await shot("06-drafts-unlocked");

console.log("Step 10: RELOAD after unlock — reveal persists");
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector(".object-btn", { timeout: 15000 });
await new Promise((r) => setTimeout(r, 400));
assert(await objectExists("to-shipped"), "revealed hotspot survives reload (flag-driven re-reveal)");
assert(await page.evaluate(() => window.__engine.flags.shipped === true), "shipped flag survives reload");

console.log("Step 11: Go to the shipped essay — win state");
await cdpKey("2");
await cdpClick('[data-hotspot-id="to-shipped"]');
txt = await sceneText();
assert(txt.includes("[Arrived at: The shipped essay]"), "final scene reached by navigation");
assert(txt.includes("You shipped it."), "ending narration renders");
assert(await page.evaluate(() => !document.getElementById("win-banner").hidden), "win banner visible");
assert(await historyHas("★ THE END"), "history contains THE END");
await shot("07-the-end");

console.log("Step 12: terminal dialogue is authoritative after winning");
await cdpKey("2");
await cdpClick('[data-hotspot-id="back-shipped"]');
await cdpKey("3");
await cdpClick('[data-hotspot-id="paul"]');
txt = await sceneText();
assert(txt.includes("It's live. Ship fast, ship honest."), "Paul's terminal line after shipping (quest not re-opened)");
assert((await historyCount("(Picked up: a sentence-shaped audit)")) === 1, "consumed sentence never re-acquired");

console.log("Step 13: RELOAD at the end — win state persists");
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector(".object-btn", { timeout: 15000 });
await new Promise((r) => setTimeout(r, 400));
assert(await page.evaluate(() => window.__engine.won === true), "won flag survives reload");
assert(await page.evaluate(() => !document.getElementById("win-banner").hidden), "win banner restored after reload");

console.log("Step 14: incremental live announcements + full history chain");
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
assert(pageErrors.length === 0, "zero page errors", JSON.stringify(pageErrors.slice(0, 2)));

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed — screenshots in tests/shots/`);
process.exit(failed ? 1 : 0);

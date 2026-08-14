import { Engine } from './engine.js';
import { aifocusAdapter } from './aifocus-fixture.js';
import { createSceneArt, ART_W, ART_H } from './art.js';

const sceneView = document.getElementById('scene-view');
const liveAnnounce = document.getElementById('live-announce');
const actionLine = document.getElementById('action-line');
const verbsPanel = document.getElementById('verbs-panel');
const objectsPanel = document.getElementById('objects-panel');
const inventoryPanel = document.getElementById('inventory-panel');
const inventoryEmpty = document.getElementById('inventory-empty');
const winBanner = document.getElementById('win-banner');
const stage = document.getElementById('stage');
const sceneCanvas = document.getElementById('scene-canvas');
const hotspotLayer = document.getElementById('hotspot-layer');
const cursorLabel = document.getElementById('cursor-label');
const sceneCaption = document.getElementById('scene-caption');

const SAVE_KEY = 'miw-save-v1';
const HASH_PREFIX = '#/scene/';
const HOME_URL = 'https://aifoc.us/';

let engine;
let renderedLines = 0;   // visual log is append-only

function scrollToBottom() {
  sceneView.scrollTop = sceneView.scrollHeight;
}

function renderLine(line) {
  const el = document.createElement('div');
  el.className = 'history-line';
  if (line.startsWith('>')) el.classList.add('action');
  else if (line.startsWith('[')) el.classList.add('location');
  else if (line.startsWith('★')) el.classList.add('ending');
  else if (line.startsWith('(')) el.classList.add('inventory-note');
  else if (line.includes(': “')) el.classList.add('dialogue');
  else el.classList.add('narration');
  el.textContent = line;
  sceneView.appendChild(el);
}

function actionText(verb, held, hotspotLabel) {
  let text = verb;
  if (verb === 'Use' && held) text += ` ${held.label} on`;
  if (hotspotLabel) text += ` ${hotspotLabel}`;
  return text;
}

function urlFromHash() {
  if (location.hash.startsWith(HASH_PREFIX)) {
    try {
      return decodeURIComponent(location.hash.slice(HASH_PREFIX.length));
    } catch {
      return null;
    }
  }
  return null;
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(engine.serialize(engine.currentScene?.url ?? null)));
  } catch {
    // storage unavailable (private mode etc.) — the game still plays in-session
  }
}

const uiCallbacks = {
  // Visual log is append-only; the polite live region announces only the
  // newest line, so screen readers get incremental updates, not a re-read
  // of the entire history on every action.
  onHistoryUpdate: (history) => {
    if (history.length < renderedLines) {
      // fresh game replaced the log
      sceneView.innerHTML = '';
      renderedLines = 0;
    }
    for (const line of history.slice(renderedLines)) renderLine(line);
    if (history.length > renderedLines) liveAnnounce.textContent = history[history.length - 1];
    renderedLines = history.length;
    scrollToBottom();
  },

  onSceneUpdate: (scene) => {
    renderStageHotspots(scene);
    art.render(scene, engine.flags);
    objectsPanel.innerHTML = '';
    scene.hotspots.forEach((hotspot) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = `object-btn kind-${hotspot.kind ?? 'object'}`;
      btn.dataset.hotspotId = hotspot.id;
      btn.textContent = hotspot.label;

      const preview = () => {
        actionLine.textContent = actionText(engine.currentVerb, engine.heldItem(), hotspot.label);
      };
      btn.onmouseenter = preview;
      btn.onfocus = preview;
      const clear = () => {
        actionLine.textContent = actionText(engine.currentVerb, engine.heldItem());
      };
      btn.onmouseleave = clear;
      btn.onblur = clear;

      btn.onclick = () => {
        engine.interact(hotspot);
        actionLine.textContent = actionText(engine.currentVerb, engine.heldItem());
      };

      li.appendChild(btn);
      objectsPanel.appendChild(li);
    });
    save();
  },

  onVerbUpdate: (verb, held) => {
    actionLine.textContent = actionText(verb, engine?.heldItem?.() ?? null);
    document.querySelectorAll('.verb-btn').forEach((btn) => {
      const active = btn.textContent === verb;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  },

  onInventoryUpdate: (inventory, heldId) => {
    inventoryPanel.querySelectorAll('.inventory-chip').forEach((n) => n.remove());
    inventoryEmpty.hidden = inventory.length > 0;
    inventory.forEach((item) => {
      const chip = document.createElement('button');
      chip.className = 'inventory-chip';
      chip.dataset.itemId = item.id;
      chip.textContent = item.label;
      chip.title = item.look ?? item.label;
      chip.setAttribute('aria-pressed', String(heldId === item.id));
      if (heldId === item.id) chip.classList.add('held');
      chip.onclick = () => engine.hold(item.id);
      inventoryPanel.appendChild(chip);
    });
  },

  onWin: () => {
    winBanner.hidden = false;
    save();
  },

  onStateChange: save,

  // Movement model: every scene change is a real hash navigation, so the
  // browser's back/forward buttons walk the game; state survives reloads
  // via the localStorage save.
  onNavigate: async (url, { push = true } = {}) => {
    // The primary playable path: the aifoc.us snapshot adapter.
    if (url.includes('aifoc.us')) {
      engine.loadScene(aifocusAdapter(url));
    } else {
      // Generic same-origin fallback: adapt any HTML page into a scene.
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const { extractSceneFromDOM } = await import('./adapter.js');
        engine.loadScene(extractSceneFromDOM(url, doc));
      } catch (e) {
        engine.addHistory(`[Error: Could not travel to ${url}. The path is blocked by CORS or network issues.]`);
        return;
      }
    }
    const targetHash = HASH_PREFIX + encodeURIComponent(url);
    if (location.hash !== targetHash) {
      if (push) {
        location.hash = targetHash;      // player movement: new history entry
      } else {
        location.replace(targetHash);    // boot/restore/back-forward: pin in place
      }
    }
  },
};

engine = new Engine(uiCallbacks);
const art = createSceneArt(sceneCanvas, sceneCaption);

// Transparent semantic hotspot regions over the scene's visible objects.
function renderStageHotspots(scene) {
  hotspotLayer.innerHTML = '';
  scene.hotspots.forEach((hotspot) => {
    if (!hotspot.region) return;
    const [x, y, w, h] = hotspot.region;
    const btn = document.createElement('button');
    btn.className = 'stage-hotspot';
    btn.dataset.stageHotspot = hotspot.id;
    btn.style.left = `${(x / ART_W) * 100}%`;
    btn.style.top = `${(y / ART_H) * 100}%`;
    btn.style.width = `${(w / ART_W) * 100}%`;
    btn.style.height = `${(h / ART_H) * 100}%`;
    btn.setAttribute('aria-label', `${hotspot.label} — ${hotspot.kind ?? 'object'}`);

    const show = () => {
      art.setHighlight(hotspot.id);
      cursorLabel.textContent = actionText(engine.currentVerb, engine.heldItem(), hotspot.label);
      cursorLabel.hidden = false;
    };
    const hide = () => {
      art.setHighlight(null);
      cursorLabel.hidden = true;
    };
    btn.addEventListener('mouseenter', show);
    btn.addEventListener('focus', show);
    btn.addEventListener('mouseleave', hide);
    btn.addEventListener('blur', hide);
    btn.addEventListener('mousemove', (e) => {
      cursorLabel.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 220)}px`;
      cursorLabel.style.top = `${e.clientY + 16}px`;
    });
    btn.addEventListener('focus', () => {
      const r = btn.getBoundingClientRect();
      cursorLabel.style.left = `${r.left}px`;
      cursorLabel.style.top = `${r.bottom + 6}px`;
    });
    btn.addEventListener('click', () => {
      const wasTalk = engine.currentVerb === 'Talk to' && hotspot.kind === 'character';
      engine.interact(hotspot);
      if (wasTalk) art.speechBubble(hotspot.region);
      art.render(engine.currentScene, engine.flags); // reflect any state change (unlock, reveal…)
      actionLine.textContent = actionText(engine.currentVerb, engine.heldItem());
    });
    hotspotLayer.appendChild(btn);
  });
}

// Restore a saved game before the first scene renders.
let saved = null;
try {
  saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
} catch {
  saved = null;
}

// Verbs panel
engine.verbs.forEach((verb, i) => {
  const btn = document.createElement('button');
  btn.className = 'verb-btn';
  btn.textContent = verb;
  btn.setAttribute('aria-pressed', String(verb === engine.currentVerb));
  btn.title = `Shortcut: ${i + 1}`;
  btn.onclick = () => engine.setVerb(verb);
  verbsPanel.appendChild(btn);
});

// Keyboard: 1..4 select verbs (native Tab/Enter operate the buttons).
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const v = { '1': 'Look at', '2': 'Go to', '3': 'Talk to', '4': 'Use' }[e.key];
  if (v) {
    e.preventDefault();
    engine.setVerb(v);
  }
});

// Back/forward: a hash whose scene differs from the current one is a
// browser-initiated navigation (our own pushes already updated the scene).
window.addEventListener('hashchange', () => {
  const url = urlFromHash();
  if (url && url !== engine.currentScene?.url) uiCallbacks.onNavigate(url, { push: false });
});

// Start: deep-linked scene > saved scene > home. Restore state first so the
// opening scene renders with quest flags, inventory and reveals intact.
if (saved) engine.restore(saved);
window.__engine = engine; // introspection handle for the functional tests
uiCallbacks.onNavigate(urlFromHash() ?? saved?.sceneUrl ?? HOME_URL, { push: false });

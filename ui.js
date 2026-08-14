import { Engine } from './engine.js';
import { extractSceneFromDOM } from './adapter.js';
import { aifocusAdapter } from './aifocus-fixture.js';

const sceneView = document.getElementById('scene-view');
const actionLine = document.getElementById('action-line');
const verbsPanel = document.getElementById('verbs-panel');
const objectsPanel = document.getElementById('objects-panel');

let engine;
let currentSceneUrl = new URL('sample-site/index.html', window.location.href).href;

function scrollToBottom() {
  sceneView.scrollTop = sceneView.scrollHeight;
}

const uiCallbacks = {
  onHistoryUpdate: (history) => {
    sceneView.innerHTML = '';
    history.forEach(line => {
      const el = document.createElement('div');
      el.className = 'history-line';
      if (line.startsWith('>')) el.classList.add('action');
      else if (line.startsWith('[')) el.classList.add('location');
      else el.classList.add('narration');
      el.textContent = line;
      sceneView.appendChild(el);
    });
    scrollToBottom();
  },
  
  onSceneUpdate: (scene) => {
    objectsPanel.innerHTML = '';
    scene.hotspots.forEach(hotspot => {
      const btn = document.createElement('button');
      btn.className = 'object-btn';
      btn.textContent = hotspot.label;
      
      btn.onmouseenter = () => {
        actionLine.textContent = `${engine.currentVerb} ${hotspot.label}`;
      };
      
      btn.onmouseleave = () => {
        actionLine.textContent = engine.currentVerb;
      };
      
      btn.onclick = () => {
        engine.interact(hotspot);
        actionLine.textContent = engine.currentVerb;
      };
      
      objectsPanel.appendChild(btn);
    });
  },

  onVerbUpdate: (verb) => {
    actionLine.textContent = verb;
    document.querySelectorAll('.verb-btn').forEach(btn => {
      if (btn.textContent === verb) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  },
  
  onNavigate: async (url) => {
    try {
      // Check if it's the aifocus fake fixture
      if (url.includes('aifoc.us')) {
        const scene = aifocusAdapter(url);
        engine.loadScene(scene);
        return;
      }

      // Fetch the page
      const resp = await fetch(url);
      const text = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const scene = extractSceneFromDOM(url, doc);
      engine.loadScene(scene);
    } catch (e) {
      engine.addHistory(`[Error: Could not travel to ${url}. The path is blocked by CORS or network issues.]`);
    }
  }
};

engine = new Engine(uiCallbacks);

// Init Verbs
engine.verbs.forEach(verb => {
  const btn = document.createElement('button');
  btn.className = 'verb-btn';
  btn.textContent = verb;
  btn.onclick = () => engine.setVerb(verb);
  verbsPanel.appendChild(btn);
});

// Setup keyboard shortcuts (1,2,3,4 for verbs)
window.addEventListener('keydown', (e) => {
  const v = {
    '1': 'Look at',
    '2': 'Go to',
    '3': 'Talk to',
    '4': 'Use'
  }[e.key];
  if (v) engine.setVerb(v);
});

// Start the game
uiCallbacks.onNavigate(currentSceneUrl);

// aifoc.us adapter — a snapshot of REAL aifoc.us content (fetched 2026-08-14)
// with an authored game layer on top: "The Unshipped Essay".
// Every mapped URL below is a real page on https://aifoc.us; titles match
// the live pages' visible H1s, and dates/reading-times/narration quotes are
// taken from the live pages.
// /shipped-essay/ is the one invented scene — the game's ending.

const SENTENCE_AUDIT = { id: "sentence-audit", label: "a sentence-shaped audit" };

const SHIPPED_LINK = {
  id: "to-shipped",
  region: [274, 118, 38, 56], glyph: "door",
  label: "The shipped essay",
  kind: "link",
  url: "https://aifoc.us/shipped-essay/",
  look: "It glows with the quiet confidence of a page that returns 200 AND meaning.",
  use: { say: "Just read it. It's earned it." },
};

export const AIFOCUS_SCENES = {
  "https://aifoc.us/": {
    art: "home",
    title: "AI Focus",
    narration: [
      "AI Focus — essays on the web, AI, and building things, by Paul Kinlan.",
      "The essays are arranged like rooms off a long hallway, newest first.",
      "In the corner of the page, a drafts folder blinks. One essay in it refuses to ship.",
    ],
    hotspots: [
      {
        id: "to-lighthouse",
        region: [22, 46, 52, 74], glyph: "door",
        label: "how might a modern lighthouse work with large language models?",
        kind: "link",
        url: "https://aifoc.us/how-might-a-modern-lighthouse-work-with-llms/",
        look: "Published July 3, 2026 · 18 minutes. “Lighthouse is one of the most successful developer tools we've ever shipped…” The essay about audits that are just sentences.",
        use: { say: "You can't use an essay. You can only read it, or ship it." },
      },
      {
        id: "to-model-gap",
        region: [86, 46, 52, 74], glyph: "door",
        label: "please mind the model gap",
        kind: "link",
        url: "https://aifoc.us/please-mind-the-model-gap/",
        look: "Published June 7, 2026 · 5 minutes. About building software at a pace never managed before — and the gap between the web that was and the web that is.",
        use: { say: "Minding it is the whole interaction." },
      },
      {
        id: "to-urls",
        region: [150, 46, 52, 74], glyph: "door",
        label: "does a url in a prompt steer an llm's output toward its content?",
        kind: "link",
        url: "https://aifoc.us/influencing-model-output-with-urls/",
        look: "Published July 3, 2026 · 22 minutes. “At first, this was a really easy post to write, but then I discovered some things.”",
        use: { say: "You paste the URL into a prompt. Somewhere, a model's output gently bends." },
      },
      {
        id: "paul",
        region: [238, 58, 42, 68], glyph: "person",
        label: "Paul Kinlan",
        kind: "character",
        look: "The author of this realm. He types like the keyboard owes him money.",
        talk: [
          // Terminal state first: once shipped, Paul never re-opens the quest.
          { ifFlag: "shipped", lines: ["It's live. Ship fast, ship honest. Now go read the thing."] },
          {
            notFlag: "metPaul",
            lines: [
              "You're wandering my site as a point-and-click adventure? Fine. Maybe you can help.",
              "The lighthouse essay won't ship. The audit has no sentence.",
              "Go read it. Find me a sentence-shaped audit. Then use it on the drafts folder.",
            ],
            setFlag: "metPaul",
          },
          {
            notFlag: "shipped",
            notHas: SENTENCE_AUDIT.id,
            lines: ["The lighthouse post. The sentence. The Auditor in there has one. Go."],
          },
          {
            notFlag: "shipped",
            lines: ["You have the sentence? Don't frame it — USE it on the drafts folder."],
          },
        ],
        use: { say: "You can't use the author. The author uses you — to ship essays." },
      },
      {
        id: "drafts",
        region: [128, 126, 44, 26], glyph: "folder",
        label: "the blinking drafts folder",
        kind: "object",
        look: "One draft inside: “how-might-a-modern-lighthouse-work-with-llms — FINAL(7).md”. It pulses accusingly.",
        talk: null,
        use: {
          needs: SENTENCE_AUDIT.id,
          fail: "It's locked by perfectionism. It needs a sentence-shaped audit.",
          success: {
            say: "The sentence clicks into place. The draft glows… and publishes itself. A new path appears: “The shipped essay”.",
            reveal: SHIPPED_LINK,
            setFlag: "shipped",
            consume: true,
          },
        },
      },
    ],
  },

  "https://aifoc.us/how-might-a-modern-lighthouse-work-with-llms/": {
    art: "lighthouse",
    title: "how might a modern lighthouse work with large language models?",
    narration: [
      "“Lighthouse is one of the most successful developer tools we've ever shipped, and I say that as someone who is genuinely proud of the work the team has done on it.”",
      "“A few months ago I got obsessed with a simple question: what if the audit was just a sentence? What if you could describe, in plain English, what good looks like?”",
      "A small figure in a green-and-orange vest patrols the essay, measuring things. The Auditor.",
    ],
    hotspots: [
      {
        id: "auditor",
        region: [216, 96, 34, 52], glyph: "person",
        label: "The Auditor",
        kind: "character",
        look: "A personified audit tool in a lighthouse-vest. Its clipboard reads: SPEC · MODEL LOOP · SCORECARD.",
        talk: [
          // Terminal state first: the sentence is consumed when the essay ships,
          // so an unfinished-quest condition must never match again afterwards.
          { ifFlag: "shipped", lines: ["You shipped it. The sentence did its work."] },
          {
            notFlag: "shipped",
            notHas: SENTENCE_AUDIT.id,
            lines: [
              "I measure everything. Contrast. Leaks. Layout shifts.",
              "But I cannot say what good is — not in a sentence.",
              "Take mine. It is shaped exactly like an audit.",
            ],
            give: { ...SENTENCE_AUDIT, look: "It reads: “what if the audit was just a sentence?” It hums with percentiles." },
            setFlag: "hasSentence",
          },
          { lines: ["You carry the sentence now. Use it on something that needs shipping."] },
        ],
        use: { say: "The Auditor is a process, not a tool. It is already in use." },
      },
      {
        id: "memory-skill",
        region: [118, 128, 46, 26], glyph: "crate",
        label: "the memory-leak-debugging skill",
        kind: "object",
        look: "“The Chrome DevTools team shipped a skill called memory-leak-debugging that runs over their Chrome DevTools MCP…” It's heavier than it looks.",
        use: { say: "You point it at the page. It reports, with some concern, about your tab hoarding." },
      },
      {
        id: "back-lighthouse",
        region: [22, 100, 40, 60], glyph: "door",
        label: "Back to the index",
        kind: "link",
        url: "https://aifoc.us/",
        look: "The hallway back to the index of essays.",
        use: { say: "Walking is the using of doors." },
      },
    ],
  },

  "https://aifoc.us/please-mind-the-model-gap/": {
    art: "gap",
    title: "please mind the model gap",
    narration: [
      "“I'm building software every day at a pace I've never managed before, even when I wasn't a manager.”",
      "“The models we use, whether Gemini, Codex, or Claude, were trained on the web that was, not the web that is.”",
      "A gap yawns between two platforms of a train station. Announcements echo: mind it.",
    ],
    hotspots: [
      {
        id: "gap",
        region: [126, 108, 76, 44], glyph: "gap",
        label: "the model gap",
        kind: "object",
        look: "Between the platform of 2024 documentation and the train of 2026 APIs. Do not attempt to board stale patterns.",
        use: { say: "You bridge it with a current spec and a retrieval step. It closes slightly. Somewhere, an agent thanks you." },
      },
      {
        id: "back-gap",
        region: [24, 56, 40, 62], glyph: "door",
        label: "Back to the index",
        kind: "link",
        url: "https://aifoc.us/",
        look: "The hallway back to the index of essays.",
        use: { say: "Walking is the using of doors." },
      },
    ],
  },

  "https://aifoc.us/influencing-model-output-with-urls/": {
    art: "urls",
    title: "does a url in a prompt steer an llm's output toward its content?",
    narration: [
      "“At first, this was a really easy post to write, but then I discovered some things. Built a lot of things. Spent a lot of tokens…”",
      "“It started when I was thinking about how the mere presence of a technology name in a prompt seemed to bias the output.”",
      "URLs hang from the ceiling like mobiles over a crib, each one tugging an invisible output distribution.",
    ],
    hotspots: [
      {
        id: "steering-url",
        region: [128, 44, 64, 42], glyph: "card",
        label: "a steering URL",
        kind: "object",
        look: "It points at react.dev. Every prompt in the room now builds components.",
        use: { say: "You swap it for a link to the platform docs. The room's outputs improve measurably." },
      },
      {
        id: "back-urls",
        region: [24, 96, 40, 62], glyph: "door",
        label: "Back to the index",
        kind: "link",
        url: "https://aifoc.us/",
        look: "The hallway back to the index of essays.",
        use: { say: "Walking is the using of doors." },
      },
    ],
  },

  // The one invented page: the ending. Reachable only after shipping the draft.
  "https://aifoc.us/shipped-essay/": {
    art: "shipped",
    title: "The shipped essay",
    narration: [
      "The essay is live.",
      "“What if the audit was just a sentence?” reads the first line. The lighthouse score is 100. The gap is minded. The URL steers nothing but readers.",
      "You shipped it.",
    ],
    onArrive: { win: true },
    hotspots: [
      {
        id: "editor",
        region: [222, 62, 42, 70], glyph: "person",
        label: "The Editor",
        kind: "character",
        look: "Calm. Fearsome. Holds a red pen that has never once been used on a shipped post.",
        talk: [
          { lines: ["Clean ship. No typos. The sentence carried the whole audit.", "Come back when you have another one."] },
        ],
        use: { say: "The Editor cannot be used. The Editor uses red pens." },
      },
      {
        id: "back-shipped",
        region: [24, 96, 40, 62], glyph: "door",
        label: "Back to the index",
        kind: "link",
        url: "https://aifoc.us/",
        look: "The hallway back. Quieter now.",
        use: { say: "Walking is the using of doors." },
      },
    ],
  },
};

export function aifocusAdapter(url) {
  let lookup = url.endsWith("/") ? url.slice(0, -1) : url;
  const scene = AIFOCUS_SCENES[lookup + "/"] ?? AIFOCUS_SCENES[lookup];
  if (scene) return { url: lookup + "/", ...scene };

  // Uncharted aifoc.us page: honest fallback, way back offered.
  return {
    title: "An uncharted corner of aifoc.us",
    url,
    narration: [
      "You have wandered into a part of aifoc.us that this adventure hasn't mapped.",
      "The walls are bare HTML. Somewhere, a sitemap is being regenerated.",
    ],
    hotspots: [
      {
        id: "back-unknown",
        region: [140, 60, 44, 66], glyph: "door",
        label: "Back to the index",
        kind: "link",
        url: "https://aifoc.us/",
        look: "The way back to the known world.",
        use: { say: "Walking is the using of doors." },
      },
    ],
  };
}

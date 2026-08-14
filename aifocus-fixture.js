const FIXTURE_DATA = {
  "https://aifoc.us": {
    title: "aifoc.us - The Blog",
    narration: [
      "Welcome to aifoc.us.",
      "A blog about the web, AI, and building things.",
      "You stand in a minimalist digital space."
    ],
    hotspots: [
      { id: "post-1", label: "Read: Building Web Agents", type: "link", url: "https://aifoc.us/building-web-agents", description: "An article about creating autonomous web entities." },
      { id: "post-2", label: "Read: The Future of Browsers", type: "link", url: "https://aifoc.us/future-browsers", description: "A piece on how browsers are evolving." },
      { id: "author", label: "Paul Kinlan", type: "character", description: "The creator of this digital realm. He looks busy." }
    ]
  },
  "https://aifoc.us/building-web-agents": {
    title: "Building Web Agents",
    narration: [
      "Building Web Agents",
      "Web agents are software entities that can interact with the web on behalf of users.",
      "They use LLMs to understand the DOM and act."
    ],
    hotspots: [
      { id: "home", label: "Back to Home", type: "link", url: "https://aifoc.us", description: "Return to the main index." },
      { id: "demo", label: "View Demo", type: "item", description: "It's a mesmerizing demonstration of an agent clicking buttons." }
    ]
  },
  "https://aifoc.us/future-browsers": {
    title: "The Future of Browsers",
    narration: [
      "The Future of Browsers",
      "Browsers are becoming operating systems.",
      "They embed capabilities that were once native only."
    ],
    hotspots: [
      { id: "home", label: "Back to Home", type: "link", url: "https://aifoc.us", description: "Return to the main index." }
    ]
  }
};

export function aifocusAdapter(url) {
  // Clean URL to match fixture keys
  let lookupUrl = url;
  if (lookupUrl.endsWith('/')) {
    lookupUrl = lookupUrl.slice(0, -1);
  }
  
  if (FIXTURE_DATA[lookupUrl]) {
    return { url: lookupUrl, ...FIXTURE_DATA[lookupUrl] };
  }

  // Fallback if not in fixture
  return {
    title: "Unknown Page",
    url: url,
    narration: ["You have wandered into an uncharted part of aifoc.us."],
    hotspots: [
      { id: "home", label: "Back to safety", type: "link", url: "https://aifoc.us", description: "Go back to the known world." }
    ]
  };
}

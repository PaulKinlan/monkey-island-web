export function extractSceneFromDOM(url, doc) {
  const title = doc.title || url;
  const narration = [];
  
  // Extract paragraphs for narration
  const pTags = doc.querySelectorAll('p, h1, h2, h3');
  pTags.forEach(p => {
    const text = p.textContent.trim();
    if (text.length > 0) narration.push(text);
  });

  const hotspots = [];
  
  // Extract links as hotspots
  const links = doc.querySelectorAll('a');
  links.forEach((a, index) => {
    const label = a.textContent.trim() || `Link ${index}`;
    let href = a.getAttribute('href');
    if (!href) return;
    
    // Resolve relative URLs
    try {
      href = new URL(href, url).href;
    } catch(e) {
      // ignore
    }

    hotspots.push({
      id: `link-${index}`,
      label: label.substring(0, 30) + (label.length > 30 ? "..." : ""),
      type: "link",
      url: href,
      description: `A path leading to ${href}`
    });
  });

  // Extract images as items to look at
  const images = doc.querySelectorAll('img');
  images.forEach((img, index) => {
    const alt = img.getAttribute('alt') || `Image ${index}`;
    hotspots.push({
      id: `img-${index}`,
      label: alt.substring(0, 30),
      type: "item",
      description: `A picture: ${alt}`
    });
  });

  return { title, url, narration, hotspots };
}

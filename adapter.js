// Generic DOM adapter: turns any same-origin HTML page into a playable scene.
// The primary game path is the curated aifoc.us snapshot (aifocus-fixture.js);
// this adapter is the fallback for any other URL the player wanders to.
export function extractSceneFromDOM(url, doc) {
  const title = doc.title || url;
  const narration = [];

  const pTags = doc.querySelectorAll('h1, h2, h3, p');
  pTags.forEach((p) => {
    const text = p.textContent.trim();
    if (text.length > 0) narration.push(text);
  });
  if (narration.length === 0) narration.push('A sparse page. The walls echo.');

  const hotspots = [];

  doc.querySelectorAll('a').forEach((a, index) => {
    const label = a.textContent.trim() || `Link ${index}`;
    let href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    try {
      href = new URL(href, url).href;
    } catch {
      return;
    }
    hotspots.push({
      id: `link-${index}`,
      label: label.length > 40 ? label.slice(0, 40) + '…' : label,
      kind: 'link',
      url: href,
      look: `A path leading to ${href}`,
      use: { say: 'Walking is the using of doors.' },
    });
  });

  doc.querySelectorAll('img').forEach((img, index) => {
    const alt = img.getAttribute('alt') || `Image ${index}`;
    hotspots.push({
      id: `img-${index}`,
      label: alt.length > 40 ? alt.slice(0, 40) + '…' : alt,
      kind: 'object',
      look: `A picture: ${alt}`,
      use: { say: 'You admire the pixels. They admire you back.' },
    });
  });

  hotspots.push({
    id: 'back-generic',
    label: 'Back to aifoc.us',
    kind: 'link',
    url: 'https://aifoc.us/',
    look: 'The way back to the known world.',
    use: { say: 'Walking is the using of doors.' },
  });

  return { title, url, narration, hotspots };
}

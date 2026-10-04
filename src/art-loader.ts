// Fetches one flag/crest SVG from public/, once per URL. Never rejects: a flaky connection just keeps
// the "Loading…" screen up while it retries, instead of crashing the game.
const cache = new Map<string, Promise<string>>();

export const loadSvg = (url: string): Promise<string> => {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await fetch(url);
          const text = r.ok ? await r.text() : '';
          // A missing file can come back as the SPA's index.html with a 200, so check it's really an SVG.
          if (text.trimStart().startsWith('<svg')) return text;
        } catch {}
        await new Promise(res => setTimeout(res, Math.min(1000 * 2 ** attempt, 8000)));
      }
    })();
    cache.set(url, p);
  }
  return p;
};

// Seeds the cache with an SVG already bundled into JS, so loadSvg skips the network for it.
export const primeSvg = (url: string, svg: string) => {
  if (!cache.has(url)) cache.set(url, Promise.resolve(svg));
};

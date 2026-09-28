// Restricts a badge's rounds to its central roundel. Each colour is one path whose
// subpaths cover both the roundel and the ornament around it (Real Madrid's crown),
// and the game swaps and outlines a colour by exact hex, so the ornament's subpaths
// are split into their own path with the hex nudged one unit — invisible, but no
// longer the hidden colour. Expects absolute path data (forceAbsolutePath).
type Box = { x0: number; y0: number; x1: number; y1: number };

const ARGS: Record<string, number> = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };

function subpaths(d: string): { d: string; box: Box }[] {
  const out: { d: string; box: Box }[] = [];
  for (const part of d.split(/(?=M)/)) {
    if (!part.trim()) continue;
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const add = (x: number, y: number) => { box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y); box.x1 = Math.max(box.x1, x); box.y1 = Math.max(box.y1, y); };
    let x = 0, y = 0;
    for (const m of part.matchAll(/([MLTHVCSQAZ])([^MLTHVCSQAZ]*)/g)) {
      const cmd = m[1]!, n = ARGS[cmd]!;
      const nums = (m[2]!.match(/-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
      for (let i = 0; n && i + n <= nums.length; i += n) {
        const a = nums.slice(i, i + n);
        if (cmd === 'H') x = a[0]!;
        else if (cmd === 'V') y = a[0]!;
        else if (cmd === 'A') { x = a[5]!; y = a[6]!; }
        else { for (let k = 0; k < n - 2; k += 2) add(a[k]!, a[k + 1]!); x = a[n - 2]!; y = a[n - 1]!; }
        add(x, y);
      }
    }
    out.push({ d: part, box });
  }
  return out;
}

const area = (b: Box) => (b.x1 - b.x0) * (b.y1 - b.y0);
const nudge = (hex: string) => {
  const last = parseInt(hex.slice(5, 7), 16);
  return hex.slice(0, 5) + (last === 255 ? 254 : last + 1).toString(16).padStart(2, '0').toUpperCase();
};

// Narrows one colour's round to a circle inside the roundel (Real Madrid's diagonal
// band, not the blue rings around it). The colour's path is locked to the nudged hex
// and re-drawn once through a clipped <use> carrying the real hex, so only the clipped
// part is swapped and outlined. <use> keeps the path data from being duplicated.
export function clipRegion(svg: string, hex: string, [cx, cy, r]: [number, number, number]): string {
  return svg.replace(/<path\b([^>]*?)\sd="([^"]+)"([^>]*)\/>/g, (m, pre: string, d: string, post: string) => {
    if (!(pre + post).includes(`fill="${hex}"`)) return m;
    return `<g fill="${nudge(hex)}"><path id="clip-src" d="${d}"/></g>` +
      `<clipPath id="clip-area"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>` +
      `<use href="#clip-src" fill="${hex}" clip-path="url(#clip-area)"/>`;
  });
}

export function lockOutsideRoundel(svg: string): string {
  const paths = [...svg.matchAll(/<path\b([^>]*?)\sd="([^"]+)"([^>]*)\/>/g)];
  const all = paths.flatMap(p => subpaths(p[2]!));
  // The roundel is the outer ring: the largest subpath on the badge.
  const ring = all.reduce((a, b) => (area(b.box) > area(a.box) ? b : a)).box;
  const tol = 2;
  const inside = (b: Box) => b.x0 >= ring.x0 - tol && b.y0 >= ring.y0 - tol && b.x1 <= ring.x1 + tol && b.y1 <= ring.y1 + tol;

  return svg.replace(/<path\b([^>]*?)\sd="([^"]+)"([^>]*)\/>/g, (m, pre: string, d: string, post: string) => {
    const fill = (pre + post).match(/\bfill="(#[0-9A-F]{6})"/)?.[1];
    if (!fill) return m;
    const parts = subpaths(d);
    const keep = parts.filter(p => inside(p.box)).map(p => p.d).join('');
    const lock = parts.filter(p => !inside(p.box)).map(p => p.d).join('');
    if (!lock) return m;
    const locked = `<path${(pre + post).replace(`fill="${fill}"`, `fill="${nudge(fill)}"`)} d="${lock}"/>`;
    return (keep ? `<path${pre} d="${keep}"${post}/>` : '') + locked;
  });
}

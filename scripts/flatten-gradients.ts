// Replace every gradient paint with one solid colour (the stops' average along the
// gradient), then merge near-identical results so a badge shaded with 28 slightly
// different greens becomes one green region.
const hex2 = (h: string) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const toHex = (c: number[]) => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

function lab([r, g, b]: number[]): number[] {
  const l = [r, g, b].map(v => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; });
  const x = (l[0]! * 0.4124 + l[1]! * 0.3576 + l[2]! * 0.1805) / 0.95047, y = l[0]! * 0.2126 + l[1]! * 0.7152 + l[2]! * 0.0722, z = (l[0]! * 0.0193 + l[1]! * 0.1192 + l[2]! * 0.9505) / 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const dE = (a: number[], b: number[]) => { const p = lab(a), q = lab(b); return Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!); };

export function flattenGradients(raw: string): string {
  // A gradient that fades to transparent is a shading overlay, not base paint.
  // Flattened opaque it would cover whatever it shades, so it is dropped instead.
  const shading = new Set<string>();
  const grads = new Map<string, { stops: [number, number[]][]; href?: string }>();
  for (const m of raw.matchAll(/<(linearGradient|radialGradient)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g)) {
    const id = m[2]!.match(/\bid="([^"]+)"/)?.[1];
    if (!id) continue;
    const href = m[2]!.match(/href="#([^"]+)"/)?.[1];
    const stops: [number, number[]][] = [];
    for (const s of (m[4] ?? '').matchAll(/<stop\b([^>]*)>/g)) {
      const off = parseFloat(s[1]!.match(/offset="([^"]+)"/)?.[1] ?? '0') * (s[1]!.includes('offset="') && s[1]!.match(/offset="[^"]*%"/) ? 0.01 : 1);
      const col = s[1]!.match(/stop-color(?:="|:\s*)(#[0-9a-fA-F]{3,6})/)?.[1];
      if (col) stops.push([off, hex2(col)]);
    }
    grads.set(id, { stops, href });
    if (/stop-opacity(?:="|:\s*)(0?\.\d+|0)\b/.test(m[4] ?? '')) shading.add(id);
  }
  const isShading = (id: string, depth = 0): boolean =>
    shading.has(id) || (depth < 5 && !!grads.get(id)?.href && isShading(grads.get(id)!.href!, depth + 1));
  const stopsOf = (id: string, depth = 0): [number, number[]][] => {
    const g = grads.get(id);
    if (!g) return [];
    return g.stops.length || !g.href || depth > 5 ? g.stops : stopsOf(g.href, depth + 1);
  };
  // Average colour over offset 0..1, holding the end stops flat past their offsets.
  const solid = new Map<string, number[]>();
  for (const id of grads.keys()) {
    const s = stopsOf(id).sort((a, b) => a[0] - b[0]);
    if (!s.length) continue;
    const pts: [number, number[]][] = [[0, s[0]![1]], ...s, [1, s[s.length - 1]![1]]];
    const acc = [0, 0, 0];
    for (let i = 1; i < pts.length; i++) {
      const w = Math.max(0, pts[i]![0] - pts[i - 1]![0]);
      for (let k = 0; k < 3; k++) acc[k] += w * (pts[i]![1][k]! + pts[i - 1]![1][k]!) / 2;
    }
    solid.set(id, acc);
  }
  // Merge solids within dE 12 onto the first-seen representative.
  const reps: number[][] = [];
  const final = new Map<string, string>();
  for (const [id, c] of solid) {
    if (isShading(id)) { final.set(id, 'none'); continue; }
    const rep = reps.find(r => dE(r, c) < 12) ?? (reps.push(c), c);
    final.set(id, toHex(rep));
  }
  return raw.replace(/url\(#([^)]+)\)/g, (m, id: string) => final.get(id) ?? m);
}

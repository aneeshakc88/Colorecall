import { Color, hsbToRgb } from '../utils/colorMath';

export function hexToLab(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
  const [rl, gl, bl] = [lin(r), lin(g), lin(b)];
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  const y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) / 1.00000;
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = hexToLab(a), [l2, a2, b2] = hexToLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

// Approximate CIELAB hue angles for everyday colour names.
const HUES: [string, number][] = [['pink', 355], ['red', 30], ['orange', 55], ['yellow', 92], ['green', 140], ['teal', 190], ['blue', 285], ['purple', 315]];
const hueName = (deg: number) => {
  const d = (x: number) => { const v = Math.abs(((deg - x) % 360 + 360) % 360); return Math.min(v, 360 - v); };
  return HUES.reduce((best, h) => d(h[1]) < d(best[1]) ? h : best)[0];
};

const amount = (d: number, small: number, big: number) => d < small ? 'a touch ' : d < big ? '' : 'way ';

// Plain-language "how you missed": lightness, then vividness, then which way the hue drifted.
export function describeMiss(actualHex: string, guessHex: string): string[] {
  const [la, aa, ba] = hexToLab(actualHex), [lg, ag, bg] = hexToLab(guessHex);
  if (deltaE(actualHex, guessHex) < 3) return ['Spot on'];

  const parts: { mag: number; text: string }[] = [];
  const dL = lg - la;
  if (Math.abs(dL) > 4) parts.push({ mag: Math.abs(dL), text: `${amount(Math.abs(dL), 9, 22)}too ${dL > 0 ? 'light' : 'dark'}` });

  const ca = Math.hypot(aa, ba), cg = Math.hypot(ag, bg);
  const dC = cg - ca;
  if (Math.abs(dC) > 6) parts.push({ mag: Math.abs(dC), text: `${amount(Math.abs(dC), 12, 30)}too ${dC > 0 ? 'vivid' : 'muted'}` });

  // Hue drift = the part of the (a,b) move perpendicular to the actual colour's chroma direction.
  const hueGap = Math.abs(((Math.atan2(bg, ag) - Math.atan2(ba, aa)) * 180 / Math.PI + 540) % 360 - 180);
  if ((ca > 8 && cg > 8 && hueGap > 75) || (ca <= 8 && cg > 25)) {
    // Different colour family (or colour where there should be none): name what they picked.
    return [`Wrong color — that's ${hueName(Math.atan2(bg, ag) * 180 / Math.PI)}`];
  } else if (ca > 8 && cg > 8) {
    const ux = aa / ca, uy = ba / ca;
    const da = ag - aa, db = bg - ba;
    const along = da * ux + db * uy;
    const px = da - along * ux, py = db - along * uy;
    const drift = Math.hypot(px, py);
    if (drift > 6) {
      // Name the hue ~50° further round in the direction it drifted (blue drifting +a reads as "purple", not "red").
      const dir = aa * bg - ba * ag > 0 ? 1 : -1;
      const toward = Math.atan2(ba, aa) * 180 / Math.PI + dir * 50;
      parts.push({ mag: drift, text: `${amount(drift, 12, 30)}too ${hueName(toward)}` });
    }
  }

  if (!parts.length) return ['Very close'];
  return parts.sort((x, y) => y.mag - x.mag).slice(0, 2).map(p => p.text);
}

// ── color conversions (hex <-> HSB, so the shared VerticalSlider can drive a hex guess) ──

export function hexToHsb(hex: string): Color {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max, d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), b: Math.round(v * 100) };
}

export function colorToHex(c: Color): string {
  const [r, g, b] = hsbToRgb(c.h, c.s, c.b);
  const to = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();
  return `#${to(r)}${to(g)}${to(b)}`;
}

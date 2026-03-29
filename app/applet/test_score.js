function hsbToRgb(h, s, b) {
  s /= 100; b /= 100;
  const c = b * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = b - c;
  let r = 0, g = 0, bl = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; bl = x; }
  else if (h < 240) { g = x; bl = c; }
  else if (h < 300) { r = x; bl = c; }
  else              { r = c; bl = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((bl + m) * 255)];
}

function rgbToLab(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750);
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function scoreHsb(h1, s1, b1, h2, s2, b2) {
  const [r1, g1, bl1] = hsbToRgb(h1, s1, b1);
  const [r2, g2, bl2] = hsbToRgb(h2, s2, b2);
  const [L1, a1, b1L] = rgbToLab(r1, g1, bl1);
  const [L2, a2, b2L] = rgbToLab(r2, g2, bl2);
  const dE = Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1L - b2L) ** 2);
  const base = 10 / (1 + Math.pow(dE / 32, 1.6));
  const hueDiff = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
  const avgSat = (s1 + s2) / 2;
  const hueAcc = Math.max(0, 1 - Math.pow(hueDiff / 25, 1.5));
  const satWeightR = Math.min(1, avgSat / 30);
  const recovery = (10 - base) * hueAcc * satWeightR * 0.40;
  const huePenFactor = Math.max(0, (hueDiff - 40) / 140);
  const satWeightP = Math.min(1, avgSat / 40);
  const penalty = base * huePenFactor * satWeightP * 0.3;
  const raw = base + recovery - penalty;
  const jitter = raw < 9.8 ? 0 : 0; // remove random for test
  return Math.max(0, Math.min(10, Math.round((raw + jitter) * 100) / 100));
}

console.log(scoreHsb(120, 100, 100, 240, 100, 100));

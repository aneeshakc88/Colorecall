// Bakes all crest rounds (club × hideable region) with the wrong-colour start and the
// marching-ants overlay, so the review page renders instantly instead of tracing 307
// outlines in the browser.
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { CRESTS_DATA } from '../src/crest/crests-data';
import { regionOutlineRaster, type Raster } from '../src/flag/flag-highlight';

const ART_BOTTOM = 755;

const rasterize = async (svg: string, width: number): Promise<Raster> => {
  const height = Math.max(2, Math.round(width * (ART_BOTTOM / 800)));
  const { data } = await sharp(Buffer.from(svg), { density: 200 })
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width, height };
};

// ── wrong-colour generator, copied verbatim from src/flag/flag-core.ts ─────────
function hexToHsl(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0').toUpperCase();
  return '#' + to(r) + to(g) + to(b);
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function makeWrongHex(hex: string, rand: () => number): string {
  const { h, s, l } = hexToHsl(hex);
  if (s < 0.12) {
    const nh = rand() * 360;
    const ns = 0.45 + rand() * 0.25;
    const nl = l > 0.5 ? 0.55 + rand() * 0.2 : 0.28 + rand() * 0.2;
    return hslToHex(nh, ns, nl);
  }
  const nh = h + 70 + rand() * 160;
  const ns = clamp(s * (0.7 + rand() * 0.5), 0.35, 1);
  const nl = clamp(l + (rand() - 0.5) * 0.24, 0.22, 0.8);
  return hslToHex(nh, ns, nl);
}
function seededRand(seed: number) {
  let s = seed;
  return () => { const x = Math.sin(s++) * 10000; return x - Math.floor(x); };
}

type Round = { c: number; hex: string; wrong: string; cov: number; ants: string };

async function main() {
  const rand = seededRand(4271);
  const clubs = CRESTS_DATA.map(c => ({ name: c.name, code: c.code, svg: c.svg }));
  const rounds: Round[] = [];
  let empty = 0;

  for (let ci = 0; ci < CRESTS_DATA.length; ci++) {
    const club = CRESTS_DATA[ci]!;
    for (const region of club.hideable) {
      const ants = await regionOutlineRaster(club.svg, region.hex, rasterize);
      if (!ants) empty++;
      rounds.push({ c: ci, hex: region.hex, wrong: makeWrongHex(region.hex, rand), cov: region.coverage, ants });
    }
    process.stdout.write(`\r${ci + 1}/${CRESTS_DATA.length} clubs · ${rounds.length} rounds`);
  }

  const out = { clubs, rounds };
  const path = process.argv[2] ?? 'rounds.json';
  writeFileSync(path, JSON.stringify(out));
  console.log(`\n${rounds.length} rounds, ${empty} with empty ants → ${path}`);
}

main();

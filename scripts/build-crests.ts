// Generates src/crest/crests-data.ts from the FCLOGO vector set.
//
//   npx tsx scripts/build-crests.ts
//
// Every source crest paints via `style="fill: …"` rather than a fill attribute, so
// the normalize step is load-bearing: swapRegion's hex swap and the silhouette
// renderer in flag-highlight both look for fill/stroke ATTRIBUTES. The FCLOGO
// wordmark sits in the bottom strip of the shared 800x800 canvas (art never reaches
// below y=749, the mark runs 760-785), so it is deleted by that position and the
// canvas cropped to match.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { optimize } from 'svgo';
import { regionOutlineRaster, type Raster } from '../src/flag/flag-highlight';

const REPO = 'FCLOGO/fclogo.top';
const FEDS = ['theFA', 'RFEF', 'FIGC', 'DFB', 'FFF'];
const CACHE = join(process.cwd(), '.crest-cache');
const ART_BOTTOM = 755;   // crop height — clips the wordmark, clears the deepest art by 6px
const MAX_BYTES = 15_000;
const COVERAGE_FLOOR = 0.08;
const MEASURE_W = 400;

// Duds pulled from the Crest Round Gauntlet review: regions whose marching-ants
// outline is unreadable as a puzzle. Club-level entries drop the badge entirely.
const DUD_CLUBS = new Set(['RFEF-c-rdoba']);
const DUD_REGIONS = new Set([
  'RFEF-eldense #FFFFFF',
  'RFEF-fc-andorra #FF0B10',
  'FFF-fc-lorient #1B1615',
  'FFF-fc-lorient #FFFFFF',
  'FIGC-fiorentina #FFFFFF',
  'DFB-jahn-regensburg #E3000F',
  'DFB-karlsruher #004B93',
  'theFA-man-city #00285D',
  'DFB-paderborn #1B68A2',
  'DFB-paderborn #131514',
  'FFF-paris #FFFFFF',
  'RFEF-santander #FFFFFF',
  'FIGC-venezia #FF6B00',
  'DFB-bochum #1456A2',
]);

// Source folder names are terse or occasionally wrong; these are the ones a player
// would have to recognize on sight.
const NAME_FIX: Record<string, string> = {
  'Paris': 'Paris Saint-Germain', 'Paris FC': 'Paris FC', 'Intel Milan': 'Inter Milan',
  'Hotspur': 'Tottenham Hotspur', 'Man City': 'Manchester City', 'Man United': 'Manchester United',
  'Nottingham': 'Nottingham Forest', 'Brestois': 'Brest', 'Rennais': 'Rennes',
  'Hamburger': 'Hamburger SV', 'Greuther': 'Greuther Fürth', 'Karlsruher': 'Karlsruher SC',
  'Hannover': 'Hannover 96', 'Hertha': 'Hertha BSC', 'Nürnberg': '1. FC Nürnberg',
  'Münster': 'Preußen Münster', 'Monchengladbach': 'Borussia Mönchengladbach',
  'Eintracht': 'Eintracht Braunschweig', 'Verona': 'Hellas Verona', 'Celta': 'Celta Vigo',
  'Vallecano': 'Rayo Vallecano', 'Ferrol': 'Racing de Ferrol', 'Santander': 'Racing Santander',
  'Gijón': 'Sporting Gijón', 'LaCoruna': 'Deportivo La Coruña', 'Éibar': 'Eibar',
  'Atletico Madrid': 'Atlético Madrid', 'Malaga': 'Málaga', 'Magdeburg': '1. FC Magdeburg',
  'Kaiserslautern': '1. FC Kaiserslautern', 'Köln': '1. FC Köln', 'Bremen': 'Werder Bremen',
  'Frankfurt': 'Eintracht Frankfurt', 'Leipzig': 'RB Leipzig', 'Dortmund': 'Borussia Dortmund',
  'Elversberg': 'SV Elversberg', 'Darmstadt': 'Darmstadt 98', 'Düsseldorf': 'Fortuna Düsseldorf',
  'Bochum': 'VfL Bochum', 'Stuttgart': 'VfB Stuttgart', 'Wolves': 'Wolverhampton Wanderers',
};

type Picked = { fed: string; folder: string; path: string };

async function listTree(): Promise<Picked[]> {
  const cached = join(CACHE, 'tree.json');
  let tree: { tree: { path: string }[]; truncated: boolean };
  if (existsSync(cached)) {
    tree = JSON.parse(readFileSync(cached, 'utf8'));
  } else {
    const r = await fetch(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`);
    if (!r.ok) throw new Error(`tree fetch ${r.status}`);
    tree = await r.json() as typeof tree;
    writeFileSync(cached, JSON.stringify(tree));
  }
  if (tree.truncated) throw new Error('repo tree truncated — needs paging');

  // Prefer the plain `-vYYYY.svg` of the newest year. The -mono/-comm/-flat/-silh
  // variants are colour-reduced redraws and would misrepresent the real crest.
  const plain = /-v(\d{4})\.svg$/;
  const byClub = new Map<string, string[]>();
  for (const e of tree.tree) {
    const p = e.path.split('/');
    if (!e.path.endsWith('.svg') || p[4] !== 'clubs' || !FEDS.includes(p[3]!)) continue;
    const key = `${p[3]}/${p[5]}`;
    byClub.set(key, [...(byClub.get(key) ?? []), e.path]);
  }
  const out: Picked[] = [];
  for (const [key, paths] of byClub) {
    const cands = paths.filter(p => plain.test(p.split('/').pop()!));
    if (!cands.length) continue;
    cands.sort((a, b) => +b.match(plain)![1]! - +a.match(plain)![1]!);
    const [fed, folder] = key.split('/') as [string, string];
    out.push({ fed, folder, path: cands[0]! });
  }
  return out;
}

async function download(p: Picked): Promise<string> {
  const file = join(CACHE, `${p.fed}__${p.folder}.svg`.replace(/[/\\:*?"<>|]/g, '_'));
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const url = `https://raw.githubusercontent.com/${REPO}/main/${p.path.split('/').map(encodeURIComponent).join('/')}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${p.folder}: ${r.status}`);
  const body = await r.text();
  writeFileSync(file, body);
  return body;
}

const up = (hex: string) => {
  const h = hex.trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return '#' + full.toUpperCase();
};

// style="fill: #abc; stroke: #def" → fill="#AABBCC" stroke="#DDEEFF", leaving any
// other declaration in place. Also crops the canvas past the FCLOGO wordmark.
function normalize(raw: string): string {
  let s = raw
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(sodipodi|inkscape):[^>]*\/>/g, '')
    .replace(/<(sodipodi|inkscape):[^>]*>[\s\S]*?<\/(sodipodi|inkscape):[^>]*>/g, '');

  s = s.replace(/style="([^"]*)"/g, (_m, body: string) => {
    const keep: string[] = [];
    const attrs: string[] = [];
    for (const decl of body.split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const name = decl.slice(0, i).trim();
      const val = decl.slice(i + 1).trim();
      if ((name === 'fill' || name === 'stroke') && /^#[0-9a-fA-F]{3,6}$/.test(val)) attrs.push(`${name}="${up(val)}"`);
      else if (name === 'fill' || name === 'stroke') attrs.push(`${name}="${val}"`);
      else keep.push(`${name}:${val}`);
    }
    return [...attrs, ...(keep.length ? [`style="${keep.join(';')}"`] : [])].join(' ');
  });

  s = s.replace(/(fill|stroke)="(#[0-9a-fA-F]{3,6})"/g, (_m, k: string, v: string) => `${k}="${up(v)}"`);

  // Delete the wordmark outright rather than just cropping it out of view: left in
  // the file it still costs bytes and, worse, still registers as a colour region.
  // Crest art tops out at y=749, so any subpath that STARTS below 760 is the mark.
  s = s.replace(/<(path|polygon)\b[^>]*?\bd="M\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)[^"]*"[^>]*\/>/g,
    (m, _tag, _x, y: string) => (+y > 760 ? '' : m));
  s = s.replace(/viewBox="[^"]*"/, `viewBox="0 0 800 ${ART_BOTTOM}"`);
  return s.trim();
}

const DRAWABLE = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline']);
const NON_RENDERING = new Set(['defs', 'clipPath', 'mask', 'symbol', 'marker', 'pattern']);

// An element with no fill anywhere up its ancestor chain renders black by SVG default.
// Those pixels are real paint, but carry no hex for swapRegion to target or for the
// coverage pass to attribute — the nearest-colour snap would silently charge them to
// some unrelated fill. Make the default explicit so black becomes a first-class region.
function stampDefaultFills(svg: string): string {
  let out = '';
  let i = 0;
  const stack: (string | undefined)[] = [];
  let inherited: string | undefined;
  let skipDepth = 0;

  for (const m of svg.matchAll(/<\/?([a-zA-Z][\w:-]*)((?:"[^"]*"|[^>"])*)>/g)) {
    out += svg.slice(i, m.index);
    i = m.index + m[0].length;
    const tag = m[1]!;
    const attrs = m[2] ?? '';
    const closing = m[0].startsWith('</');
    const selfClosing = attrs.trimEnd().endsWith('/');

    if (closing) {
      if (NON_RENDERING.has(tag)) skipDepth = Math.max(0, skipDepth - 1);
      else inherited = stack.pop();
      out += m[0];
      continue;
    }
    if (NON_RENDERING.has(tag)) {
      if (!selfClosing) skipDepth++;
      out += m[0];
      continue;
    }

    const own = attrs.match(/\bfill="([^"]*)"/)?.[1];
    if (skipDepth === 0 && DRAWABLE.has(tag) && own === undefined && inherited === undefined) {
      out += `<${tag}${attrs.replace(/\s*\/$/, '')} fill="#000000"${selfClosing ? '/' : ''}>`;
    } else {
      out += m[0];
    }
    if (!selfClosing) {
      stack.push(inherited);
      if (own !== undefined) inherited = own;
    }
  }
  return out + svg.slice(i);
}

const rasterize = async (svg: string, width: number): Promise<Raster> => {
  const height = Math.max(2, Math.round(width * (ART_BOTTOM / 800)));
  const { data } = await sharp(Buffer.from(svg), { density: 200 })
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width, height };
};

// Declared paint, snapped: antialiasing invents in-between colours, so every opaque
// pixel is attributed to the nearest colour the file actually declares. Coverage is
// measured against the badge's own area, not the square canvas it sits on.
async function coverage(svg: string, hexes: string[]): Promise<Record<string, number>> {
  const height = Math.round(MEASURE_W * (ART_BOTTOM / 800));
  const { data } = await sharp(Buffer.from(svg), { density: 200 })
    .resize(MEASURE_W, height, { fit: 'fill', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgb = hexes.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const);
  const count = new Array(hexes.length).fill(0);
  let area = 0;
  for (let i = 0; i < MEASURE_W * height; i++) {
    const o = i * 4;
    if (data[o + 3]! < 128) continue;
    area++;
    const r = data[o]!, g = data[o + 1]!, b = data[o + 2]!;
    let best = 0, bd = Infinity;
    for (let k = 0; k < rgb.length; k++) {
      const [cr, cg, cb] = rgb[k]!;
      const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    count[best]++;
  }
  const out: Record<string, number> = {};
  if (!area) return out;
  hexes.forEach((h, k) => { out[h] = count[k] / area; });
  return out;
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const picked = await listTree();
  console.log(`${picked.length} Big-5 clubs with a clean version file`);

  const skipped: Record<string, string[]> = { gradient: [], image: [], tooBig: [], noRegion: [], noRing: [] };
  const rows: { name: string; code: string; svg: string; hideable: { hex: string; coverage: number }[] }[] = [];

  for (const p of picked) {
    const folder = p.folder.replace(/^\d+[_-]\s*/, '').trim();
    const code = `${p.fed}-${folder.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (DUD_CLUBS.has(code)) continue;

    const raw = await download(p);
    const name = NAME_FIX[folder] ?? folder;

    if (/<image\b/.test(raw)) { skipped.image!.push(name); continue; }
    if (/url\(#/.test(raw)) { skipped.gradient!.push(name); continue; }

    let svg = normalize(raw);
    svg = optimize(svg, { multipass: true, floatPrecision: 1, plugins: ['preset-default'] }).data;
    svg = optimize(svg, { multipass: true, floatPrecision: 1, plugins: ['preset-default'] }).data;
    // After optimizing, not before: SVGO's removeUselessStrokeAndFill strips an
    // explicit black fill right back off, since black is the default it encodes.
    svg = stampDefaultFills(svg);
    // SVGO can re-shorten hexes it just saw us expand.
    svg = svg.replace(/(fill|stroke)="(#[0-9a-fA-F]{3,6})"/g, (_m, k: string, v: string) => `${k}="${up(v)}"`);

    if (Buffer.byteLength(svg) > MAX_BYTES) { skipped.tooBig!.push(`${name}(${(Buffer.byteLength(svg) / 1024).toFixed(0)}KB)`); continue; }

    const hexes = [...new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9A-F]{6})"/g)].map(m => m[1]!))];
    if (!hexes.length) { skipped.noRegion!.push(name); continue; }

    const cov = await coverage(svg, hexes);
    const cands = hexes
      .filter(h => (cov[h] ?? 0) >= COVERAGE_FLOOR)
      .sort((a, b) => (cov[b] ?? 0) - (cov[a] ?? 0));
    if (!cands.length) { skipped.noRegion!.push(name); continue; }

    // A region can clear the coverage floor and still trace to nothing when the
    // 0.1%-area floor in the tracer eats a fragmented shape — drop those, or the
    // round would render with no marching-ants ring at all.
    const hideable: { hex: string; coverage: number }[] = [];
    for (const hex of cands) {
      if (DUD_REGIONS.has(`${code} ${hex}`)) continue;
      const ring = await regionOutlineRaster(svg, hex, rasterize);
      if (ring) hideable.push({ hex, coverage: +(cov[hex] ?? 0).toFixed(3) });
      else skipped.noRing!.push(`${name}:${hex}`);
    }
    if (!hideable.length) { skipped.noRegion!.push(name); continue; }

    rows.push({ name, code, svg, hideable });
    process.stdout.write(`\r${rows.length} built…`);
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  const body = rows.map(r => '  ' + JSON.stringify(r) + ',').join('\n');
  const out = `// AUTO-GENERATED by scripts/build-crests.ts — do not edit by hand.
// Club crest SVGs (FCLOGO), inline styles converted to fill/stroke attributes, colours
// normalized to uppercase #RRGGBB, canvas cropped past the source wordmark, per-colour
// visible area measured against the badge's own area. Every listed region is confirmed
// to trace a non-empty outline.
export type CrestRegion = { hex: string; coverage: number };
export type CrestData = { name: string; code: string; svg: string; hideable: CrestRegion[] };
export const CRESTS_DATA: CrestData[] = [
${body}
];
`;
  const dest = join(process.cwd(), 'src', 'crest', 'crests-data.ts');
  mkdirSync(join(process.cwd(), 'src', 'crest'), { recursive: true });
  writeFileSync(dest, out);

  const rounds = rows.reduce((t, r) => t + r.hideable.length, 0);
  console.log(`\n\nwrote ${dest}`);
  console.log(`clubs ${rows.length} | rounds ${rounds} | bundle ${(Buffer.byteLength(out) / 1024).toFixed(0)}KB`);
  for (const [k, v] of Object.entries(skipped)) if (v.length) console.log(`skipped ${k} (${v.length}): ${v.join(', ')}`);
}

main().catch(e => { console.error(e); process.exit(1); });

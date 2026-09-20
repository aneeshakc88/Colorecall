import { CRESTS_DATA } from './crests-data';
import { makeWrongHex, seededRand } from '../flag/flag-core';
import { Color, hsbToRgb } from '../utils/colorMath';
import { getCurrentCycle } from '../daily-cycle';

export type CrestRound = {
  crest: { name: string; code: string; svg: string };
  hiddenHex: string;
  wrongHex: string;
  coverage: number;
};

export const CREST_ROUNDS = 4;
export const CREST_MAX_PER_ROUND = 25;

// ── daily round set: 4 clubs a day, no club twice inside any 7-day window ──

const CLUB_COUNT = CRESTS_DATA.length;
const WEEK_SLOTS = CREST_ROUNDS * 7;
// 104 clubs / 4 a day deals a whole pass in 26 days, so a club can only come
// back after ~26 days — well past the one-week rule.
const DAYS_PER_PASS = Math.floor(CLUB_COUNT / CREST_ROUNDS);

// First cycle Color-sport went daily (2026-09-14, on the shared 18h cycle clock).
const CREST_EPOCH_CYCLE = 1317;

// One pass = every club dealt once in a deterministic shuffle. Within a pass no
// club can repeat at all; the only place the week rule can break is the seam
// between two passes, so the new deck's first week is swapped clear of whatever
// the previous deck spent its last week on.
function passDeck(pass: number, prevTail: Set<number>): number[] {
  const rand = seededRand(pass * 7919 + 1013);
  const deck = Array.from({ length: CLUB_COUNT }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  for (let i = 0; i < WEEK_SLOTS && i < deck.length; i++) {
    if (!prevTail.has(deck[i]!)) continue;
    const swap = deck.findIndex((c, k) => k >= WEEK_SLOTS && !prevTail.has(c));
    if (swap > 0) [deck[i], deck[swap]] = [deck[swap]!, deck[i]!];
  }
  return deck;
}

const deckCache = new Map<number, number[]>();

function deckForPass(pass: number): number[] {
  const hit = deckCache.get(pass);
  if (hit) return hit;
  let tail = new Set<number>();
  let deck: number[] = [];
  for (let p = 0; p <= pass; p++) {
    const cached = deckCache.get(p);
    deck = cached ?? passDeck(p, tail);
    deckCache.set(p, deck);
    tail = new Set(deck.slice(-WEEK_SLOTS));
  }
  return deck;
}

export function getDailyCrestPuzzle(cycle: number = getCurrentCycle()): CrestRound[] {
  const day = Math.max(0, cycle - CREST_EPOCH_CYCLE);
  const deck = deckForPass(Math.floor(day / DAYS_PER_PASS));
  const slot = (day % DAYS_PER_PASS) * CREST_ROUNDS;
  const rand = seededRand(cycle * 31 + 9173);

  return Array.from({ length: CREST_ROUNDS }, (_, i) => {
    const crest = CRESTS_DATA[deck[(slot + i) % deck.length]!]!;
    const region = crest.hideable[Math.floor(rand() * crest.hideable.length)]!;
    return {
      crest: { name: crest.name, code: crest.code, svg: crest.svg },
      hiddenHex: region.hex,
      wrongHex: makeWrongHex(region.hex, rand),
      coverage: region.coverage,
    };
  });
}

// ── colour conversions (hex <-> HSB, so the shared VerticalSlider drives a hex guess) ──

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

// ── scoring (Lab ΔE, same formula as the flag daily) ──

function hexToLab(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
  const [rl, gl, bl] = [lin(r), lin(g), lin(b)];
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  const y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) / 1.00000;
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function calcScore(actualHex: string, guessHex: string): number {
  const [l1, a1, b1] = hexToLab(actualHex), [l2, a2, b2] = hexToLab(guessHex);
  const de = Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
  return Math.min(CREST_MAX_PER_ROUND, Math.max(0, Math.round((1 - Math.min(de, 100) / 100) * CREST_MAX_PER_ROUND)));
}

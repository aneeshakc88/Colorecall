import { FLAGS_INDEX, ART_DIR } from './flags-index';
import { getCurrentCycle } from '../daily-cycle';
import { loadSvg } from '../art-loader';

export type DailyFlagRound = {
  flag: { name: string; svg: string };
  hiddenHex: string;
  wrongHex: string;
  // Element positions this region owns; absent means the whole hex is fair game.
  hiddenIdx?: number[];
};

type FlagPick = Omit<DailyFlagRound, 'flag'> & { name: string; url: string };

export { makeWrongHex, seededRand } from './wrong-color';
import { makeWrongHex, seededRand } from './wrong-color';

export const FLAG_ROUNDS = 4;
export const FLAG_MAX_PER_ROUND = 25;

function pickRoundsForCycle(cycle: number, excludeNames: Set<string>): FlagPick[] {
  const rand = seededRand(cycle * 31 + 4271);

  const rounds: FlagPick[] = [];
  const used = new Set<number>();

  for (let i = 0; i < FLAG_ROUNDS; i++) {
    let idx: number;
    let tries = 0;
    do {
      idx = Math.floor(rand() * FLAGS_INDEX.length);
      tries++;
    } while ((used.has(idx) || excludeNames.has(FLAGS_INDEX[idx]!.name)) && tries < 200);
    used.add(idx);

    const flag = FLAGS_INDEX[idx]!;
    const region = flag.hideable[Math.floor(rand() * flag.hideable.length)]!;
    rounds.push({
      name: flag.name,
      url: `${ART_DIR}/${flag.code}.svg?v=${flag.v}`,
      hiddenHex: region.hex,
      wrongHex: makeWrongHex(region.hex, rand),
      ...(region.idx ? { hiddenIdx: region.idx } : {}),
    });
  }

  return rounds;
}

// First cycle the flag daily existed (2026-07-05, on the shared 18h cycle clock).
const FLAG_EPOCH_CYCLE = 1221;

// Walks day-by-day from launch so no flag repeats within any 3 consecutive
// dailies (today excludes yesterday's and the day-before's picks). Cheap even
// after years of daily posts — a few thousand iterations of 5-item picks.
export function getDailyFlagPicks(cycle: number = getCurrentCycle()): FlagPick[] {
  let prev1 = new Set<string>();
  let prev2 = new Set<string>();
  let rounds: FlagPick[] = [];

  for (let c = Math.min(FLAG_EPOCH_CYCLE, cycle); c <= cycle; c++) {
    const exclude = new Set([...prev1, ...prev2]);
    rounds = pickRoundsForCycle(c, exclude);
    const names = new Set(rounds.map(r => r.name));
    prev2 = prev1;
    prev1 = names;
  }

  return rounds;
}

// The day's 4 flags with their artwork. One promise per cycle, so components can `use()` it and
// the home page can warm it up ahead of time.
const puzzles = new Map<number, Promise<DailyFlagRound[]>>();

export function loadDailyFlagPuzzle(cycle: number = getCurrentCycle()): Promise<DailyFlagRound[]> {
  let p = puzzles.get(cycle);
  if (!p) {
    p = Promise.all(getDailyFlagPicks(cycle).map(async ({ name, url, ...round }) =>
      ({ flag: { name, svg: await loadSvg(url) }, ...round })));
    puzzles.set(cycle, p);
  }
  return p;
}

// Fixed flags for the Flag intro screen, so it never shows today's answers.
const SHOWCASE_HERO = 'br';
const SHOWCASE_RIBBON = ['jp', 'ca', 'za', 'se', 'jm', 'in', 'de', 'gr', 'kr'];

export type ShowcaseFlags = { hero: DailyFlagRound; ribbon: string[] };
let showcase: Promise<ShowcaseFlags> | undefined;

export function loadShowcaseFlags(): Promise<ShowcaseFlags> {
  const load = (code: string) => {
    const f = FLAGS_INDEX.find(x => x.code === code)!;
    return loadSvg(`${ART_DIR}/${f.code}.svg?v=${f.v}`).then(svg => ({ f, svg }));
  };
  return showcase ??= Promise.all([load(SHOWCASE_HERO), ...SHOWCASE_RIBBON.map(load)]).then(([hero, ...ribbon]) => {
    const region = hero!.f.hideable[0]!;
    return {
      hero: {
        flag: { name: hero!.f.name, svg: hero!.svg },
        hiddenHex: region.hex,
        wrongHex: makeWrongHex(region.hex, seededRand(42)),
        ...(region.idx ? { hiddenIdx: region.idx } : {}),
      },
      ribbon: ribbon.map(r => r.svg),
    };
  });
}

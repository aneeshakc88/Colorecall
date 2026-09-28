import { FLAGS_DATA } from './flags-data';
import { viewBoxRatio } from './flag-highlight';
import { getCurrentCycle } from '../daily-cycle';

export type DailyFlagRound = {
  flag: { name: string; svg: string };
  hiddenHex: string;
  wrongHex: string;
  // Element positions this region owns; absent means the whole hex is fair game.
  hiddenIdx?: number[];
};

export { makeWrongHex, seededRand } from './wrong-color';
import { makeWrongHex, seededRand } from './wrong-color';

export const FLAG_ROUNDS = 4;
export const FLAG_MAX_PER_ROUND = 25;

function pickRoundsForCycle(cycle: number, excludeNames: Set<string>): DailyFlagRound[] {
  const rand = seededRand(cycle * 31 + 4271);

  const rounds: DailyFlagRound[] = [];
  const used = new Set<number>();

  for (let i = 0; i < FLAG_ROUNDS; i++) {
    let idx: number;
    let tries = 0;
    do {
      idx = Math.floor(rand() * FLAGS_DATA.length);
      tries++;
    } while ((used.has(idx) || excludeNames.has(FLAGS_DATA[idx]!.name)) && tries < 200);
    used.add(idx);

    const flag = FLAGS_DATA[idx]!;
    const region = flag.hideable[Math.floor(rand() * flag.hideable.length)]!;
    rounds.push({
      flag: { name: flag.name, svg: flag.svg },
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
export function getDailyFlagPuzzle(cycle: number = getCurrentCycle()): DailyFlagRound[] {
  let prev1 = new Set<string>();
  let prev2 = new Set<string>();
  let rounds: DailyFlagRound[] = [];

  for (let c = Math.min(FLAG_EPOCH_CYCLE, cycle); c <= cycle; c++) {
    const exclude = new Set([...prev1, ...prev2]);
    rounds = pickRoundsForCycle(c, exclude);
    const names = new Set(rounds.map(r => r.flag.name));
    prev2 = prev1;
    prev1 = names;
  }

  return rounds;
}

// Dev gauntlet: every playable region, so one pass covers all of them — a flag's
// colours land back to back. Widest aspect ratio first (Qatar 4.17:1 → Nepal 0.82:1)
// so the layout extremes show up in the first and last few rounds.
export function getGauntletRounds(): DailyFlagRound[] {
  const rand = seededRand(4271);
  return [...FLAGS_DATA]
    .sort((a, b) => viewBoxRatio(b.svg) - viewBoxRatio(a.svg))
    .flatMap(flag =>
      flag.hideable.map(region => ({
        flag: { name: flag.name, svg: flag.svg },
        hiddenHex: region.hex,
        wrongHex: makeWrongHex(region.hex, rand),
        ...(region.idx ? { hiddenIdx: region.idx } : {}),
      })));
}

// Single source of truth for when a daily puzzle rolls over. Every mode
// (classic, duo, flag) keys its puzzle, its saved state and its leaderboard
// `period` off the same cycle number so they all reset together.
export const CYCLE_HOURS = 18;
export const EPOCH = new Date('2024-01-01T00:00:00Z').getTime();
const CYCLE_MS = CYCLE_HOURS * 60 * 60 * 1000;

export const getCurrentCycle = () => Math.floor((Date.now() - EPOCH) / CYCLE_MS);

export const getNextResetTime = () => (getCurrentCycle() + 1) * CYCLE_MS + EPOCH;

export const cycleStartTime = (cycle: number) => cycle * CYCLE_MS + EPOCH;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const cycleDateLabel = (cycle: number) => {
  const d = new Date(cycleStartTime(cycle));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

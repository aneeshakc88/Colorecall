// Split-hero flag intro — text left, one flag (with its wrong-colored band) right,
// two rows of the day's flags drifting behind as a quiet ribbon. Mirrors mock "A"
// from the flag-card direction deck, but built from the real daily puzzle instead
// of CSS-drawn stand-ins.
import { useMemo } from 'react';
import { getDailyFlagPuzzle } from './flag-core';
import { swapRegion } from './flag-highlight';
import { flagDataUri, flagAspect } from './flag-card';

type Props = {
  onPlay: () => void;
  playersToday: number;
};

const dailyKicker = () => {
  const d = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Daily · ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

// Desktop: absolute drifting band across the whole card, top/bottom edges.
// Mobile: same drift, but a normal in-flow row (className override) so it
// can't overlap the copy the way an absolute-positioned band did.
const Ribbon = ({ flags, reverse, duration, className }: { flags: string[]; reverse?: boolean; duration: number; className?: string }) => (
  <div
    className={className ?? 'hidden lg:flex absolute left-0 right-0 gap-3 sm:gap-4 opacity-25'}
    style={{ maskImage: 'linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)' }}
  >
    <div
      className="flex gap-3 sm:gap-4 shrink-0"
      style={{ animation: `fi-drift ${duration}s linear infinite`, animationDirection: reverse ? 'reverse' : 'normal' }}
    >
      {[...flags, ...flags].map((uri, i) => (
        <div
          key={i}
          className="h-[clamp(1.35rem,4.5vh,2.5rem)] w-[clamp(2rem,6.75vh,3.75rem)] rounded-[3px] shrink-0 shadow-md"
          style={{ backgroundImage: `url("${uri}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
      ))}
    </div>
  </div>
);

export const FlagSplitHero = ({ onPlay, playersToday }: Props) => {
  const rounds = useMemo(() => getDailyFlagPuzzle(), []);
  // Qatar's serrated band reads badly at hero size, so keep it to the game itself
  const heroRound = rounds.find(r => r.flag.name !== 'Qatar') ?? rounds[0]!;

  const heroUri = useMemo(
    () => flagDataUri(swapRegion(heroRound.flag.svg, heroRound.hiddenHex, heroRound.wrongHex, heroRound.hiddenIdx)),
    [heroRound],
  );
  const heroAr = flagAspect(heroRound.flag.svg);
  const ribbonUris = useMemo(() => rounds.filter(r => r.flag.name !== 'Qatar').map(r => flagDataUri(r.flag.svg)), [rounds]);

  return (
    <div className="relative flex flex-col lg:flex-row w-full h-full items-center justify-between lg:justify-center gap-1 lg:gap-10 overflow-hidden py-[clamp(0.25rem,2vh,1.5rem)] lg:py-14">
      <style>{`
        @keyframes fi-drift { to { transform: translateX(-50%); } }
        @keyframes fi-heroglint { 0% { transform: translateX(-140%) skewX(-14deg); } 55%, 100% { transform: translateX(340%) skewX(-14deg); } }
        @media (prefers-reduced-motion: reduce) { .fi-heroglint, [style*="fi-drift"] { animation: none !important; } }
      `}</style>

      {/* Bands sit in the vertical padding the content is inset by (lg:py-14), so they never run through the copy */}
      <div className="absolute inset-x-0 top-0 h-10">
        <Ribbon flags={ribbonUris} duration={40} />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-10">
        <Ribbon flags={ribbonUris} reverse duration={52} />
      </div>

      {/* display:contents on mobile so the hero flag (order-2 below) can sit between the copy and the CTA */}
      <div className="relative z-10 contents lg:flex lg:flex-col lg:flex-1 lg:min-w-0 lg:items-start lg:justify-center lg:gap-5">
        <div className="order-1 w-full text-center lg:text-left shrink-0">
          <span className="inline-block text-[10px] sm:text-xs font-mono uppercase tracking-[0.18em] text-white/60 border border-white/15 bg-white/[0.05] rounded-full px-3 py-1 w-max mx-auto lg:mx-0">
            {dailyKicker()}
          </span>
          <h1 className="fi-title mt-2 lg:mt-3 text-[clamp(1.85rem,8.5vw,2.75rem)] lg:text-5xl font-black tracking-tighter leading-none">
            Flag ColorGuessr
          </h1>
          <p className="mt-1.5 lg:mt-3 text-[clamp(0.75rem,3.4vw,1rem)] font-semibold text-[#9fb0c4]">
            One color is wrong — spot it &amp; fix it
          </p>
        </div>

        <div className="order-4 fi-cta shrink-0 w-full sm:w-48 relative p-[5px] rounded-[1.2rem] overflow-hidden hover:scale-[1.03] active:scale-95 transition-all duration-300 group/rainbow">
          <div className="absolute inset-[-500%] bg-[conic-gradient(from_0deg,#ff4545,#f2f245,#45f245,#45f2f2,#4545f2,#f245f2,#ff4545)] animate-spin-slow opacity-40 group-hover/rainbow:opacity-100 transition-opacity" />
          <button
            onClick={onPlay}
            className="relative z-10 w-full py-[clamp(0.6rem,1.8vh,1rem)] sm:py-4 bg-white text-black font-black rounded-2xl flex items-center justify-center text-base sm:text-xl transition-colors duration-300 overflow-hidden"
          >
            Daily
            <span className="fi-sheen pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent mix-blend-overlay" />
          </button>
        </div>

        {playersToday > 0 && (
          <div className="order-5 w-full text-center lg:text-left font-mono text-[11px] sm:text-xs tracking-wide text-white/40 tabular-nums">
            <span className="text-white/70">{playersToday}</span> played today
          </div>
        )}

        {/* Mobile gets both bands too — desktop's are the absolute ones above */}
        <div className="order-3 w-full lg:hidden">
          <Ribbon flags={ribbonUris} duration={40} className="flex gap-2 opacity-30 overflow-hidden" />
        </div>
        <div className="order-6 w-full lg:hidden">
          <Ribbon flags={ribbonUris} reverse duration={52} className="flex gap-2 opacity-30 overflow-hidden" />
        </div>
      </div>

      <div className="order-2 relative z-10 shrink-0 w-[clamp(150px,46vw,230px)] lg:w-[clamp(160px,28vw,300px)] mb-[clamp(0.5rem,2.5vh,1.25rem)] lg:mb-0 lg:mr-2" style={{ aspectRatio: `${heroAr}`, transform: 'rotate(-3deg)' }}>
        <div
          className="absolute inset-0 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.08)]"
          style={{ backgroundImage: `url("${heroUri}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
          <div className="fi-heroglint absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/70 to-transparent mix-blend-overlay" style={{ animation: 'fi-heroglint 3.6s ease-in-out infinite' }} />
        </div>
        <div className="absolute -right-3 top-[44%] flex items-center gap-1.5 bg-[#080b12]/85 border border-white/15 rounded-full px-2.5 py-1 shadow-lg whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: heroRound.wrongHex, boxShadow: '0 0 0 2px rgba(255,255,255,0.85)' }} />
          <span className="font-mono text-[9px] sm:text-[10px] text-[#dfe8f6] uppercase tracking-wide">wrong color?</span>
        </div>
      </div>
    </div>
  );
};

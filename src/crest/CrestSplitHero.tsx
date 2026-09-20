// Color-sport intro — copy left, the day's first badge (wearing its wrong colour)
// right, the rest of the day's badges drifting behind as a quiet ribbon. Same
// split-hero shape as FlagSplitHero, dressed as a pitch instead of an atlas.
import { useMemo } from 'react';
import { getDailyCrestPuzzle } from './crest-core';
import { swapRegion, viewBoxRatio } from '../flag/flag-highlight';

type Props = {
  onPlay: () => void;
  playersToday: number;
  playedToday: boolean;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dailyKicker = () => {
  const d = new Date();
  return `Daily · ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

const crestDataUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

// Four badges a day is too short a strip to fill the card, so the day's set is
// repeated before the track is doubled for the seamless -50% loop.
const Ribbon = ({ crests, reverse, duration, className }: { crests: string[]; reverse?: boolean; duration: number; className?: string }) => {
  const strip = [...crests, ...crests, ...crests];
  return (
    <div
      className={className ?? 'hidden lg:flex absolute left-0 right-0 gap-4 opacity-20'}
      style={{ maskImage: 'linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)' }}
    >
      <div
        className="flex gap-4 shrink-0"
        style={{ animation: `cs-drift ${duration}s linear infinite`, animationDirection: reverse ? 'reverse' : 'normal' }}
      >
        {[...strip, ...strip].map((uri, i) => (
          <div
            key={i}
            className="h-[clamp(1.5rem,5vh,2.5rem)] w-[clamp(1.5rem,5vh,2.5rem)] shrink-0"
            style={{ backgroundImage: `url("${uri}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}
          />
        ))}
      </div>
    </div>
  );
};

export const CrestSplitHero = ({ onPlay, playersToday, playedToday }: Props) => {
  const rounds = useMemo(() => getDailyCrestPuzzle(), []);
  const heroRound = rounds[0]!;
  const heroUri = useMemo(
    () => crestDataUri(swapRegion(heroRound.crest.svg, heroRound.hiddenHex, heroRound.wrongHex)),
    [heroRound],
  );
  const heroAr = viewBoxRatio(heroRound.crest.svg);
  const ribbonUris = useMemo(() => rounds.map(r => crestDataUri(r.crest.svg)), [rounds]);

  return (
    <div className="relative flex flex-col lg:flex-row w-full h-full items-center justify-center gap-[clamp(0.5rem,2vh,1rem)] lg:gap-10 overflow-hidden pt-12 lg:pt-14 pb-[clamp(0.5rem,3vh,1.5rem)] lg:pb-14">
      <style>{`
        @keyframes cs-drift { to { transform: translateX(-50%); } }
        @keyframes cs-shine { to { background-position: 220% center; } }
        @keyframes cs-glint { 0% { transform: translateX(-140%) skewX(-14deg); } 55%, 100% { transform: translateX(340%) skewX(-14deg); } }
        @keyframes cs-cta { 0%,100% { box-shadow: 0 14px 34px rgba(4,20,14,0.55), 0 0 0 0 rgba(74,222,128,0.18); } 50% { box-shadow: 0 18px 48px rgba(16,120,74,0.42), 0 0 0 9px rgba(74,222,128,0.10); } }
        @keyframes cs-flood { 0%,100% { opacity: 0.55; transform: translate(0,0) scale(1); } 50% { opacity: 0.85; transform: translate(4%,-3%) scale(1.18); } }
        .cs-title { background: linear-gradient(90deg,#4ade80,#a3e635,#22d3ee,#34d399,#4ade80); background-size: 220% auto; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; animation: cs-shine 6s linear infinite; filter: drop-shadow(0 4px 24px rgba(52,211,153,0.28)); }
        .cs-flood { position: absolute; border-radius: 50%; filter: blur(64px); pointer-events: none; animation: cs-flood var(--fdur) ease-in-out infinite; animation-delay: var(--fdl); }
        @media (prefers-reduced-motion: reduce) { .cs-title, .cs-flood, .cs-cta, .cs-glint, [style*="cs-drift"] { animation: none !important; } }
      `}</style>

      {/* Pitch: mown stripes under two floodlight pools, then a vignette so the copy stays readable */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 46px, transparent 46px 92px)' }}
      />
      <div className="cs-flood" style={{ top: '-18%', left: '-12%', width: 340, height: 340, background: 'radial-gradient(circle, rgba(34,197,94,0.42), transparent 68%)', ['--fdur' as string]: '15s', ['--fdl' as string]: '0s' }} />
      <div className="cs-flood" style={{ bottom: '-20%', right: '-14%', width: 380, height: 380, background: 'radial-gradient(circle, rgba(20,184,166,0.34), transparent 68%)', ['--fdur' as string]: '19s', ['--fdl' as string]: '2s' }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32" style={{ background: 'linear-gradient(to top, #040806 6%, rgba(4,8,6,0.72) 42%, rgba(4,8,6,0) 100%)' }} />

      <div className="absolute inset-x-0 top-0 h-10">
        <Ribbon crests={ribbonUris} duration={46} />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-10">
        <Ribbon crests={ribbonUris} reverse duration={58} />
      </div>

      {/* display:contents on mobile so the hero badge (order-2) can sit between the copy and the CTA */}
      <div className="relative z-10 contents lg:flex lg:flex-col lg:flex-1 lg:min-w-0 lg:items-start lg:justify-center lg:gap-5">
        <div className="order-1 w-full text-center lg:text-left shrink-0">
          <span className="inline-block text-[10px] sm:text-xs font-mono uppercase tracking-[0.18em] text-white/60 border border-white/15 bg-white/[0.05] rounded-full px-3 py-1 w-max mx-auto lg:mx-0">
            {dailyKicker()}
          </span>
          <h1 className="cs-title mt-2 lg:mt-3 text-[clamp(1.85rem,8.5vw,2.75rem)] lg:text-5xl font-black tracking-tighter leading-none">
            Color-sport
          </h1>
          <p className="mt-1.5 lg:mt-3 text-[clamp(0.75rem,3.4vw,1rem)] font-semibold text-[#9ec4b1]">
            One colour is wrong on the badge — slide it back
          </p>
        </div>

        <div className="order-4 cs-cta shrink-0 w-full sm:w-52 relative p-[5px] rounded-[1.2rem] overflow-hidden hover:scale-[1.03] active:scale-95 transition-all duration-300 group/glow" style={{ animation: 'cs-cta 2.6s ease-in-out infinite' }}>
          <div className="absolute inset-[-500%] bg-[conic-gradient(from_0deg,#4ade80,#a3e635,#22d3ee,#34d399,#4ade80)] animate-spin-slow opacity-40 group-hover/glow:opacity-100 transition-opacity" />
          <button
            onClick={onPlay}
            className="relative z-10 w-full py-[clamp(0.6rem,1.8vh,1rem)] sm:py-4 bg-white text-black font-black rounded-2xl flex items-center justify-center text-base sm:text-xl transition-colors duration-300 overflow-hidden"
          >
            {playedToday ? 'See result' : 'Daily'}
            <span className="cs-glint pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent mix-blend-overlay" style={{ animation: 'cs-glint 4.2s ease-in-out infinite' }} />
          </button>
        </div>

        <div className="order-5 w-full text-center lg:text-left font-mono text-[11px] sm:text-xs tracking-wide text-white/40 tabular-nums">
          <span className="text-white/70">4</span> clubs · <span className="text-white/70">100</span> pts
          {playersToday > 0 && <> · <span className="text-white/70">{playersToday}</span> played today</>}
        </div>

        {/* Mobile gets the ribbons in flow — desktop's are the absolute ones above */}
        <div className="order-3 w-full lg:hidden">
          <Ribbon crests={ribbonUris} duration={46} className="flex gap-3 opacity-25 overflow-hidden" />
        </div>
        <div className="order-6 w-full lg:hidden">
          <Ribbon crests={ribbonUris} reverse duration={58} className="flex gap-3 opacity-25 overflow-hidden" />
        </div>
      </div>

      <div
        className="order-2 relative z-10 shrink-0 w-[clamp(104px,28vw,150px)] lg:w-[clamp(130px,20vw,190px)] mb-4 lg:mb-0 lg:mr-4"
        style={{ aspectRatio: `${heroAr}`, transform: 'rotate(-3deg)' }}
      >
        <div
          className="absolute inset-0"
          style={{ backgroundImage: `url("${heroUri}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', filter: 'drop-shadow(0 18px 34px rgba(0,0,0,0.6))' }}
        />
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#050b08]/85 border border-white/15 rounded-full px-2.5 py-1 shadow-lg whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: heroRound.wrongHex, boxShadow: '0 0 0 2px rgba(255,255,255,0.85)' }} />
          <span className="font-mono text-[9px] sm:text-[10px] text-[#d7f0e2] uppercase tracking-wide">wrong colour?</span>
        </div>
      </div>
    </div>
  );
};

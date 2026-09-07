// Deck-hero flag intro — flag thumbnail decks above and below the copy, a big
// hero flag with a warm/cool hint tag on the right. Third layout option for
// comparing flag intro treatments against FlagSplitHero and the ring intro.
import { useMemo } from 'react';
import { getDailyFlagPuzzle } from './flag-core';
import { swapRegion } from './flag-highlight';
import { flagDataUri, flagAspect } from './flag-card';
import { FLAGS_DATA } from './flags-data';

type Props = {
  onPlay: () => void;
  playersToday: number;
};

const dailyKicker = () => {
  const d = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Daily · ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

// Rough warmth score (red-heavy vs blue-heavy) — enough to say which way the
// wrong colour leans without giving away the actual hex.
const warmth = (hex: string) => parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(5, 7), 16);

const Deck = ({ uris }: { uris: string[] }) => (
  <div
    className="flex gap-1.5 sm:gap-2 w-full overflow-hidden"
    style={{ maskImage: 'linear-gradient(90deg, #000 85%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, #000 85%, transparent)' }}
  >
    {uris.map((uri, i) => (
      <div
        key={i}
        className="h-6 w-9 sm:h-8 sm:w-12 rounded-[4px] shrink-0 shadow-sm"
        style={{ backgroundImage: `url("${uri}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      />
    ))}
  </div>
);

export const FlagDeckHero = ({ onPlay, playersToday }: Props) => {
  const rounds = useMemo(() => getDailyFlagPuzzle(), []);
  const heroRound = rounds[0]!;

  const heroUri = useMemo(
    () => flagDataUri(swapRegion(heroRound.flag.svg, heroRound.hiddenHex, heroRound.wrongHex, heroRound.hiddenIdx)),
    [heroRound],
  );
  const heroAr = flagAspect(heroRound.flag.svg);
  const tagLabel = warmth(heroRound.wrongHex) > warmth(heroRound.hiddenHex) ? 'too warm' : 'too cool';

  const deckUris = useMemo(() => FLAGS_DATA.slice(0, 17).map(f => flagDataUri(f.svg)), []);
  const topDeck = deckUris.slice(0, 9);
  const bottomDeck = deckUris.slice(9, 17);

  return (
    <div className="relative flex flex-col lg:flex-row w-full h-full items-center gap-3 lg:gap-10 overflow-x-hidden overflow-y-auto">
      <style>{`
        @keyframes fi-heroglint2 { 0% { transform: translateX(-140%) skewX(-14deg); } 55%, 100% { transform: translateX(340%) skewX(-14deg); } }
        @media (prefers-reduced-motion: reduce) { .fi-heroglint2 { animation: none !important; } }
      `}</style>

      {/* display:contents on mobile so the hero flag (order-4 below) can sit between the title and the CTA */}
      <div className="contents lg:flex lg:flex-col lg:items-start lg:justify-center lg:gap-3 lg:flex-1 lg:min-w-0">
        <div className="order-1 w-full"><Deck uris={topDeck} /></div>

        <span className="order-2 text-[10px] sm:text-xs font-mono uppercase tracking-[0.18em] text-white/60 border border-white/15 bg-white/[0.05] rounded-full px-3 py-1 w-max mx-auto lg:mx-0">
          {dailyKicker()}
        </span>

        <div className="order-3 w-full text-center lg:text-left">
          <h1 className="fi-title text-3xl sm:text-5xl font-black tracking-tighter leading-[0.95]">
            Flag<br />ColorGuessr
          </h1>
          <p className="mt-3 text-sm sm:text-base font-semibold text-[#9fb0c4]">
            One color is wrong — spot it &amp; fix it
          </p>
        </div>

        <button
          onClick={onPlay}
          className="order-5 w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-white text-black font-black rounded-full hover:scale-[1.03] active:scale-95 transition-all duration-300 shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
        >
          Play today's flag
        </button>

        {playersToday > 0 && (
          <div className="order-6 w-full text-center lg:text-left font-mono text-[11px] sm:text-xs tracking-wide text-white/40 tabular-nums">
            <span className="text-white/70">{playersToday}</span> played today
          </div>
        )}

        <div className="order-7 w-full"><Deck uris={bottomDeck} /></div>
      </div>

      <div
        className="order-4 relative z-10 shrink-0 w-32 sm:w-48 lg:w-[clamp(150px,26vw,300px)] lg:mr-6"
        style={{ aspectRatio: `${heroAr}`, transform: 'rotate(-3deg)' }}
      >
        <div
          className="absolute inset-0 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.08)]"
          style={{ backgroundImage: `url("${heroUri}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
          <div className="fi-heroglint2 absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/70 to-transparent mix-blend-overlay" style={{ animation: 'fi-heroglint2 3.6s ease-in-out infinite' }} />
        </div>
        <div className="absolute -right-3 sm:-right-4 top-[44%] flex items-center gap-1.5 bg-[#080b12]/85 border border-white/15 rounded-full px-2.5 py-1 shadow-lg whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: heroRound.wrongHex, boxShadow: '0 0 0 2px rgba(255,255,255,0.85)' }} />
          <span className="font-mono text-[9px] sm:text-[10px] text-[#dfe8f6] uppercase tracking-wide">{tagLabel}</span>
        </div>
      </div>
    </div>
  );
};

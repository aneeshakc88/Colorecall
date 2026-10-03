import { lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CalendarDays, Trophy } from 'lucide-react';
import { BOX } from '../duo-v2/DuoV2';
import { audio } from '../utils/audio';
import { cycleDateLabel, getCurrentCycle } from '../daily-cycle';

const CrestHeroBackdrop = lazy(() => import('./CrestV2Art').then(m => ({ default: m.CrestHeroBackdrop })));
const CrestHero = lazy(() => import('./CrestV2Art').then(m => ({ default: m.CrestHero })));
const CrestRibbon = lazy(() => import('./CrestV2Art').then(m => ({ default: m.CrestRibbon })));

type Props = { key?: string; playedToday: boolean; playersToday: number; onPlay: () => void; onLeaderboard: () => void };

// Placeholders hold the art's space so nothing jumps when the badges land.
const ribbonGap = <div className="h-[clamp(1.5rem,5vh,2.5rem)]" />;
const heroGap = <div className="w-[clamp(140px,40vw,200px)] tall:w-[min(52vw,240px)] lg:w-[clamp(150px,22vw,230px)] aspect-square" />;

// The original pitch hero (floodlights, drifting badge ribbons, tilted badge in its wrong colour) in Duo v2's type and buttons.
// Fixed showcase badges, never the day's picks. Copy and buttons render with the page; only the badge art waits.
export function CrestV2Start({ playedToday, playersToday, onPlay, onLeaderboard }: Props) {
  return (
    <motion.div
      key="crest-v2-start"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className={`dv2 ${BOX} overflow-y-auto! overflow-x-hidden text-white lg:outline lg:-outline-offset-1 lg:outline-white/10`}
      style={{ background: 'radial-gradient(120% 90% at 50% 0%, #17603a 0%, #0a2a19 55%, #04100a 100%)' }}
    >
      <Suspense fallback={null}><CrestHeroBackdrop /></Suspense>
      <div className="hidden lg:block absolute inset-x-0 top-4"><Suspense fallback={null}><CrestRibbon duration={46} className="flex gap-4 opacity-25 overflow-hidden" /></Suspense></div>
      <div className="hidden lg:block absolute inset-x-0 bottom-4"><Suspense fallback={null}><CrestRibbon reverse duration={58} className="flex gap-4 opacity-25 overflow-hidden" /></Suspense></div>

      <div className="relative min-h-full flex flex-col lg:flex-row lg:items-center lg:justify-center gap-6 lg:gap-10 px-5 sm:px-8 lg:px-12 pt-16 pb-12 tall:pb-16 lg:py-14">
        <div className="order-1 lg:order-2 flex-1 lg:flex-none w-full lg:w-auto grid grid-cols-[minmax(0,1fr)] content-center justify-items-center gap-5 tall:gap-8">
          <div className="w-full lg:hidden"><Suspense fallback={ribbonGap}><CrestRibbon duration={46} className="flex gap-3 opacity-30 overflow-hidden" /></Suspense></div>
          <Suspense fallback={heroGap}><CrestHero /></Suspense>
          <div className="w-full lg:hidden"><Suspense fallback={ribbonGap}><CrestRibbon reverse duration={58} className="flex gap-3 opacity-30 overflow-hidden" /></Suspense></div>
        </div>

        <div className="order-2 lg:order-1 shrink-0 w-full lg:flex-1 lg:min-w-0 grid gap-4 tall:gap-7 tall:min-h-[calc(44cqh-4rem)] tall:content-between">
          <div className="grid gap-1.5 tall:gap-2.5 max-w-[60ch]">
            <p className="text-[13px] font-semibold text-white/50">Daily · {cycleDateLabel(getCurrentCycle())}</p>
            <h1 className="dv2-display text-[clamp(2.25rem,10cqw,3rem)] font-extrabold leading-[0.95]">Football Logo</h1>
            <p className="text-[15px] sm:text-base tall:text-base leading-relaxed text-white/60 text-pretty">
              Four club badges, each with one color wrong. Slide it back to the real shade. Same badges for everyone, new ones every day.
            </p>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2.5">
            <button
              onClick={onPlay}
              onMouseEnter={() => audio.playHover()}
              className="dv2-focus group min-h-16 sm:min-h-[72px] tall:min-h-[76px] pl-2.5 sm:pl-3 pr-4 py-2.5 sm:py-3 rounded-[22px] text-left flex items-center gap-3 bg-white text-black hover:bg-zinc-100 active:scale-[0.98] transition-[transform,background-color]"
            >
              <span className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-[14px] grid place-items-center bg-black text-white" aria-hidden>
                <CalendarDays size={22} />
              </span>
              <span className="flex-1 min-w-0 grid gap-1">
                <span className="dv2-display text-xl font-bold leading-tight">{playedToday ? "Today's result" : 'Play daily'}</span>
                <span className="text-[13px] leading-snug text-black/60">
                  {playedToday ? 'See how you did' : playersToday > 0 ? `${playersToday} played today` : 'Same badges for everyone'}
                </span>
              </span>
              <ArrowRight size={20} className="shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
            <button
              onClick={onLeaderboard}
              onMouseEnter={() => audio.playHover()}
              aria-label="Leaderboard"
              className="dv2-focus w-16 sm:w-[72px] tall:w-[76px] min-h-16 sm:min-h-[72px] tall:min-h-[76px] rounded-[22px] ring-1 ring-inset ring-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12] grid place-items-center active:scale-[0.95] transition-[transform,background-color]"
            >
              <Trophy size={22} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

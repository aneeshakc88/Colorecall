import { lazy, Suspense, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CalendarDays, Trophy } from 'lucide-react';
import { BOX, FooterSpot } from '../duo-v2/DuoV2';
import { audio } from '../utils/audio';
import { cycleDateLabel, getCurrentCycle } from '../daily-cycle';

const FlagHero = lazy(() => import('./FlagV2Art').then(m => ({ default: m.FlagHero })));
const FlagRibbon = lazy(() => import('./FlagV2Art').then(m => ({ default: m.FlagRibbon })));

type Props = { key?: string; footer: ReactNode; playedToday: boolean; playersToday: number; onPlay: () => void; onLeaderboard: () => void };

// Placeholders hold the art's space so nothing jumps when the flags land.
const ribbonGap = <div className="h-[clamp(1.35rem,4.5vh,2.5rem)]" />;
const heroGap = <div className="w-[clamp(170px,52vw,240px)] tall:w-[min(68vw,300px)] lg:w-[clamp(180px,26vw,280px)] aspect-[3/2]" />;

// The original split hero (drifting flag ribbons, tilted flag with its wrong band) in Duo v2's type and buttons.
// Copy and buttons render with the page; only the flag art waits on its chunk and SVGs.
export function FlagV2Start({ footer, playedToday, playersToday, onPlay, onLeaderboard }: Props) {
  return (
    <motion.div
      key="flag-v2-start"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className={`dv2 ${BOX} overflow-y-auto! overflow-x-hidden text-white lg:outline lg:-outline-offset-1 lg:outline-white/10`}
      style={{ background: 'radial-gradient(120% 90% at 50% 0%, #14203a 0%, #0a0e18 60%, #05070d 100%)' }}
    >
      {/* Inset equally from both card edges so the top row clears the rounded corners like the bottom one. */}
      <div className="hidden lg:block absolute inset-x-0 top-4"><Suspense fallback={null}><FlagRibbon duration={40} className="flex gap-4 opacity-25 overflow-hidden" /></Suspense></div>
      <div className="hidden lg:block absolute inset-x-0 bottom-4"><Suspense fallback={null}><FlagRibbon reverse duration={52} className="flex gap-4 opacity-25 overflow-hidden" /></Suspense></div>

      <div className="relative min-h-full flex flex-col lg:flex-row lg:items-center lg:justify-center gap-6 lg:gap-10 px-5 sm:px-8 lg:px-12 pt-16 pb-12 tall:pb-16 lg:py-14">
        {/* Mobile: flag between its ribbons on top, copy and buttons below. Desktop: copy left, flag right. */}
        <div className="order-1 lg:order-2 flex-1 lg:flex-none w-full lg:w-auto grid grid-cols-[minmax(0,1fr)] content-center justify-items-center gap-5 tall:gap-8">
          <div className="w-full lg:hidden"><Suspense fallback={ribbonGap}><FlagRibbon duration={40} className="flex gap-2 opacity-30 overflow-hidden" /></Suspense></div>
          <Suspense fallback={heroGap}><FlagHero /></Suspense>
          <div className="w-full lg:hidden"><Suspense fallback={ribbonGap}><FlagRibbon reverse duration={52} className="flex gap-2 opacity-30 overflow-hidden" /></Suspense></div>
        </div>

        {/* Tall phones: the copy block (plus the 4rem bottom padding) takes ~44% so the copy rides up and the buttons stay at the thumb. */}
        <div className="order-2 lg:order-1 shrink-0 w-full lg:flex-1 lg:min-w-0 grid gap-4 tall:gap-7 tall:min-h-[calc(44cqh-4rem)] tall:content-between">
          <div className="grid gap-1.5 tall:gap-2.5 max-w-[60ch]">
            <p className="text-[13px] font-semibold text-white/50">Daily · {cycleDateLabel(getCurrentCycle())}</p>
            <h1 className="dv2-display text-[clamp(2.25rem,10cqw,3rem)] font-extrabold leading-[0.95]">Flag ColorGuessr</h1>
            <p className="text-[15px] sm:text-base tall:text-base leading-relaxed text-white/60 text-pretty">
              Four flags, each with one color wrong. Slide it back to the real shade. Same flags for everyone, new ones every day.
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
                  {playedToday ? 'See how you did' : playersToday > 0 ? `${playersToday} played today` : 'Same flags for everyone'}
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
        <FooterSpot>{footer}</FooterSpot>
      </div>
    </motion.div>
  );
}

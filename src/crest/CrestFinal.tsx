import { useMemo } from 'react';
import { motion } from 'motion/react';
import { Share2, X } from 'lucide-react';
import { AnimatedScore } from '../utils/colorMath';
import { audio } from '../utils/audio';
import { swapRegion } from '../flag/flag-highlight';
import { CrestBackdrop } from './crest-v2-parts';
import { crestDataUri } from './CrestSplitHero';
import './crest-v2.css';

export type SquadItem = { svg: string; name: string; hiddenHex: string; guessHex: string; score: number };

type Props = {
  items: SquadItem[];
  total: number;
  max: number;
  quip: string;
  dateLabel: string;
  countdown: string;
  copied: boolean;
  onShare: () => void;
  onExit: () => void;
  onReturnHome: () => void;
};

const band = (score: number) =>
  score >= 24 ? 'var(--dv2-great)' : score >= 18 ? 'var(--dv2-good)' : score >= 10 ? 'var(--dv2-fair)' : 'var(--dv2-miss)';

// The squad sheet: each club badge repainted with your guess, a band-coloured score under it.
export function CrestFinal({ items, total, max, quip, dateLabel, countdown, copied, onShare, onExit, onReturnHome }: Props) {
  const uris = useMemo(() => items.map(i => crestDataUri(swapRegion(i.svg, i.hiddenHex, i.guessHex))), [items]);

  return (
    <>
      <CrestBackdrop svg={items[0]?.svg ?? ''} />
      <button
        onClick={onExit}
        aria-label="Close"
        className="dv2-focus absolute top-5 right-5 z-10 w-12 h-12 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20 active:scale-95 transition"
      >
        <X size={22} />
      </button>

      <div className="relative h-full w-full overflow-y-auto">
        <div className="min-h-full grid content-center gap-8 px-5 pt-20 pb-16 sm:px-8 sm:pt-16 lg:h-full lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-10 lg:px-12 lg:py-10">
          <header className="grid gap-2">
            <p className="text-base font-semibold text-white/55">Football Logo daily · {dateLabel}</p>
            <p className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="dv2-display font-extrabold leading-[0.9] text-[clamp(64px,min(22cqw,26cqh),112px)] lg:text-[clamp(72px,min(12cqw,18cqh),96px)]">
                <AnimatedScore value={total} decimals={0} timing={{ settle: true }} onComplete={() => audio.playScoreReveal()} />
              </span>
              <span className="dv2-display text-2xl sm:text-3xl font-bold text-white/40">/{max}</span>
            </p>
            <p className="text-white/70 font-semibold">{quip}</p>
            <dl className="mt-3 text-sm">
              <dt className="text-white/55">New badges in</dt>
              <dd className="font-bold tabular-nums">{countdown}</dd>
            </dl>
          </header>

          <div className="grid gap-4">
            <ol className="grid grid-cols-4 gap-2 sm:gap-3">
              {items.map((r, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 16, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.3 + i * 0.09, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="grid gap-1.5 justify-items-center min-w-0"
                >
                  <div
                    className="aspect-square w-full rounded-2xl bg-white/[0.06] ring-1 ring-inset ring-white/10 p-[9%] grid place-items-center"
                    aria-label={`${r.name}: real ${r.hiddenHex}, yours ${r.guessHex}`}
                  >
                    <div
                      className="w-full h-full"
                      style={{ backgroundImage: `url("${uris[i]}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', filter: 'drop-shadow(0 8px 10px rgba(0,0,0,.5))' }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-bold tabular-nums">
                    <span className="w-2 h-2 rounded-full" style={{ background: band(r.score) }} />
                    {r.score}
                  </div>
                  <p className="w-full text-center text-[11px] leading-tight font-semibold text-white/50 truncate" title={r.name}>{r.name}</p>
                </motion.li>
              ))}
            </ol>

            <button
              onClick={onShare}
              className="dv2-focus min-h-14 px-4 rounded-[18px] bg-white text-black dv2-display text-lg font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 active:scale-[0.98] transition"
            >
              <Share2 size={20} /> {copied ? 'Copied' : 'Share score'}
            </button>

            <button
              onClick={onReturnHome}
              className="dv2-focus justify-self-start text-sm font-bold text-white/80 underline underline-offset-4 decoration-2 hover:text-white"
            >
              Play Colorecall: Duo Edition
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

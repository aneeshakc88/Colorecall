import { motion } from 'motion/react';
import { Share2, User, X } from 'lucide-react';
import { AnimatedScore } from '../utils/colorMath';
import { audio } from '../utils/audio';
import { FlagBackdrop } from './flag-v2-parts';
import './flag-v2.css';

export type AtlasItem = { actualHex: string; guessHex: string; score: number };

type Props = {
  items: AtlasItem[];
  backdropSvg: string;
  total: number;
  quip: string;
  dateLabel: string;
  countdown: string;
  copied: boolean;
  onShare: () => void;
  name: string;
  setName: (n: string) => void;
  onSaveName: () => void;
  isSaving: boolean;
  onExit: () => void;
  onReturnHome: () => void;
};

const band = (score: number) =>
  score >= 24 ? 'var(--dv2-great)' : score >= 18 ? 'var(--dv2-good)' : score >= 10 ? 'var(--dv2-fair)' : 'var(--dv2-miss)';

// Laid out like DuoV2Final: score and quip on one side, the four rounds and actions on the other.
export function FlagAtlas({ items, backdropSvg, total, quip, dateLabel, countdown, copied, onShare, name, setName, onSaveName, isSaving, onExit, onReturnHome }: Props) {
  return (
    <>
      <FlagBackdrop svg={backdropSvg} />
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
            <p className="text-base font-semibold text-white/55">Flag daily · {dateLabel}</p>
            <p className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="dv2-display font-extrabold leading-[0.9] text-[clamp(64px,min(22cqw,26cqh),112px)] lg:text-[clamp(72px,min(12cqw,18cqh),96px)]">
                <AnimatedScore value={total} decimals={0} timing={{ settle: true }} onComplete={() => audio.playScoreReveal()} />
              </span>
              <span className="dv2-display text-2xl sm:text-3xl font-bold text-white/40">/100</span>
            </p>
            <p className="text-white/70 font-semibold">{quip}</p>
            <dl className="mt-3 text-sm">
              <dt className="text-white/55">New flags in</dt>
              <dd className="font-bold tabular-nums">{countdown}</dd>
            </dl>
          </header>

          <div className="grid gap-4">
            <ol className="grid grid-cols-4 gap-2">
              {items.map((r, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="grid gap-1.5"
                >
                  <div className="relative aspect-square rounded-2xl overflow-hidden ring-1 ring-inset ring-white/10" aria-label={`Real ${r.actualHex}, yours ${r.guessHex}`}>
                    <div className="absolute inset-0" style={{ background: r.actualHex, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
                    <div className="absolute inset-0" style={{ background: r.guessHex, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-bold tabular-nums">
                    <span className="w-2 h-2 rounded-full" style={{ background: band(r.score) }} />
                    {r.score}
                  </div>
                </motion.li>
              ))}
            </ol>

            {/* Same name row as DuoV2Final. */}
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); onSaveName(); }}>
              <label className="relative flex-1 min-w-0">
                <span className="sr-only">Your name</span>
                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={name}
                  onChange={e => setName(e.target.value.slice(0, 20))}
                  className="w-full h-12 rounded-[16px] bg-white/10 pl-11 pr-4 font-semibold text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white"
                />
              </label>
              <button
                type="submit"
                disabled={!name.trim() || isSaving}
                className="dv2-focus h-12 px-5 rounded-[16px] bg-white/10 text-white font-bold hover:bg-white/20 disabled:opacity-40 transition"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </form>

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

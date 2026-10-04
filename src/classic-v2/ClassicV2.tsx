import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Color, hsbToString } from '../utils/colorMath';
import { audio } from '../utils/audio';
import { BOX, FooterSpot, HOME_SHAPES, ModeButtons, RoundTag, reducedMotion } from '../duo-v2/DuoV2';
import '../duo-v2/duo-v2.css';

// No @types/react in this repo, so `key` must be declared for AnimatePresence children.
type K = { key?: string };

/* ---------- Start ---------- */

// Mid-to-deep hues only, so the white cut-out shape and wordmark always read.
const PALETTE = ['#ff5a36', '#2f5bff', '#00a37a', '#7a3cff', '#e8407f', '#0f8fd6', '#c2185b', '#f06a00'];

export function ClassicV2Start({ footer, hasPlayedToday, onDaily, onQuickPlay, onScore }: K & {
  footer: React.ReactNode; hasPlayedToday: boolean; onDaily: () => void; onQuickPlay: () => void; onScore: () => void;
}) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const t = setInterval(() => setStep(s => s + 1), 4200);
    return () => clearInterval(t);
  }, []);
  const color = PALETTE[step % PALETTE.length];
  const shape = HOME_SHAPES[step % HOME_SHAPES.length];

  return (
    <motion.div
      key="classic-v2-start"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className={`dv2 ${BOX} overflow-y-auto! bg-white text-black flex flex-col lg:outline lg:-outline-offset-1 lg:outline-zinc-200`}
    >
      {/* Duo opens on two color fields; Classic on one. */}
      <motion.div
        className="dv2-field relative flex-1 min-h-[180px] flex flex-col wide:flex-row items-center justify-center gap-x-[6cqw] gap-y-3 pt-16 pb-5 sm:pb-0 lg:pt-0 text-white overflow-hidden"
        style={{ backgroundColor: color }}
        initial={{ clipPath: 'inset(100% 0 0 0)' }}
        animate={{ clipPath: 'inset(0% 0 0 0)' }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <svg
          viewBox="0 0 100 100"
          className="dv2-float shrink-0 w-[min(22cqh,26cqw)] h-[min(22cqh,26cqw)] tall:w-[min(22cqh,36cqw)] tall:h-[min(22cqh,36cqw)] max-w-[170px] max-h-[170px] fill-white"
          style={{ ['--r' as string]: '-6deg' }}
          aria-hidden
        >
          {shape}
        </svg>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="dv2-display font-extrabold leading-[0.8] text-[clamp(60px,min(19cqw,22cqh),160px)] tall:text-[min(26cqw,20cqh)]"
        >
          recall
          <span className="hidden">Color Memory Game</span>
        </motion.h1>
      </motion.div>

      <section className="relative shrink-0 px-5 pt-5 pb-12 sm:px-8 sm:pb-16 lg:px-10 lg:pt-6 lg:pb-8 tall:pt-8 tall:pb-16">
        <div className="grid gap-4 sm:gap-5 tall:gap-7">
          <div className="grid gap-1.5 tall:gap-2.5 text-[15px] sm:text-base tall:text-base leading-relaxed text-black/60 max-w-[60ch]">
            <p className="text-black font-semibold text-lg sm:text-xl tall:text-[22px] leading-snug text-balance">Four shapes, one at a time.</p>
            <p>Each shape shows for 5 seconds. Then pick the shape you saw and recreate its color from memory.</p>
          </div>
          <ModeButtons tone="light" hasPlayedToday={hasPlayedToday} onDaily={onDaily} onQuickPlay={onQuickPlay} onScore={onScore} />
        </div>
        <FooterSpot>{footer}</FooterSpot>
      </section>
    </motion.div>
  );
}

/* ---------- Memorize ---------- */

const RING = 2 * Math.PI * 46;

export function ClassicV2Memorize({ round, countdown, progress, Icon, color }: K & {
  round: number; countdown: number; progress: number; Icon: React.ElementType; color: Color;
}) {
  const c = hsbToString(color);
  return (
    <motion.div
      key="classic-v2-memorize"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={`dv2 ${BOX} z-40 bg-[var(--dv2-stage)] text-white grid place-items-center lg:outline lg:-outline-offset-1 lg:outline-white/10`}
    >
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10"><RoundTag round={round} /></div>

      {/* The ring drains in the shape's own color, so the eye never has to leave it. */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative grid place-items-center w-[min(62cqmin,360px)] aspect-square"
      >
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--dv2-seam)" strokeWidth="2.5" />
          <circle cx="50" cy="50" r="46" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={RING} strokeDashoffset={RING * progress} />
        </svg>
        <Icon className="w-[44%] h-[44%]" style={{ color: c }} />
      </motion.div>

      <div className="absolute bottom-7 left-1/2 -translate-x-1/2">
        <span className="dv2-display text-5xl font-extrabold leading-none tabular-nums" aria-live="off">
          {countdown}
        </span>
      </div>
    </motion.div>
  );
}

/* ---------- Pick ---------- */

export function ClassicV2Pick({ round, options, onPick }: K & {
  round: number; options: React.ElementType[]; onPick: (Icon: React.ElementType) => void;
}) {
  return (
    <motion.div
      key="classic-v2-pick"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={`dv2 ${BOX} overflow-y-auto! z-40 bg-[var(--dv2-stage)] text-white flex flex-col lg:outline lg:-outline-offset-1 lg:outline-white/10`}
    >
      <header className="shrink-0 grid justify-items-center gap-3 pt-6 px-6">
        <RoundTag round={round} />
        <h2 className="dv2-display text-2xl wide:text-3xl font-bold text-center text-balance">Which shape was it?</h2>
      </header>
      <div className="flex-1 grid content-center px-5 py-6 wide:px-10">
        <ul className="grid grid-cols-5 gap-2 wide:gap-3 w-full max-w-[min(100%,calc(50cqh*5/2))] mx-auto">
          {options.map((Shape, i) => (
            <li key={i}>
              <button
                aria-label={`Shape option ${i + 1}`}
                onClick={() => { audio.playShapeSliderTick(); onPick(Shape); }}
                className="dv2-focus w-full aspect-square rounded-[22%] bg-white/[0.06] ring-1 ring-inset ring-white/10 text-white/70 hover:bg-white/[0.12] hover:text-white active:scale-95 grid place-items-center transition-[transform,background-color,color]"
              >
                <Shape className="w-[52%] h-[52%]" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

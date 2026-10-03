import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeftRight, ArrowRight, CalendarDays, Share2, Trophy, User, X, RotateCcw, Zap } from 'lucide-react';
import { Color, hsbToRgb, hsbToString, HorizontalSlider, AnimatedScore } from '../utils/colorMath';
import { audio } from '../utils/audio';
import './duo-v2.css';

type Shape = { Icon: React.ElementType; color: Color };
// No @types/react in this repo, so `key` must be declared for AnimatePresence children.
type K = { key?: string };

const ink = (c: Color) => {
  const [r, g, b] = hsbToRgb(c.h, c.s, c.b);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#000' : '#fff';
};

// Matches the share grid bands in App.handleShare.
const band = (score: number) =>
  score >= 24 ? 'var(--dv2-great)' : score >= 18 ? 'var(--dv2-good)' : score >= 10 ? 'var(--dv2-fair)' : 'var(--dv2-miss)';

// Same footprint as the original game card: full screen on mobile, framed box on desktop.
export const BOX = 'fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[810px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[594px] lg:rounded-[2.5rem] overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] [container-type:size] pointer-events-auto';

// Recreate's "Lock it in" and Result's "Next round" share one spot and one shape, so the thumb never has to look for it.
export const ACTION = 'dv2-focus h-14 wide:h-16 rounded-[20px] dv2-display text-xl font-bold flex items-center justify-center gap-2 active:scale-[0.97] transition-[transform,background-color]';
export const ACTION_SPOT = 'absolute left-5 right-5 bottom-5 wide:left-auto wide:right-7 wide:bottom-6 wide:w-[calc(min(44cqw,360px)-3.5rem)]';

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const RoundTag = ({ round }: { round: number }) => (
  <span className="dv2-display text-lg font-bold tabular-nums text-white/70" aria-label={`Round ${round} of 4`}>
    {round}/4
  </span>
);

/* ---------- Mode buttons (shared by the v2 start screens) ---------- */

const TONES = {
  dark: {
    primary: 'bg-white text-black hover:bg-zinc-100',
    primaryTile: 'bg-black text-white',
    primarySub: 'text-black/60',
    secondary: 'bg-white/[0.06] ring-white/15 text-white hover:bg-white/[0.12]',
    secondaryTile: 'bg-white/10',
    secondarySub: 'text-white/60',
  },
  light: {
    primary: 'bg-black text-white hover:bg-zinc-800',
    primaryTile: 'bg-white text-black',
    primarySub: 'text-white/65',
    secondary: 'bg-black/[0.03] ring-black/15 text-black hover:bg-black/[0.07]',
    secondaryTile: 'bg-black/[0.07]',
    secondarySub: 'text-black/60',
  },
};

export function ModeButtons({ tone, hasPlayedToday, onDaily, onQuickPlay, onScore }: {
  tone: keyof typeof TONES; hasPlayedToday: boolean; onDaily: () => void; onQuickPlay: () => void; onScore: () => void;
}) {
  const t = TONES[tone];
  return (
    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_1fr_auto] gap-2.5">
      <button
        onClick={onDaily}
        onMouseEnter={() => audio.playHover()}
        className={`dv2-focus group col-span-2 sm:col-span-1 min-h-16 sm:min-h-[72px] tall:min-h-[76px] pl-2.5 sm:pl-3 pr-4 py-2.5 sm:py-3 rounded-[22px] text-left flex items-center gap-3 active:scale-[0.98] transition-[transform,background-color] ${t.primary}`}
      >
        <span className={`shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-[14px] grid place-items-center ${t.primaryTile}`} aria-hidden>
          <CalendarDays size={22} />
        </span>
        <span className="flex-1 min-w-0 grid gap-1">
          <span className="dv2-display text-xl font-bold leading-tight">{hasPlayedToday ? "Today's result" : 'Play daily'}</span>
          <span className={`text-[13px] leading-snug ${t.primarySub}`}>{hasPlayedToday ? 'Done for today. See how you did' : 'Same colors for everyone'}</span>
        </span>
        <ArrowRight size={20} className="shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </button>
      <button
        onClick={onQuickPlay}
        onMouseEnter={() => audio.playHover()}
        className={`dv2-focus group min-h-16 sm:min-h-[72px] tall:min-h-[76px] pl-2.5 sm:pl-3 pr-4 py-2.5 sm:py-3 rounded-[22px] ring-1 ring-inset text-left flex items-center gap-3 active:scale-[0.98] transition-[transform,background-color] ${t.secondary}`}
      >
        <span className={`shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-[14px] grid place-items-center ${t.secondaryTile}`} aria-hidden>
          <Zap size={22} />
        </span>
        <span className="flex-1 min-w-0 grid gap-1">
          <span className="dv2-display text-xl font-bold leading-tight">Quick play</span>
          <span className={`text-[13px] leading-snug ${t.secondarySub}`}>New colors every time</span>
        </span>
      </button>
      <button
        onClick={onScore}
        onMouseEnter={() => audio.playHover()}
        aria-label="Leaderboard"
        className={`dv2-focus w-16 sm:w-[72px] tall:w-[76px] min-h-16 sm:min-h-[72px] tall:min-h-[76px] rounded-[22px] ring-1 ring-inset grid place-items-center active:scale-[0.95] transition-[transform,background-color] ${t.secondary}`}
      >
        <Trophy size={22} />
      </button>
    </div>
  );
}

/* ---------- Start ---------- */

const PAIRS: [string, string][] = [
  ['#ff5a36', '#2f5bff'],
  ['#ffc21a', '#7a3cff'],
  ['#00b386', '#ff4f9a'],
  ['#1fb6ff', '#ff8a00'],
  ['#e9ff3a', '#d6246e'],
];

export const HOME_SHAPES = [
  <circle key="c" cx="50" cy="50" r="44" />,
  <path key="t" d="M50 6 L94 88 H6 Z" strokeLinejoin="round" />,
  <rect key="s" x="14" y="14" width="72" height="72" rx="10" transform="rotate(45 50 50)" />,
  <path key="p" d="M50 4 L61 38 L96 38 L68 59 L79 94 L50 72 L21 94 L32 59 L4 38 L39 38 Z" />,
];

export function DuoV2Start({ hasPlayedToday, onDaily, onQuickPlay, onScore }: K & {
  hasPlayedToday: boolean; onDaily: () => void; onQuickPlay: () => void; onScore: () => void;
}) {
  const [pair, setPair] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const t = setInterval(() => setPair(p => (p + 1) % PAIRS.length), 4200);
    return () => clearInterval(t);
  }, []);
  const [a, b] = PAIRS[pair];
  const shapeA = HOME_SHAPES[pair % HOME_SHAPES.length];
  const shapeB = HOME_SHAPES[(pair + 2) % HOME_SHAPES.length];

  return (
    <motion.div
      key="duo-v2-start"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className={`dv2 ${BOX} overflow-y-auto! flex flex-col bg-black text-white lg:outline lg:-outline-offset-1 lg:outline-white/10`}
    >
      <div className="relative flex-1 min-h-[150px] sm:min-h-[180px] flex flex-col sm:flex-row overflow-hidden">
        <motion.div
          className="dv2-field relative flex-1 grid place-items-center pt-14 lg:pt-0"
          style={{ backgroundColor: a }}
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <svg viewBox="0 0 100 100" className="dv2-float w-[20cqmin] h-[20cqmin] tall:w-[26cqmin] tall:h-[26cqmin] max-w-[160px] sm:translate-x-[-30%] transition-[fill] duration-[2400ms]" style={{ fill: b, ['--r' as string]: '-8deg' }} aria-hidden>
            {shapeA}
          </svg>
        </motion.div>
        <motion.div
          className="dv2-field relative flex-1 grid place-items-center pt-14 lg:pt-0"
          style={{ backgroundColor: b }}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <svg viewBox="0 0 100 100" className="dv2-float w-[20cqmin] h-[20cqmin] tall:w-[26cqmin] tall:h-[26cqmin] max-w-[160px] sm:translate-x-[30%] transition-[fill] duration-[2400ms]" style={{ fill: a, ['--r' as string]: '10deg', animationDelay: '-3s' }} aria-hidden>
            {shapeB}
          </svg>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.45, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="dv2-display dv2-wordmark pointer-events-none absolute inset-0 pt-14 lg:pt-0 grid place-items-center font-extrabold leading-none text-[clamp(88px,min(28cqw,34cqh),240px)]"
        >
          DUO
          <span className="hidden">Color Memory Game</span>
        </motion.h1>
      </div>

      <section className="relative shrink-0 px-5 pt-5 pb-12 sm:pb-16 sm:px-8 lg:px-10 lg:pt-6 lg:pb-8 tall:pt-8 tall:pb-16">
        <div className="grid gap-4 sm:gap-5 tall:gap-7">
          <div className="grid gap-1.5 tall:gap-2.5 text-[15px] sm:text-base tall:text-base leading-relaxed text-white/60 max-w-[60ch]">
            <p className="text-white font-semibold text-lg sm:text-xl tall:text-[22px] leading-snug text-balance">Two shapes, two colors. Can you isolate the memory?</p>
            <p>You have 5 seconds to anchor two colors to their shapes. We'll bring back one shape, see if you can recreate its original color.</p>
          </div>

          <ModeButtons tone="dark" hasPlayedToday={hasPlayedToday} onDaily={onDaily} onQuickPlay={onQuickPlay} onScore={onScore} />
        </div>
      </section>
    </motion.div>
  );
}

/* ---------- Ready ---------- */

export function DuoV2Ready({ countdown, round, hint = 'Two shapes are coming. Remember both.' }: K & { countdown: number; round: number; hint?: string }) {
  return (
    <motion.div
      key="duo-v2-ready"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className={`dv2 ${BOX} z-40 bg-[var(--dv2-stage)] text-white grid place-items-center lg:outline lg:-outline-offset-1 lg:outline-white/10`}
    >
      <div className="absolute top-6 left-1/2 -translate-x-1/2"><RoundTag round={round} /></div>
      <div className="grid justify-items-center gap-3">
        <span key={countdown} className="dv2-display dv2-pop font-extrabold leading-none text-[clamp(96px,32cqmin,220px)]">
          {countdown > 0 ? countdown : 'Go'}
        </span>
        <p className="text-white/55 text-base text-center px-6">{hint}</p>
      </div>
    </motion.div>
  );
}

/* ---------- Memorize ---------- */

export function DuoV2Memorize({ round, countdown, left, right }: K & {
  round: number; countdown: number; left: Shape; right: Shape;
}) {
  const progress = countdown === 0 ? 0 : Math.min((6 - countdown) / 5, 1);
  return (
    <motion.div
      key="duo-v2-memorize"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={`dv2 ${BOX} z-40 bg-[var(--dv2-stage)] text-white lg:outline lg:-outline-offset-1 lg:outline-white/10`}
    >
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10"><RoundTag round={round} /></div>
      <div className="h-full flex flex-col wide:flex-row">
        {[left, right].map(({ Icon, color }, i) => (
          <div key={i} className="flex-1 grid place-items-center">
            <motion.div
              initial={{ scale: 0.7, opacity: 0, x: i === 0 ? -30 : 30 }}
              animate={{ scale: 1, opacity: 1, x: 0 }}
              transition={{ delay: 0.05 + i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <Icon className="w-[min(32cqh,60cqw)] h-[min(32cqh,60cqw)] wide:w-[min(32cqw,52cqh)] wide:h-[min(32cqw,52cqh)]" style={{ color: hsbToString(color) }} />
            </motion.div>
          </div>
        ))}
      </div>

      {/* The seam doubles as the timer. */}
      <div className="wide:hidden absolute bg-[var(--dv2-seam)] inset-x-0 top-1/2 h-[3px] -translate-y-1/2">
        <div className="absolute inset-0 bg-white origin-left" style={{ transform: `scaleX(${progress})`, transition: progress === 0 ? 'none' : 'transform 1s linear' }} />
      </div>
      <div className="hidden wide:block absolute bg-[var(--dv2-seam)] inset-y-0 left-1/2 w-[3px] -translate-x-1/2">
        <div className="absolute inset-0 bg-white origin-top" style={{ transform: `scaleY(${progress})`, transition: progress === 0 ? 'none' : 'transform 1s linear' }} />
      </div>

      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 grid justify-items-center">
        <span className="dv2-display text-5xl font-extrabold leading-none tabular-nums" style={{ opacity: countdown > 0 ? 1 : 0 }}>
          {countdown > 0 ? countdown : 5}
        </span>
      </div>
    </motion.div>
  );
}

/* ---------- Recreate ---------- */

export function DuoV2Recreate({ round, Icon, color, setColor, onSubmit, prompt = 'This one came back. Match its color.', onChangeShape }: K & {
  round: number; Icon: React.ElementType; color: Color;
  setColor: (fn: (c: Color) => Color) => void; onSubmit: () => void;
  prompt?: string; onChangeShape?: () => void;
}) {
  const shape = <Icon className="w-[min(22cqh,56cqw)] h-[min(22cqh,56cqw)] wide:w-[min(26cqw,44cqh)] wide:h-[min(26cqw,44cqh)] transition-[color,transform] duration-150 group-hover:scale-105" style={{ color: hsbToString(color) }} />;
  return (
    <motion.div
      key="duo-v2-recreate"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={`dv2 ${BOX} overflow-y-auto! z-40 bg-[var(--dv2-stage)] text-white flex flex-col wide:flex-row lg:outline lg:-outline-offset-1 lg:outline-white/10`}
    >
      <div className="relative flex-1 grid place-items-center pt-14 pb-2 wide:py-0">
        <div className="absolute top-6 left-1/2 -translate-x-1/2 grid justify-items-center gap-3">
          <RoundTag round={round} />
        </div>
        <div className="grid justify-items-center gap-3 wide:gap-5">
          {onChangeShape ? (
            <button
              onClick={onChangeShape}
              className="dv2-focus group grid justify-items-center gap-2.5 p-2 rounded-[28px] hover:bg-white/[0.05] transition-colors"
            >
              {shape}
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 ring-1 ring-inset ring-white/15 text-[13px] font-semibold text-white/80 group-hover:bg-white/15">
                <ArrowLeftRight size={14} aria-hidden /> Tap to change shape
              </span>
            </button>
          ) : shape}
          <p className="dv2-display text-lg wide:text-2xl font-bold text-center text-balance px-6">{prompt}</p>
        </div>
      </div>

      <div className="wide:w-[44cqw] wide:max-w-[360px] shrink-0 flex flex-col gap-3 px-5 pb-5 wide:pb-6 pt-2 wide:pt-5 [@media(max-height:420px)]:pt-2 wide:px-7 wide:shadow-[inset_1px_0_0_rgba(255,255,255,0.1)]">
        <div className="flex-1 grid gap-3 [@media(max-height:420px)]:gap-1.5 content-end wide:content-center">
        <HorizontalSlider label="Hue" suffix="°" value={color.h} max={360} type="H"
          onChange={v => setColor(c => ({ ...c, h: v }))}
          bg="linear-gradient(to right, #ff0000 0%, #ffff00 16.67%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.67%, #ff00ff 83.33%, #ff0000 100%)" />
        <HorizontalSlider label="Saturation" value={color.s} max={100} type="S"
          onChange={v => setColor(c => ({ ...c, s: v }))}
          bg={`linear-gradient(to right, ${hsbToString({ ...color, s: 0 })}, ${hsbToString({ ...color, s: 100 })})`} />
        <HorizontalSlider label="Brightness" value={color.b} max={100} type="B"
          onChange={v => setColor(c => ({ ...c, b: v }))}
          bg={`linear-gradient(to right, #000, ${hsbToString({ ...color, b: 100 })})`} />
        </div>
        <button onClick={onSubmit} className={`${ACTION} shrink-0 bg-white text-black hover:bg-zinc-200`}>
          Lock it in
        </button>
      </div>
    </motion.div>
  );
}

/* ---------- Result ---------- */

const Sparks = ({ colors }: { colors: string[] }) => (
  <>
    {Array.from({ length: 14 }, (_, i) => (
      <span
        key={i}
        className="dv2-spark"
        style={{ background: colors[i % colors.length], ['--a' as string]: `${(360 / 14) * i}deg`, ['--d' as string]: `${(i % 3) * 0.03}s` }}
      />
    ))}
  </>
);

// Shorter ease so the hundredths stop creeping ~1s in; payoff fires the frame the final digits show. Used by Final too.
const RESULT_SCORE_TIMING = { duration: 1200, settle: true };

export function DuoV2Result({ round, score, showScoreText, scoreText, onScoreDone, target, user, wrongShape, onNext }: K & {
  round: number; score: number; showScoreText: boolean; scoreText: string; onScoreDone: () => void;
  target: Shape; user: Shape; wrongShape: boolean; onNext: () => void;
}) {
  const tInk = ink(target.color), uInk = ink(user.color);
  const last = round >= 4;
  return (
    <motion.div
      key="duo-v2-result"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={`dv2 ${BOX} z-40 flex flex-col wide:flex-row`}
    >
      <div className="relative flex-1 grid place-items-center" style={{ background: hsbToString(target.color), color: tInk }}>
        <target.Icon className="w-[min(18cqh,34cqw)] h-[min(18cqh,34cqw)] wide:w-[min(16cqw,24cqh)] wide:h-[min(16cqw,24cqh)]" />
        <div className="absolute left-5 top-5 wide:left-8 wide:top-7 grid">
          <span className="text-sm font-semibold opacity-70">Shown</span>
          <span className="text-sm font-bold tabular-nums">H{target.color.h} S{target.color.s} B{target.color.b}</span>
        </div>
      </div>

      <motion.div
        className="relative flex-1 grid place-items-center"
        style={{ background: hsbToString(user.color), color: uInk }}
        initial={{ clipPath: 'inset(0 0 0 100%)' }}
        animate={{ clipPath: 'inset(0 0 0 0%)' }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <user.Icon className="w-[min(18cqh,34cqw)] h-[min(18cqh,34cqw)] wide:w-[min(16cqw,24cqh)] wide:h-[min(16cqw,24cqh)]" />
        <div className="absolute left-5 bottom-[5.5rem] wide:left-8 wide:bottom-auto wide:top-7 grid">
          <span className="text-sm font-semibold opacity-70">Yours{wrongShape ? ' (wrong shape)' : ''}</span>
          <span className="text-sm font-bold tabular-nums">H{user.color.h} S{user.color.s} B{user.color.b}</span>
        </div>
      </motion.div>

      <button
        onClick={onNext}
        aria-label={last ? 'See total' : 'Next round'}
        className={`${ACTION} ${ACTION_SPOT} z-10`}
        style={{ background: uInk, color: uInk === '#000' ? '#fff' : '#000' }}
      >
        <ArrowRight size={26} aria-hidden />
      </button>

      {/* Score sits on the seam, where the two colors meet. */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div
          className={`relative w-[clamp(9.5rem,40cqmin,12rem)] h-[clamp(9.5rem,40cqmin,12rem)] rounded-full bg-white text-black grid place-items-center content-center shadow-[0_18px_50px_rgba(0,0,0,.28)] ${showScoreText && score < 10 ? 'dv2-shake' : ''}`}
          style={{ boxShadow: `0 0 0 6px ${showScoreText ? band(score) : 'rgba(255,255,255,.6)'}, 0 18px 50px rgba(0,0,0,.28)`, transition: 'box-shadow .3s' }}
        >
          <span className="text-sm text-black/50 font-bold tabular-nums mb-1" aria-label={`Round ${round} of 4`}>{round}/4</span>
          {showScoreText && score >= 20 && <Sparks colors={[hsbToString(target.color), hsbToString(user.color), '#fff']} />}
          <span className="dv2-display text-5xl wide:text-6xl font-extrabold leading-none">
            <AnimatedScore value={score} onComplete={onScoreDone} timing={RESULT_SCORE_TIMING} />
          </span>
          <span className="text-sm text-black/50 font-semibold">out of 25</span>
          <span className={`mt-1 text-sm font-bold transition-all duration-300 ${showScoreText ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
            {scoreText}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ---------- Final ---------- */

export type FinalRound = { target: Shape; user: Shape; score: number };

export function DuoV2Final(p: K & {
  isDaily: boolean; totalScore: number; quote: string; rounds: FinalRound[];
  stats: { high: number; avg: number } | null; nextIn: string | null;
  playerName: string; setPlayerName: (n: string) => void; onPost: () => void; isPosting: boolean;
  onShare: () => void; copied: boolean; onPlayAgain: (() => void) | null;
  label: string; crossSell: { text: string; onClick: () => void }; onClose: () => void;
}) {
  return (
    <motion.div
      key="duo-v2-final"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`dv2 ${BOX} z-40 bg-black text-white lg:outline lg:-outline-offset-1 lg:outline-white/10`}
    >
      <button
        onClick={p.onClose}
        aria-label="Close"
        className="dv2-focus absolute top-5 right-5 z-10 w-12 h-12 rounded-full bg-white/10 grid place-items-center hover:bg-white/20 active:scale-95 transition"
      >
        <X size={22} />
      </button>

      <div className="h-full overflow-y-auto">
        <div className="min-h-full grid gap-8 px-5 pt-20 pb-16 sm:px-8 sm:pt-16 lg:h-full lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-10 lg:px-12 lg:py-10">
          <div className="grid gap-6">
            <header className="grid gap-2">
              <p className="text-base font-semibold text-white/55">{p.label}</p>
              <p className="flex items-baseline gap-2 whitespace-nowrap">
                <span className="dv2-display font-extrabold leading-[0.9] text-[clamp(64px,min(22cqw,26cqh),112px)] lg:text-[clamp(72px,min(12cqw,18cqh),96px)]">
                  <AnimatedScore value={p.totalScore} timing={RESULT_SCORE_TIMING} onComplete={() => audio.playScoreReveal()} />
                </span>
                <span className="dv2-display text-2xl sm:text-3xl font-bold text-white/40">/100</span>
              </p>
              <p className="text-white/70 font-semibold">{p.quote}</p>
            </header>

            {(p.stats || p.nextIn) && (
              <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                {p.stats && <div><dt className="text-white/55">Day's high</dt><dd className="font-bold tabular-nums">{p.stats.high.toFixed(2)}</dd></div>}
                {p.stats && <div><dt className="text-white/55">Day's average</dt><dd className="font-bold tabular-nums">{p.stats.avg.toFixed(2)}</dd></div>}
                {p.nextIn && <div><dt className="text-white/55">Next daily in</dt><dd className="font-bold tabular-nums">{p.nextIn}</dd></div>}
              </dl>
            )}
          </div>

          <div className="grid gap-4">
            <ol className="grid grid-cols-4 gap-2">
              {p.rounds.map((r, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="grid gap-1.5"
                >
                  <div className="aspect-[3/4] lg:aspect-[4/5] rounded-2xl overflow-hidden flex">
                    <div className="flex-1 grid place-items-center" style={{ background: hsbToString(r.target.color), color: ink(r.target.color) }}>
                      <r.target.Icon className="w-1/2 h-auto opacity-90" />
                    </div>
                    <div className="flex-1 grid place-items-center" style={{ background: hsbToString(r.user.color), color: ink(r.user.color) }}>
                      <r.user.Icon className="w-1/2 h-auto opacity-90" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-bold tabular-nums">
                    <span className="w-2 h-2 rounded-full" style={{ background: band(r.score) }} />
                    {r.score.toFixed(1)}
                  </div>
                </motion.li>
              ))}
            </ol>

            <div className="flex gap-2">
              <label className="relative flex-1 min-w-0">
                <span className="sr-only">Your name</span>
                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  placeholder={p.isDaily ? 'Name (optional)' : 'Your name'}
                  value={p.playerName}
                  onChange={e => p.setPlayerName(e.target.value.slice(0, 20))}
                  className="w-full h-12 rounded-[16px] bg-white/10 pl-11 pr-4 font-semibold text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white"
                />
              </label>
              <button
                onClick={p.onPost}
                disabled={!p.playerName.trim() || p.isPosting}
                className="dv2-focus h-12 px-5 rounded-[16px] bg-white/10 font-bold hover:bg-white/20 disabled:opacity-40 transition"
              >
                {p.isPosting ? 'Saving…' : p.isDaily ? 'Save' : 'Post'}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={p.onShare}
                className="dv2-focus flex-1 basis-[9.5rem] min-h-14 px-4 whitespace-nowrap rounded-[18px] bg-white text-black dv2-display text-lg font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 active:scale-[0.98] transition"
              >
                <Share2 size={20} /> {p.copied ? 'Copied' : 'Share score'}
              </button>
              {p.onPlayAgain && (
                <button
                  onClick={p.onPlayAgain}
                  className="dv2-focus flex-1 basis-[9.5rem] min-h-14 px-4 whitespace-nowrap rounded-[18px] bg-white/10 dv2-display text-lg font-bold flex items-center justify-center gap-2 hover:bg-white/20 active:scale-[0.98] transition"
                >
                  <RotateCcw size={20} /> Play again
                </button>
              )}
            </div>

            <button
              onClick={p.crossSell.onClick}
              className="dv2-focus justify-self-start text-sm font-bold text-white/80 underline underline-offset-4 decoration-2 hover:text-white"
            >
              {p.crossSell.text}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

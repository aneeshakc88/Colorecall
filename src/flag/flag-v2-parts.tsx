import { useEffect, useMemo, useState } from 'react';
import { AnimatedScore, type ScoreTiming } from '../utils/colorMath';
import { describeMiss, hexToLab } from './color-feedback';
import { flagAspect, flagDataUri } from './flag-card';

// Blurred copy of the flag filling the card. Drawn small then scaled up so the blur stays cheap while sliders move.
export function FlagBackdrop({ svg }: { svg: string }) {
  const uri = useMemo(() => flagDataUri(svg), [svg]);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <div
        className="absolute left-1/2 top-1/2 w-[30%] h-[30%] opacity-70"
        style={{ backgroundImage: `url("${uri}")`, backgroundSize: '100% 100%', filter: 'blur(14px) saturate(1.3)', transform: 'translate(-50%, -50%) scale(4.2)', transition: 'background-image 80ms' }}
      />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.05), rgba(0,0,0,0.7) 80%)' }} />
    </div>
  );
}

// Same bands as the Duo redesign (DuoV2 band()).
const band = (score: number) =>
  score >= 24 ? 'var(--dv2-great)' : score >= 18 ? 'var(--dv2-good)' : score >= 10 ? 'var(--dv2-fair)' : 'var(--dv2-miss)';

// Round progress as flag outlines: done = the real flag with a score tick, current = bright outline, upcoming = dim.
export function FlagProgress({ svgs, current, scores }: { svgs: string[]; current: number; scores: number[] }) {
  return (
    <div className="flex items-end gap-1.5" role="img" aria-label={`Round ${current + 1} of ${svgs.length}`}>
      {svgs.map((svg, i) => {
        const w = Math.round(18 * Math.min(flagAspect(svg), 2));
        const done = i < scores.length;
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className={`h-[18px] rounded-[3px] transition-all duration-300 ${done ? '' : i === current ? 'ring-2 ring-white' : 'ring-1 ring-white/25'}`}
              style={{ width: w, ...(done ? { backgroundImage: `url("${flagDataUri(svg)}")`, backgroundSize: '100% 100%' } : {}) }}
            />
            <div className="h-[3px] w-full rounded-full" style={{ background: done ? band(scores[i]!) : 'transparent' }} />
          </div>
        );
      })}
    </div>
  );
}

const ink = (hex: string) => (hexToLab(hex)[0] > 62 ? '#000' : '#fff');

const Swatch = ({ hex, label }: { hex: string; label: string }) => (
  <div className="flex-1 h-14 rounded-2xl px-3.5 flex flex-col justify-center ring-1 ring-inset ring-white/15" style={{ background: hex, color: ink(hex) }}>
    <span className="text-[12px] font-semibold opacity-70 leading-tight">{label}</span>
    <span className="text-[13px] font-bold tabular-nums leading-tight">{hex}</span>
  </div>
);

// Count starts with the true-colour sweep (fv2-curtain: 450ms delay, 700ms) and lands with it, so the payoff
// (chime/ping, confetti, message) hits as the sweep and the fv2-late details finish at 1150ms.
export const REVEAL_SCORE_TIMING = { delay: 450, duration: 1100, minMs: 700, settle: true };

// Round score for the result panel: count-up, a bar in the Duo band colour, then the plain-language miss.
export function FlagV2Score({ result, msg, showMsg, onScoreDone, timing }: {
  result: { actualHex: string; guessHex: string; score: number }; msg: string; showMsg: boolean; onScoreDone: () => void; timing?: ScoreTiming;
}) {
  const [fill, setFill] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setFill(result.score / 25)); return () => cancelAnimationFrame(id); }, [result.score]);
  const miss = useMemo(() => describeMiss(result.actualHex, result.guessHex), [result.actualHex, result.guessHex]);
  const color = band(result.score);

  return (
    <div className="flex-1 grid gap-3 content-end wide:content-center">
      <div className={`grid gap-2 ${showMsg && result.score < 10 ? 'dv2-shake' : ''}`}>
        <p className="flex items-baseline gap-1.5">
          <span className={`dv2-display text-6xl wide:text-7xl font-extrabold leading-none ${showMsg && result.score >= 24 ? 'fv2-pop' : ''}`}>
            <AnimatedScore value={result.score} decimals={0} onComplete={onScoreDone} timing={timing} />
          </span>
          <span className="dv2-display text-2xl font-bold text-white/40">/25</span>
        </p>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${fill * 100}%`, background: color, transition: `width ${timing?.duration ?? 1500}ms cubic-bezier(0.22, 1, 0.36, 1) ${timing?.delay ?? 0}ms` }} />
        </div>
        <p className={`text-white/60 font-semibold transition-all duration-300 ${showMsg ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>{msg}</p>
      </div>
      <p className="fv2-late dv2-display text-xl font-bold leading-tight first-letter:uppercase text-balance">{miss.join(' · ')}</p>
      <div className="fv2-late flex gap-2">
        <Swatch hex={result.actualHex} label="Real" />
        <Swatch hex={result.guessHex} label="Yours" />
      </div>
    </div>
  );
}

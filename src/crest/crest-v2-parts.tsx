import { useMemo } from 'react';
import { crestDataUri } from './CrestSplitHero';
import '../flag/flag-v2.css';
import './crest-v2.css';

// Floodlit pitch behind the badge, softly tinted by the badge's live colours.
export function CrestBackdrop({ svg }: { svg: string }) {
  const uri = useMemo(() => crestDataUri(svg), [svg]);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden style={{ background: 'radial-gradient(120% 90% at 50% 0%, #17603a 0%, #0a2a19 55%, #04100a 100%)' }}>
      <div className="absolute inset-0 cv2-stripes" />
      <div className="cv2-pool" style={{ top: '-18%', left: '-14%', width: 360, height: 360, background: 'radial-gradient(circle, rgba(34,197,94,.62), transparent 68%)', ['--d' as string]: '15s' }} />
      <div className="cv2-pool" style={{ bottom: '-20%', right: '-14%', width: 400, height: 400, background: 'radial-gradient(circle, rgba(20,184,166,.5), transparent 68%)', ['--d' as string]: '19s' }} />
      <div
        className="absolute left-1/2 top-1/2 w-[60%] h-[60%] opacity-50"
        style={{ backgroundImage: `url("${uri}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', filter: 'blur(48px) saturate(1.5)', transform: 'translate(-50%, -50%) scale(1.5)', transition: 'background-image 80ms' }}
      />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0), rgba(0,0,0,.42) 85%)' }} />
    </div>
  );
}

const band = (score: number) =>
  score >= 24 ? 'var(--dv2-great)' : score >= 18 ? 'var(--dv2-good)' : score >= 10 ? 'var(--dv2-fair)' : 'var(--dv2-miss)';

// Round progress as the day's four badges: done = the real badge with a score tick, current = ringed silhouette, upcoming = dim silhouette.
// Only finished rounds show colour, so the chip never gives away the current answer.
export function CrestProgress({ svgs, current, scores }: { svgs: string[]; current: number; scores: number[] }) {
  return (
    <div className="flex items-end gap-2.5" role="img" aria-label={`Badge ${current + 1} of ${svgs.length}`}>
      {svgs.map((svg, i) => {
        const done = i < scores.length;
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className={`h-7 w-7 rounded-full grid place-items-center transition-all duration-300 ${i === current ? 'ring-2 ring-white bg-white/10' : done ? 'bg-white/5' : 'ring-1 ring-white/20'}`}
            >
              <div
                className={`h-5 w-5 transition-all duration-300 ${done ? '' : i === current ? 'brightness-0 invert' : 'brightness-0 invert opacity-25'}`}
                style={{ backgroundImage: `url("${crestDataUri(svg)}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}
              />
            </div>
            <div className="h-[3px] w-full rounded-full" style={{ background: done ? band(scores[i]!) : 'transparent' }} />
          </div>
        );
      })}
    </div>
  );
}

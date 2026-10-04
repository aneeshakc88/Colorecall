import { useEffect, useMemo, useState } from 'react';
import { swapRegion, viewBoxRatio } from '../flag/flag-highlight';
import { crestDataUri } from './CrestSplitHero';
import '../flag/flag-v2.css';
import './crest-v2.css';

type Props = {
  svg: string;
  hiddenHex: string;
  guessHex: string;
  perfect: boolean;
  fire: boolean;
  reserve?: number;
};

const palette = (svg: string) => [...new Set(svg.match(/#[0-9a-f]{6}\b/gi)?.map(h => h.toUpperCase()) ?? [])].slice(0, 5);

// The badge wears your guess for a beat, then the true colour sweeps across it. Hold to look at your guess again.
export function CrestReveal({ svg, hiddenHex, guessHex, perfect, fire, reserve = 0 }: Props) {
  const [peek, setPeek] = useState(false);
  const guessSvg = useMemo(() => swapRegion(svg, hiddenHex, guessHex), [svg, hiddenHex, guessHex]);
  const ratio = viewBoxRatio(svg);
  const mask = useMemo(() => `url("${crestDataUri(svg)}") center / 100% 100% no-repeat`, [svg]);

  const bits = useMemo(() => {
    if (!perfect || !fire) return [];
    const cols = palette(svg);
    return Array.from({ length: 30 }, (_, i) => {
      const a = (i / 30) * Math.PI * 2 + Math.random() * 0.4;
      const r = 110 + Math.random() * 150;
      return { c: cols[i % cols.length] ?? '#fff', dx: Math.cos(a) * r, dy: Math.sin(a) * r * 0.8, rot: Math.random() * 720 - 360 };
    });
  }, [perfect, fire, svg]);

  useEffect(() => {
    if (!perfect || !fire) return;
    const id = setTimeout(() => navigator.vibrate?.([20, 40, 30]), 0);
    return () => clearTimeout(id);
  }, [perfect, fire]);

  const hold = (on: boolean) => () => setPeek(on);

  return (
    <button
      type="button"
      aria-label={peek ? 'Showing your guess' : 'Hold to compare with your guess'}
      onPointerDown={hold(true)}
      onPointerUp={hold(false)}
      onPointerLeave={hold(false)}
      onPointerCancel={hold(false)}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setPeek(true); } }}
      onKeyUp={hold(false)}
      onContextMenu={(e) => e.preventDefault()}
      className={`cv2-badge relative block select-none touch-none ${perfect && fire ? 'is-perfect' : ''}`}
      style={{ width: `min(100cqw, calc((100cqh - var(--crest-reserve, ${reserve}rem)) * ${ratio.toFixed(3)}), 420px)`, aspectRatio: String(ratio) }}
    >
      <div className="cv2-layer" dangerouslySetInnerHTML={{ __html: guessSvg }} />
      <div className="cv2-layer fv2-true" style={{ visibility: peek ? 'hidden' : 'visible' }} dangerouslySetInnerHTML={{ __html: svg }} />
      {/* Light edge of the sweep, masked to the badge so it never spills onto the grass. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ WebkitMask: mask, mask }}>
        <div className="fv2-edge" />
      </div>
      {bits.map((b, i) => (
        <span
          key={i}
          className="fv2-bit"
          style={{ background: b.c, ['--dx' as string]: `${b.dx}px`, ['--dy' as string]: `${b.dy}px`, ['--rot' as string]: `${b.rot}deg` }}
        />
      ))}
      <span className={`absolute left-1/2 -translate-x-1/2 -top-3 px-2.5 py-1 rounded-full bg-black/75 text-[12px] font-bold text-white transition-opacity ${peek ? 'opacity-100' : 'opacity-0'}`}>Your guess</span>
    </button>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { swapRegion, viewBoxRatio } from './flag-highlight';
import './flag-v2.css';

type Props = {
  svg: string;
  hiddenHex: string;
  hiddenIdx?: number[] | undefined;
  guessHex: string;
  perfect: boolean;
  fire: boolean;
  reserve?: number;
};

const palette = (svg: string) => [...new Set(svg.match(/#[0-9a-f]{6}\b/gi)?.map(h => h.toUpperCase()) ?? [])].slice(0, 5);

// Celebration (burst, flutter, buzz) waits for `fire` — the count-up landing — so it starts on the chime.
export function FlagReveal({ svg, hiddenHex, hiddenIdx, guessHex, perfect, fire, reserve = 0 }: Props) {
  const [peek, setPeek] = useState(false);
  const guessSvg = useMemo(() => swapRegion(svg, hiddenHex, guessHex, hiddenIdx), [svg, hiddenHex, guessHex, hiddenIdx]);
  const ratio = viewBoxRatio(svg);

  const bits = useMemo(() => {
    if (!perfect || !fire) return [];
    const cols = palette(svg);
    return Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2 + Math.random() * 0.4;
      const r = 120 + Math.random() * 160;
      return { c: cols[i % cols.length] ?? '#fff', dx: Math.cos(a) * r, dy: Math.sin(a) * r * 0.7, rot: Math.random() * 720 - 360 };
    });
  }, [perfect, fire, svg]);

  useEffect(() => {
    if (!perfect || !fire) return;
    navigator.vibrate?.([20, 40, 30]);
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
      className={`fv2-flag relative block select-none touch-none rounded-lg ${perfect && fire ? 'is-perfect' : ''}`}
      style={{ width: `min(100cqw, calc((100cqh - ${reserve}rem) * ${ratio.toFixed(3)}), 640px)`, aspectRatio: String(ratio) }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-lg" style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.25), 0 30px 60px -20px rgba(0,0,0,0.8)' }}>
        <div className="fv2-layer" dangerouslySetInnerHTML={{ __html: guessSvg }} />
        <div className="fv2-layer fv2-true" style={{ visibility: peek ? 'hidden' : 'visible' }} dangerouslySetInnerHTML={{ __html: svg }} />
        {/* Fabric light: soft diagonal sheen so the flag reads as cloth, not a vector. */}
        <div className="absolute inset-0 pointer-events-none mix-blend-soft-light" style={{ background: 'linear-gradient(105deg, rgba(255,255,255,.25), transparent 35%, rgba(0,0,0,.18) 60%, rgba(255,255,255,.12) 80%, transparent)' }} />
        <div className="fv2-edge" />
      </div>
      {bits.map((b, i) => (
        <span
          key={i}
          className="fv2-bit"
          style={{ background: b.c, ['--dx' as string]: `${b.dx}px`, ['--dy' as string]: `${b.dy}px`, ['--rot' as string]: `${b.rot}deg` }}
        />
      ))}
      <span className={`absolute left-2 top-2 px-2.5 py-1 rounded-full bg-black/75 text-[12px] font-bold text-white transition-opacity ${peek ? 'opacity-100' : 'opacity-0'}`}>Your guess</span>
    </button>
  );
}

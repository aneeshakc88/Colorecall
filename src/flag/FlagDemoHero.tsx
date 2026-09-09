// Live-demo flag intro — the game playing itself. The day's flag sits with the
// marching ants already round the wrong region (the game shows them too, so this
// gives nothing away), a hue slider scrubs on its own, and the region repaints
// with it. Fourth layout option alongside the ring, FlagSplitHero and FlagDeckHero.
//
// Layout switches on "wide OR short" rather than width alone — a phone in
// landscape has desktop's problem, not a phone's — which a Tailwind breakpoint
// can't express, hence the fd-* classes. The flag is sized from its measured box,
// so it can't outgrow whatever room is left.
import { useEffect, useMemo, useRef, useState } from 'react';
import { getDailyFlagPuzzle, type DailyFlagRound } from './flag-core';
import { swapRegion, regionOutline, applyOverlay, viewBoxRatio } from './flag-highlight';

type Props = {
  onPlay: () => void;
  playersToday: number;
};

const SCRUB_MS = 9000; // one full sweep of the hue slider

const dailyKicker = () => {
  const d = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Daily · ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

const hslToHex = (h: number, s: number, l: number): string => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${to(r)}${to(g)}${to(b)}`;
};

const useBoxSize = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
};

const CSS = `
  .fd-root { display: flex; flex-direction: column; align-items: center; justify-content: center;
             gap: clamp(0.5rem, 2.2vh, 1rem); width: 100%; height: 100%; min-height: 0; padding-bottom: 2.25rem; }
  .fd-copy { display: contents; }
  .fd-text { order: 1; width: 100%; text-align: center; overflow-wrap: anywhere; }
  /* Measured box: slider and flag are sized from it in JS, so the pair always
     sits centred as one unit whatever room is left. */
  .fd-stage { order: 2; display: flex; align-items: center; justify-content: center;
              width: 100%; height: clamp(84px, 22vh, 190px); min-height: 0; }
  .fd-cta { order: 3; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; width: 100%; }

  /* Wide desktop card, or any viewport too short to stack (landscape phones). */
  @media (min-width: 1024px), ((max-height: 560px) and (min-width: 620px)) {
    .fd-root { flex-direction: row-reverse; gap: clamp(1.25rem, 4vw, 2.5rem); padding-bottom: 0; }
    .fd-copy { display: flex; flex-direction: column; flex: 1 1 0; min-width: 0;
               align-items: flex-start; justify-content: center; gap: clamp(0.75rem, 3vh, 1.4rem); }
    .fd-text { text-align: left; }
    .fd-stage { flex: 0 0 auto; width: clamp(180px, 30vw, 330px); height: clamp(100px, 26vh, 210px); }
    .fd-cta { width: auto; align-items: flex-start; }
  }

  @keyframes fd-knob { 0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.55); } 50% { box-shadow: 0 0 0 6px rgba(255,255,255,0); } }
  /* The region outline can run along the flag's edge — a hair of scale keeps that
     stroke inside the clip instead of half-cropped by it. */
  .fd-flag svg { display: block; width: 100%; height: 100%; transform: scale(0.99); }
`;

/** First round whose region outline can be drawn synchronously — the raster
 *  tracer the game falls back to is too heavy to run on the intro screen. */
const pickRound = (rounds: DailyFlagRound[]) => {
  for (const r of rounds) {
    const o = regionOutline(r.flag.svg, r.hiddenHex, r.hiddenIdx);
    if (o) return { round: r, outline: o };
  }
  return { round: rounds[0]!, outline: null };
};

export const FlagDemoHero = ({ onPlay, playersToday }: Props) => {
  const rounds = useMemo(() => getDailyFlagPuzzle(), []);
  const { round, outline } = useMemo(() => pickRound(rounds), [rounds]);
  const [boxRef, box] = useBoxSize();

  const flagRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const hexRef = useRef<HTMLSpanElement>(null);

  const ar = viewBoxRatio(round.flag.svg);
  const railW = Math.round(Math.max(14, Math.min(22, box.w * 0.05)));
  const gap = Math.round(Math.max(8, Math.min(14, box.w * 0.03)));
  const flagW = box.w && box.h ? Math.min(box.w - railW - gap, box.h * ar) : 0;
  const flagH = flagW / ar;

  // The demo repaints the flag straight into the DOM: at 20fps a React state
  // update per frame would re-render the whole hero for nothing.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = -1;
    const paint = (hue: number) => {
      const hex = hslToHex(hue, 0.68, 0.46);
      if (flagRef.current) {
        flagRef.current.innerHTML = applyOverlay(
          swapRegion(round.flag.svg, round.hiddenHex, hex, round.hiddenIdx),
          outline,
        );
      }
      if (knobRef.current) knobRef.current.style.top = `${(hue / 360) * 100}%`;
      if (hexRef.current) hexRef.current.textContent = hex;
    };

    if (reduced) {
      paint(210);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // Triangle sweep, so the slider runs down and back rather than snapping.
      const t = ((now - start) % SCRUB_MS) / SCRUB_MS;
      const hue = Math.round((t < 0.5 ? t * 2 : 2 - t * 2) * 360);
      if (hue === last) return;
      last = hue;
      paint(hue);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [round, outline]);

  return (
    <div className="fd-root relative">
      <style>{CSS}</style>

      {/* display:contents while stacked, so the flag can sit between the copy and the CTA */}
      <div className="fd-copy">
        <div className="fd-text shrink-0">
          <span className="inline-block text-[10px] sm:text-xs font-mono uppercase tracking-[0.18em] text-white/60 border border-white/15 bg-white/[0.05] rounded-full px-3 py-1">
            {dailyKicker()}
          </span>
          <h1 className="fi-title mt-2 font-black tracking-tighter leading-[0.95] text-[clamp(1.85rem,7.6vw,2.9rem)] lg:text-[clamp(1.7rem,2.7vw,2.4rem)]">
            Flag ColorGuessr
          </h1>
          <p className="mt-2 font-semibold text-[#9fb0c4] text-[clamp(0.78rem,3.3vw,1rem)]">
            Slide the marked band back to its real colour
          </p>
        </div>

        <div className="fd-cta shrink-0">
          <div className="fi-cta relative w-full max-w-[16rem] p-[5px] rounded-[1.2rem] overflow-hidden hover:scale-[1.03] active:scale-95 transition-all duration-300 group/rainbow">
            <div className="absolute inset-[-500%] bg-[conic-gradient(from_0deg,#ff4545,#f2f245,#45f245,#45f2f2,#4545f2,#f245f2,#ff4545)] animate-spin-slow opacity-40 group-hover/rainbow:opacity-100 transition-opacity" />
            <button
              onClick={onPlay}
              className="relative z-10 w-full px-5 py-3 sm:py-4 bg-white text-black font-black rounded-2xl flex items-center justify-center whitespace-nowrap text-[clamp(0.95rem,3.6vw,1.1rem)] transition-colors duration-300 overflow-hidden"
            >
              Play today's flags
              <span className="fi-sheen pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent mix-blend-overlay" />
            </button>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px] sm:text-xs tracking-wide text-white/40 tabular-nums">
            <span ref={hexRef} className="text-white/70">#000000</span>
            {playersToday > 0 && <span>· <span className="text-white/70">{playersToday}</span> played today</span>}
          </div>
        </div>
      </div>

      {/* The game's own controls, running themselves */}
      <div ref={boxRef} className="fd-stage">
        {flagW > 0 && (
          <div className="flex items-stretch" style={{ height: flagH, gap }}>
            <div
              className="relative shrink-0 rounded-full overflow-hidden border border-white/15"
              style={{
                width: railW,
                background: 'linear-gradient(to bottom, #ff0000 0%, #ffff00 16.67%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.67%, #ff00ff 83.33%, #ff0000 100%)',
              }}
            >
              <div
                ref={knobRef}
                className="absolute left-1/2 w-[calc(100%+6px)] h-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 border border-black/30"
                style={{ top: '0%', animation: 'fd-knob 2.4s ease-in-out infinite' }}
              />
            </div>

            <div
              ref={flagRef}
              className="fd-flag rounded-lg sm:rounded-xl overflow-hidden shadow-[0_18px_44px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.1)]"
              style={{ width: flagW, height: flagH }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

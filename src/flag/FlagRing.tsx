// 3D rotating flag ring — the day's 5 flags as convex cards on a tilted, rolled cylinder.
import { useEffect, useMemo, useRef, useState } from 'react';
import { getDailyFlagPuzzle } from './flag-core';
import {
  RING_TILT, RING_ROLL, CARD_STRIPS, RING_COPIES, RING_CARD_W,
  ringRadius, ringPlacement, cardBox, flagDataUri, type CardBox,
} from './flag-card';

export type RingFlag = { name: string; svg: string };

const svgBg = (svg: string) => `url("${flagDataUri(svg)}")`;

// The flag image comes from --f on the card, set once per distinct flag in
// FlagRing3D's stylesheet — inlining the data URI here would repeat it 36 times.
const BentCard = ({ box }: { box: CardBox }) => {
  const stripW = box.w / CARD_STRIPS;
  const bendRad = box.bendR;
  const step = box.bend / CARD_STRIPS;
  return (
    <>
      {Array.from({ length: CARD_STRIPS }, (_, j) => {
        const a = -box.bend / 2 + (j + 0.5) * step;
        const first = j === 0, last = j === CARD_STRIPS - 1;
        return (
          <div key={j} className="fr-strip" style={{
            width: stripW + 0.7, height: box.h, marginLeft: -stripW / 2,
            transform: `rotateY(${a}deg) translateZ(${bendRad}px)`,
            backgroundColor: box.mat,
            backgroundSize: `${box.bg.w}px ${box.bg.h}px`,
            backgroundPosition: `${box.bg.x - j * stripW}px ${box.bg.y}px`,
            borderTopLeftRadius: first ? 9 : 0, borderBottomLeftRadius: first ? 9 : 0,
            borderTopRightRadius: last ? 9 : 0, borderBottomRightRadius: last ? 9 : 0,
          }} />
        );
      })}
    </>
  );
};

const BLANK_RING: RingFlag[] = Array.from({ length: 5 }, () => ({ name: '', svg: '' }));

export const FlagRing3D = ({ flags, scale = 1 }: { flags: RingFlag[] | null; scale?: number }) => {
  const cards = flags ?? BLANK_RING;
  const ring = Array.from({ length: RING_COPIES }, () => cards).flat();
  const n = ring.length;
  const radius = ringRadius(RING_CARD_W * scale, n, scale);
  // Slots sized per card, so a 4:1 flag takes a wide slot instead of losing height.
  const boxes = ring.map(f => cardBox(f.svg, scale));
  // Surfaces sit on the ring radius (cardBox pulls each card back by its bend radius),
  // so slots are allocated against that same radius.
  const { angles } = ringPlacement(boxes.map(b => b.w), radius);

  return (
    <div style={{ width: 340 * scale, height: 300 * scale, perspective: 1600 * scale, perspectiveOrigin: '50% 50%' }}>
      <style>{`
        @keyframes fr-spin {
          from { transform: rotateX(${RING_TILT}deg) rotateZ(${RING_ROLL}deg) rotateY(0deg); }
          to   { transform: rotateX(${RING_TILT}deg) rotateZ(${RING_ROLL}deg) rotateY(360deg); }
        }
        .fr-ring { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; animation: fr-spin 40s linear infinite; }
        .fr-card { position: absolute; top: 50%; left: 50%; transform-style: preserve-3d; }
        .fr-strip { position: absolute; top: 0; left: 50%; transform-origin: 50% 50%;
          background-image: var(--f); background-repeat: no-repeat; box-shadow: inset 0 -2px 4px rgba(0,0,0,0.14); }
        .fr-blank .fr-strip { background-color: rgba(255,255,255,0.055); }
        @keyframes fr-rise { from { opacity: 0; transform: translateY(18px) scale(0.96); } to { opacity: 1; transform: none; } }
        .fr-rise { animation: fr-rise 0.7s cubic-bezier(0.22,1,0.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .fr-ring { animation-duration: 220s; } .fr-rise { animation: none; } }
        ${(flags ?? []).map((f, i) => `.fr-f${i} { --f: ${svgBg(f.svg)}; }`).join('\n        ')}
      `}</style>
      <div className="fr-ring">
        {ring.map((_flag, i) => {
          const box = boxes[i]!;
          return (
            <div key={i} className={`fr-card ${flags ? `fr-f${i % cards.length}` : 'fr-blank'}`} style={{
              width: box.w, height: box.h, marginLeft: -box.w / 2, marginTop: -box.h / 2,
              transform: `rotateY(${angles[i]}deg) translateZ(${radius + box.zOffset}px)`,
            }}>
              <BentCard box={box} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Sits in the intro column's flow, exactly like the Reddit splash: the ring is
// free to spill past its own box and is clipped only by the card's rounded edge.
// Scale follows the card's height, so the band fills it on a phone and on desktop.
export const FlagIntroRing = () => {
  const flags = useMemo(
    () => getDailyFlagPuzzle()
      .map(r => ({ name: r.flag.name, svg: r.flag.svg })),
    [],
  );
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    // offsetParent is the intro card — the ring is sized to it, not to its own slot.
    const card = boxRef.current?.offsetParent as HTMLElement | null;
    if (!card) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry!.contentRect.height;
      const s = Math.max(0.7, Math.min(1.05, (h - 250) / 300));
      setScale(Math.round(s * 20) / 20); // quantised: fractional scale re-renders ~180 strips
    });
    ro.observe(card);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={boxRef} className="fr-rise shrink-0 -mt-3.5 z-[1]">
      <FlagRing3D flags={flags} scale={scale} />
    </div>
  );
};

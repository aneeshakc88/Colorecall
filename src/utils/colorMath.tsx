import React, { useState, useEffect, useRef } from 'react';
import { audio } from './audio';
import { auth } from '../firebase';

export type Color = { h: number; s: number; b: number };

export const hsbToRgb = (h: number, s: number, b: number): [number, number, number] => {
  s /= 100; b /= 100;
  const c = b * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = b - c;
  let r = 0, g = 0, bl = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; bl = x; }
  else if (h < 240) { g = x; bl = c; }
  else if (h < 300) { r = x; bl = c; }
  else { r = c; bl = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((bl + m) * 255)];
};

export const hsbToString = (c: Color, alpha: number = 1) => {
  const [r, g, b] = hsbToRgb(c.h, c.s, c.b);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const getUserId = () => {
  if (auth.currentUser) return auth.currentUser.uid;
  // Pre-auth fallback (brief window before anonymous sign-in resolves on mount).
  let id = localStorage.getItem('recreate_user_id');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('recreate_user_id', id);
  }
  return id;
};

// Rows written before the switch to Firebase-uid identity carry the old
// browser-generated id. Reads (stats, "is this mine" highlighting) match
// against both ids so pre-existing players still see their history; writes
// (rename, etc) stay scoped to the current uid only — see firestore.rules.
export const getMyUserIds = (): string[] => {
  const ids = [getUserId()];
  const legacy = localStorage.getItem('recreate_user_id');
  if (legacy && !ids.includes(legacy)) ids.push(legacy);
  return ids;
};

export const getUserType = () => {
  const hasPlayed = localStorage.getItem('recreate_has_played');
  if (!hasPlayed) {
    localStorage.setItem('recreate_has_played', 'true');
    return 'new';
  }
  return 'returning';
};

export const getDeviceType = () => {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return "tablet";
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return "mobile";
  }
  return "desktop";
};

export const generateSessionId = () => Math.random().toString(36).substring(2, 15);

// --- VERTICAL DIALED.GG STYLE SLIDER ---
export const VerticalSlider = ({
  value, max, onChange, bg, type
}: {
  value: number, max: number, onChange: (v: number) => void, bg: string, type: 'H' | 'S' | 'B'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSoundTime = useRef<number>(0);
  const lastSoundValue = useRef<number>(value);

  const handlePointerEvent = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    if (e.type === 'pointerdown') {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const rect = containerRef.current.getBoundingClientRect();
    let y = e.clientY - rect.top;
    y = Math.max(16, Math.min(y, rect.height - 16));
    const percentage = type === 'H' ? ((y - 16) / (rect.height - 32)) : 1 - ((y - 16) / (rect.height - 32));
    const newValue = Math.round(percentage * max);

    if (newValue !== value) {
      onChange(newValue);

      const now = performance.now();
      if (now - lastSoundTime.current > 40 && Math.abs(newValue - lastSoundValue.current) >= (max * 0.01)) {
        audio.playColorSliderTick(type);
        lastSoundTime.current = now;
        lastSoundValue.current = newValue;
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-10 sm:w-12 lg:w-12 h-full relative cursor-ns-resize touch-none"
      style={{ background: bg }}
      onPointerDown={handlePointerEvent}
      onPointerMove={(e) => e.buttons > 0 && handlePointerEvent(e)}
    >
      <div
        className="absolute left-1/2 w-7 h-7 sm:w-9 sm:h-9 lg:w-6 lg:h-6 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full shadow-lg pointer-events-none z-10 border border-zinc-200"
        style={{ top: `calc(16px + ${(type === 'H' ? value / max : 1 - value / max)} * (100% - 32px))` }}
      />
    </div>
  );
};

// Horizontal so the colour above it stays clear of the player's thumb.
export const HorizontalSlider = ({
  label, value, max, onChange, bg, type, suffix = ''
}: {
  label: string, value: number, max: number, onChange: (v: number) => void, bg: string, type: 'H' | 'S' | 'B', suffix?: string
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSoundTime = useRef<number>(0);

  const set = (newValue: number) => {
    if (newValue === value) return;
    onChange(newValue);
    const now = performance.now();
    if (now - lastSoundTime.current > 40) {
      audio.playColorSliderTick(type);
      lastSoundTime.current = now;
    }
  };

  const handlePointerEvent = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    if (e.type === 'pointerdown') {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const rect = containerRef.current.getBoundingClientRect();
    // Knob is a circle the height of the track, so its centre only travels between the inset ends.
    const span = rect.width - rect.height;
    const frac = span > 0 ? (e.clientX - rect.left - rect.height / 2) / span : 0;
    set(Math.round(Math.max(0, Math.min(1, frac)) * max));
  };

  const handleKey = (e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    set(Math.max(0, Math.min(max, value + dir * (e.shiftKey ? 10 : 1))));
  };

  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between items-baseline text-[10px] sm:text-[11px] tracking-[0.16em] uppercase font-bold text-zinc-600">
        <span>{label}</span>
        <b className="text-xs sm:text-[13px] tracking-normal text-zinc-400 font-semibold tabular-nums">{value}{suffix}</b>
      </div>
      <div
        ref={containerRef}
        className="relative h-10 sm:h-12 rounded-full cursor-ew-resize touch-none select-none border border-white/10"
        style={{ background: bg }}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={handlePointerEvent}
        onPointerMove={(e) => e.buttons > 0 && handlePointerEvent(e)}
        onKeyDown={handleKey}
      >
        <div className="absolute inset-y-0 left-5 right-5 sm:left-6 sm:right-6 pointer-events-none">
          <div
            className="absolute top-1/2 w-10 h-10 sm:w-12 sm:h-12 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.6)] border-2 border-white/90 z-10"
            style={{ left: `${(value / max) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

// `settle` (opt-in): tick as the shown whole number changes and finish the moment the shown digits read the final
// value (once `minMs` has passed), instead of at the end of the ease where the rounded number has long since stopped.
export type ScoreTiming = { delay?: number; duration?: number; minMs?: number; settle?: boolean };

export const AnimatedScore =({ value, onComplete, decimals = 2, timing }: { value: number, onComplete?: () => void, decimals?: number, timing?: ScoreTiming }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const lastTickTime = useRef(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const { delay = 0, duration = 1500, minMs = 0, settle = false } = timing ?? {};
    let animationFrameId: number;
    let lastWhole = 0;
    let lastShownWhole = 0;
    const finalText = value.toFixed(decimals);

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp + delay;
      if (timestamp < startTimestamp) {
        animationFrameId = window.requestAnimationFrame(step);
        return;
      }
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      const shown = easeProgress * value;
      setDisplayValue(shown);

      let done = progress >= 1;
      if (settle) {
        const text = shown.toFixed(decimals);
        const shownWhole = Math.floor(Number(text));
        if (shownWhole !== lastShownWhole) {
          if (timestamp - lastTickTime.current >= 35) {
            audio.playScoreRollTick();
            lastTickTime.current = timestamp;
          }
          lastShownWhole = shownWhole;
        }
        done ||= text === finalText && elapsed >= minMs;
      } else {
        // Tick only when the whole number visibly rolls over, so the clicks slow down with the count
        // (a fixed-rate tick kept clicking long after the number had stopped moving, and even for a 0).
        const whole = Math.floor(shown);
        if (whole > lastWhole && timestamp - lastTickTime.current >= 35) {
          audio.playScoreRollTick();
          lastTickTime.current = timestamp;
          lastWhole = whole;
        }
      }

      if (!done) {
        animationFrameId = window.requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
        if (onCompleteRef.current) onCompleteRef.current();
      }
    };

    animationFrameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [value]);

  return <>{displayValue.toFixed(decimals)}</>;
};

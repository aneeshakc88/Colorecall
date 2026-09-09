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

export const AnimatedScore = ({ value, onComplete }: { value: number, onComplete?: () => void }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const lastTickTime = useRef(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 1500;
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(easeProgress * value);

      if (timestamp - lastTickTime.current > 50 && progress < 1) {
        audio.playScoreRollTick();
        lastTickTime.current = timestamp;
      }

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
        if (onCompleteRef.current) onCompleteRef.current();
      }
    };

    animationFrameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [value]);

  return <>{displayValue.toFixed(2)}</>;
};

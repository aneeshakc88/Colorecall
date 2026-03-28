import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getDynamicFeedback } from './utils';
import { ArrowRight, RotateCcw } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

type Color = { h: number; s: number; l: number };
type GameState = 'ready' | 'memorize' | 'recreate' | 'result' | 'final';

const allIcons = Object.entries(LucideIcons)
  .filter(([key, value]) => {
    return /^[A-Z]/.test(key) && 
           key !== 'Icon' && 
           key !== 'LucideIcon' && 
           key !== 'createLucideIcon' && 
           key !== 'defaultAttributes' &&
           typeof value === 'object';
  })
  .map(([_, value]) => value as React.ElementType);

const OBJECTS = allIcons.slice(0, 500);

// --- DAILY SEEDED RANDOM GENERATOR ---
const mulberry32 = (a: number) => {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
};

const getDailySeed = () => {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};

const random = mulberry32(getDailySeed());

const generateSeededColor = (): Color => ({
  h: Math.floor(random() * 360),
  s: 20 + Math.floor(random() * 81),
  l: 20 + Math.floor(random() * 61)
});

const DAILY_ROUNDS = Array.from({ length: 4 }, () => ({
  color: generateSeededColor(),
  objectIndex: Math.floor(random() * OBJECTS.length)
}));

const calculateScore = (target: Color, user: Color): number => {
  const hDiff = Math.min(Math.abs(target.h - user.h), 360 - Math.abs(target.h - user.h));
  const sDiff = Math.abs(target.s - user.s);
  const lDiff = Math.abs(target.l - user.l);
  
  const error = hDiff + sDiff + lDiff;
  return Math.max(0, Math.round(25 * (1 - error / 120)));
};

// Removed getScoreText

const hslToString = (c: Color, alpha: number = 1) => `hsl(${c.h}, ${c.s}%, ${c.l}%, ${alpha})`;

// --- INNOVATIVE VERTICAL PILLAR SLIDER ---
const VerticalPillar = ({ 
  label, value, max, onChange, bg 
}: { 
  label: string, value: number, max: number, onChange: (v: number) => void, bg: string 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerEvent = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    if (e.type === 'pointerdown') {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const rect = containerRef.current.getBoundingClientRect();
    let y = e.clientY - rect.top;
    y = Math.max(0, Math.min(y, rect.height));
    const percentage = 1 - (y / rect.height);
    onChange(Math.round(percentage * max));
  };

  return (
    <div className="flex flex-col items-center h-full w-14 sm:w-16 md:w-20 lg:w-24 group">
      <div className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-zinc-400 font-medium mb-3 md:mb-4">{label}</div>
      
      <div 
        ref={containerRef}
        className="flex-1 w-full relative cursor-ns-resize touch-none rounded-2xl overflow-hidden bg-zinc-900/80 backdrop-blur-xl shadow-[inset_0_4px_20px_rgba(0,0,0,0.5)] border border-white/10 transition-colors hover:border-white/20"
        onPointerDown={handlePointerEvent}
        onPointerMove={(e) => e.buttons > 0 && handlePointerEvent(e)}
      >
        {/* Full Background Gradient */}
        <div className="absolute inset-0 opacity-60 group-hover:opacity-100 transition-opacity duration-300" style={{ background: bg }} />
        
        {/* Dark Overlay masking the unselected top portion */}
        <div 
          className="absolute top-0 inset-x-0 bg-zinc-950/95 backdrop-blur-2xl transition-all duration-75 ease-out border-b border-white/10"
          style={{ height: `${100 - (value / max) * 100}%` }}
        />
        
        {/* Glowing Indicator Thumb */}
        <div 
          className="absolute inset-x-1 h-2 bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.8)] transition-all duration-75 ease-out z-10"
          style={{ bottom: `calc(${(value / max) * 100}% - 4px)` }}
        />
      </div>

      <div className="text-xs md:text-sm font-mono text-zinc-300 mt-3 md:mt-4 bg-zinc-900/50 px-3 py-1 rounded-full border border-white/5">
        {value.toString().padStart(3, '0')}
      </div>
    </div>
  );
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>('ready');
  const [round, setRound] = useState(1);
  const [targetColor, setTargetColor] = useState<Color>({ h: 0, s: 0, l: 0 });
  const [userColor, setUserColor] = useState<Color>({ h: 180, s: 50, l: 50 });
  const [score, setScore] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [targetObject, setTargetObject] = useState<React.ElementType>(OBJECTS[0]);

  const startRound = (r: number) => {
    setRound(r);
    setTargetColor(DAILY_ROUNDS[r - 1].color);
    setUserColor({ h: 180, s: 50, l: 50 });
    setTargetObject(() => OBJECTS[DAILY_ROUNDS[r - 1].objectIndex]);
    setCountdown(3);
    setGameState('ready');
  };

  useEffect(() => {
    startRound(1);
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (gameState === 'ready') {
      if (countdown > 0) {
        timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      } else {
        setGameState('memorize');
        setCountdown(5);
      }
    } else if (gameState === 'memorize') {
      if (countdown > 0) {
        timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      } else {
        setGameState('recreate');
      }
    }
    return () => clearTimeout(timer);
  }, [gameState, countdown]);

  const handleSubmit = () => {
    const roundScore = calculateScore(targetColor, userColor);
    setScore(roundScore);
    setTotalScore(prev => prev + roundScore);
    setGameState('result');
  };

  const handleNextRound = () => {
    if (round < 4) {
      startRound(round + 1);
    } else {
      setGameState('final');
    }
  };

  const resetGame = () => {
    setTotalScore(0);
    startRound(1);
  };

  const ObjectIcon = targetObject;

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-zinc-950 text-zinc-100 font-sans overflow-hidden selection:bg-white selection:text-black">
      
      {/* LEFT PANE: The Canvas */}
      <div className="w-full h-[40vh] md:w-1/2 md:h-screen relative flex flex-col bg-zinc-950 overflow-hidden border-b md:border-b-0 md:border-r border-white/5 shadow-2xl z-10">
        {/* Dynamic Glow Background */}
        <div 
          className="absolute inset-0 opacity-30 transition-colors duration-1000 ease-in-out"
          style={{ 
            background: `radial-gradient(circle at center, ${
              gameState === 'recreate' ? hslToString(userColor) : 
              (gameState === 'memorize' || gameState === 'ready') ? hslToString(targetColor) : 
              'transparent'
            } 0%, transparent 70%)` 
          }}
        />
        {/* Subtle noise texture for an "art gallery" feel */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none z-50 mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
        
        <AnimatePresence mode="wait">
          {gameState === 'result' ? (
            <motion.div 
              key="split-canvas"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full flex flex-row"
            >
              <div className="flex-1 relative flex flex-col items-center justify-center p-6 border-r border-white/5">
                <ObjectIcon 
                  size={120} 
                  color={hslToString(targetColor)} 
                  fill={hslToString(targetColor)}
                  strokeWidth={1.5} 
                  style={{ filter: `drop-shadow(0 0 30px ${hslToString(targetColor, 0.4)})` }}
                />
                <div className="absolute bottom-6 md:bottom-12 text-center">
                  <p className="text-[10px] tracking-[0.2em] uppercase text-zinc-500 mb-1">Original</p>
                  <p className="font-serif text-xl md:text-2xl tracking-tight text-white">H{targetColor.h} S{targetColor.s} L{targetColor.l}</p>
                </div>
              </div>
              <div className="flex-1 relative flex flex-col items-center justify-center p-6">
                <ObjectIcon 
                  size={120} 
                  color={hslToString(userColor)} 
                  fill={hslToString(userColor)}
                  strokeWidth={1.5} 
                  style={{ filter: `drop-shadow(0 0 30px ${hslToString(userColor, 0.4)})` }}
                />
                <div className="absolute bottom-6 md:bottom-12 text-center">
                  <p className="text-[10px] tracking-[0.2em] uppercase text-zinc-500 mb-1">Your Vision</p>
                  <p className="font-serif text-xl md:text-2xl tracking-tight text-white">H{userColor.h} S{userColor.s} L{userColor.l}</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="single-canvas"
              className="w-full h-full absolute inset-0 flex items-center justify-center"
            >
              {gameState === 'memorize' && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
                  animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                  exit={{ scale: 1.1, opacity: 0, filter: 'blur(10px)' }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                >
                  <ObjectIcon 
                    size={200} 
                    color={hslToString(targetColor)} 
                    fill={hslToString(targetColor)}
                    strokeWidth={1} 
                    style={{ filter: `drop-shadow(0 0 40px ${hslToString(targetColor, 0.5)})` }}
                  />
                </motion.div>
              )}
              {gameState === 'recreate' && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <ObjectIcon 
                    size={200} 
                    color={hslToString(userColor)} 
                    fill={hslToString(userColor)}
                    strokeWidth={1} 
                    style={{ filter: `drop-shadow(0 0 40px ${hslToString(userColor, 0.5)})` }}
                  />
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* RIGHT PANE: The Interface */}
      <div className="w-full h-[60vh] md:w-1/2 md:h-screen relative flex flex-col justify-center p-6 md:p-16 lg:p-24 bg-zinc-950/50">
        
        {/* Top Header */}
        <div className="absolute top-6 left-6 right-6 flex justify-between items-center md:top-10 md:left-12 md:right-12 lg:top-12 lg:left-16 lg:right-16 z-10">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
            <span className="text-xs md:text-sm font-bold tracking-[0.3em] uppercase text-white">Daily Chroma</span>
          </div>
          <p className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-zinc-400 font-medium bg-zinc-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg">
            {gameState === 'final' ? 'Exhibition Complete' : `Exhibition ${round} / 4`}
          </p>
        </div>

        <div className="w-full max-w-lg mx-auto relative flex flex-col h-full justify-center mt-8 md:mt-0">
          <AnimatePresence mode="wait">
            
            {/* STATE: READY */}
            {gameState === 'ready' && (
              <motion.div 
                key="ready"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <h1 className="font-serif text-6xl md:text-8xl tracking-tighter mb-6 text-white">
                  {countdown > 0 ? countdown : 'Begin.'}
                </h1>
                <p className="text-zinc-400 text-sm tracking-widest uppercase">Prepare your perception.</p>
              </motion.div>
            )}

            {/* STATE: MEMORIZE */}
            {gameState === 'memorize' && (
              <motion.div 
                key="memorize"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="text-zinc-500 text-xs tracking-[0.2em] uppercase mb-4">Observe</p>
                <h2 className="font-serif text-8xl md:text-[10rem] tracking-tighter leading-none text-white">
                  {countdown}
                </h2>
                <p className="text-zinc-400 text-sm tracking-widest uppercase mt-6">Seconds remaining.</p>
              </motion.div>
            )}

            {/* STATE: RECREATE */}
            {gameState === 'recreate' && (
              <motion.div 
                key="recreate"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="w-full h-full flex flex-col"
              >
                <div className="flex justify-between items-end mb-8">
                  <p className="text-zinc-500 text-xs tracking-[0.2em] uppercase">Reconstruct</p>
                  <button 
                    onClick={handleSubmit}
                    className="px-6 py-3 border border-zinc-700 hover:border-white text-[10px] md:text-xs tracking-[0.2em] uppercase transition-colors duration-300 flex items-center gap-3 group"
                  >
                    Confirm
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform duration-300" />
                  </button>
                </div>
                
                {/* Vertical Pillars Container */}
                <div className="flex-1 min-h-[200px] md:min-h-[250px] flex justify-center gap-4 sm:gap-8 md:gap-12 lg:gap-16 py-2 md:py-4">
                  <VerticalPillar 
                    label="Hue" 
                    value={userColor.h} 
                    max={360} 
                    onChange={(v) => setUserColor(prev => ({ ...prev, h: v }))} 
                    bg="linear-gradient(to top, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
                  />
                  <VerticalPillar 
                    label="Sat" 
                    value={userColor.s} 
                    max={100} 
                    onChange={(v) => setUserColor(prev => ({ ...prev, s: v }))} 
                    bg={`linear-gradient(to top, hsl(${userColor.h}, 0%, ${userColor.l}%), hsl(${userColor.h}, 100%, ${userColor.l}%))`}
                  />
                  <VerticalPillar 
                    label="Lum" 
                    value={userColor.l} 
                    max={100} 
                    onChange={(v) => setUserColor(prev => ({ ...prev, l: v }))} 
                    bg={`linear-gradient(to top, #000, hsl(${userColor.h}, ${userColor.s}%, 50%), #fff)`}
                  />
                </div>
              </motion.div>
            )}

            {/* STATE: RESULT */}
            {gameState === 'result' && (
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="text-zinc-500 text-xs tracking-[0.2em] uppercase mb-4">Accuracy</p>
                <div className="flex items-baseline gap-2 mb-6">
                  <h2 className="font-serif text-8xl md:text-[9rem] tracking-tighter leading-none text-white">
                    {score}
                  </h2>
                  <span className="text-2xl text-zinc-600 font-serif">/25</span>
                </div>
                <p className="text-zinc-300 text-lg md:text-xl font-serif italic mb-12">
                  "{getDynamicFeedback(score, null, true)}"
                </p>

                <button 
                  onClick={handleNextRound}
                  className="px-8 py-4 bg-white text-black hover:bg-zinc-200 text-xs tracking-[0.2em] uppercase transition-colors duration-300 w-full md:w-auto flex items-center justify-center gap-4 group"
                >
                  {round < 4 ? 'Next Canvas' : 'View Gallery'}
                  <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform duration-300" />
                </button>
              </motion.div>
            )}

            {/* STATE: FINAL */}
            {gameState === 'final' && (
              <motion.div 
                key="final"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="text-zinc-500 text-xs tracking-[0.2em] uppercase mb-4">Total Mastery</p>
                <div className="flex items-baseline gap-2 mb-6">
                  <h2 className="font-serif text-8xl md:text-[10rem] tracking-tighter leading-none text-white">
                    {totalScore}
                  </h2>
                  <span className="text-2xl text-zinc-600 font-serif">/100</span>
                </div>
                <p className="text-zinc-300 text-lg md:text-xl font-serif italic mb-12">
                  {totalScore >= 90 ? '"A master of the spectrum."' : 
                   totalScore >= 70 ? '"A highly refined eye."' : 
                   totalScore >= 40 ? '"An emerging perspective."' : '"Vision requires practice."'}
                </p>

                <button 
                  onClick={resetGame}
                  className="px-8 py-4 border border-zinc-700 hover:border-white text-xs tracking-[0.2em] uppercase transition-colors duration-300 w-full md:w-auto flex items-center justify-center gap-4 group"
                >
                  <RotateCcw size={16} className="group-hover:-rotate-180 transition-transform duration-500" />
                  Restart Exhibition
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

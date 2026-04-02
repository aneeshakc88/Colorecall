import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Share2, Trophy, User, Calendar, Send, Volume2, VolumeX, RefreshCw } from 'lucide-react';
import * as FaIcons from 'react-icons/fa';
import { db } from './firebase';
import { getDynamicFeedback } from './utils';
import { audio } from './utils/audio';
import { initGA, trackPageView, trackButtonClick, trackGameStart, trackGameEnd } from './analytics';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, where, Timestamp, updateDoc, doc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, User as FirebaseUser } from 'firebase/auth';
import { auth } from './firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

type Color = { h: number; s: number; b: number };
type GameState = 'start' | 'ready' | 'memorize' | 'recreate' | 'result' | 'final';

type RoundData = {
  targetColor: Color;
  userColor: Color;
  targetObjectIndex: number;
  userObjectIndex: number;
  score: number;
};

const allIcons = Object.entries(FaIcons)
  .filter(([key, value]) => typeof value === 'function' && key !== 'FaTimes')
  .map(([_, value]) => value as React.ElementType);

const OBJECTS = allIcons.slice(0, 500);

// --- DAILY SEEDED RANDOM GENERATOR ---
const CYCLE_HOURS = 18;
const EPOCH = new Date('2024-01-01T00:00:00Z').getTime();

const getCurrentCycle = () => {
  return Math.floor((Date.now() - EPOCH) / (CYCLE_HOURS * 60 * 60 * 1000));
};

const getNextResetTime = () => {
  const currentCycle = getCurrentCycle();
  return (currentCycle + 1) * (CYCLE_HOURS * 60 * 60 * 1000) + EPOCH;
};

const mulberry32 = (a: number) => {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
};

const poolRandom = mulberry32(42);

const generateSeededColor = (rng: () => number): Color => ({
  h: Math.floor(rng() * 360),
  s: 20 + Math.floor(rng() * 81),
  b: 20 + Math.floor(rng() * 61)
});

const DAILY_POOL = Array.from({ length: 2000 }, () => {
  const targetIndex = Math.floor(poolRandom() * OBJECTS.length);
  const options = new Set<number>([targetIndex]);
  while(options.size < 10) {
    options.add(Math.floor(poolRandom() * OBJECTS.length));
  }
  const optionsArray = Array.from(options);
  for (let i = optionsArray.length - 1; i > 0; i--) {
    const j = Math.floor(poolRandom() * (i + 1));
    [optionsArray[i], optionsArray[j]] = [optionsArray[j], optionsArray[i]];
  }
  return {
    color: generateSeededColor(poolRandom),
    objectIndex: targetIndex,
    options: optionsArray
  };
});

const hsbToRgb = (h: number, s: number, b: number): [number, number, number] => {
  s /= 100; b /= 100;
  const c = b * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = b - c;
  let r = 0, g = 0, bl = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; bl = x; }
  else if (h < 240) { g = x; bl = c; }
  else if (h < 300) { r = x; bl = c; }
  else              { r = c; bl = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((bl + m) * 255)];
};

const rgbToLab = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255; g /= 255; b /= 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  let x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  let y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750);
  let z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};

const getAnalyticsModeName = (mode: string) => {
  switch(mode) {
    case 'daily': return 'Classic - Daily';
    case 'solo': return 'Classic - QuickPlay';
    case 'duo': return 'Duo - Daily';
    case 'duo-quickplay': return 'Duo - QuickPlay';
    default: return mode;
  }
};

const calculateScore = (target: Color, user: Color, targetObj: React.ElementType, userObj: React.ElementType, mode: 'daily' | 'solo' | 'duo' | 'duo-quickplay'): number => {
  const [r1, g1, bl1] = hsbToRgb(target.h, target.s, target.b);
  const [r2, g2, bl2] = hsbToRgb(user.h, user.s, user.b);
  const [L1, a1, b1L] = rgbToLab(r1, g1, bl1);
  const [L2, a2, b2L] = rgbToLab(r2, g2, bl2);

  // CIE76 Delta E — perceptual color distance
  const dE = Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1L - b2L) ** 2);
  
  // Sigmoid curve: tighter precision required for high scores
  const base = 10 / (1 + Math.pow(dE / 32, 1.6));

  // Hue-aware adjustments
  const hueDiff = Math.min(Math.abs(target.h - user.h), 360 - Math.abs(target.h - user.h));
  const avgSat = (target.s + user.s) / 2;

  // Recovery: if hue is within ~25°, recover up to 40% of lost points.
  const hueAcc = Math.max(0, 1 - Math.pow(hueDiff / 25, 1.5));
  const satWeightR = Math.min(1, avgSat / 30);
  const recovery = (10 - base) * hueAcc * satWeightR * 0.40;

  // Penalty: if hue is off by >40°, subtract points.
  const huePenFactor = Math.max(0, (hueDiff - 40) / 140);
  const satWeightP = Math.min(1, avgSat / 40);
  const penalty = base * huePenFactor * satWeightP * 0.3;

  const raw = base + recovery - penalty;
  const jitter = raw < 9.8 ? (Math.random() - 0.5) * 0.08 : 0;
  const dialedScore = Math.max(0, Math.min(10, raw + jitter));

  // Scale dialed.gg's 10-point score to our 25-point system
  let totalScore = 0;
  if (mode.startsWith('duo')) {
    totalScore = 2.5 * dialedScore;
  } else {
    // 80% for color (max 20), 20% for shape (max 5)
    let colorScore = 2.0 * dialedScore;
    let shapeScore = targetObj === userObj ? 5 : 0;
    totalScore = colorScore + shapeScore;
  }
  
  return Number(totalScore.toFixed(2));
};

const getScoreText = (score: number) => {
  if (score >= 24.5) return "Flawless.";
  if (score >= 23) return "Incredible.";
  if (score >= 20) return "Great job.";
  if (score >= 15) return "Not bad.";
  if (score >= 10) return "Needs work.";
  return "That's not it.";
};

const hsbToString = (c: Color, alpha: number = 1) => {
  const [r, g, b] = hsbToRgb(c.h, c.s, c.b);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const STATIC_LEADERBOARD = (() => {
  const parts = ["VS", "Int", "Xy", "Qo", "Pl", "Tr", "Mn", "Bk", "Jz", "Wq", "Vn", "Cr", "Op", "Am", "Jd", "Rb", "Sp", "Tp", "Br", "On"];
  const scores = [];
  let currentScore = 95.0;
  for (let i = 0; i < 120; i++) {
    const name = parts[Math.floor(Math.random() * parts.length)] + parts[Math.floor(Math.random() * parts.length)];
    scores.push({ name, score: Number(currentScore.toFixed(2)) });
    currentScore -= 0.4 + Math.random() * 0.2;
  }
  return scores;
})();

const AnimatedScore = ({ value, onComplete }: { value: number, onComplete?: () => void }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const lastTickTime = useRef(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 1500; // 1.5 seconds
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 4); // easeOutQuart
      setDisplayValue(easeProgress * value);
      
      // Play roll sound every ~50ms
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

// --- VERTICAL DIALED.GG STYLE SLIDER ---
const VerticalSlider = ({ 
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
      // Throttle sound to avoid machine gun effect (max once every 40ms, and only if value changed enough)
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
      className="w-6 sm:w-10 md:w-12 h-full relative cursor-ns-resize touch-none"
      style={{ background: bg }}
      onPointerDown={handlePointerEvent}
      onPointerMove={(e) => e.buttons > 0 && handlePointerEvent(e)}
    >
      {/* Glowing Indicator Thumb */}
      <div 
        className="absolute left-1/2 w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full shadow-lg pointer-events-none z-10 border border-zinc-200"
        style={{ top: `calc(16px + ${(type === 'H' ? value / max : 1 - value / max)} * (100% - 32px))` }}
      />
    </div>
  );
};

const getUserId = () => {
  let id = localStorage.getItem('recreate_user_id');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('recreate_user_id', id);
  }
  return id;
};

const getUserType = () => {
  const hasPlayed = localStorage.getItem('recreate_has_played');
  if (!hasPlayed) {
    localStorage.setItem('recreate_has_played', 'true');
    return 'new';
  }
  return 'returning';
};

const getDeviceType = () => {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return "tablet";
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return "mobile";
  }
  return "desktop";
};

const generateSessionId = () => Math.random().toString(36).substring(2, 15);

const SplashParticles = ({ triggerKey }: { triggerKey: number }) => {
  const multiColors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];
  
  const particles = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 1200,
    y: -Math.random() * 800 - 200,
    scale: Math.random() * 1.5 + 0.5,
    delay: Math.random() * 0.1,
    duration: Math.random() * 0.6 + 0.6,
    color: multiColors[Math.floor(Math.random() * multiColors.length)]
  })), [triggerKey]);

  if (triggerKey === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      <div className="absolute bottom-16 left-1/2">
        {particles.map(p => (
          <motion.div
            key={`${triggerKey}-${p.id}`}
            initial={{ opacity: 1, x: 0, y: 0, scale: 0 }}
            animate={{ 
              opacity: [0, 1, 1, 0], 
              x: [0, p.x * 0.8, p.x, p.x * 1.05], 
              y: [0, p.y * 0.8, p.y, p.y + 150], 
              scale: [0, p.scale, p.scale, p.scale * 0.8] 
            }}
            transition={{ 
              duration: p.duration, 
              delay: p.delay, 
              times: [0, 0.2, 0.8, 1],
              ease: ["easeOut", "easeOut", "easeIn"] 
            }}
            className="absolute w-4 h-4 rounded-full -ml-2 -mt-2 shadow-md"
            style={{ backgroundColor: p.color }}
          />
        ))}
      </div>
    </div>
  );
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>('start');
  const [gameMode, setGameMode] = useState<'daily' | 'solo' | 'duo' | 'duo-quickplay'>('daily');
  const [round, setRound] = useState(1);
  const [targetColor, setTargetColor] = useState<Color>({ h: 0, s: 0, b: 0 });
  const [distractorColor, setDistractorColor] = useState<Color>({ h: 0, s: 0, b: 0 });
  const [userColor, setUserColor] = useState<Color>({ h: 180, s: 50, b: 100 });
  const [score, setScore] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [roundData, setRoundData] = useState<RoundData[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [targetObject, setTargetObject] = useState<React.ElementType>(OBJECTS[0]);
  const [distractorObject, setDistractorObject] = useState<React.ElementType>(OBJECTS[0]);
  const [duoTargetPosition, setDuoTargetPosition] = useState<0 | 1>(0);
  const [userObject, setUserObject] = useState<React.ElementType>(OBJECTS[0]);
  const [hasPlayedToday, setHasPlayedToday] = useState(false);
  const [hasPlayedDuoToday, setHasPlayedDuoToday] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<'daily' | 'quickplay'>('daily');
  const [showScoreText, setShowScoreText] = useState(false);
  const [currentOptions, setCurrentOptions] = useState<number[]>([]);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('mastery_player_name') || '');
  const [isPosting, setIsPosting] = useState(false);
  const [isHoveringDaily, setIsHoveringDaily] = useState(false);

  const getCollectionName = (mode: string) => {
    switch (mode) {
      case 'daily': return 'classic_daily_scores';
      case 'solo': return 'classic_quickplay_scores';
      case 'duo': return 'duo_daily_scores';
      case 'duo-quickplay': return 'duo_quickplay_scores';
      default: return 'classic_daily_scores';
    }
  };
  const [isHoveringQuickPlay, setIsHoveringQuickPlay] = useState(false);
  const [isHoveringDuo, setIsHoveringDuo] = useState(false);
  const [isHoveringScore, setIsHoveringScore] = useState(false);
  const [gameEdition, setGameEdition] = useState<'duo' | 'classic'>('duo');
  const [splashTrigger, setSplashTrigger] = useState(0);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const isAdmin = user?.email === 'aneeshakc88@gmail.com';
  const [currentFeedback, setCurrentFeedback] = useState("");
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number; mode?: string }[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [dailyStats, setDailyStats] = useState<{ high: number; avg: number } | null>(null);
  const [duoStats, setDuoStats] = useState<{ high: number; avg: number } | null>(null);
  const [nextDailyCountdown, setNextDailyCountdown] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [currentScoreDocId, setCurrentScoreDocId] = useState<string | null>(null);
  const [cycleOffset, setCycleOffset] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(audio.isEnabled);

  const toggleSound = () => {
    const newState = audio.toggleSound();
    setSoundEnabled(newState);
    if (newState) {
      audio.playClick();
    }
  };

  const getEffectiveCycle = () => getCurrentCycle() + cycleOffset;

  const getDailyDateString = () => {
    const cycleStartTime = getEffectiveCycle() * (CYCLE_HOURS * 60 * 60 * 1000) + EPOCH;
    const d = new Date(cycleStartTime);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
  };

  const fetchDailyStats = async () => {
    try {
      const currentCycle = getEffectiveCycle();
      const q = query(
        collection(db, 'classic_daily_scores'), 
        where('period', '==', currentCycle)
      );
      const querySnapshot = await getDocs(q);
      const scores = querySnapshot.docs.map(doc => doc.data().score as number);
      
      if (scores.length > 0) {
        const high = Math.max(...scores);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        setDailyStats({ high, avg });
      } else {
        setDailyStats(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'classic_daily_scores');
    }
  };

  const fetchDuoStats = async () => {
    try {
      const currentCycle = getEffectiveCycle();
      const q = query(
        collection(db, 'duo_daily_scores'), 
        where('period', '==', currentCycle)
      );
      const querySnapshot = await getDocs(q);
      const scores = querySnapshot.docs.map(doc => doc.data().score as number);
      
      if (scores.length > 0) {
        const high = Math.max(...scores);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        setDuoStats({ high, avg });
      } else {
        setDuoStats(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'duo_daily_scores');
    }
  };

  useEffect(() => {
    initGA();
    trackPageView(window.location.pathname);
    
    // Anonymous auth for production readiness
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        signInAnonymously(auth).catch(err => console.error("Auth error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const nextReset = getNextResetTime();
      const diff = nextReset - now;
      
      if (diff <= 0) {
        setNextDailyCountdown("0h 0m 0s");
        return;
      }
      
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      setNextDailyCountdown(`${h}h ${m}m ${s}s`);
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const fetchScores = async () => {
    try {
      const mode = leaderboardTab === 'daily' ? (gameEdition === 'duo' ? 'duo' : 'daily') : (gameEdition === 'duo' ? 'duo-quickplay' : 'solo');
      const collectionName = getCollectionName(mode);
      const q = query(
        collection(db, collectionName), 
        where('isPosted', '==', true),
        orderBy('score', 'desc'), 
        limit(50)
      );
      const querySnapshot = await getDocs(q);
      const liveScores = querySnapshot.docs.map(doc => ({
        name: doc.data().name || 'Anonymous',
        score: doc.data().score,
        mode: doc.data().mode
      }));
      
      // Get total count for the current mode
      const countQuery = query(collection(db, collectionName), where('isPosted', '==', true));
      const countSnapshot = await getDocs(countQuery);
      
      // Only include static scores if in classic mode, or if they are relevant
      const staticScores = gameEdition === 'classic' && leaderboardTab === 'daily' ? STATIC_LEADERBOARD : [];
      setTotalPlayers(countSnapshot.size + staticScores.length);
      
      const combined = [...liveScores, ...staticScores].sort((a, b) => b.score - a.score);
      setLeaderboard(combined);
    } catch (error) {
      const mode = leaderboardTab === 'daily' ? (gameEdition === 'duo' ? 'duo' : 'daily') : (gameEdition === 'duo' ? 'duo-quickplay' : 'solo');
      const collectionName = getCollectionName(mode);
      handleFirestoreError(error, OperationType.GET, collectionName);
    }
  };

  useEffect(() => {
    if (showScoreboard) {
      fetchScores();
    }
  }, [showScoreboard, gameEdition, leaderboardTab]);

  const postGameHistory = async (finalTotal: number, finalRoundData: RoundData[]) => {
    console.log("Attempting to post game history...", { finalTotal, gameMode });
    try {
      const isDuo = gameMode === 'duo' || gameMode === 'duo-quickplay';
      const collectionName = isDuo ? 'duo_history' : 'classic_history';
      
      await addDoc(collection(db, collectionName), {
        sessionId: currentSessionId || generateSessionId(),
        timestamp: serverTimestamp(),
        totalScore: finalTotal,
        gameMode: gameMode,
        deviceType: getDeviceType(),
        userId: getUserId(),
        roundData: finalRoundData
      });
      console.log("Game history posted successfully to", collectionName);
    } catch (error) {
      console.error("Failed to post game history:", error);
      const isDuo = gameMode === 'duo' || gameMode === 'duo-quickplay';
      handleFirestoreError(error, OperationType.WRITE, isDuo ? 'duo_history' : 'classic_history');
    }
  };

  const autoPostScore = async (finalTotal: number, mode: 'daily' | 'solo' | 'duo' | 'duo-quickplay') => {
    try {
      const collectionName = getCollectionName(mode);
      const isDaily = mode === 'daily' || mode === 'duo';
      const nameToSave = isDaily ? (playerName.trim() || 'BB') : (playerName.trim() || 'Anonymous');
      const isPosted = isDaily ? true : !!playerName.trim();

      const docRef = await addDoc(collection(db, collectionName), {
        sessionId: currentSessionId || generateSessionId(),
        createdAt: serverTimestamp(),
        period: getEffectiveCycle(),
        score: finalTotal,
        mode: mode,
        deviceType: getDeviceType(),
        userId: getUserId(),
        userType: getUserType(),
        name: nameToSave,
        isPosted: isPosted
      });
      setCurrentScoreDocId(docRef.id);
      if (mode === 'daily' || mode === 'solo') fetchDailyStats();
      else fetchDuoStats();
    } catch (error) {
      const collectionName = getCollectionName(mode);
      handleFirestoreError(error, OperationType.WRITE, collectionName);
    }
  };

  const postScore = async () => {
    audio.playClick();
    trackButtonClick('PostScore');
    if (!playerName.trim() || isPosting) return;
    setIsPosting(true);
    console.log("Attempting to post score...", { playerName, totalScore, gameMode });
    localStorage.setItem('mastery_player_name', playerName.trim());
    try {
      const collectionName = getCollectionName(gameMode);
      
      const q = query(
        collection(db, collectionName),
        where('userId', '==', getUserId())
      );
      const querySnapshot = await getDocs(q);
      
      const updatePromises = querySnapshot.docs
        .filter(docSnapshot => docSnapshot.data().isPosted === false)
        .map(docSnapshot => 
          updateDoc(doc(db, collectionName, docSnapshot.id), {
            name: playerName.trim(),
            isPosted: true
          })
        );
      
      if (currentScoreDocId) {
        updatePromises.push(updateDoc(doc(db, collectionName, currentScoreDocId), {
          name: playerName.trim(),
          isPosted: true
        }));
      }
      
      await Promise.all(updatePromises);
      console.log("Score posted successfully to", collectionName);
      
      setShowScoreboard(true);
      setGameState('start');
    } catch (error) {
      console.error("Failed to post score:", error);
      const collectionName = getCollectionName(gameMode);
      handleFirestoreError(error, OperationType.WRITE, collectionName);
    } finally {
      setIsPosting(false);
    }
  };

  const startRound = (r: number, mode: 'daily' | 'solo' | 'duo' | 'duo-quickplay' = gameMode) => {
    setRound(r);
    setGameMode(mode);
    
    if (r === 1) {
      setCurrentScoreDocId(null);
      if (mode === 'daily') {
        setCurrentSessionId(generateSessionId());
      }
    }

    let roundInfo;
    if (mode === 'daily') {
      roundInfo = DAILY_POOL[(getEffectiveCycle() * 4 + (r - 1)) % 2000];
    } else {
      const targetIndex = Math.floor(Math.random() * OBJECTS.length);
      const options = new Set<number>([targetIndex]);
      while(options.size < 10) {
        options.add(Math.floor(Math.random() * OBJECTS.length));
      }
      const optionsArray = Array.from(options);
      for (let i = optionsArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [optionsArray[i], optionsArray[j]] = [optionsArray[j], optionsArray[i]];
      }
      roundInfo = {
        color: {
          h: Math.floor(Math.random() * 360),
          s: 20 + Math.floor(Math.random() * 81),
          b: 20 + Math.floor(Math.random() * 61)
        },
        objectIndex: targetIndex,
        options: optionsArray
      };
    }
    
    setTargetColor(roundInfo.color);
    setUserColor({ h: 180, s: 50, b: 100 });
    setTargetObject(() => OBJECTS[roundInfo.objectIndex]);
    setUserObject(() => mode.startsWith('duo') ? OBJECTS[roundInfo.objectIndex] : OBJECTS[roundInfo.options[0]]);
    setCurrentOptions(roundInfo.options);

    if (mode.startsWith('duo')) {
      setDistractorColor({
        h: Math.floor(Math.random() * 360),
        s: 20 + Math.floor(Math.random() * 81),
        b: 20 + Math.floor(Math.random() * 61)
      });
      let distractorIdx = Math.floor(Math.random() * OBJECTS.length);
      while (distractorIdx === roundInfo.objectIndex) {
        distractorIdx = Math.floor(Math.random() * OBJECTS.length);
      }
      setDistractorObject(() => OBJECTS[distractorIdx]);
      setDuoTargetPosition(Math.random() > 0.5 ? 1 : 0);
    }

    setCountdown(2);
    setGameState('ready');
  };

  useEffect(() => {
    const currentCycle = getEffectiveCycle();
    const savedState = localStorage.getItem('daily_chroma_state');
    
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed.cycleId === currentCycle && parsed.completed) {
          setHasPlayedToday(true);
        } else if (parsed.cycleId !== currentCycle) {
          setHasPlayedToday(false);
        }
      } catch (e) {
        console.error("Failed to parse saved state");
      }
    }

    const savedDuoState = localStorage.getItem('duo_daily_chroma_state');
    if (savedDuoState) {
      try {
        const parsedDuo = JSON.parse(savedDuoState);
        if (parsedDuo.cycleId === currentCycle && parsedDuo.completed) {
          setHasPlayedDuoToday(true);
          fetchDuoStats();
        } else if (parsedDuo.cycleId !== currentCycle) {
          setHasPlayedDuoToday(false);
        }
      } catch (e) {
        console.error("Failed to parse saved duo state");
      }
    }
  }, [cycleOffset]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (gameState === 'ready') {
      if (countdown > 0) {
        audio.playCountdownBeep();
        timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      } else {
        audio.playGoBeep();
        setGameState('memorize');
        // countdown is already 0 here, which triggers the 200ms delay in the 'memorize' block
      }
    } else if (gameState === 'memorize') {
      if (countdown === 0) {
        // Just entered memorize state. Wait 200ms before starting the 5s countdown.
        timer = setTimeout(() => {
          setCountdown(5);
        }, 200);
      } else if (countdown === 5) {
        timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      } else if (countdown > 1) {
        audio.playTick();
        timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      } else if (countdown === 1) {
        audio.playTick();
        timer = setTimeout(() => {
          setGameState('recreate');
        }, 1000);
      }
    }
    return () => clearTimeout(timer);
  }, [gameState, countdown]);

  const handleSubmit = () => {
    audio.playClick();
    trackButtonClick('Submit');
    const roundScore = calculateScore(targetColor, userColor, targetObject, userObject, gameMode);
    
    if (roundScore > 85) {
      audio.playSuccess();
    } else {
      audio.playClick();
    }

    setScore(roundScore);
    setTotalScore(prev => prev + roundScore);
    
    // Calculate feedback once to prevent flickering
    const prevScore = round > 1 ? roundData[round - 2]?.score : null;
    const feedback = getDynamicFeedback(roundScore, prevScore, targetObject === userObject);
    setCurrentFeedback(feedback);
    
    const targetObjectIndex = OBJECTS.indexOf(targetObject);
    const userObjectIndex = OBJECTS.indexOf(userObject);
    
    setRoundData(prev => {
      const newData = [...prev];
      newData[round - 1] = {
        targetColor,
        userColor,
        targetObjectIndex,
        userObjectIndex,
        score: roundScore
      };
      return newData;
    });
    setShowScoreText(false);
    setGameState('result');
  };

  const handleNextRound = () => {
    audio.playClick();
    if (round < 4) {
      startRound(round + 1, gameMode);
    } else {
      trackGameEnd(totalScore, getAnalyticsModeName(gameMode));
      const finalTotal = totalScore;
      const finalRoundData = [...roundData];
      
      // Post detailed history for all games
      postGameHistory(finalTotal, finalRoundData).catch(err => console.error("History post failed:", err));
      
      if (gameMode === 'daily') {
        localStorage.setItem('daily_chroma_state', JSON.stringify({
          cycleId: getEffectiveCycle(),
          completed: true,
          totalScore: finalTotal,
          roundData: finalRoundData
        }));
        setHasPlayedToday(true);
        autoPostScore(finalTotal, 'daily');
      } else if (gameMode === 'duo') {
        localStorage.setItem('duo_daily_chroma_state', JSON.stringify({
          cycleId: getEffectiveCycle(),
          completed: true,
          totalScore: finalTotal,
          roundData: finalRoundData
        }));
        setHasPlayedDuoToday(true);
        autoPostScore(finalTotal, 'duo');
      } else if (gameMode === 'solo') {
        autoPostScore(finalTotal, 'solo');
      } else if (gameMode === 'duo-quickplay') {
        autoPostScore(finalTotal, 'duo-quickplay');
      }
      
      setGameState('final');
    }
  };

  const handleShare = () => {
    audio.playClick();
    trackButtonClick('Share');
    let dateStr;
    let grid = "";
    
    if (gameMode === 'daily' || gameMode === 'duo') {
      dateStr = getDailyDateString();
      roundData.forEach(d => {
        if (d.score >= 24) grid += "🟩";
        else if (d.score >= 18) grid += "🟨";
        else if (d.score >= 10) grid += "🟧";
        else grid += "🟥";
      });
    } else {
      const d = new Date();
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      dateStr = `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
      roundData.forEach((d, i) => {
        let emoji = "";
        if (d.score >= 24) emoji = "🟩";
        else if (d.score >= 18) emoji = "🟨";
        else if (d.score >= 10) emoji = "🟧";
        else emoji = "🟥";
        grid += emoji + (i < roundData.length - 1 ? " " : "");
      });
    }
    
    const modeName = gameMode === 'daily' ? 'Classic Daily' 
                   : gameMode === 'solo' ? 'Classic QuickPlay' 
                   : gameMode === 'duo' ? 'Duo Daily' 
                   : 'Duo QuickPlay';
    const text = `${modeName} - ${dateStr}\nScore: ${totalScore.toFixed(2)}/100\n${grid}\nPlay at: https://www.colorecall.com/`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const TargetIcon = targetObject;
  const UserIcon = userObject;

  return (
    <div className="min-h-screen w-full flex flex-col bg-white text-zinc-900 font-sans overflow-y-auto relative selection:bg-black selection:text-white select-none">
      
      {/* Global Volume Toggle */}
      <button 
        onClick={toggleSound}
        className="fixed top-6 right-6 p-3 text-zinc-400 hover:text-black transition-colors z-50 bg-white/80 backdrop-blur-md rounded-full shadow-sm border border-zinc-200"
        aria-label={soundEnabled ? "Mute sound" : "Enable sound"}
      >
        {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
      </button>

      {/* Colorecall Logo */}
      <button 
        onClick={() => {
          audio.playTransition('splash');
          setSplashTrigger(prev => prev + 1);
          setGameState('start');
        }}
        className="fixed top-6 left-6 z-50 hidden lg:block text-2xl font-bold tracking-tighter hover:opacity-80 transition-opacity cursor-pointer"
      >
        Colorecall
      </button>

      {/* Main Content Area */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative p-4 md:p-8">
        
        {/* Central Icon Display */}
        {gameState !== 'final' && gameState !== 'ready' && gameState !== 'result' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <AnimatePresence mode="wait">
              {gameState === 'start' && (
                <div className="relative w-full h-full sm:w-[850px] sm:h-[550px] flex items-center justify-center pointer-events-none">
                  <AnimatePresence mode="wait">
                    {gameEdition === 'duo' ? (
                      <motion.div
                        key="duo-screen"
                        initial={{ clipPath: 'circle(0% at 50% 100%)', scale: 0.8, y: 50 }}
                        animate={{ clipPath: 'circle(150% at 50% 100%)', scale: 1, y: 0 }}
                        exit={{ clipPath: 'circle(0% at 50% 100%)', scale: 1.1, y: -50, zIndex: 10 }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="w-full h-full fixed inset-0 sm:relative sm:w-[850px] sm:h-[550px] bg-black sm:rounded-[3rem] shadow-2xl flex flex-col items-center justify-center p-8 sm:p-12 overflow-hidden pointer-events-auto border border-zinc-800"
                        style={{ transformStyle: 'preserve-3d' }}
                      >
                        {/* Subtle glow effect */}
                        <div className="absolute inset-0 opacity-20 bg-gradient-to-br from-orange-500/20 to-rose-500/20 blur-3xl scale-150 pointer-events-none" />
                        
                        {showScoreboard ? (
                          <div className="flex flex-col w-full max-w-2xl z-10 h-full">
                            <div className="flex justify-between items-center mb-6">
                              <div className="flex items-center gap-3">
                                <Trophy className="text-white" size={24} />
                                <div className="flex flex-col">
                                  <h2 className="text-3xl font-semibold tracking-tight text-white leading-none">Leaderboard</h2>
                                  <span className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-500 mt-1">
                                    {totalPlayers > 0 ? `${totalPlayers} Duo Players` : 'Global Rankings'}
                                  </span>
                                </div>
                              </div>
                              <button onClick={() => { audio.playClick(); setShowScoreboard(false); }} className="text-white hover:opacity-70 transition-opacity font-bold uppercase text-xs tracking-widest">
                                Close
                              </button>
                            </div>
                            <div className="flex justify-center mb-6">
                              <div className="flex bg-zinc-800/50 p-1 rounded-full">
                                <button 
                                  onClick={() => { audio.playClick(); setLeaderboardTab('daily'); }}
                                  className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors ${leaderboardTab === 'daily' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
                                >
                                  Daily
                                </button>
                                <button 
                                  onClick={() => { audio.playClick(); setLeaderboardTab('quickplay'); }}
                                  className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors ${leaderboardTab === 'quickplay' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
                                >
                                  Quick Play
                                </button>
                              </div>
                            </div>
                            <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-2">
                              {leaderboard.length > 0 ? leaderboard.map((entry, i) => (
                                <div key={i} className="flex justify-between items-center p-6 bg-zinc-900 rounded-2xl border border-zinc-800 text-white">
                                  <div className="flex items-center gap-4">
                                    <span className="text-white/50 font-bold w-6 text-lg">{i + 1}</span>
                                    <div className="flex flex-col">
                                      <span className="font-bold text-lg">{entry.name}</span>
                                    </div>
                                  </div>
                                  <span className="font-black text-lg">{entry.score.toFixed(2)}</span>
                                </div>
                              )) : (
                                <div className="py-20 text-white/50 font-bold italic uppercase tracking-widest text-xs text-center">
                                  No scores yet. Be the first.
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col h-full justify-start sm:justify-between items-start w-full max-w-2xl gap-8 sm:gap-4 relative z-10 pt-12 sm:pt-2">
                            <motion.div 
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.2, duration: 0.8 }}
                              className="w-full text-left"
                            >
                              <h1 className="text-6xl sm:text-7xl md:text-8xl font-bold tracking-tighter mb-16 sm:mb-10 leading-[0.8] text-white flex items-baseline gap-2 whitespace-nowrap">
                                DUO
                                <span className="hidden">Color Memory Game</span>
                              </h1>
                              <div className="text-white/80 text-lg sm:text-lg md:text-xl leading-relaxed font-normal flex flex-col justify-start gap-4">
                                <p>Two shapes, two colors. Can you isolate the memory?</p>
                                <p>You have 5 seconds to anchor two colors to their shapes. We'll bring back one shape, see if you can recreate its original color.</p>
                              </div>
                            </motion.div>
                            
                            <motion.div 
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.4, duration: 0.8 }}
                              className="flex flex-col w-full mt-8 pb-12 sm:mt-auto sm:pb-8"
                            >
                              <div className="flex flex-row items-center justify-center gap-3 sm:gap-4 w-full">
                                <button 
                                  onClick={() => {
                                    audio.playClick();
                                    trackButtonClick('Duo');
                                    if (hasPlayedDuoToday) {
                                      const savedState = localStorage.getItem('duo_daily_chroma_state');
                                      if (savedState) {
                                        const parsed = JSON.parse(savedState);
                                        setTotalScore(parsed.totalScore);
                                        setRoundData(parsed.roundData || []);
                                        setRound(parsed.roundData ? parsed.roundData.length : 4);
                                        setGameMode('duo');
                                        setGameState('final');
                                      }
                                    } else {
                                      setTotalScore(0);
                                      setRoundData([]);
                                      startRound(1, 'duo');
                                      trackGameStart('Duo - Daily');
                                    }
                                  }}
                                  className="flex-1 sm:flex-none sm:w-48 py-4 sm:py-5 bg-white text-black font-black rounded-2xl flex items-center justify-center text-lg sm:text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform"
                                >
                                  Daily
                                </button>
                                <button 
                                  onClick={() => {
                                    audio.playClick();
                                    setTotalScore(0);
                                    setRoundData([]);
                                    startRound(1, 'duo-quickplay');
                                    trackGameStart('Duo - QuickPlay');
                                  }}
                                  className="flex-1 sm:flex-none sm:w-48 py-4 sm:py-5 bg-white text-black font-black rounded-2xl flex items-center justify-center text-lg sm:text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform"
                                >
                                  QuickPlay
                                </button>
                                <button 
                                  onClick={() => {
                                    audio.playClick();
                                    trackButtonClick('Score');
                                    setShowScoreboard(true);
                                  }}
                                  className="p-4 sm:p-5 bg-zinc-800 text-white rounded-2xl flex items-center justify-center hover:bg-zinc-700 active:scale-95 transition-all"
                                >
                                  <Trophy size={24} />
                                </button>
                              </div>
                            </motion.div>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="classic-screen"
                        initial={{ clipPath: 'circle(0% at 50% 100%)', scale: 0.8, y: 50 }}
                        animate={{ clipPath: 'circle(150% at 50% 100%)', scale: 1, y: 0 }}
                        exit={{ clipPath: 'circle(0% at 50% 100%)', scale: 1.1, y: -50, zIndex: 10 }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="w-full h-full fixed inset-0 sm:relative sm:w-[850px] sm:h-[550px] bg-white sm:rounded-[3rem] shadow-2xl flex flex-col items-center justify-center p-8 sm:p-12 overflow-hidden pointer-events-auto border border-zinc-100"
                      >
                        {showScoreboard ? (
                          <div className="flex flex-col w-full h-full">
                            <div className="flex justify-between items-center mb-6">
                              <div className="flex items-center gap-3">
                                <Trophy className="text-amber-500" size={24} />
                                <div className="flex flex-col">
                                  <h2 className="text-3xl font-semibold tracking-tight text-black leading-none">Leaderboard</h2>
                                  <span className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-400 mt-1">
                                    {totalPlayers > 0 ? `${totalPlayers} Classic Players` : 'Global Rankings'}
                                  </span>
                                </div>
                              </div>
                              <button onClick={() => { audio.playClick(); setShowScoreboard(false); }} className="text-black hover:opacity-70 transition-opacity font-bold uppercase text-xs tracking-widest">
                                Close
                              </button>
                            </div>
                            <div className="flex justify-center mb-6">
                              <div className="flex bg-zinc-100 p-1 rounded-full">
                                <button 
                                  onClick={() => { audio.playClick(); setLeaderboardTab('daily'); }}
                                  className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors ${leaderboardTab === 'daily' ? 'bg-black text-white' : 'text-zinc-500 hover:text-black'}`}
                                >
                                  Daily
                                </button>
                                <button 
                                  onClick={() => { audio.playClick(); setLeaderboardTab('quickplay'); }}
                                  className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors ${leaderboardTab === 'quickplay' ? 'bg-black text-white' : 'text-zinc-500 hover:text-black'}`}
                                >
                                  Quick Play
                                </button>
                              </div>
                            </div>
                            <div className="space-y-4 overflow-y-auto max-h-[350px] pr-2">
                              {leaderboard.length > 0 ? leaderboard.map((entry, i) => (
                                <div key={i} className="flex justify-between items-center p-6 bg-zinc-50 rounded-2xl border border-zinc-100 text-black">
                                  <div className="flex items-center gap-4">
                                    <span className="text-black/30 font-bold w-6 text-lg">{i + 1}</span>
                                    <div className="flex flex-col">
                                      <span className="font-bold text-lg">{entry.name}</span>
                                    </div>
                                  </div>
                                  <span className="font-black text-lg">{entry.score.toFixed(2)}</span>
                                </div>
                              )) : (
                                <div className="py-20 text-black/40 font-bold italic uppercase tracking-widest text-xs text-center">
                                  No scores yet. Be the first.
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col h-full justify-start sm:justify-between items-start w-full max-w-2xl gap-8 sm:gap-4 relative z-10 pt-12 sm:pt-2">
                            <motion.div 
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.2, duration: 0.8 }}
                              className="w-full text-left"
                            >
                              <h1 className="text-6xl sm:text-7xl md:text-8xl font-bold tracking-tighter mb-16 sm:mb-10 leading-[0.8] text-black">
                                recall
                                <span className="hidden">Color Memory Game</span>
                              </h1>
                              <div className="text-zinc-500 text-lg sm:text-lg md:text-xl leading-relaxed font-medium flex flex-col justify-start gap-4">
                                <p>Recalling a specific color is hard. Recalling a specific color AND shape together is a true test of visual memory.</p>
                                <p className="text-zinc-400 text-base sm:text-base md:text-lg">We'll show you <strong className="text-black">four colored shapes</strong> - see if you can recreate these four shapes and colors.</p>
                              </div>
                            </motion.div>
                            <motion.div 
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.4, duration: 0.8 }}
                              className="flex flex-col w-full mt-8 pb-12 sm:mt-auto sm:pb-8"
                            >
                              <div className="flex flex-row items-center justify-center gap-3 sm:gap-4 w-full">
                                <button 
                                  onClick={() => {
                                    audio.playClick();
                                    trackButtonClick('Daily');
                                    if (hasPlayedToday) {
                                      const savedState = localStorage.getItem('daily_chroma_state');
                                      if (savedState) {
                                        const parsed = JSON.parse(savedState);
                                        setTotalScore(parsed.totalScore);
                                        setRoundData(parsed.roundData || []);
                                        setRound(parsed.roundData ? parsed.roundData.length : 4);
                                        setGameMode('daily');
                                        setGameState('final');
                                      }
                                    } else {
                                      trackGameStart('Classic - Daily');
                                      setTotalScore(0);
                                      setRoundData([]);
                                      startRound(1, 'daily');
                                    }
                                  }}
                                  className="flex-1 sm:flex-none sm:w-48 py-4 sm:py-5 bg-black text-white font-black rounded-2xl flex items-center justify-center text-lg sm:text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform"
                                >
                                  Daily
                                </button>
                                <button 
                                  onClick={() => {
                                    audio.playClick();
                                    trackButtonClick('QuickPlay');
                                    setTotalScore(0);
                                    setRoundData([]);
                                    startRound(1, 'solo');
                                    trackGameStart('Classic - QuickPlay');
                                  }}
                                  className="flex-1 sm:flex-none sm:w-48 py-4 sm:py-5 bg-black text-white font-black rounded-2xl flex items-center justify-center text-lg sm:text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform"
                                >
                                  QuickPlay
                                </button>
                                <button 
                                  onClick={() => {
                                    audio.playClick();
                                    trackButtonClick('Score');
                                    setShowScoreboard(true);
                                  }}
                                  className="p-4 sm:p-5 bg-zinc-100 text-black rounded-2xl flex items-center justify-center hover:bg-zinc-200 active:scale-95 transition-all"
                                >
                                  <Trophy size={24} />
                                </button>
                              </div>
                            </motion.div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Splash Particles Overlay */}
                  <SplashParticles triggerKey={splashTrigger} />

                  {/* Fixed Toggle Button at the bottom */}
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="fixed bottom-8 sm:absolute sm:bottom-0 sm:translate-y-1/2 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
                  >
                    <button
                      onClick={() => {
                        audio.playTransition('splash');
                        if (true) {
                          setSplashTrigger(prev => prev + 1);
                        }
                        setGameEdition(prev => prev === 'duo' ? 'classic' : 'duo');
                      }}
                      className="flex items-center gap-2 sm:gap-3 px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-r from-orange-500 to-red-500 backdrop-blur-md text-white rounded-full shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)] hover:scale-105 active:scale-95 transition-all border border-white/20"
                    >
                      <RefreshCw size={18} sm-size={20} className={gameEdition === 'duo' ? 'text-amber-200' : 'text-white'} />
                      <span className="font-bold tracking-widest uppercase text-xs sm:text-sm">
                        {gameEdition === 'duo' ? 'Play Classic Edition' : 'Play Duo Edition'}
                      </span>
                    </button>
                  </motion.div>

                  {/* Demo Controls - Moved to top left */}
                  <div className="fixed top-6 left-6 z-50 flex gap-2 pointer-events-auto">
                  </div>

                  {/* Admin Tools */}
                  {isAdmin && (
                    <div className="fixed bottom-6 right-6 z-50 pointer-events-auto bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-zinc-200">
                      <div className="text-[8px] text-zinc-400 mb-2 uppercase tracking-widest font-black">Admin Tools</div>
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={() => {
                            trackButtonClick('ResetDaily');
                            localStorage.removeItem('daily_chroma_state');
                            setHasPlayedToday(false);
                            setTotalScore(0);
                            setRoundData([]);
                            alert("Daily state reset!");
                          }}
                          className="text-[10px] text-zinc-500 hover:text-black font-bold uppercase tracking-[0.2em] transition-colors text-left"
                        >
                          Reset Daily
                        </button>
                        <button 
                          onClick={async () => {
                            if (!confirm("Add 78 random Duo scores?")) return;
                            const prefixes = ["Ultra", "Neo", "Cyber", "Zen", "Hyper", "Mega", "Quantum", "Sonic", "Pixel", "Nova"];
                            const suffixes = ["Master", "Seeker", "Ghost", "Runner", "Pilot", "Sage", "Knight", "Rogue", "Blade", "Star"];
                            
                            for (let i = 0; i < 78; i++) {
                              const name = prefixes[Math.floor(Math.random() * prefixes.length)] + 
                                           suffixes[Math.floor(Math.random() * suffixes.length)] + 
                                           Math.floor(Math.random() * 99);
                              const randomScore = Number((70 + Math.random() * 29).toFixed(2));
                              await addDoc(collection(db, 'duo_quickplay_scores'), {
                                sessionId: `seeded_${i}_${Date.now()}`,
                                createdAt: serverTimestamp(),
                                period: getEffectiveCycle(),
                                score: randomScore,
                                mode: 'duo-quickplay',
                                deviceType: 'desktop',
                                userId: 'seeded_bot',
                                userType: 'returning',
                                name: name,
                                isPosted: true
                              });
                            }
                            alert("78 Duo scores seeded to duo_quickplay_scores!");
                            fetchScores();
                          }}
                          className="text-[10px] text-zinc-500 hover:text-black font-bold uppercase tracking-[0.2em] transition-colors text-left"
                        >
                          Seed Duo Scores
                        </button>
                        <button 
                          onClick={() => {
                            setCycleOffset(prev => prev + 1);
                            setHasPlayedToday(false);
                            setTotalScore(0);
                            setRoundData([]);
                          }}
                          className="text-[10px] text-zinc-500 hover:text-black font-bold uppercase tracking-[0.2em] transition-colors text-left"
                        >
                          Simulate Next Cycle
                        </button>
                        <span className="text-[8px] text-zinc-400 uppercase tracking-widest">Cycle: {getEffectiveCycle()}</span>
                      </div>
                    </div>
                  )}
                  {!isAdmin && (
                    <div className="fixed bottom-6 right-6 z-50 pointer-events-auto opacity-0 hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          const provider = new GoogleAuthProvider();
                          signInWithPopup(auth, provider).catch(err => console.error("Admin login error:", err));
                        }}
                        className="text-[8px] text-zinc-200 hover:text-zinc-400 font-bold uppercase tracking-[0.2em]"
                      >
                        .
                      </button>
                    </div>
                  )}
                </div>
              )}
              {gameState === 'memorize' && (
                <motion.div
                  key="target-icon"
                  initial={{ opacity: 0, scale: 0.9, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -20 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className={`relative w-[90vw] max-w-[750px] h-[65vh] min-h-[450px] max-h-[550px] bg-black backdrop-blur-2xl flex flex-col items-center justify-center shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] rounded-[2.5rem] overflow-hidden pointer-events-auto border border-white/10`}
                >
                  {/* Round Info: Top Left */}
                  <div className="absolute top-6 left-6 text-white text-xs tracking-widest uppercase">
                    {round}/4
                  </div>

                  {/* Top Right: Score and Observe Text */}
                  <div className="absolute top-2 right-6 flex flex-col items-center text-right">
                    <div className={`text-4xl md:text-5xl font-bold text-white tracking-tighter transition-opacity duration-200 ${countdown > 0 ? 'opacity-100' : 'opacity-0'}`}>
                      {countdown > 0 ? countdown : 5}
                    </div>
                    <div className={`text-xs text-zinc-400 tracking-widest mt-1 transition-opacity duration-200 ${countdown > 0 ? 'opacity-100' : 'opacity-0'}`}>
                      {gameMode.startsWith('duo') ? 'Seconds to observe the Shapes and Colors' : 'Seconds to observe the Shape and Color'}
                    </div>
                  </div>

                  {gameMode.startsWith('duo') ? (
                    <div className="flex gap-12 md:gap-24 items-center justify-center w-full h-full">
                      <div className="w-32 h-32 md:w-48 md:h-48">
                        {duoTargetPosition === 0 ? (
                          <TargetIcon 
                            className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
                            style={{ color: hsbToString(targetColor) }}
                          />
                        ) : (
                          (() => {
                            const DistractorIcon = distractorObject;
                            return (
                              <DistractorIcon 
                                className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
                                style={{ color: hsbToString(distractorColor) }}
                              />
                            );
                          })()
                        )}
                      </div>
                      <div className="w-32 h-32 md:w-48 md:h-48">
                        {duoTargetPosition === 1 ? (
                          <TargetIcon 
                            className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
                            style={{ color: hsbToString(targetColor) }}
                          />
                        ) : (
                          (() => {
                            const DistractorIcon = distractorObject;
                            return (
                              <DistractorIcon 
                                className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
                                style={{ color: hsbToString(distractorColor) }}
                              />
                            );
                          })()
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="w-40 h-40 md:w-56 md:h-56">
                      <TargetIcon 
                        className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
                        style={{ color: hsbToString(targetColor) }}
                      />
                    </div>
                  )}
                </motion.div>
              )}
              {gameState === 'recreate' && (
                <motion.div
                  key="user-icon"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`relative w-[90vw] max-w-[750px] h-[65vh] min-h-[450px] max-h-[550px] bg-black backdrop-blur-2xl flex shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] rounded-[2.5rem] overflow-hidden pointer-events-auto border border-white/10`}
                >
                  {/* Left: Sliders */}
                  <div className="flex flex-shrink-0">
                    <VerticalSlider 
                      value={userColor.h} 
                      max={360} 
                      onChange={(v) => setUserColor(prev => ({ ...prev, h: v }))} 
                      bg="linear-gradient(to bottom, #ff0000 0%, #ffff00 16.67%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.67%, #ff00ff 83.33%, #ff0000 100%)"
                      type="H"
                    />
                    <VerticalSlider 
                      value={userColor.s} 
                      max={100} 
                      onChange={(v) => setUserColor(prev => ({ ...prev, s: v }))} 
                      bg={`linear-gradient(to bottom, ${hsbToString({h: userColor.h, s: 100, b: userColor.b})}, ${hsbToString({h: userColor.h, s: 0, b: userColor.b})})`}
                      type="S"
                    />
                    <VerticalSlider 
                      value={userColor.b} 
                      max={100} 
                      onChange={(v) => setUserColor(prev => ({ ...prev, b: v }))} 
                      bg={`linear-gradient(to bottom, ${hsbToString({h: userColor.h, s: userColor.s, b: 100})}, ${hsbToString({h: userColor.h, s: userColor.s, b: 0})})`}
                      type="B"
                    />
                  </div>

                  {/* Round Info */}
                  <div className="absolute top-2 sm:top-6 left-20 sm:left-32 md:left-40 text-white text-xs tracking-widest uppercase z-20">
                    {round}/4
                  </div>

                  {/* Match Text */}
                  {/* (Moved to Canvas container) */}
 
                  {/* Center: Canvas */}
                  <div className="flex-1 flex flex-col items-center justify-center relative">
                    {/* Match Text */}
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 text-white/60 text-[8px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.3em] uppercase font-bold z-20 whitespace-nowrap">
                      {gameMode.startsWith('duo') ? 'Match the color' : 'Match the shape and color'}
                    </div>
                    <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-48 md:h-48">
                      <UserIcon 
                        className="w-full h-full transition-colors duration-200"
                        style={{ color: hsbToString(userColor) }}
                      />
                    </div>
                    
                    {/* Bottom Right: Continue Button */}
                    <button 
                      onClick={() => {
                        trackButtonClick('Continue');
                        handleSubmit();
                      }}
                      className="absolute bottom-6 right-6 px-8 py-3 bg-white text-black hover:bg-zinc-200 active:scale-[0.95] rounded-xl text-sm font-bold tracking-tight transition-all duration-300 shadow-2xl"
                    >
                      Continue
                    </button>
                  </div>
 
                  {/* Right: Shapes */}
                  {!gameMode.startsWith('duo') && (
                    <div className="w-16 flex flex-col items-center gap-4 p-4 border-l border-white/10 overflow-y-auto hide-scrollbar">
                      <div className="text-[8px] text-white/60 font-bold tracking-widest uppercase mb-2">Shape Slider</div>
                      {currentOptions.map((optionIndex, i) => {
                        const ShapeIcon = OBJECTS[optionIndex];
                        return (
                          <button 
                            key={i}
                            onClick={() => {
                              if (userObject !== ShapeIcon) {
                                audio.playShapeSliderTick();
                                setUserObject(() => ShapeIcon);
                              }
                            }}
                            className={`w-10 h-10 flex-shrink-0 flex items-center justify-center transition-all ${userObject === ShapeIcon ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                          >
                            <ShapeIcon size={24} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* UI Overlays */}
        <div className="z-10 w-full max-w-4xl flex flex-col items-center justify-center h-full">
          <AnimatePresence mode="wait">
            
            {/* STATE: READY */}
            {gameState === 'ready' && (
              <motion.div 
                key="ready"
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.2, filter: 'blur(10px)' }}
                transition={{ duration: 0.4, ease: "backOut" }}
                className="text-center"
              >
                <h1 className="font-serif text-6xl md:text-8xl tracking-tighter mb-6 text-black">
                  {countdown === 2 ? 'Focus.' : 'Memorize.'}
                </h1>
                <p className="text-zinc-400 text-sm tracking-widest uppercase">Get ready.</p>
              </motion.div>
            )}

            {/* STATE: MEMORIZE */}
            {/* Countdown is now inside the shape box to prevent overlap */}

            {/* STATE: RECREATE (Now integrated into the main canvas above) */}
            {gameState === 'recreate' && (
              <></>
            )}

            {/* STATE: RESULT */}
            {gameState === 'result' && (
              <motion.div 
                key="result"
                initial={{ opacity: 0, scale: 0.95, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -40 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-[90vw] max-w-[750px] h-[65vh] min-h-[450px] max-h-[550px] bg-black backdrop-blur-2xl flex flex-col items-center justify-center shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] rounded-[2.5rem] overflow-hidden pointer-events-auto border border-white/10 p-8 md:p-12"
              >
                  {/* Round Info: Top Left */}
                  <div className="absolute top-6 left-6 text-white text-xs tracking-widest uppercase z-20">
                     {round}/4
                  </div>

                  {/* Top Section */}
                  <div className="absolute top-6 right-6 flex flex-col items-end text-right">
                    <div className="flex items-baseline gap-1 mb-1">
                      <h2 className="text-5xl md:text-6xl font-bold tracking-tighter leading-none text-white">
                        <AnimatedScore value={score} onComplete={() => {
                          setTimeout(() => {
                            setShowScoreText(true);
                            audio.playScoreReveal();
                          }, 150);
                        }} />
                      </h2>
                      <span className="text-xl md:text-2xl text-zinc-500 font-bold">/25</span>
                    </div>
                    <p className={`text-zinc-400 text-xs md:text-sm font-medium italic max-w-[200px] leading-tight transition-all duration-300 ease-out transform ${showScoreText ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
                      "{getScoreText(score)}"
                    </p>
                  </div>

                  {/* Images Section */}
                  <div className="flex items-center justify-center gap-12 md:gap-24 mb-8 mt-4">
                    {/* Original */}
                    <div className="flex flex-col items-center">
                      <div className="w-24 h-24 md:w-32 md:h-32 mb-6">
                        <TargetIcon 
                          className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
                          style={{ color: hsbToString(targetColor) }}
                        />
                      </div>
                      <p className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold mb-1">Original</p>
                      <p className="text-xs md:text-sm tracking-tight text-zinc-400 font-bold">H{targetColor.h} S{targetColor.s} B{targetColor.b}</p>
                    </div>

                    {/* User Selection */}
                    <div className="flex flex-col items-center">
                      <div className="w-24 h-24 md:w-32 md:h-32 mb-6">
                        <UserIcon 
                          className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
                          style={{ color: hsbToString(userColor) }}
                        />
                      </div>
                      <p className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold mb-1">Your Selection</p>
                      <p className="text-xs md:text-sm tracking-tight text-zinc-400 font-bold">H{userColor.h} S{userColor.s} B{userColor.b}</p>
                    </div>
                  </div>

                  {/* Next Button */}
                  <div className="absolute bottom-6 right-6">
                    <button 
                      onClick={handleNextRound}
                      className="px-8 py-5 bg-white text-black rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-white/20 group font-bold text-lg"
                    >
                      {round < 4 ? '' : 'See Final Score'}
                      <ArrowRight size={24} className={round < 4 ? "" : "ml-3"} />
                    </button>
                  </div>
                </motion.div>
            )}

            {/* STATE: FINAL */}
            {gameState === 'final' && (
              <motion.div 
                key="final"
                initial={{ opacity: 0, scale: 0.8, rotate: -2 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 1.1, rotate: 2 }}
                transition={{ type: "spring", damping: 20, stiffness: 100 }}
                className="relative w-[90vw] max-w-[750px] h-auto min-h-[450px] bg-black backdrop-blur-2xl flex flex-col items-center justify-center shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] rounded-[2.5rem] overflow-hidden pointer-events-auto border border-white/10 py-12 px-6 md:px-12"
              >
                <button 
                  onClick={() => { audio.playClick(); setGameState('start'); }}
                  className="absolute top-6 right-6 p-4 text-white hover:opacity-70 transition-opacity z-10"
                >
                  <FaIcons.FaTimes size={24} />
                </button>
                
                <p className="text-white text-[10px] tracking-[0.3em] uppercase font-bold mb-4 opacity-50">Total Mastery</p>
                
                <div className="flex items-baseline justify-center gap-2 mb-6">
                  <h2 className="text-5xl md:text-6xl font-bold tracking-tighter leading-none text-white">
                    <AnimatedScore value={totalScore} />
                  </h2>
                  <span className="text-xl text-zinc-500 font-bold">/100</span>
                </div>

                {(gameMode === 'daily' && dailyStats) || (gameMode === 'duo' && duoStats) ? (
                  <div className="flex gap-8 mb-4 text-zinc-400 text-[10px] tracking-widest uppercase font-bold">
                    <div className="flex flex-col items-center">
                      <span className="text-zinc-600 mb-1">Day's High</span>
                      <span className="text-white text-sm">{(gameMode === 'daily' ? dailyStats!.high : duoStats!.high).toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-zinc-600 mb-1">Day's Avg</span>
                      <span className="text-white text-sm">{(gameMode === 'daily' ? dailyStats!.avg : duoStats!.avg).toFixed(2)}</span>
                    </div>
                  </div>
                ) : null}

                <p className="text-zinc-300 text-lg md:text-xl font-medium italic mb-4 max-w-lg text-center">
                  {totalScore >= 90 ? '"A master of the spectrum."' : 
                   totalScore >= 70 ? '"A highly refined eye."' : 
                   totalScore >= 40 ? '"An emerging perspective."' : '"Vision requires practice."'}
                </p>

                {(gameMode === 'daily' || gameMode === 'duo') && (
                  <div className="text-zinc-500 text-[10px] tracking-[0.2em] uppercase font-bold mb-6">
                    Next in {nextDailyCountdown}
                  </div>
                )}
                
                {/* Innovative Summary Grid */}
                <div className="flex gap-2 md:gap-3 mb-4 w-full justify-center flex-wrap px-4">
                  {roundData.map((d, i) => {
                    const TargetShape = OBJECTS[d.targetObjectIndex];
                    const UserShape = OBJECTS[d.userObjectIndex];
                    return (
                      <div key={i} className="relative w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden shadow-sm border border-zinc-100 flex-shrink-0 group bg-white">
                        {/* Target Color (Top Left) */}
                        <div 
                          className="absolute inset-0" 
                          style={{ 
                            background: hsbToString(d.targetColor),
                            clipPath: 'polygon(0 0, 100% 0, 0 100%)'
                          }} 
                        >
                          <div className="absolute top-1.5 left-1.5 text-white/90">
                            <TargetShape size={14} />
                          </div>
                        </div>
                        {/* User Color (Bottom Right) */}
                        <div 
                          className="absolute inset-0" 
                          style={{ 
                            background: hsbToString(d.userColor),
                            clipPath: 'polygon(100% 0, 100% 100%, 0 100%)'
                          }} 
                        >
                          <div className="absolute bottom-1.5 right-1.5 text-white/90">
                            <UserShape size={14} />
                          </div>
                        </div>
                        {/* Score Label */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-white text-[10px] md:text-xs font-bold drop-shadow-md bg-black/10 px-1 rounded">
                            {d.score.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-3 w-full max-w-sm mt-4">
                  {/* Row 1: Name Input and Post Button (QuickPlay Only) */}
                  {(gameMode === 'solo' || gameMode === 'duo-quickplay') && (
                    <div className="flex gap-2 w-full items-center">
                        <div className="relative group flex-1">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-white transition-colors">
                            <User size={18} />
                          </div>
                          <input 
                            type="text"
                            placeholder="Enter your name"
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value.slice(0, 20))}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-10 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-all font-bold"
                          />
                        </div>

                        <button 
                          onClick={postScore}
                          disabled={!playerName.trim() || isPosting}
                          className="px-6 py-3 bg-white text-black hover:bg-zinc-200 disabled:opacity-50 rounded-2xl text-base font-bold tracking-tight transition-all duration-300 flex items-center justify-center gap-2 group shadow-xl"
                        >
                          {isPosting ? (
                            <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                          ) : (
                            <>
                              <Send size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                              Post
                            </>
                          )}
                        </button>
                      </div>
                  )}

                  {/* Row 2: Share and Play Again Buttons */}
                  <div className="flex gap-2 w-full">
                    <button 
                      onClick={handleShare}
                      className="flex-1 px-6 py-4 bg-zinc-800 text-white hover:bg-zinc-700 rounded-2xl text-sm font-bold tracking-tight transition-all duration-300 flex items-center justify-center gap-3 border border-white/5"
                    >
                      <Share2 size={16} />
                      {copied ? 'Copied!' : (gameMode === 'daily' ? 'Share' : 'Share')}
                    </button>
                    
                    {gameMode === 'solo' || gameMode === 'duo-quickplay' ? (
                      <button 
                        onClick={() => {
                          audio.playClick();
                          trackButtonClick('PlayAgain');
                          setTotalScore(0);
                          setRoundData([]);
                          startRound(1, gameMode);
                          trackGameStart(getAnalyticsModeName(gameMode));
                        }}
                        className="flex-1 px-6 py-4 border border-white/10 text-zinc-400 hover:text-white hover:border-white/30 rounded-2xl text-sm font-bold tracking-tight transition-all duration-300"
                      >
                        Play Again
                      </button>
                    ) : null}
                  </div>
                </div>
                
                {(gameMode === 'daily' || gameMode === 'duo') && (
                  <p className="text-black/40 text-[10px] tracking-widest uppercase mt-4 text-center font-bold">
                    Come back tomorrow for a new exhibition.
                  </p>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

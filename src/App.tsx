import { diff } from 'color-diff';
import convert from 'color-convert';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Share2, Trophy, User, Send, Volume2, VolumeX, RefreshCw } from 'lucide-react';
import * as FaIcons from 'react-icons/fa';
import { db } from './firebase';
import { getDynamicFeedback } from './utils';
import { audio } from './utils/audio';
import { initGA, trackPageView, trackButtonClick, trackGameStart, trackGameEnd } from './analytics';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, where } from 'firebase/firestore';
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

type Color = { h: number; s: number; l: number };
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
  l: 20 + Math.floor(rng() * 61)
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

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
};

const calculateScore = (target: Color, user: Color, targetObj: React.ElementType, userObj: React.ElementType, mode: 'daily' | 'solo' | 'duo'): number => {
  const lab1Arr = convert.hsl.lab([target.h, target.s, target.l]);
  const lab2Arr = convert.hsl.lab([user.h, user.s, user.l]);
  
  const lab1 = { L: lab1Arr[0], a: lab1Arr[1], b: lab1Arr[2] };
  const lab2 = { L: lab2Arr[0], a: lab2Arr[1], b: lab2Arr[2] };
  
  const deltaE = diff(lab1, lab2);
  
  let totalScore = 0;
  if (mode === 'duo') {
    // 100% score for color (max 25 per round)
    totalScore = 25 * Math.exp(-deltaE / 25);
  } else {
    // 80% for color (max 20), 20% for shape (max 5)
    let colorScore = 20 * Math.exp(-deltaE / 25);
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

const hslToString = (c: Color, alpha: number = 1) => `hsl(${c.h}, ${c.s}%, ${c.l}%, ${alpha})`;

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
  value: number, max: number, onChange: (v: number) => void, bg: string, type: 'H' | 'S' | 'L' 
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
    const percentage = 1 - ((y - 16) / (rect.height - 32));
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
        style={{ top: `calc(16px + ${(1 - value / max)} * (100% - 32px))` }}
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

export default function App() {
  const [gameState, setGameState] = useState<GameState>('start');
  const [gameMode, setGameMode] = useState<'daily' | 'solo' | 'duo'>('daily');
  const [round, setRound] = useState(1);
  const [targetColor, setTargetColor] = useState<Color>({ h: 0, s: 0, l: 0 });
  const [distractorColor, setDistractorColor] = useState<Color>({ h: 0, s: 0, l: 0 });
  const [userColor, setUserColor] = useState<Color>({ h: 180, s: 50, l: 50 });
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
  const [showScoreText, setShowScoreText] = useState(false);
  const [currentOptions, setCurrentOptions] = useState<number[]>([]);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('mastery_player_name') || '');
  const [isPosting, setIsPosting] = useState(false);
  const [isHoveringDaily, setIsHoveringDaily] = useState(false);
  const [isHoveringQuickPlay, setIsHoveringQuickPlay] = useState(false);
  const [isHoveringDuo, setIsHoveringDuo] = useState(false);
  const [isHoveringScore, setIsHoveringScore] = useState(false);
  const [gameEdition, setGameEdition] = useState<'duo' | 'classic'>('duo');
  const [transitionStyle, setTransitionStyle] = useState<'flip' | 'splash' | 'carousel'>('flip');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const isAdmin = user?.email === 'aneeshakc88@gmail.com';
  const [currentFeedback, setCurrentFeedback] = useState("");
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number }[]>([]);
  const [dailyStats, setDailyStats] = useState<{ high: number; avg: number } | null>(null);
  const [duoStats, setDuoStats] = useState<{ high: number; avg: number } | null>(null);
  const [nextDailyCountdown, setNextDailyCountdown] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState("");
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
        collection(db, 'daily_scores'), 
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
      handleFirestoreError(error, OperationType.GET, 'daily_scores');
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
      const q = query(collection(db, 'scores'), orderBy('score', 'desc'), limit(50));
      const querySnapshot = await getDocs(q);
      const liveScores = querySnapshot.docs.map(doc => ({
        name: doc.data().name,
        score: doc.data().score
      }));
      
      const combined = [...liveScores, ...STATIC_LEADERBOARD].sort((a, b) => b.score - a.score);
      setLeaderboard(combined);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'scores');
    }
  };

  useEffect(() => {
    if (showScoreboard) {
      fetchScores();
    }
  }, [showScoreboard]);

  const autoPostDailyScore = async (finalTotal: number) => {
    try {
      await addDoc(collection(db, 'daily_scores'), {
        sessionId: currentSessionId || generateSessionId(),
        createdAt: serverTimestamp(),
        period: getEffectiveCycle(),
        score: finalTotal,
        deviceType: getDeviceType(),
        userId: getUserId(),
        userType: getUserType()
      });
      fetchDailyStats();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'daily_scores');
    }
  };

  const autoPostDuoDailyScore = async (finalTotal: number) => {
    try {
      await addDoc(collection(db, 'duo_daily_scores'), {
        sessionId: currentSessionId || generateSessionId(),
        createdAt: serverTimestamp(),
        period: getEffectiveCycle(),
        score: finalTotal,
        deviceType: getDeviceType(),
        userId: getUserId(),
        userType: getUserType()
      });
      fetchDuoStats();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'duo_daily_scores');
    }
  };

  const postScore = async () => {
    trackButtonClick('PostScore');
    if (!playerName.trim() || isPosting) return;
    setIsPosting(true);
    localStorage.setItem('mastery_player_name', playerName.trim());
    try {
      await addDoc(collection(db, 'scores'), {
        name: playerName.trim(),
        score: totalScore,
        timestamp: serverTimestamp()
      });
      setShowScoreboard(true);
      setGameState('start');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'scores');
    } finally {
      setIsPosting(false);
    }
  };

  const startRound = (r: number, mode: 'daily' | 'solo' | 'duo' = gameMode) => {
    setRound(r);
    setGameMode(mode);
    
    if (r === 1 && mode === 'daily') {
      setCurrentSessionId(generateSessionId());
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
          l: 20 + Math.floor(Math.random() * 61)
        },
        objectIndex: targetIndex,
        options: optionsArray
      };
    }
    
    setTargetColor(roundInfo.color);
    setUserColor({ h: 180, s: 50, l: 50 });
    setTargetObject(() => OBJECTS[roundInfo.objectIndex]);
    setUserObject(() => mode === 'duo' ? OBJECTS[roundInfo.objectIndex] : OBJECTS[roundInfo.options[0]]);
    setCurrentOptions(roundInfo.options);

    if (mode === 'duo') {
      setDistractorColor({
        h: Math.floor(Math.random() * 360),
        s: 20 + Math.floor(Math.random() * 81),
        l: 20 + Math.floor(Math.random() * 61)
      });
      setDistractorObject(() => OBJECTS[Math.floor(Math.random() * OBJECTS.length)]);
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
      trackGameEnd(totalScore, gameMode);
      const finalTotal = totalScore;
      const finalRoundData = [...roundData];
      
      if (gameMode === 'daily') {
        localStorage.setItem('daily_chroma_state', JSON.stringify({
          cycleId: getEffectiveCycle(),
          completed: true,
          totalScore: finalTotal,
          roundData: finalRoundData
        }));
        setHasPlayedToday(true);
        autoPostDailyScore(finalTotal);
      } else if (gameMode === 'duo') {
        localStorage.setItem('duo_daily_chroma_state', JSON.stringify({
          cycleId: getEffectiveCycle(),
          completed: true,
          totalScore: finalTotal,
          roundData: finalRoundData
        }));
        setHasPlayedDuoToday(true);
        autoPostDuoDailyScore(finalTotal);
      }
      
      setGameState('final');
    }
  };

  const handleShare = () => {
    trackButtonClick('Share');
    let dateStr;
    let grid = "";
    
    if (gameMode === 'daily') {
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
    
    const modeName = gameMode === 'daily' ? 'Daily' : gameMode === 'duo' ? 'Duo' : 'QuickPlay';
    const text = `Recreate ${modeName} - ${dateStr}\nScore: ${totalScore.toFixed(2)}/100\n${grid}\nPlay at: ${window.location.origin}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const TargetIcon = targetObject;
  const UserIcon = userObject;

  return (
    <div className="min-h-screen w-full flex flex-col bg-white text-zinc-900 font-sans overflow-y-auto relative selection:bg-black selection:text-white">
      
      {/* Global Volume Toggle */}
      <button 
        onClick={toggleSound}
        className="fixed top-6 right-6 p-3 text-zinc-400 hover:text-black transition-colors z-50 bg-white/80 backdrop-blur-md rounded-full shadow-sm border border-zinc-200"
        aria-label={soundEnabled ? "Mute sound" : "Enable sound"}
      >
        {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
      </button>

      {/* Main Content Area */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative p-4 md:p-8">
        
        {/* Central Icon Display */}
        {gameState !== 'final' && gameState !== 'ready' && gameState !== 'result' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <AnimatePresence mode="wait">
              {gameState === 'start' && (
                <>
                  <AnimatePresence mode="wait">
                    {gameEdition === 'duo' ? (
                      <motion.div
                        key="duo-screen"
                        initial={
                          transitionStyle === 'flip' ? { rotateY: -180, opacity: 0 } :
                          transitionStyle === 'splash' ? { clipPath: 'circle(0% at 50% 90%)' } :
                          { x: '-80vw', opacity: 0.5, scale: 0.85 }
                        }
                        animate={
                          transitionStyle === 'flip' ? { rotateY: 0, opacity: 1 } :
                          transitionStyle === 'splash' ? { clipPath: 'circle(150% at 50% 90%)' } :
                          { x: 0, opacity: 1, scale: 1 }
                        }
                        exit={
                          transitionStyle === 'flip' ? { rotateY: 180, opacity: 0 } :
                          transitionStyle === 'splash' ? { clipPath: 'circle(0% at 50% 90%)', zIndex: 10 } :
                          { x: '-80vw', opacity: 0.5, scale: 0.85 }
                        }
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                        className="relative w-[90vw] max-w-[750px] min-h-[650px] bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center p-8 overflow-hidden pointer-events-auto"
                        style={{ transformStyle: 'preserve-3d' }}
                      >
                        {/* Liquid splash background effect */}
                        <div className="absolute inset-0 opacity-50 bg-gradient-to-br from-amber-300 via-orange-400 to-pink-500 blur-3xl scale-150 animate-pulse mix-blend-overlay" />
                        
                        {showScoreboard ? (
                          <div className="flex flex-col w-full max-w-2xl z-10 h-full">
                            <div className="flex justify-between items-center mb-12">
                              <div className="flex items-center gap-3">
                                <Trophy className="text-white" size={24} />
                                <h2 className="text-3xl font-semibold tracking-tight text-white">Leaderboard</h2>
                              </div>
                              <button onClick={() => { audio.playClick(); setShowScoreboard(false); }} className="text-white hover:opacity-70 transition-opacity font-bold uppercase text-xs tracking-widest">
                                Close
                              </button>
                            </div>
                            <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-2">
                              {leaderboard.length > 0 ? leaderboard.map((entry, i) => (
                                <div key={i} className="flex justify-between items-center p-6 bg-white/10 rounded-2xl border border-white/20 text-white">
                                  <div className="flex items-center gap-4">
                                    <span className="text-white/50 font-bold w-6 text-lg">{i + 1}</span>
                                    <span className="font-bold text-lg">{entry.name}</span>
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
                          <div className="flex flex-col items-center justify-center z-10 w-full h-full">
                            <h1 className="text-[25vw] sm:text-[20vw] md:text-[15rem] leading-none font-black tracking-tighter text-white drop-shadow-2xl">
                              DUO
                            </h1>
                            <p className="text-xl md:text-3xl text-white/90 font-medium mt-4 text-center max-w-2xl drop-shadow-md">
                              Two shapes. One color. Pure visual memory.
                            </p>
                            
                            <div className="flex flex-col sm:flex-row gap-4 mt-12 w-full max-w-md justify-center">
                              <button 
                                onClick={() => {
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
                                    trackGameStart('Duo');
                                  }
                                }}
                                className="flex-1 py-5 bg-white text-orange-600 font-black rounded-2xl text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform"
                              >
                                Daily Duo
                              </button>
                              <button 
                                onClick={() => {
                                  setTotalScore(0);
                                  setRoundData([]);
                                  startRound(1, 'duo');
                                }}
                                className="flex-1 py-5 bg-black/20 text-white font-black rounded-2xl text-xl backdrop-blur-md hover:bg-black/30 active:scale-95 transition-all"
                              >
                                QuickPlay
                              </button>
                            </div>
                            
                            <button 
                              onClick={() => {
                                audio.playClick();
                                trackButtonClick('Score');
                                setShowScoreboard(true);
                              }}
                              className="mt-6 p-4 bg-white/20 text-white rounded-full backdrop-blur-md hover:bg-white/30 transition-colors"
                            >
                              <Trophy size={24} />
                            </button>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="classic-screen"
                        initial={
                          transitionStyle === 'flip' ? { rotateY: 180, opacity: 0 } :
                          transitionStyle === 'splash' ? { clipPath: 'circle(0% at 50% 90%)' } :
                          { x: '80vw', opacity: 0.5, scale: 0.85 }
                        }
                        animate={
                          transitionStyle === 'flip' ? { rotateY: 0, opacity: 1 } :
                          transitionStyle === 'splash' ? { clipPath: 'circle(150% at 50% 90%)' } :
                          { x: 0, opacity: 1, scale: 1 }
                        }
                        exit={
                          transitionStyle === 'flip' ? { rotateY: -180, opacity: 0 } :
                          transitionStyle === 'splash' ? { clipPath: 'circle(0% at 50% 90%)', zIndex: 10 } :
                          { x: '80vw', opacity: 0.5, scale: 0.85 }
                        }
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                        className="relative w-[90vw] max-w-[750px] min-h-[650px] bg-white rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center p-8 md:p-12 overflow-y-auto overflow-x-hidden pointer-events-auto border border-zinc-100"
                        style={{ transformStyle: 'preserve-3d' }}
                      >
                        {showScoreboard ? (
                          <div className="flex flex-col w-full h-full">
                            <div className="flex justify-between items-center mb-12">
                              <div className="flex items-center gap-3">
                                <Trophy className="text-amber-500" size={24} />
                                <h2 className="text-3xl font-semibold tracking-tight text-black">Leaderboard</h2>
                              </div>
                              <button onClick={() => { audio.playClick(); setShowScoreboard(false); }} className="text-black hover:opacity-70 transition-opacity font-bold uppercase text-xs tracking-widest">
                                Close
                              </button>
                            </div>
                            <div className="space-y-4 overflow-y-auto max-h-[350px] pr-2">
                              {leaderboard.length > 0 ? leaderboard.map((entry, i) => (
                                <div key={i} className="flex justify-between items-center p-6 bg-zinc-50 rounded-2xl border border-zinc-100 text-black">
                                  <div className="flex items-center gap-4">
                                    <span className="text-black/30 font-bold w-6 text-lg">{i + 1}</span>
                                    <span className="font-bold text-lg">{entry.name}</span>
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
                          <div className="flex flex-col h-full justify-between items-start w-full max-w-2xl gap-4 relative">
                            <div className="w-full text-left pt-2">
                              <h1 className="text-5xl sm:text-8xl md:text-9xl font-bold tracking-tighter mb-6 leading-[0.8] text-black">
                                recreate
                              </h1>
                              <div className="text-zinc-500 text-base sm:text-lg md:text-xl leading-relaxed font-medium flex flex-col justify-center gap-4">
                                <p>Recalling a specific color is hard. Recalling a specific color AND shape together is a true test of visual memory.</p>
                                <p>We'll show you <strong className="text-black">four colored shapes</strong> - see if you can recreate these four shapes and colors.</p>
                              </div>
                            </div>
                            <div className="flex flex-col w-full mt-auto pb-2">
                              <div className="flex flex-row items-center justify-start gap-3 sm:gap-4 w-full flex-wrap">
                                <button 
                                  onClick={() => {
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
                                      trackGameStart('Daily');
                                      setTotalScore(0);
                                      setRoundData([]);
                                      startRound(1, 'daily');
                                    }
                                  }}
                                  className="flex-1 min-w-[100px] px-4 py-4 rounded-2xl bg-black text-white font-bold tracking-tight text-sm sm:text-lg hover:scale-[1.05] active:scale-[0.95] transition-all"
                                >
                                  Daily Classic
                                </button>
                                <button 
                                  onClick={() => {
                                    trackButtonClick('QuickPlay');
                                    setTotalScore(0);
                                    setRoundData([]);
                                    startRound(1, 'solo');
                                    trackGameStart('QuickPlay');
                                  }}
                                  className="flex-1 min-w-[100px] px-4 py-4 rounded-2xl bg-black text-white font-bold tracking-tight text-sm sm:text-lg hover:scale-[1.05] active:scale-[0.95] transition-all"
                                >
                                  QuickPlay Classic
                                </button>
                                <button 
                                  onClick={() => {
                                    audio.playClick();
                                    trackButtonClick('Score');
                                    setShowScoreboard(true);
                                  }}
                                  className="flex-none px-4 py-4 rounded-2xl bg-zinc-200 text-black font-bold tracking-tight text-sm sm:text-lg hover:scale-[1.05] active:scale-[0.95] transition-all"
                                >
                                  <Trophy size={20} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Fixed Toggle Button at the bottom */}
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
                  >
                    <button
                      onClick={() => {
                        audio.playTransition(transitionStyle);
                        setGameEdition(prev => prev === 'duo' ? 'classic' : 'duo');
                      }}
                      className="flex items-center gap-3 px-6 py-4 bg-black/90 backdrop-blur-md text-white rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all border border-white/10"
                    >
                      <RefreshCw size={20} className={gameEdition === 'duo' ? 'text-amber-500' : 'text-white'} />
                      <span className="font-bold tracking-widest uppercase text-sm">
                        {gameEdition === 'duo' ? 'Play Classic Edition' : 'Play Duo Edition'}
                      </span>
                    </button>
                  </motion.div>

                  {/* Demo Controls - Moved to top left */}
                  <div className="fixed top-6 left-6 z-50 flex gap-2 pointer-events-auto">
                    <button onClick={() => setTransitionStyle('flip')} className={`px-3 py-1 text-xs rounded-full font-bold ${transitionStyle === 'flip' ? 'bg-black text-white' : 'bg-white/80 backdrop-blur-md text-black shadow-sm'}`}>Flip</button>
                    <button onClick={() => setTransitionStyle('splash')} className={`px-3 py-1 text-xs rounded-full font-bold ${transitionStyle === 'splash' ? 'bg-black text-white' : 'bg-white/80 backdrop-blur-md text-black shadow-sm'}`}>Splash</button>
                    <button onClick={() => setTransitionStyle('carousel')} className={`px-3 py-1 text-xs rounded-full font-bold ${transitionStyle === 'carousel' ? 'bg-black text-white' : 'bg-white/80 backdrop-blur-md text-black shadow-sm'}`}>Carousel</button>
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
                </>
              )}
              {gameState === 'memorize' && (
                <motion.div
                  key="target-icon"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
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
                      {gameMode === 'duo' ? 'Seconds to observe the Shapes and Colors' : 'Seconds to observe the Shape and Color'}
                    </div>
                  </div>

                  {gameMode === 'duo' ? (
                    <div className="flex gap-12 md:gap-24 items-center justify-center w-full h-full">
                      <div className="w-32 h-32 md:w-48 md:h-48">
                        {duoTargetPosition === 0 ? (
                          <TargetIcon 
                            className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
                            style={{ color: hslToString(targetColor) }}
                          />
                        ) : (
                          (() => {
                            const DistractorIcon = distractorObject;
                            return (
                              <DistractorIcon 
                                className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
                                style={{ color: hslToString(distractorColor) }}
                              />
                            );
                          })()
                        )}
                      </div>
                      <div className="w-32 h-32 md:w-48 md:h-48">
                        {duoTargetPosition === 1 ? (
                          <TargetIcon 
                            className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
                            style={{ color: hslToString(targetColor) }}
                          />
                        ) : (
                          (() => {
                            const DistractorIcon = distractorObject;
                            return (
                              <DistractorIcon 
                                className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
                                style={{ color: hslToString(distractorColor) }}
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
                        style={{ color: hslToString(targetColor) }}
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
                      bg="linear-gradient(to bottom, #ff3b30 0%, #ff2d55 17%, #5856d6 33%, #007aff 50%, #34c759 67%, #ffcc00 83%, #ff3b30 100%)"
                      type="H"
                    />
                    <VerticalSlider 
                      value={userColor.s} 
                      max={100} 
                      onChange={(v) => setUserColor(prev => ({ ...prev, s: v }))} 
                      bg={`linear-gradient(to bottom, hsl(${userColor.h}, 100%, ${userColor.l}%), hsl(${userColor.h}, 0%, ${userColor.l}%))`}
                      type="S"
                    />
                    <VerticalSlider 
                      value={userColor.l} 
                      max={100} 
                      onChange={(v) => setUserColor(prev => ({ ...prev, l: v }))} 
                      bg={`linear-gradient(to bottom, #fff 0%, hsl(${userColor.h}, ${userColor.s}%, 50%) 50%, #000 100%)`}
                      type="L"
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
                      {gameMode === 'duo' ? 'Match the color' : 'Match the shape and color'}
                    </div>
                    <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-48 md:h-48">
                      <UserIcon 
                        className="w-full h-full transition-colors duration-200"
                        style={{ color: hslToString(userColor) }}
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
                  {gameMode !== 'duo' && (
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
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
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
                          style={{ color: hslToString(targetColor) }}
                        />
                      </div>
                      <p className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold mb-1">Original</p>
                      <p className="text-xs md:text-sm tracking-tight text-zinc-400 font-bold">H{targetColor.h} S{targetColor.s} L{targetColor.l}</p>
                    </div>

                    {/* User Selection */}
                    <div className="flex flex-col items-center">
                      <div className="w-24 h-24 md:w-32 md:h-32 mb-6">
                        <UserIcon 
                          className="w-full h-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
                          style={{ color: hslToString(userColor) }}
                        />
                      </div>
                      <p className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold mb-1">Your Selection</p>
                      <p className="text-xs md:text-sm tracking-tight text-zinc-400 font-bold">H{userColor.h} S{userColor.s} L{userColor.l}</p>
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="relative w-[90vw] max-w-[750px] h-[65vh] min-h-[450px] max-h-[550px] bg-black backdrop-blur-2xl flex flex-col items-center justify-center shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] rounded-[2.5rem] overflow-hidden pointer-events-auto border border-white/10 p-8 md:p-12"
              >
                <button 
                  onClick={() => { audio.playClick(); setGameState('start'); }}
                  className="absolute top-6 right-6 p-4 text-white hover:opacity-70 transition-opacity"
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

                {gameMode === 'daily' && (
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
                            background: hslToString(d.targetColor),
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
                            background: hslToString(d.userColor),
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
                  {/* Row 1: Name Input and Post Button (Solo Only) */}
                  {gameMode === 'solo' && (
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
                    
                    {gameMode === 'solo' && (
                      <button 
                        onClick={() => {
                          trackButtonClick('PlayAgain');
                          setTotalScore(0);
                          setRoundData([]);
                          startRound(1, gameMode);
                          trackGameStart('QuickPlay');
                        }}
                        className="flex-1 px-6 py-4 border border-white/10 text-zinc-400 hover:text-white hover:border-white/30 rounded-2xl text-sm font-bold tracking-tight transition-all duration-300"
                      >
                        Play Again
                      </button>
                    )}
                  </div>
                </div>
                
                {gameMode !== 'solo' && (
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

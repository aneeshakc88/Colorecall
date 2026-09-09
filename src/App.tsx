import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Share2, Trophy, User, Calendar, Send, Volume2, VolumeX, RefreshCw } from 'lucide-react';
import * as FaIcons from 'react-icons/fa';
import { db } from './firebase';
import { getDynamicFeedback } from './utils';
import { audio } from './utils/audio';
import { Color, hsbToRgb, hsbToString, VerticalSlider, AnimatedScore, getUserId, getMyUserIds, getUserType, getDeviceType, generateSessionId } from './utils/colorMath';
import FlagGame from './flag/FlagGame';
import { FlagIntroRing } from './flag/FlagRing';
import { FlagSplitHero } from './flag/FlagSplitHero';
import { getCurrentCycle, getNextResetTime, cycleDateLabel } from './daily-cycle';

// Split Hero is the only flag intro anywhere, dev included. The alternates stay
// in the tree but are reachable only via ?heroLab=1.
const HERO_LAB = new URLSearchParams(window.location.search).has('heroLab');

const MEDAL_HEX = ['#fbbf24', '#cbd5e1', '#f0a868'];
import { FlagDeckHero } from './flag/FlagDeckHero';
import { FlagDemoHero } from './flag/FlagDemoHero';
import { initGA, trackPageView, trackButtonClick, trackGameStart, trackGameEnd } from './analytics';
import { collection, addDoc, query, orderBy, getDocs, serverTimestamp, where, Timestamp, updateDoc, doc, limit, getCountFromServer } from 'firebase/firestore';
import Leaderboard, { BoardData, BoardRow, MyStats } from './components/Leaderboard';
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

const mulberry32 = (a: number) => {
  return function () {
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
  while (options.size < 10) {
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

// Separate RNG instance: drawing from poolRandom here would shift every
// Classic daily colour, past and future.
const duoPoolRandom = mulberry32(9173);

const DUO_POOL = Array.from({ length: 2000 }, () => {
  const targetIndex = Math.floor(duoPoolRandom() * OBJECTS.length);
  let distractorIndex = Math.floor(duoPoolRandom() * OBJECTS.length);
  while (distractorIndex === targetIndex) {
    distractorIndex = Math.floor(duoPoolRandom() * OBJECTS.length);
  }
  return {
    color: generateSeededColor(duoPoolRandom),
    objectIndex: targetIndex,
    options: [targetIndex],
    distractorColor: generateSeededColor(duoPoolRandom),
    distractorObjectIndex: distractorIndex,
    targetPosition: (duoPoolRandom() > 0.5 ? 1 : 0) as 0 | 1
  };
});

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
  switch (mode) {
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

function computeMyStats(docs: { score: number; createdAt: Timestamp | null }[]): MyStats {
  if (docs.length === 0) return { played: 0, avg: 0, streak: 0, maxStreak: 0 };

  // Streak counts calendar days, not `period`: a cycle is 18h, so two
  // periods can land on one day and must not count twice.
  const utcDay = (ms: number) => Math.floor(ms / 86400000);
  const days = [...new Set(
    docs.filter(d => d.createdAt).map(d => utcDay(d.createdAt!.toMillis()))
  )].sort((a, b) => b - a);

  const today = utcDay(Date.now());
  let streak = 0;
  if (days.length && (days[0] === today || days[0] === today - 1)) {
    let cursor = days[0];
    for (const d of days) {
      if (d !== cursor) break;
      streak++;
      cursor--;
    }
  }

  let maxStreak = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i - 1] - days[i] === 1 ? run + 1 : 1;
    maxStreak = Math.max(maxStreak, run);
  }

  return {
    played: docs.length,
    avg: docs.reduce((a, d) => a + d.score, 0) / docs.length,
    streak,
    maxStreak
  };
}

function FlagStatsPanel({ stats, playerName, onRename }: { stats: MyStats | null; playerName: string; onRename: (name: string) => Promise<void> | void }) {
  const [draft, setDraft] = useState(playerName);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(playerName), [playerName]);

  if (!stats || stats.played === 0) {
    return (
      <div className="py-20 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 text-center">
        No games yet. Play a daily round to start your streak.
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      await onRename(draft.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Played', value: String(stats.played) },
          { label: 'Average', value: stats.avg.toFixed(1) },
          { label: 'Streak', value: String(stats.streak) },
          { label: 'Max Streak', value: String(stats.maxStreak) }
        ].map(s => (
          <div key={s.label} className="p-5 rounded-2xl border border-white/10 bg-white/[0.05] text-center">
            <div className="text-3xl font-black tracking-tight text-white">{s.value}</div>
            <div className="text-[10px] uppercase tracking-[0.2em] font-black mt-2 text-white/40">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="Your name"
          value={draft}
          onChange={e => setDraft(e.target.value.slice(0, 20))}
          className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-all font-bold"
        />
        <button
          onClick={save}
          disabled={saving || !draft.trim() || draft.trim() === playerName}
          className="px-6 py-3 rounded-2xl text-sm font-bold tracking-tight transition-all disabled:opacity-40 bg-white text-black hover:bg-zinc-200"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

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
  const [hasPlayedFlagToday, setHasPlayedFlagToday] = useState(false);
  const [showFlagGame, setShowFlagGame] = useState(false);
  const [flagLeaderboard, setFlagLeaderboard] = useState<{ id: string; userId: string; name: string; score: number }[]>([]);
  const [flagTotalPlayers, setFlagTotalPlayers] = useState(0);
  const [flagStats, setFlagStats] = useState<MyStats | null>(null);
  const [flagIntroLayout, setFlagIntroLayout] = useState<'current' | 'split' | 'deck' | 'demo'>('split');
  const [copied, setCopied] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [leaderboardScope, setLeaderboardScope] = useState<'daily' | 'quickplay'>('daily');
  const [leaderboardView, setLeaderboardView] = useState<'today' | 'stats'>('today');
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
  const ALL_SCORE_COLLECTIONS = ['classic_daily_scores', 'classic_quickplay_scores', 'duo_daily_scores', 'duo_quickplay_scores', 'flag_daily_scores'];
  const [isHoveringQuickPlay, setIsHoveringQuickPlay] = useState(false);
  const [isHoveringDuo, setIsHoveringDuo] = useState(false);
  const [isHoveringScore, setIsHoveringScore] = useState(false);
  const [gameEdition, setGameEdition] = useState<'duo' | 'classic' | 'flag'>('duo');
  const [splashTrigger, setSplashTrigger] = useState(0);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const isAdmin = user?.email === 'aneeshakc88@gmail.com';
  const [currentFeedback, setCurrentFeedback] = useState("");
  const [board, setBoard] = useState<BoardData | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [myBestScore, setMyBestScore] = useState<number | null>(null);
  const [myStats, setMyStats] = useState<MyStats | null>(null);
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

  const getDailyDateString = () => cycleDateLabel(getEffectiveCycle());

  const isDailyMode = gameMode === 'daily' || gameMode === 'duo';

  const fetchDayScores = async (collectionName: string, cycle: number): Promise<BoardRow[]> => {
    const q = query(collection(db, collectionName), where('period', '==', cycle));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({
        id: d.id,
        userId: (d.data().userId as string) || '',
        name: (d.data().name as string) || 'Anonymous',
        score: d.data().score as number,
        isPosted: d.data().isPosted !== false
      }))
      .filter(r => r.isPosted)
      .sort((a, b) => b.score - a.score);
  };

  const summarize = (rows: BoardRow[]) =>
    rows.length > 0
      ? { high: rows[0].score, avg: rows.reduce((a, r) => a + r.score, 0) / rows.length }
      : null;

  const refreshDayStats = async (mode: 'daily' | 'duo') => {
    const collectionName = getCollectionName(mode);
    try {
      const stats = summarize(await fetchDayScores(collectionName, getEffectiveCycle()));
      if (mode === 'daily') setDailyStats(stats);
      else setDuoStats(stats);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, collectionName);
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

  const boardMode = (): 'daily' | 'solo' | 'duo' | 'duo-quickplay' =>
    leaderboardScope === 'daily'
      ? (gameEdition === 'duo' ? 'duo' : 'daily')
      : (gameEdition === 'duo' ? 'duo-quickplay' : 'solo');

  const fetchScores = async () => {
    const collectionName = getCollectionName(boardMode());
    const myIds = getMyUserIds();
    setBoardLoading(true);
    try {
      if (leaderboardScope === 'daily') {
        const rows = await fetchDayScores(collectionName, getEffectiveCycle());
        setBoard({ rows, total: rows.length, ...(summarize(rows) ?? { high: null, avg: null }) });
        setMyBestScore(rows.find(r => myIds.includes(r.userId))?.score ?? null);
      } else {
        // All-time hall of fame: QuickPlay colours are random per player, so a
        // day-scoped board would only reward whoever replayed most.
        const topSnap = await getDocs(query(
          collection(db, collectionName),
          where('isPosted', '==', true),
          orderBy('score', 'desc'),
          limit(100)
        ));
        const rows: BoardRow[] = topSnap.docs.map(d => ({
          id: d.id,
          userId: (d.data().userId as string) || '',
          name: (d.data().name as string) || 'Anonymous',
          score: d.data().score as number
        }));
        // The list is capped, so the player count needs its own aggregate read.
        const countSnap = await getCountFromServer(query(
          collection(db, collectionName),
          where('isPosted', '==', true)
        ));
        setBoard({
          rows,
          total: countSnap.data().count,
          ...(summarize(rows) ?? { high: null, avg: null })
        });

        // Their best run can sit outside the top 100, so it needs its own read.
        const mineSnap = await getDocs(query(
          collection(db, collectionName),
          where('userId', 'in', myIds),
          where('isPosted', '==', true)
        ));
        const mine = mineSnap.docs.map(d => d.data().score as number);
        setMyBestScore(mine.length ? Math.max(...mine) : null);
      }
    } catch (error) {
      setBoard({ rows: [], total: 0, high: null, avg: null });
      handleFirestoreError(error, OperationType.GET, collectionName);
    } finally {
      setBoardLoading(false);
    }
  };

  const fetchMyStats = async () => {
    if (leaderboardScope !== 'daily') return;
    const collectionName = getCollectionName(boardMode());
    try {
      const snap = await getDocs(query(
        collection(db, collectionName),
        where('userId', 'in', getMyUserIds())
      ));
      const docs = snap.docs.map(d => ({
        score: d.data().score as number,
        createdAt: d.data().createdAt as Timestamp | null
      }));
      setMyStats(computeMyStats(docs));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, collectionName);
    }
  };

  const fetchFlagStats = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'flag_daily_scores'),
        where('userId', 'in', getMyUserIds())
      ));
      const docs = snap.docs.map(d => ({
        score: d.data().score as number,
        createdAt: d.data().createdAt as Timestamp | null
      }));
      setFlagStats(computeMyStats(docs));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'flag_daily_scores');
    }
  };

  const renameMyScores = async (name: string) => {
    const trimmed = name.slice(0, 20).trim();
    if (!trimmed) return;
    const myId = getUserId();
    try {
      await Promise.all(ALL_SCORE_COLLECTIONS.map(async (collectionName) => {
        const snap = await getDocs(query(
          collection(db, collectionName),
          where('userId', '==', myId)
        ));
        await Promise.all(snap.docs.map(d => updateDoc(d.ref, { name: trimmed })));
      }));
      localStorage.setItem('mastery_player_name', trimmed);
      setPlayerName(trimmed);
      await fetchScores();
      if (gameEdition === 'flag') await fetchFlagScores();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'score_collections');
    }
  };

  useEffect(() => {
    if (!showScoreboard) return;
    fetchScores();
    fetchMyStats();
  }, [showScoreboard, gameEdition, leaderboardScope]);

  const fetchFlagScores = async () => {
    try {
      const q = query(
        collection(db, 'flag_daily_scores'),
        where('isPosted', '==', true),
        where('period', '==', getEffectiveCycle()),
        orderBy('score', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const liveScores = querySnapshot.docs.map(doc => ({
        id: doc.id,
        userId: (doc.data().userId as string) || '',
        name: doc.data().name || 'Anonymous',
        score: doc.data().score,
      }));
      setFlagTotalPlayers(liveScores.length);
      setFlagLeaderboard(liveScores);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'flag_daily_scores');
    }
  };

  useEffect(() => {
    if (gameEdition === 'flag') {
      fetchFlagScores();
      fetchFlagStats();
    }
  }, [showScoreboard, gameEdition]);

  const postGameHistory = async (finalTotal: number, finalRoundData: RoundData[]) => {
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
    } catch (error) {
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
      if (mode === 'daily' || mode === 'duo') refreshDayStats(mode);
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

      setShowScoreboard(true);
      setGameState('start');
    } catch (error) {
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
    let seededDuo: typeof DUO_POOL[number] | null = null;
    if (mode === 'daily') {
      roundInfo = DAILY_POOL[(getEffectiveCycle() * 4 + (r - 1)) % 2000];
    } else if (mode === 'duo') {
      seededDuo = DUO_POOL[(getEffectiveCycle() * 4 + (r - 1)) % 2000];
      roundInfo = seededDuo;
    } else {
      const targetIndex = Math.floor(Math.random() * OBJECTS.length);
      const options = new Set<number>([targetIndex]);
      while (options.size < 10) {
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

    if (seededDuo) {
      setDistractorColor(seededDuo.distractorColor);
      setDistractorObject(() => OBJECTS[seededDuo.distractorObjectIndex]);
      setDuoTargetPosition(seededDuo.targetPosition);
    } else if (mode.startsWith('duo')) {
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
          refreshDayStats('duo');
        } else if (parsedDuo.cycleId !== currentCycle) {
          setHasPlayedDuoToday(false);
        }
      } catch (e) {
        console.error("Failed to parse saved duo state");
      }
    }

    const savedFlagState = localStorage.getItem('flag_daily_state');
    if (savedFlagState) {
      try {
        const parsedFlag = JSON.parse(savedFlagState);
        if (parsedFlag.cycleId === currentCycle && parsedFlag.completed) {
          setHasPlayedFlagToday(true);
        } else if (parsedFlag.cycleId !== currentCycle) {
          setHasPlayedFlagToday(false);
        }
      } catch (e) {
        console.error("Failed to parse saved flag state");
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
    <div className="min-h-[100dvh] w-full flex flex-col bg-white text-zinc-900 font-sans overflow-y-auto overflow-x-hidden relative selection:bg-black selection:text-white select-none">

      {/* Top Left Mode Tabs — hidden on mobile once a round starts (overlaps game UI); always shown from sm breakpoint up */}
      <div className={`fixed top-4 left-4 sm:top-6 sm:left-6 z-50 items-center gap-0.5 sm:gap-1 pointer-events-auto bg-white/95 backdrop-blur-md border border-zinc-200 rounded-full pl-1 pr-1.5 py-1.5 sm:pl-1.5 sm:pr-2 sm:py-2 shadow-xl ${(gameState === 'start' && !showScoreboard && !showFlagGame) ? 'flex' : 'hidden sm:flex'}`}>
          {([
            { key: 'duo' as const, label: 'Duo', played: hasPlayedDuoToday },
            { key: 'classic' as const, label: 'Classic', played: hasPlayedToday },
            { key: 'flag' as const, label: 'Flag', played: hasPlayedFlagToday },
          ]).map(({ key, label, played }) => {
            const active = gameEdition === key;
            return (
              <button
                key={key}
                onClick={() => {
                  if (gameEdition === key) return;
                  audio.playTransition('splash');
                  setSplashTrigger(prev => prev + 1);
                  // Switching mid-round abandons it — no score is saved.
                  setShowFlagGame(false);
                  setShowScoreboard(false);
                  setGameState('start');
                  setTotalScore(0);
                  setRoundData([]);
                  setGameEdition(key);
                }}
                className={`relative px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold uppercase tracking-widest transition-all ${active ? 'bg-black text-white' : 'text-zinc-400 hover:text-zinc-700'}`}
              >
                {label}
                {played && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-orange-500" />
                )}
              </button>
            );
          })}
      </div>

      {/* Flag intro layout switcher — staging/dev only, see HERO_LAB */}
      {HERO_LAB && gameEdition === 'flag' && !showFlagGame && gameState === 'start' && !showScoreboard && (
        <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-50 flex items-center gap-0.5 pointer-events-auto bg-white/95 backdrop-blur-md border border-zinc-200 rounded-full p-1 shadow-xl">
          {([
            { key: 'current' as const, label: 'Current' },
            { key: 'split' as const, label: 'Split Hero' },
            { key: 'deck' as const, label: 'Deck Hero' },
            { key: 'demo' as const, label: 'Live Demo' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { audio.playClick(); setFlagIntroLayout(key); }}
              className={`px-2 py-1.5 sm:px-3 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-colors ${flagIntroLayout === key ? 'bg-black text-white' : 'text-zinc-400 hover:text-zinc-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Footer Links */}
      <div className={`fixed bottom-3 left-0 w-full justify-center lg:bottom-6 lg:left-6 lg:w-auto lg:justify-start z-50 ${(gameState === 'start' && !showScoreboard) ? 'flex' : 'hidden lg:flex'} items-center gap-4 text-[10px] sm:text-xs font-medium text-zinc-400`}>
        <Link to="/terms" className="hover:text-zinc-900 transition-colors">Terms of Service</Link>
        <Link to="/privacy" className="hover:text-zinc-900 transition-colors">Privacy Policy</Link>
        <button 
          onClick={toggleSound} 
          className="hover:text-zinc-900 transition-colors flex items-center cursor-pointer ml-1" 
          aria-label={soundEnabled ? "Mute" : "Unmute"}
        >
           {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative p-4 md:p-8">

        {/* Central Icon Display */}
        {gameState !== 'final' && gameState !== 'ready' && gameState !== 'result' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <AnimatePresence mode="wait">
              {gameState === 'start' && (
                <div className="relative w-full h-full lg:w-[90vw] lg:max-w-[750px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[550px] flex items-center justify-center pointer-events-none">
                  {gameEdition === 'flag' && showFlagGame ? (
                    <FlagGame
                      hasPlayedToday={hasPlayedFlagToday}
                      playerName={playerName}
                      onPlayedToday={() => setHasPlayedFlagToday(true)}
                      onExit={() => setShowFlagGame(false)}
                      onReturnHome={() => {
                        setShowFlagGame(false);
                        audio.playTransition('splash');
                        setSplashTrigger(prev => prev + 1);
                        setGameEdition('duo');
                      }}
                    />
                  ) : (
                  <AnimatePresence mode="wait">
                    {gameEdition === 'duo' ? (
                      <motion.div
                        key="duo-screen"
                        initial={{ clipPath: 'circle(0% at 50% 100%)', scale: 0.8, y: 50 }}
                        animate={{ clipPath: 'circle(150% at 50% 100%)', scale: 1, y: 0 }}
                        exit={{ clipPath: 'circle(0% at 50% 100%)', scale: 1.1, y: -50, zIndex: 10 }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[750px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[550px] bg-black lg:rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center p-6 lg:p-10 overflow-hidden pointer-events-auto border border-zinc-800"
                        style={{ transformStyle: 'preserve-3d' }}
                      >
                        {/* Subtle glow effect */}
                        <div className="absolute inset-0 opacity-20 bg-gradient-to-br from-orange-500/20 to-rose-500/20 blur-3xl scale-150 pointer-events-none" />

                        {showScoreboard ? (
                          <Leaderboard
                            theme="dark"
                            editionLabel="Duo"
                            scope={leaderboardScope}
                            view={leaderboardView}
                            onScopeChange={s => { audio.playClick(); setLeaderboardScope(s); setLeaderboardView('today'); }}
                            onViewChange={v => { audio.playClick(); setLeaderboardView(v); }}
                            onClose={() => { audio.playClick(); setShowScoreboard(false); }}
                            board={board}
                            loading={boardLoading}
                            myUserIds={getMyUserIds()}
                            myBestScore={myBestScore}
                            stats={myStats}
                            playerName={playerName}
                            onRename={renameMyScores}
                            canRename={myStats !== null && myStats.played > 0}
                            onPlayToday={() => {
                              audio.playClick();
                              setShowScoreboard(false);
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
                          />
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
                                <div className="flex-1 sm:flex-none sm:w-48 relative p-[5px] rounded-[1.2rem] overflow-hidden hover:scale-[1.03] active:scale-95 transition-all duration-300 shadow-xl group/rainbow">
                                  <div className="absolute inset-[-500%] bg-[conic-gradient(from_0deg,#ff4545,#f2f245,#45f245,#45f2f2,#4545f2,#f245f2,#ff4545)] animate-spin-slow opacity-40 group-hover/rainbow:opacity-100 transition-opacity" />
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
                                    onMouseEnter={() => audio.playHover()}
                                    className="relative z-10 w-full py-4 sm:py-5 bg-white text-black font-black rounded-2xl flex items-center justify-center text-lg sm:text-xl transition-colors duration-300"
                                  >
                                    Daily
                                  </button>
                                </div>
                                <div className="flex-1 sm:flex-none sm:w-48 relative p-[5px] rounded-[1.2rem] overflow-hidden hover:scale-[1.03] active:scale-95 transition-all duration-300 shadow-xl group/rainbow">
                                  <div className="absolute inset-[-500%] bg-[conic-gradient(from_0deg,#ff4545,#f2f245,#45f245,#45f2f2,#4545f2,#f245f2,#ff4545)] animate-spin-slow opacity-40 group-hover/rainbow:opacity-100 transition-opacity" />
                                  <button
                                    onClick={() => {
                                      audio.playClick();
                                      setTotalScore(0);
                                      setRoundData([]);
                                      startRound(1, 'duo-quickplay');
                                      trackGameStart('Duo - QuickPlay');
                                    }}
                                    onMouseEnter={() => audio.playHover()}
                                    className="relative z-10 w-full py-4 sm:py-5 bg-white text-black font-black rounded-2xl flex items-center justify-center text-lg sm:text-xl transition-colors duration-300"
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
                                  onMouseEnter={() => audio.playHover()}
                                  className="p-4 sm:p-5 bg-zinc-800 text-white rounded-2xl flex items-center justify-center hover:scale-[1.05] hover:bg-zinc-700 hover:shadow-white/5 active:scale-95 transition-all duration-300"
                                >
                                  <Trophy size={24} />
                                </button>
                              </div>
                            </motion.div>
                          </div>
                        )}
                      </motion.div>
                    ) : gameEdition === 'classic' ? (
                      <motion.div
                        key="classic-screen"
                        initial={{ clipPath: 'circle(0% at 50% 100%)', scale: 0.8, y: 50 }}
                        animate={{ clipPath: 'circle(150% at 50% 100%)', scale: 1, y: 0 }}
                        exit={{ clipPath: 'circle(0% at 50% 100%)', scale: 1.1, y: -50, zIndex: 10 }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[750px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[550px] bg-white lg:rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center p-6 lg:p-10 overflow-hidden pointer-events-auto border border-zinc-100"
                      >
                        {showScoreboard ? (
                          <Leaderboard
                            theme="light"
                            editionLabel="Classic"
                            scope={leaderboardScope}
                            view={leaderboardView}
                            onScopeChange={s => { audio.playClick(); setLeaderboardScope(s); setLeaderboardView('today'); }}
                            onViewChange={v => { audio.playClick(); setLeaderboardView(v); }}
                            onClose={() => { audio.playClick(); setShowScoreboard(false); }}
                            board={board}
                            loading={boardLoading}
                            myUserIds={getMyUserIds()}
                            myBestScore={myBestScore}
                            stats={myStats}
                            playerName={playerName}
                            onRename={renameMyScores}
                            canRename={myStats !== null && myStats.played > 0}
                            onPlayToday={() => {
                              audio.playClick();
                              setShowScoreboard(false);
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
                          />
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
                                <div className="flex-1 sm:flex-none sm:w-48 relative p-[5px] rounded-[1.2rem] overflow-hidden hover:scale-[1.03] active:scale-95 transition-all duration-300 shadow-xl group/rainbow">
                                  <div className="absolute inset-[-500%] bg-[conic-gradient(from_0deg,#ff4545,#f2f245,#45f245,#45f2f2,#4545f2,#f245f2,#ff4545)] animate-spin-slow opacity-40 group-hover/rainbow:opacity-100 transition-opacity" />
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
                                    onMouseEnter={() => audio.playHover()}
                                    className="relative z-10 w-full py-4 sm:py-5 bg-black text-white font-black rounded-2xl flex items-center justify-center text-lg sm:text-xl transition-colors duration-300"
                                  >
                                    Daily
                                  </button>
                                </div>
                                <div className="flex-1 sm:flex-none sm:w-48 relative p-[5px] rounded-[1.2rem] overflow-hidden hover:scale-[1.03] active:scale-95 transition-all duration-300 shadow-xl group/rainbow">
                                  <div className="absolute inset-[-500%] bg-[conic-gradient(from_0deg,#ff4545,#f2f245,#45f245,#45f2f2,#4545f2,#f245f2,#ff4545)] animate-spin-slow opacity-40 group-hover/rainbow:opacity-100 transition-opacity" />
                                  <button
                                    onClick={() => {
                                      audio.playClick();
                                      trackButtonClick('QuickPlay');
                                      setTotalScore(0);
                                      setRoundData([]);
                                      startRound(1, 'solo');
                                      trackGameStart('Classic - QuickPlay');
                                    }}
                                    onMouseEnter={() => audio.playHover()}
                                    className="relative z-10 w-full py-4 sm:py-5 bg-black text-white font-black rounded-2xl flex items-center justify-center text-lg sm:text-xl transition-colors duration-300"
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
                                  onMouseEnter={() => audio.playHover()}
                                  className="p-4 sm:p-5 bg-zinc-100 text-black rounded-2xl flex items-center justify-center hover:scale-[1.05] hover:bg-zinc-200 hover:shadow-black/10 active:scale-95 transition-all duration-300"
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
                        key="flag-screen"
                        initial={{ clipPath: 'circle(0% at 50% 100%)', scale: 0.8, y: 50 }}
                        animate={{ clipPath: 'circle(150% at 50% 100%)', scale: 1, y: 0 }}
                        exit={{ clipPath: 'circle(0% at 50% 100%)', scale: 1.1, y: -50, zIndex: 10 }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[750px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[550px] lg:rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center p-6 lg:p-10 overflow-hidden pointer-events-auto border border-zinc-800"
                        style={{
                          transformStyle: 'preserve-3d',
                          background: 'radial-gradient(120% 90% at 50% 0%, #14203a 0%, #0a0e18 60%, #05070d 100%)',
                        }}
                      >
                        <style>{`
                          @keyframes fi-shine { to { background-position: 220% center; } }
                          @keyframes fi-aurora { 0%,100%{ transform: translate(0,0) scale(1); } 33%{ transform: translate(6%,-5%) scale(1.28); } 66%{ transform: translate(-5%,4%) scale(1.12); } }
                          @keyframes fi-cta { 0%,100%{ box-shadow: 0 14px 34px rgba(20,32,58,0.55), 0 0 0 0 rgba(147,180,255,0.16); } 50%{ box-shadow: 0 18px 48px rgba(37,99,235,0.42), 0 0 0 9px rgba(147,180,255,0.10); } }
                          @keyframes fi-sheen { 0%{ transform: translateX(-160%) skewX(-18deg); } 60%,100%{ transform: translateX(320%) skewX(-18deg); } }
                          @keyframes fi-floor { 0%,100%{ opacity: 0.5; transform: translateX(-50%) scaleX(1); } 50%{ opacity: 0.8; transform: translateX(-50%) scaleX(1.1); } }
                          .fi-title { background: linear-gradient(90deg,#5b9bff,#a78bfa,#f472b6,#fbbf24,#5b9bff); background-size: 220% auto; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; animation: fi-shine 6s linear infinite; filter: drop-shadow(0 4px 24px rgba(91,155,255,0.28)); }
                          .fi-aurora { position: absolute; border-radius: 50%; filter: blur(60px); pointer-events: none; animation: fi-aurora var(--adur) ease-in-out infinite; animation-delay: var(--adl); }
                          .fi-cta { animation: fi-cta 2.6s ease-in-out infinite; }
                          .fi-sheen { animation: fi-sheen 4.2s ease-in-out infinite; }
                          .fi-floor { animation: fi-floor 7s ease-in-out infinite; }
                          @media (prefers-reduced-motion: reduce) {
                            .fi-cta, .fi-sheen, .fi-floor, .fi-aurora, .fi-title { animation: none; }
                          }
                        `}</style>

                        {/* Aurora backdrop stays behind the leaderboard too, so both views read as one screen */}
                            <div className="fi-aurora" style={{ top: '-14%', left: '-16%', width: 360, height: 360, background: 'radial-gradient(circle, rgba(37,99,235,0.5), transparent 68%)', ['--adur' as string]: '14s', ['--adl' as string]: '0s' }} />
                            <div className="fi-aurora" style={{ bottom: '-12%', right: '-18%', width: 380, height: 380, background: 'radial-gradient(circle, rgba(239,65,53,0.42), transparent 68%)', ['--adur' as string]: '17s', ['--adl' as string]: '2s' }} />
                            <div className="fi-aurora" style={{ top: '30%', right: '8%', width: 260, height: 260, background: 'radial-gradient(circle, rgba(167,139,250,0.4), transparent 68%)', ['--adur' as string]: '20s', ['--adl' as string]: '1s' }} />
                            <div className="fi-aurora" style={{ bottom: '18%', left: '6%', width: 240, height: 240, background: 'radial-gradient(circle, rgba(34,197,94,0.32), transparent 68%)', ['--adur' as string]: '16s', ['--adl' as string]: '3s' }} />
                            <div className="fi-floor pointer-events-none absolute left-1/2 bottom-[4%] w-[78%] h-28 rounded-[50%] blur-2xl" style={{ background: 'radial-gradient(closest-side, rgba(91,155,255,0.28), rgba(91,155,255,0))' }} />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 z-[2]" style={{ background: 'linear-gradient(to top, #05070d 6%, rgba(5,7,13,0.72) 42%, rgba(5,7,13,0) 100%)' }} />
                        {!showScoreboard && (
                            <button
                              onClick={() => { audio.playClick(); trackButtonClick('Score'); setShowScoreboard(true); }}
                              onMouseEnter={() => audio.playHover()}
                              aria-label="Leaderboard"
                              className="absolute top-4 right-4 lg:top-6 lg:right-6 z-20 w-11 h-11 rounded-full border border-white/15 bg-white/[0.06] text-white flex items-center justify-center hover:bg-white/[0.12] active:scale-95 transition-all"
                            >
                              <Trophy size={20} />
                            </button>
                        )}

                        {showScoreboard ? (
                          <div className="flex flex-col w-full max-w-2xl z-10 h-full">
                            <div className="flex justify-between items-center mb-6">
                              <div className="flex items-center gap-3">
                                <Trophy className="text-white shrink-0" size={24} />
                                <div className="flex flex-col">
                                  <h2 className="fi-title text-3xl font-semibold tracking-tight leading-none">Leaderboard</h2>
                                  <span className="text-[10px] uppercase tracking-[0.2em] font-black text-white/40 mt-1">
                                    {flagTotalPlayers > 0 ? `${flagTotalPlayers} played today` : 'Global rankings'}
                                  </span>
                                </div>
                              </div>
                              <button onClick={() => { audio.playClick(); setShowScoreboard(false); }} className="shrink-0 text-white hover:opacity-70 transition-opacity font-bold uppercase text-xs tracking-widest">
                                Close
                              </button>
                            </div>

                            <div className="flex justify-center mb-5">
                              <div className="flex gap-6">
                                {(['today', 'stats'] as const).map(v => (
                                  <button
                                    key={v}
                                    onClick={() => { audio.playClick(); setLeaderboardView(v); }}
                                    className={`text-[11px] font-bold uppercase tracking-widest pb-1 border-b-2 transition-colors ${
                                      leaderboardView === v
                                        ? 'text-white border-current'
                                        : 'text-white/40 hover:text-white border-transparent'
                                    }`}
                                  >
                                    {v === 'today' ? 'Today' : 'My Stats'}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {leaderboardView === 'stats' ? (
                              <FlagStatsPanel stats={flagStats} playerName={playerName} onRename={renameMyScores} />
                            ) : (
                              <>
                                {flagLeaderboard.length > 0 && (
                                  (() => {
                                    const myIds = getMyUserIds();
                                    const myIndex = flagLeaderboard.findIndex(r => myIds.includes(r.userId));
                                    const myRank = myIndex >= 0 ? myIndex + 1 : null;
                                    return myRank !== null ? (
                                      <div className="mb-3 flex justify-between items-center px-6 py-4 rounded-2xl border border-white/20 bg-white/[0.09] font-bold text-sm text-white">
                                        <span>#{myRank} · You</span>
                                        <span className="font-black">{Math.round(flagLeaderboard[myIndex].score)}<span className="text-white/30 text-xs font-bold">/100</span></span>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          audio.playClick();
                                          setShowScoreboard(false);
                                          trackButtonClick('FlagDaily');
                                          if (!hasPlayedFlagToday) trackGameStart('Flag - Daily');
                                          setShowFlagGame(true);
                                        }}
                                        className="mb-3 w-full px-6 py-4 rounded-2xl border border-white/20 bg-white/[0.09] text-center text-xs font-bold uppercase tracking-widest text-white hover:bg-white/[0.14] active:scale-[0.98] transition-all"
                                      >
                                        Play today's flags to claim your rank
                                      </button>
                                    );
                                  })()
                                )}

                                <div className="space-y-3 overflow-y-auto max-h-[58vh] pr-2">
                                  {flagLeaderboard.length > 0 ? flagLeaderboard.map((entry, i) => (
                                    <div
                                      key={entry.id}
                                      className={`flex justify-between items-center px-6 py-5 rounded-2xl border transition-colors ${i === 0 ? 'bg-white/[0.09] border-white/20' : 'bg-white/[0.05] border-white/10 hover:bg-white/[0.08]'}`}
                                    >
                                      <div className="flex items-center gap-5 min-w-0">
                                        <span
                                          className="font-bold text-lg tabular-nums w-6 shrink-0"
                                          style={{ color: MEDAL_HEX[i] ?? 'rgba(255,255,255,0.35)' }}
                                        >
                                          {i + 1}
                                        </span>
                                        <span className="font-bold text-lg text-white truncate">{entry.name}</span>
                                      </div>
                                      <span className="font-black text-lg text-[#dfe8f6] tabular-nums shrink-0">
                                        {Math.round(entry.score)}
                                        <span className="text-white/30 text-sm">/100</span>
                                      </span>
                                    </div>
                                  )) : (
                                    <div className="py-20 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 text-center">
                                      No scores yet — be the first
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col lg:flex-row h-full items-center justify-start lg:justify-center w-full max-w-2xl gap-4 lg:gap-6 relative z-10 pt-10 sm:pt-0">

                            {flagIntroLayout === 'current' ? (
                              <>
                                {/* display:contents on mobile so the ring can sit between the copy and the CTA */}
                                <div className="contents lg:flex lg:flex-col lg:flex-1 lg:min-w-0 lg:items-start lg:justify-center lg:gap-7">
                                  <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2, duration: 0.8 }}
                                    className="order-1 w-full text-center lg:text-left shrink-0"
                                  >
                                    <h1 className="fi-title text-4xl sm:text-5xl font-black tracking-tighter leading-none">
                                      Flag ColorGuessr
                                    </h1>
                                    <p className="mt-3 text-sm sm:text-base font-semibold text-[#9fb0c4]">
                                      One color is wrong — spot it &amp; fix it
                                    </p>
                                  </motion.div>

                                  <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4, duration: 0.8 }}
                                    className="fi-cta order-3 shrink-0 w-48 relative z-10 p-[5px] rounded-[1.2rem] overflow-hidden hover:scale-[1.03] active:scale-95 transition-all duration-300 group/rainbow"
                                  >
                                    <div className="absolute inset-[-500%] bg-[conic-gradient(from_0deg,#ff4545,#f2f245,#45f245,#45f2f2,#4545f2,#f245f2,#ff4545)] animate-spin-slow opacity-40 group-hover/rainbow:opacity-100 transition-opacity" />
                                    <button
                                      onClick={() => {
                                        audio.playClick();
                                        trackButtonClick('FlagDaily');
                                        if (!hasPlayedFlagToday) trackGameStart('Flag - Daily');
                                        setShowFlagGame(true);
                                      }}
                                      onMouseEnter={() => audio.playHover()}
                                      className="relative z-10 w-full py-4 bg-white text-black font-black rounded-2xl flex items-center justify-center text-lg sm:text-xl transition-colors duration-300 overflow-hidden"
                                    >
                                      Daily
                                      <span className="fi-sheen pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent mix-blend-overlay" />
                                    </button>
                                  </motion.div>
                                </div>

                                <div className="order-2 shrink-0">
                                  <FlagIntroRing />
                                </div>
                              </>
                            ) : flagIntroLayout === 'split' ? (
                              <FlagSplitHero
                                playersToday={flagTotalPlayers}
                                onPlay={() => {
                                  audio.playClick();
                                  trackButtonClick('FlagDaily');
                                  if (!hasPlayedFlagToday) trackGameStart('Flag - Daily');
                                  setShowFlagGame(true);
                                }}
                              />
                            ) : flagIntroLayout === 'deck' ? (
                              <FlagDeckHero
                                playersToday={flagTotalPlayers}
                                onPlay={() => {
                                  audio.playClick();
                                  trackButtonClick('FlagDaily');
                                  if (!hasPlayedFlagToday) trackGameStart('Flag - Daily');
                                  setShowFlagGame(true);
                                }}
                              />
                            ) : (
                              <FlagDemoHero
                                playersToday={flagTotalPlayers}
                                onPlay={() => {
                                  audio.playClick();
                                  trackButtonClick('FlagDaily');
                                  if (!hasPlayedFlagToday) trackGameStart('Flag - Daily');
                                  setShowFlagGame(true);
                                }}
                              />
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  )}

                  {/* Splash Particles Overlay */}
                  <SplashParticles triggerKey={splashTrigger} />

                  {/* Toggle Button moved to Top Right */}

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
                    <div className="fixed bottom-6 left-6 md:left-24 lg:left-32 z-50 pointer-events-auto opacity-0 hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          const provider = new GoogleAuthProvider();
                          signInWithPopup(auth, provider).catch(err => console.error("Admin login error:", err));
                        }}
                        className="text-[8px] text-zinc-200 hover:text-zinc-600 font-bold uppercase tracking-[0.2em]"
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
                  className={`w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[750px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[550px] bg-black backdrop-blur-2xl flex flex-col items-center justify-center shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] lg:rounded-[2.5rem] overflow-hidden pointer-events-auto border border-white/10`}
                >
                  {/* Round Info: Top Left */}
                  <div className="absolute top-16 sm:top-6 left-6 text-white text-xs tracking-widest uppercase">
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
                  className={`w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[750px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[550px] bg-black backdrop-blur-2xl flex shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] lg:rounded-[2.5rem] overflow-hidden pointer-events-auto border border-white/10`}
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
                      bg={`linear-gradient(to bottom, ${hsbToString({ h: userColor.h, s: 100, b: userColor.b })}, ${hsbToString({ h: userColor.h, s: 0, b: userColor.b })})`}
                      type="S"
                    />
                    <VerticalSlider
                      value={userColor.b}
                      max={100}
                      onChange={(v) => setUserColor(prev => ({ ...prev, b: v }))}
                      bg={`linear-gradient(to bottom, ${hsbToString({ h: userColor.h, s: userColor.s, b: 100 })}, ${hsbToString({ h: userColor.h, s: userColor.s, b: 0 })})`}
                      type="B"
                    />
                  </div>

                  {/* Round Info */}
                  <div className="absolute top-16 sm:top-6 left-32 sm:left-32 md:left-40 text-white text-xs tracking-widest uppercase z-20 pointer-events-none">
                    {round}/4
                  </div>

                  {/* Match Text */}
                  {/* (Moved to Canvas container) */}

                  {/* Center: Canvas */}
                  <div className="flex-1 flex flex-col items-center justify-center relative">
                    {/* Match Text */}
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 text-white/60 text-[8px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.3em] uppercase font-bold z-20 whitespace-nowrap pointer-events-none">
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
                <div className="absolute top-16 sm:top-6 left-6 text-white text-xs tracking-widest uppercase z-20">
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
                className="w-full h-full fixed inset-0 overflow-y-auto lg:relative lg:w-[90vw] lg:max-w-[750px] lg:h-auto lg:min-h-[450px] lg:overflow-hidden bg-black backdrop-blur-2xl flex flex-col items-center justify-center shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] lg:rounded-[2.5rem] pointer-events-auto border border-white/10 py-12 px-6 md:px-12"
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
                  {/* Daily auto-posts on finish, so its name entry is optional and only renames the existing row. */}
                  <div className="flex flex-col gap-1.5 w-full">
                    <div className="flex gap-2 w-full items-center">
                      <div className="relative group flex-1">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-white transition-colors">
                          <User size={18} />
                        </div>
                        <input
                          type="text"
                          placeholder={isDailyMode ? 'Enter your name (optional)' : 'Enter your name'}
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
                            {isDailyMode ? 'Save' : 'Post'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>

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

                {/* Cross Promotion / Return Button */}
                <button
                  onClick={() => {
                    audio.playTransition('splash');
                    setSplashTrigger(prev => prev + 1);
                    setGameEdition(prev => prev === 'duo' ? 'classic' : 'duo');
                    setGameState('start');
                  }}
                  className="mt-6 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black rounded-full shadow-lg hover:shadow-[0_0_30px_rgba(239,68,68,0.6)] hover:scale-105 active:scale-95 transition-all duration-300 flex items-center justify-center gap-3 text-xs tracking-widest uppercase"
                >
                  Play More Colorecall: {gameEdition === 'duo' ? 'Classic Edition' : 'Duo Edition'} <ArrowRight size={16} />
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

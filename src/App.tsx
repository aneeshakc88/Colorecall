import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ArrowLeftRight, Share2, Trophy, User, Calendar, Send, Volume2, VolumeX, RefreshCw, CircleHelp } from 'lucide-react';
import { GenIcon, type IconBaseProps, type IconTree } from 'react-icons';
import { SHAPE_COUNT, SHAPE_VERSION } from './shape-icons';
import { db } from './firebase';
import { getDynamicFeedback } from './utils';
import { audio } from './utils/audio';
import { Color, hsbToRgb, hsbToString, VerticalSlider, HorizontalSlider, AnimatedScore, getUserId, getMyUserIds, getUserType, getDeviceType, generateSessionId } from './utils/colorMath';
import { getCurrentCycle, getNextResetTime, cycleDateLabel } from './daily-cycle';

// Split Hero is the only flag intro anywhere, dev included. The alternates stay
// in the tree but are reachable only via ?heroLab=1.
const HERO_LAB = new URLSearchParams(window.location.search).has('heroLab');

// Lazy so the 586KB club badge dataset stays out of the main bundle. The intro
// hero renders the day's real badges, so it pulls the same chunk.
const CrestGame = React.lazy(() => import('./crest/CrestGame'));
const CrestSplitHero = React.lazy(() => import('./crest/CrestSplitHero').then(m => ({ default: m.CrestSplitHero })));
// Same for the flag dataset.
const FlagGame = React.lazy(() => import('./flag/FlagGame'));
const FlagIntroRing = React.lazy(() => import('./flag/FlagRing').then(m => ({ default: m.FlagIntroRing })));
const FlagSplitHero = React.lazy(() => import('./flag/FlagSplitHero').then(m => ({ default: m.FlagSplitHero })));
const FlagDeckHero = React.lazy(() => import('./flag/FlagDeckHero').then(m => ({ default: m.FlagDeckHero })));
const FlagDemoHero = React.lazy(() => import('./flag/FlagDemoHero').then(m => ({ default: m.FlagDemoHero })));

// Each shape icon is its own ~0.4KB file (generated from shapes.ts), so a round fetches only the
// icons it shows instead of all of them. OBJECTS is filled as icons arrive; one component per index
// keeps the === / indexOf comparisons in scoring working.
const OBJECTS: React.ElementType[] = [];
const iconLoads = new Map<number, Promise<void>>();
const loadIcon = (i: number) => {
  let p = iconLoads.get(i);
  if (!p) {
    p = fetch(`/shape-icons/${i}.json?v=${SHAPE_VERSION}`)
      .then(r => { if (!r.ok) throw new Error(`shape icon ${i}: HTTP ${r.status}`); return r.json() as Promise<IconTree>; })
      .then(tree => { OBJECTS[i] = GenIcon(tree); });
    p.catch(() => iconLoads.delete(i));
    iconLoads.set(i, p);
  }
  return p;
};
const loadIcons = (indices: number[]) => Promise.all(indices.map(loadIcon));
// Local copy of react-icons FaTimes: importing it from 'react-icons/fa' would pull the whole icon set back into this chunk.
const FaTimes = (props: IconBaseProps) => GenIcon({"tag":"svg","attr":{"viewBox":"0 0 352 512"},"child":[{"tag":"path","attr":{"d":"M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"},"child":[]}]})(props);

const MEDAL_HEX =['#fbbf24', '#cbd5e1', '#f0a868'];
import { initGA, trackPageView, trackButtonClick, trackGameStart, trackGameEnd } from './analytics';
import { collection, addDoc, query, orderBy, getDocs, serverTimestamp, where, Timestamp, updateDoc, doc, limit, getCountFromServer } from 'firebase/firestore';
import Leaderboard, { BoardData, BoardRow, MyStats } from './components/Leaderboard';
import { signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, User as FirebaseUser } from 'firebase/auth';
import { auth } from './firebase';
import { PAGES, SITE_URL, type Edition } from './seo/pages';
import HowToPlay from './seo/HowToPlay';
import { getGuestName, DisplayNameButton, DisplayNameModal } from './components/DisplayName';

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

// Round result as two colour bands (shown on top, answer below). false reverts to the side-by-side card.
const BAND_RESULT = true;

// Black or white, whichever the band's own luminance can carry.
const inkOn = (c: Color) => {
  const [r, g, b] = hsbToRgb(c.h, c.s, c.b);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.94)';
};

const EDITION_PATHS = Object.fromEntries(Object.entries(PAGES).map(([k, p]) => [k, p.path])) as Record<Edition, string>;
const applySeo = (edition: Edition) => {
  const { path, title, socialTitle = title, description } = PAGES[edition];
  const url = SITE_URL + path;
  const set = (selector: string, attr: string, value: string) =>
    document.head.querySelector(selector)?.setAttribute(attr, value);
  document.title = title;
  set('meta[name="description"]', 'content', description);
  for (const p of ['og', 'twitter']) {
    set(`meta[property="${p}:title"]`, 'content', socialTitle);
    set(`meta[property="${p}:description"]`, 'content', description);
    set(`meta[property="${p}:url"]`, 'content', url);
  }
  set('link[rel="canonical"]', 'href', url);
};
const editionFromPath = (path: string): Edition =>
  (Object.keys(EDITION_PATHS) as Edition[]).find(k => k !== 'duo' && EDITION_PATHS[k] === path.replace(/\/+$/, '')) ?? 'duo';

type GameState ='start' | 'ready' | 'memorize' | 'pick' | 'recreate' | 'result' | 'final';

type RoundData = {
  targetColor: Color;
  userColor: Color;
  targetObjectIndex: number;
  userObjectIndex: number;
  score: number;
};

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
  const targetIndex = Math.floor(poolRandom() * SHAPE_COUNT);
  const options = new Set<number>([targetIndex]);
  while (options.size < 10) {
    options.add(Math.floor(poolRandom() * SHAPE_COUNT));
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
  const targetIndex = Math.floor(duoPoolRandom() * SHAPE_COUNT);
  let distractorIndex = Math.floor(duoPoolRandom() * SHAPE_COUNT);
  while (distractorIndex === targetIndex) {
    distractorIndex = Math.floor(duoPoolRandom() * SHAPE_COUNT);
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

type PlannedRound = {
  color: Color;
  objectIndex: number;
  options: number[];
  distractorColor?: Color;
  distractorObjectIndex?: number;
  targetPosition?: 0 | 1;
};

const randomRound = (duo: boolean): PlannedRound => {
  const targetIndex = Math.floor(Math.random() * SHAPE_COUNT);
  const options = new Set<number>([targetIndex]);
  while (options.size < 10) {
    options.add(Math.floor(Math.random() * SHAPE_COUNT));
  }
  const optionsArray = Array.from(options);
  for (let i = optionsArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [optionsArray[i], optionsArray[j]] = [optionsArray[j], optionsArray[i]];
  }
  const round: PlannedRound = {
    color: {
      h: Math.floor(Math.random() * 360),
      s: 20 + Math.floor(Math.random() * 81),
      b: 20 + Math.floor(Math.random() * 61)
    },
    objectIndex: targetIndex,
    options: optionsArray
  };
  if (duo) {
    round.distractorColor = {
      h: Math.floor(Math.random() * 360),
      s: 20 + Math.floor(Math.random() * 81),
      b: 20 + Math.floor(Math.random() * 61)
    };
    let distractorIdx = Math.floor(Math.random() * SHAPE_COUNT);
    while (distractorIdx === targetIndex) {
      distractorIdx = Math.floor(Math.random() * SHAPE_COUNT);
    }
    round.distractorObjectIndex = distractorIdx;
    round.targetPosition = Math.random() > 0.5 ? 1 : 0;
  }
  return round;
};

// Duo rounds show only the target and distractor (no shape picker), so the 10 options aren't fetched.
const roundIcons = (p: PlannedRound) =>
  p.distractorObjectIndex === undefined ? [p.objectIndex, ...p.options] : [p.objectIndex, p.distractorObjectIndex];

const savedRoundIcons = (saved: { roundData?: RoundData[] }) =>
  (saved.roundData || []).flatMap(d => [d.targetObjectIndex, d.userObjectIndex]).filter(i => i >= 0 && i < SHAPE_COUNT);

type GameMode = 'daily' | 'solo' | 'duo' | 'duo-quickplay';
// Quick Play rounds are rolled one ahead so their icons are already fetched when the player taps.
const upcomingRandom: Partial<Record<'solo' | 'duo-quickplay', PlannedRound>> = {};
const planRound = (r: number, mode: GameMode, cycle: number): PlannedRound => {
  if (mode === 'daily') return DAILY_POOL[(cycle * 4 + (r - 1)) % 2000];
  if (mode === 'duo') return DUO_POOL[(cycle * 4 + (r - 1)) % 2000];
  return upcomingRandom[mode] ??= randomRound(mode === 'duo-quickplay');
};
const prefetchRound = (r: number, mode: GameMode, cycle: number) => {
  loadIcons(roundIcons(planRound(r, mode, cycle))).catch(() => {});
};
// What this page's start buttons open: round 1 of each mode, or today's saved results if already played.
const prefetchStartScreen = (edition: Edition, cycle: number) => {
  const modes: [string, GameMode, GameMode] | null =
    edition === 'duo' ? ['duo_daily_chroma_state', 'duo', 'duo-quickplay'] :
    edition === 'classic' ? ['daily_chroma_state', 'daily', 'solo'] : null;
  if (!modes) return;
  const [savedKey, daily, quick] = modes;
  let saved: { cycleId?: number; completed?: boolean; roundData?: RoundData[] } = {};
  try { saved = JSON.parse(localStorage.getItem(savedKey) || '{}'); } catch {}
  if (saved.cycleId === cycle && saved.completed) loadIcons(savedRoundIcons(saved)).catch(() => {});
  else prefetchRound(1, daily, cycle);
  prefetchRound(1, quick, cycle);
};
// Start as soon as this module runs, before React's first render.
prefetchStartScreen(editionFromPath(window.location.pathname), getCurrentCycle());

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
  const [memoProgress, setMemoProgress] = useState(0);
  const [shutter, setShutter] = useState(false);
  const [targetObject, setTargetObject] = useState<React.ElementType>(OBJECTS[0]);
  const [distractorObject, setDistractorObject] = useState<React.ElementType>(OBJECTS[0]);
  const [duoTargetPosition, setDuoTargetPosition] = useState<0 | 1>(0);
  const [userObject, setUserObject] = useState<React.ElementType>(OBJECTS[0]);
  const [hasPlayedToday, setHasPlayedToday] = useState(false);
  const [hasPlayedDuoToday, setHasPlayedDuoToday] = useState(false);
  const [hasPlayedFlagToday, setHasPlayedFlagToday] = useState(false);
  const [showFlagGame, setShowFlagGame] = useState(false);
  const [hasPlayedColorSportToday, setHasPlayedColorSportToday] = useState(false);
  const [showCrestGame, setShowCrestGame] = useState(false);
  const [colorSportLeaderboard, setColorSportLeaderboard] = useState<{ id: string; userId: string; name: string; score: number }[]>([]);
  const [colorSportTotalPlayers, setColorSportTotalPlayers] = useState(0);
  const [colorSportStats, setColorSportStats] = useState<MyStats | null>(null);
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
  const [guestName] = useState(getGuestName);
  const displayName = playerName.trim() || guestName;
  const [showNameModal, setShowNameModal] = useState(false);
  const closeNameModal = useCallback(() => setShowNameModal(false), []);
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
  const ALL_SCORE_COLLECTIONS = ['classic_daily_scores', 'classic_quickplay_scores', 'duo_daily_scores', 'duo_quickplay_scores', 'flag_daily_scores', 'colorsport_daily_scores'];
  const [isHoveringQuickPlay, setIsHoveringQuickPlay] = useState(false);
  const [isHoveringDuo, setIsHoveringDuo] = useState(false);
  const [isHoveringScore, setIsHoveringScore] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const closeHowToPlay = useCallback(() => setShowHowToPlay(false), []);
  const location = useLocation();
  const navigate = useNavigate();
  const gameEdition = editionFromPath(location.pathname);
  const setGameEdition = (next: Edition | ((prev: Edition) => Edition)) =>
    navigate(EDITION_PATHS[typeof next === 'function' ? next(gameEdition) : next]);
  // URL is the source of truth, so back/forward also abandon any round in progress.
  useEffect(() => {
    applySeo(gameEdition);
    setShowFlagGame(false);
    setShowCrestGame(false);
    setShowScoreboard(false);
    setGameState('start');
    setTotalScore(0);
    setRoundData([]);
  }, [gameEdition]);
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

  const fetchColorSportStats = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'colorsport_daily_scores'),
        where('userId', 'in', getMyUserIds())
      ));
      const docs = snap.docs.map(d => ({
        score: d.data().score as number,
        createdAt: d.data().createdAt as Timestamp | null
      }));
      setColorSportStats(computeMyStats(docs));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'colorsport_daily_scores');
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
      if (gameEdition === 'crest') await fetchColorSportScores();
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
  }, [showScoreboard, gameEdition, showFlagGame]);

  const fetchColorSportScores = async () => {
    try {
      const q = query(
        collection(db, 'colorsport_daily_scores'),
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
      setColorSportTotalPlayers(liveScores.length);
      setColorSportLeaderboard(liveScores);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'colorsport_daily_scores');
    }
  };

  useEffect(() => {
    if (gameEdition === 'crest') {
      fetchColorSportScores();
      fetchColorSportStats();
    }
  }, [showScoreboard, gameEdition, showCrestGame]);

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
      const nameToSave = isDaily ? displayName : (playerName.trim() || 'Anonymous');
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

  // The round's icons download during the 2s "Focus." countdown (which shows none); memorize waits for them.
  const [roundIconsReady, setRoundIconsReady] = useState(false);
  const roundToken = useRef(0);

  const startRound = (r: number, mode: 'daily' | 'solo' | 'duo' | 'duo-quickplay' = gameMode) => {
    const roundInfo = planRound(r, mode, getEffectiveCycle());
    if (mode === 'solo' || mode === 'duo-quickplay') delete upcomingRandom[mode];
    const token = ++roundToken.current;
    setRoundIconsReady(false);
    const retry = () => loadIcons(roundIcons(roundInfo)).then(() => {
      if (token !== roundToken.current) return;
      setTargetObject(() => OBJECTS[roundInfo.objectIndex]);
      setUserObject(() => mode.startsWith('duo') ? OBJECTS[roundInfo.objectIndex] : OBJECTS[roundInfo.options[0]]);
      if (mode.startsWith('duo')) setDistractorObject(() => OBJECTS[roundInfo.distractorObjectIndex!]);
      setRoundIconsReady(true);
    }, () => { if (token === roundToken.current) setTimeout(retry, 1000); });
    retry();
    setRound(r);
    setGameMode(mode);

    if (r === 1) {
      setCurrentScoreDocId(null);
      if (mode === 'daily') {
        setCurrentSessionId(generateSessionId());
      }
    }

    setTargetColor(roundInfo.color);
    setUserColor({ h: 180, s: 50, b: 100 });
    setCurrentOptions(roundInfo.options);

    if (mode.startsWith('duo')) {
      setDistractorColor(roundInfo.distractorColor!);
      setDuoTargetPosition(roundInfo.targetPosition!);
    }

    // Next round (or, after the last, the next game's first) downloads while this one is played.
    prefetchRound(r < 4 ? r + 1 : 1, mode, getEffectiveCycle());
    setCountdown(2);
    setGameState('ready');
  };

  // Covers client-side navigation between editions and the admin day offset.
  useEffect(() => prefetchStartScreen(gameEdition, getEffectiveCycle()), [gameEdition, cycleOffset]);

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

    const savedColorSportState = localStorage.getItem('colorsport_daily_state');
    if (savedColorSportState) {
      try {
        const parsedColorSport = JSON.parse(savedColorSportState);
        setHasPlayedColorSportToday(parsedColorSport.cycleId === currentCycle && !!parsedColorSport.completed);
      } catch (e) {
        console.error("Failed to parse saved Color-sport state");
      }
    }
  }, [cycleOffset]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (gameState === 'ready') {
      if (countdown > 0) {
        audio.playCountdownBeep();
        timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      }
    } else if (gameState === 'memorize' && gameMode.startsWith('duo')) {
      if (countdown === 0) {
        // Just entered memorize state. Wait 200ms before starting the 5s countdown.
        timer = setTimeout(() => {
          setCountdown(5);
        }, 200);
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

  // Separate from the countdown effect so icons arriving mid-countdown don't restart its timer.
  useEffect(() => {
    if (gameState !== 'ready' || countdown !== 0 || !roundIconsReady) return;
    audio.playGoBeep();
    if (!gameMode.startsWith('duo')) setCountdown(5);
    setGameState('memorize');
    // countdown is already 0 here, which triggers the 200ms delay in the 'memorize' block
  }, [gameState, countdown, roundIconsReady]);

  // Classic memorize, ported from Recall: 200ms beat, then one clock drives the ring
  // and the number; each drop of the number ticks (4,3,2,1,0), and the shutter snaps at 0.
  useEffect(() => {
    if (gameState !== 'memorize' || gameMode.startsWith('duo')) return;
    const seconds = 5;
    let raf = 0, spoken = seconds;
    setCountdown(seconds); setMemoProgress(0);
    const t = setTimeout(() => {
      let t0 = 0;
      const step = (ts: number) => {
        t0 ||= ts;
        const p = Math.min((ts - t0) / (seconds * 1000), 1);
        setMemoProgress(p);
        const left = Math.ceil((1 - p) * seconds);
        if (left < spoken) { spoken = left; setCountdown(left); audio.playMemoTick(); }
        if (p < 1) { raf = requestAnimationFrame(step); return; }
        setShutter(true);
      };
      raf = requestAnimationFrame(step);
    }, 200);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [gameState]);

  // Swap screens while the shutter fully covers them, then clear the overlay.
  useEffect(() => {
    if (!shutter) return;
    const t1 = setTimeout(() => setGameState('pick'), 190);
    const t2 = setTimeout(() => setShutter(false), 440);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [shutter]);

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
      <div className={`fixed top-4 left-4 sm:top-6 sm:left-6 z-50 items-center gap-0.5 sm:gap-1 pointer-events-auto bg-white/95 backdrop-blur-md border border-zinc-200 rounded-full pl-1 pr-1.5 py-1.5 sm:pl-1.5 sm:pr-2 sm:py-2 shadow-xl ${(gameState === 'start' && !showScoreboard && !showFlagGame && !showCrestGame) ? 'flex' : 'hidden sm:flex'}`}>
          {([
            { key: 'duo' as const, label: 'Duo', played: hasPlayedDuoToday },
            { key: 'classic' as const, label: 'Classic', played: hasPlayedToday },
            { key: 'flag' as const, label: 'Flag', played: hasPlayedFlagToday },
            { key: 'crest' as const, label: 'Football Logo', played: hasPlayedColorSportToday },
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

      {/* Display name — top-right from sm up; below sm the mode tabs fill the top row, so it lives in the footer */}
      {gameState === 'start' && !showScoreboard && !showFlagGame && !showCrestGame && !(HERO_LAB && gameEdition === 'flag') && (
        <div className="fixed top-6 right-6 z-50 hidden sm:flex items-center pointer-events-auto bg-white/95 backdrop-blur-md border border-zinc-200 rounded-full px-4 py-2.5 shadow-xl text-xs font-bold text-zinc-500">
          <DisplayNameButton name={displayName} onClick={() => { audio.playClick(); setShowNameModal(true); }} />
        </div>
      )}
      <DisplayNameModal open={showNameModal} name={displayName} suggested={guestName} onClose={closeNameModal} onSave={renameMyScores} />

      {/* Footer Links */}
      <div className={`fixed bottom-3 left-0 w-full justify-center lg:bottom-6 lg:left-6 lg:w-auto lg:justify-start z-50 ${(gameState === 'start' && !showScoreboard) ? 'flex' : 'hidden lg:flex'} items-center gap-4 text-[10px] sm:text-xs font-medium text-zinc-400`}>
        <DisplayNameButton name={displayName} onClick={() => { audio.playClick(); setShowNameModal(true); }} className="sm:hidden font-bold text-zinc-500" />
        <Link to="/terms" className="hover:text-zinc-900 transition-colors">Terms of Service</Link>
        <Link to="/privacy" className="hover:text-zinc-900 transition-colors">Privacy Policy</Link>
        <button 
          onClick={toggleSound} 
          className="hover:text-zinc-900 transition-colors flex items-center cursor-pointer ml-1" 
          aria-label={soundEnabled ? "Mute" : "Unmute"}
        >
           {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
        <button
          onClick={() => { audio.playClick(); setShowHowToPlay(true); }}
          className="hover:text-zinc-900 transition-colors flex items-center cursor-pointer"
          aria-label="How to play"
          aria-controls="how-to-play"
        >
          <CircleHelp size={14} />
        </button>
      </div>
      <HowToPlay edition={gameEdition} open={showHowToPlay} onClose={closeHowToPlay} />

      {/* Main Content Area */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative p-4 md:p-8">

        {/* Central Icon Display */}
        {gameState !== 'final' && gameState !== 'ready' && gameState !== 'result' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <AnimatePresence mode="wait">
              {gameState === 'start' && (
                <div className="relative w-full h-full lg:w-[90vw] lg:max-w-[810px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[594px] flex items-center justify-center pointer-events-none">
                  {gameEdition === 'crest' && showCrestGame ? (
                    <React.Suspense fallback={<div className="text-white/50 text-[10px] tracking-[0.2em] uppercase font-bold">Loading badges…</div>}>
                      <CrestGame
                        hasPlayedToday={hasPlayedColorSportToday}
                        playerName={displayName}
                        onPlayedToday={() => setHasPlayedColorSportToday(true)}
                        onExit={() => setShowCrestGame(false)}
                        onReturnHome={() => {
                          setShowCrestGame(false);
                          audio.playTransition('splash');
                          setSplashTrigger(prev => prev + 1);
                          setGameEdition('duo');
                        }}
                      />
                    </React.Suspense>
                  ) : gameEdition === 'flag' && showFlagGame ? (
                    <React.Suspense fallback={<div className="text-white/50 text-[10px] tracking-[0.2em] uppercase font-bold">Loading flags…</div>}>
                    <FlagGame
                      hasPlayedToday={hasPlayedFlagToday}
                      playerName={displayName}
                      onPlayedToday={() => setHasPlayedFlagToday(true)}
                      onExit={() => setShowFlagGame(false)}
                      onReturnHome={() => {
                        setShowFlagGame(false);
                        audio.playTransition('splash');
                        setSplashTrigger(prev => prev + 1);
                        setGameEdition('duo');
                      }}
                    />
                    </React.Suspense>
                  ) : (
                  <AnimatePresence mode="wait">
                    {gameEdition === 'duo' ? (
                      <motion.div
                        key="duo-screen"
                        initial={{ clipPath: 'circle(0% at 50% 100%)', scale: 0.8, y: 50 }}
                        animate={{ clipPath: 'circle(150% at 50% 100%)', scale: 1, y: 0 }}
                        exit={{ clipPath: 'circle(0% at 50% 100%)', scale: 1.1, y: -50, zIndex: 10 }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[810px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[594px] bg-black lg:rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center p-6 lg:p-10 overflow-hidden pointer-events-auto border border-zinc-800"
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
                            playerName={displayName}
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
                                  loadIcons(savedRoundIcons(parsed)).then(() => setGameState('final'));
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
                          <div className="flex flex-col h-full justify-start sm:justify-between items-start w-full max-w-2xl gap-8 sm:gap-4 relative z-10 pt-16 lg:pt-2">
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
                                          loadIcons(savedRoundIcons(parsed)).then(() => setGameState('final'));
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
                        className="w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[810px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[594px] bg-white lg:rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center p-6 lg:p-10 overflow-hidden pointer-events-auto border border-zinc-100"
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
                            playerName={displayName}
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
                                  loadIcons(savedRoundIcons(parsed)).then(() => setGameState('final'));
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
                          <div className="flex flex-col h-full justify-start sm:justify-between items-start w-full max-w-2xl gap-8 sm:gap-4 relative z-10 pt-16 lg:pt-2">
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
                                          loadIcons(savedRoundIcons(parsed)).then(() => setGameState('final'));
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
                    ) : gameEdition === 'crest' ? (
                      <motion.div
                        key="crest-screen"
                        initial={{ clipPath: 'circle(0% at 50% 100%)', scale: 0.8, y: 50 }}
                        animate={{ clipPath: 'circle(150% at 50% 100%)', scale: 1, y: 0 }}
                        exit={{ clipPath: 'circle(0% at 50% 100%)', scale: 1.1, y: -50, zIndex: 10 }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[810px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[594px] lg:rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center p-6 lg:p-10 overflow-hidden pointer-events-auto border border-zinc-800"
                        style={{
                          transformStyle: 'preserve-3d',
                          background: 'radial-gradient(120% 90% at 50% 0%, #123a28 0%, #08180f 58%, #030705 100%)',
                        }}
                      >
                        {!showScoreboard && (
                          <button
                            onClick={() => { audio.playClick(); trackButtonClick('Score'); setShowScoreboard(true); }}
                            onMouseEnter={() => audio.playHover()}
                            aria-label="Leaderboard"
                            className="absolute top-6 right-6 z-20 w-11 h-11 rounded-full border border-white/15 bg-white/[0.06] text-white hidden lg:flex items-center justify-center hover:bg-white/[0.12] active:scale-95 transition-all"
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
                                  <h2 className="text-3xl font-semibold tracking-tight leading-none text-white">Leaderboard</h2>
                                  <span className="text-[10px] uppercase tracking-[0.2em] font-black text-white/40 mt-1">
                                    {colorSportTotalPlayers > 0 ? `${colorSportTotalPlayers} played today` : 'Global rankings'}
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
                              <FlagStatsPanel stats={colorSportStats} playerName={displayName} onRename={renameMyScores} />
                            ) : (
                              <>
                                {colorSportLeaderboard.length > 0 && (
                                  (() => {
                                    const myIds = getMyUserIds();
                                    const myIndex = colorSportLeaderboard.findIndex(r => myIds.includes(r.userId));
                                    const myRank = myIndex >= 0 ? myIndex + 1 : null;
                                    return myRank !== null ? (
                                      <div className="mb-3 flex justify-between items-center px-6 py-4 rounded-2xl border border-white/20 bg-white/[0.09] font-bold text-sm text-white">
                                        <span>#{myRank} &middot; You</span>
                                        <span className="font-black">{Math.round(colorSportLeaderboard[myIndex].score)}<span className="text-white/30 text-xs font-bold">/100</span></span>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          audio.playClick();
                                          setShowScoreboard(false);
                                          trackButtonClick('ColorSportDaily');
                                          if (!hasPlayedColorSportToday) trackGameStart('Color-sport - Daily');
                                          setShowCrestGame(true);
                                        }}
                                        className="mb-3 w-full px-6 py-4 rounded-2xl border border-white/20 bg-white/[0.09] text-center text-xs font-bold uppercase tracking-widest text-white hover:bg-white/[0.14] active:scale-[0.98] transition-all"
                                      >
                                        Play the daily badges to claim your rank
                                      </button>
                                    );
                                  })()
                                )}

                                <div className="space-y-3 overflow-y-auto max-h-[58vh] pr-2">
                                  {colorSportLeaderboard.length > 0 ? colorSportLeaderboard.map((entry, i) => (
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
                                      <span className="font-black text-lg text-[#c9f2dd] tabular-nums shrink-0">
                                        {Math.round(entry.score)}
                                        <span className="text-white/30 text-sm">/100</span>
                                      </span>
                                    </div>
                                  )) : (
                                    <div className="py-20 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 text-center">
                                      No scores yet &mdash; be the first
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col h-full items-center justify-center w-full max-w-2xl relative z-10">
                            <React.Suspense fallback={<div className="text-white/40 text-[10px] tracking-[0.2em] uppercase font-bold">Loading badges…</div>}>
                              <CrestSplitHero
                                playersToday={colorSportTotalPlayers}
                                playedToday={hasPlayedColorSportToday}
                                onLeaderboard={() => { audio.playClick(); trackButtonClick('Score'); setShowScoreboard(true); }}
                                onPlay={() => {
                                  audio.playClick();
                                  trackButtonClick('ColorSportDaily');
                                  if (!hasPlayedColorSportToday) trackGameStart('Color-sport - Daily');
                                  setShowCrestGame(true);
                                }}
                              />
                            </React.Suspense>
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
                        className="w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[810px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[594px] lg:rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center p-6 lg:p-10 overflow-hidden pointer-events-auto border border-zinc-800"
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
                              className={`absolute top-4 right-4 lg:top-6 lg:right-6 z-20 w-11 h-11 rounded-full border border-white/15 bg-white/[0.06] text-white ${flagIntroLayout === 'split' ? 'hidden lg:flex' : 'flex'} items-center justify-center hover:bg-white/[0.12] active:scale-95 transition-all`}
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
                              <FlagStatsPanel stats={flagStats} playerName={displayName} onRename={renameMyScores} />
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

                            <React.Suspense fallback={<div className="text-white/40 text-[10px] tracking-[0.2em] uppercase font-bold">Loading flags…</div>}>
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
                                playedToday={hasPlayedFlagToday}
                                onLeaderboard={() => { audio.playClick(); trackButtonClick('Score'); setShowScoreboard(true); }}
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
                            </React.Suspense>
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
                  className={`w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[810px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[594px] ${gameMode.startsWith('duo') ? 'bg-black' : 'bg-[#1A1A1B]'} backdrop-blur-2xl flex flex-col items-center justify-center shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] lg:rounded-[2.5rem] overflow-hidden pointer-events-auto border border-white/10`}
                >
                  {/* Round Info: Top Left */}
                  <div className="absolute top-16 sm:top-6 left-6 text-white text-xs tracking-widest uppercase">
                    {round}/4
                  </div>

                  {/* Top Right: Score and Observe Text */}
                  {gameMode.startsWith('duo') && (
                  <div className="absolute top-2 right-6 flex flex-col items-center text-right">
                    <div className={`text-4xl md:text-5xl font-bold text-white tracking-tighter transition-opacity duration-200 ${countdown > 0 ? 'opacity-100' : 'opacity-0'}`}>
                      {countdown > 0 ? countdown : 5}
                    </div>
                    <div className={`text-xs text-zinc-400 tracking-widest mt-1 transition-opacity duration-200 ${countdown > 0 ? 'opacity-100' : 'opacity-0'}`}>
                      Seconds to observe the Shapes and Colors
                    </div>
                  </div>
                  )}

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
                    <>
                      {/* Countdown is drawn around the shape, so the eye never leaves it. */}
                      <div className="relative grid place-items-center w-[min(62vmin,300px)] aspect-square">
                        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
                          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="2.5" />
                          <circle cx="50" cy="50" r="46" fill="none" stroke={hsbToString(targetColor)} strokeWidth="2.5" strokeLinecap="round"
                            strokeDasharray={2 * Math.PI * 46} strokeDashoffset={2 * Math.PI * 46 * memoProgress} />
                        </svg>
                        <TargetIcon
                          className="w-[42%] h-[42%] drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
                          style={{ color: hsbToString(targetColor) }}
                        />
                      </div>
                      <div className="absolute bottom-[clamp(14px,4vh,28px)] left-1/2 -translate-x-1/2 text-[10px] tracking-[0.18em] uppercase font-bold text-zinc-600 tabular-nums whitespace-nowrap">
                        {countdown}s — shape and color
                      </div>
                    </>
                  )}
                </motion.div>
              )}
              {gameState === 'pick' && (
                <motion.div
                  key="pick"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[810px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[594px] bg-[#1A1A1B] backdrop-blur-2xl flex flex-col px-4 sm:px-6 pt-24 sm:pt-16 pb-6 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] lg:rounded-[2.5rem] overflow-hidden pointer-events-auto border border-white/10`}
                >
                  <div className="absolute top-16 sm:top-6 left-6 text-white text-xs tracking-widest uppercase">
                    {round}/4
                  </div>
                  <div className="absolute top-16 sm:top-6 left-1/2 -translate-x-1/2 text-white/60 text-[9px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.3em] uppercase font-bold whitespace-nowrap pointer-events-none">
                    Which shape was it?
                  </div>
                  <div className="flex-1 min-h-0 grid grid-cols-[repeat(auto-fit,minmax(56px,1fr))] content-center gap-2 sm:gap-3 overflow-y-auto hide-scrollbar">
                    {currentOptions.map((optionIndex) => {
                      const ShapeIcon = OBJECTS[optionIndex];
                      return (
                        <button
                          key={optionIndex}
                          aria-label="Shape option"
                          onClick={() => {
                            audio.playShapeSliderTick();
                            setUserObject(() => ShapeIcon);
                            setGameState('recreate');
                          }}
                          className="aspect-square rounded-[22%] bg-[#26262C] text-[#7E7B8A] hover:bg-[#32323A] hover:text-[#C6C3D2] active:scale-90 grid place-items-center transition-all"
                        >
                          <ShapeIcon className="w-[52%] h-[52%]" />
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
              {gameState === 'recreate' && !gameMode.startsWith('duo') && (
                <motion.div
                  key="mix"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[810px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[594px] bg-[#1A1A1B] backdrop-blur-2xl flex flex-col px-4 sm:px-8 pt-24 sm:pt-16 pb-24 sm:pb-24 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] lg:rounded-[2.5rem] overflow-hidden pointer-events-auto border border-white/10`}
                >
                  <div className="absolute top-16 sm:top-6 left-6 text-white text-xs tracking-widest uppercase z-20 pointer-events-none">
                    {round}/4
                  </div>
                  <div className="absolute top-16 sm:top-6 left-1/2 -translate-x-1/2 text-white/60 text-[9px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.3em] uppercase font-bold z-20 whitespace-nowrap pointer-events-none">
                    Which color was it?
                  </div>
                  {/* Shape above the bars when tall; side by side once the card is wider than tall. */}
                  <div className="flex-1 min-h-0 flex flex-col landscape:flex-row items-center gap-4 sm:gap-6">
                    <div className="flex-1 min-h-0 w-full grid place-items-center">
                      <button
                        onClick={() => { audio.playClick(); setGameState('pick'); }}
                        aria-label="Change shape"
                        className="group grid justify-items-center gap-2 sm:gap-3 p-2.5 rounded-3xl hover:bg-white/5 transition-colors"
                      >
                        <UserIcon
                          className="w-[min(40vw,24vh,180px)] h-[min(40vw,24vh,180px)] transition-[color,transform] duration-200 group-hover:scale-105"
                          style={{ color: hsbToString(userColor) }}
                        />
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/20 bg-white/10 group-hover:bg-white/15 group-hover:border-white/40 text-[9.5px] tracking-[0.14em] uppercase font-bold text-zinc-200 whitespace-nowrap transition-colors">
                          <ArrowLeftRight size={13} strokeWidth={2.4} />Tap to change shape
                        </span>
                      </button>
                    </div>
                    <div className="w-full landscape:max-w-[380px] grid gap-3 sm:gap-4">
                      <HorizontalSlider
                        label="Hue"
                        suffix="°"
                        value={userColor.h}
                        max={360}
                        type="H"
                        onChange={(v) => setUserColor(prev => ({ ...prev, h: v }))}
                        bg="linear-gradient(to right, #ff0000 0%, #ffff00 16.67%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.67%, #ff00ff 83.33%, #ff0000 100%)"
                      />
                      <HorizontalSlider
                        label="Saturation"
                        value={userColor.s}
                        max={100}
                        type="S"
                        onChange={(v) => setUserColor(prev => ({ ...prev, s: v }))}
                        bg={`linear-gradient(to right, ${hsbToString({ ...userColor, s: 0 })}, ${hsbToString({ ...userColor, s: 100 })})`}
                      />
                      <HorizontalSlider
                        label="Brightness"
                        value={userColor.b}
                        max={100}
                        type="B"
                        onChange={(v) => setUserColor(prev => ({ ...prev, b: v }))}
                        bg={`linear-gradient(to right, #000, ${hsbToString({ ...userColor, b: 100 })})`}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      trackButtonClick('Lock it in');
                      handleSubmit();
                    }}
                    className="absolute bottom-5 right-5 sm:bottom-7 sm:right-8 h-14 sm:h-16 px-6 sm:px-8 bg-white text-black hover:brightness-90 active:scale-[0.98] rounded-full text-sm sm:text-[15px] font-extrabold tracking-tight transition-all shadow-2xl"
                  >
                    Lock it in
                  </button>
                </motion.div>
              )}
              {gameState === 'recreate' && gameMode.startsWith('duo') && (
                <motion.div
                  key="user-icon"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[810px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[594px] bg-black backdrop-blur-2xl flex shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] lg:rounded-[2.5rem] overflow-hidden pointer-events-auto border border-white/10`}
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
                      Match the color
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {shutter && (
          <motion.div
            className="fixed inset-0 z-[60] bg-[#0E0E0F] origin-center pointer-events-none"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: [0, 1, 1, 0] }}
            transition={{ duration: 0.42, times: [0, 0.38, 0.62, 1], ease: [0.7, 0, 0.3, 1] }}
          />
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

            {/* STATE: RESULT (Classic, bands) */}
            {gameState === 'result' && BAND_RESULT && (() => {
              const tInk = inkOn(targetColor), uInk = inkOn(userColor);
              const wrongShape = targetObject !== userObject;
              return (
                <motion.div
                  key="result-bands"
                  initial={{ opacity: 0, scale: 0.95, y: 40 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -40 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[810px] lg:h-[65vh] lg:min-h-[450px] lg:max-h-[594px] grid grid-rows-2 [container-type:size] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] lg:rounded-[2.5rem] overflow-hidden pointer-events-auto border border-white/10"
                >
                  <div className="relative grid place-items-center overflow-hidden" style={{ background: hsbToString(targetColor), color: tInk }}>
                    <div className="absolute top-16 sm:top-[clamp(16px,4cqh,28px)] left-[clamp(16px,4.5cqw,30px)] text-[11px] font-bold tracking-[0.12em] uppercase opacity-60">
                      Round {round} / 4
                    </div>
                    <div className="absolute top-14 sm:top-[clamp(8px,2.4cqh,20px)] right-[clamp(16px,4.5cqw,30px)] grid gap-0.5 justify-items-end text-right">
                      <b className="text-[min(14cqmin,64px)] font-extrabold leading-[0.84] tracking-[-0.05em] tabular-nums">
                        <AnimatedScore value={score} onComplete={() => {
                          setTimeout(() => {
                            setShowScoreText(true);
                            audio.playScoreReveal();
                          }, 150);
                        }} />
                        <i className="not-italic text-[min(5.9cqmin,27px)] opacity-55 tracking-[-0.02em]"> / 25</i>
                      </b>
                      <span className={`text-[clamp(11px,2.7cqmin,14px)] italic transition-all duration-300 ${showScoreText ? 'opacity-75 translate-y-0' : 'opacity-0 translate-y-1.5'}`}>
                        {getScoreText(score)}
                      </span>
                    </div>
                    <TargetIcon className="w-[min(18cqmin,84px)] h-[min(18cqmin,84px)]" />
                    <div className="absolute left-[clamp(16px,4.5cqw,30px)] right-[clamp(16px,4.5cqw,30px)] bottom-[clamp(13px,3.4cqh,26px)] grid gap-0.5">
                      <div className="text-[10px] tracking-[0.16em] uppercase font-bold opacity-60">Shown</div>
                      <div className="text-[clamp(11px,2.9cqmin,15px)] font-bold tracking-tight tabular-nums">H{targetColor.h} S{targetColor.s} B{targetColor.b}</div>
                    </div>
                  </div>
                  <motion.div
                    className="relative grid place-items-center overflow-hidden"
                    style={{ background: hsbToString(userColor), color: uInk }}
                    initial={{ clipPath: 'inset(100% 0 0 0)' }}
                    animate={{ clipPath: 'inset(0% 0 0 0)' }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <UserIcon className="w-[min(18cqmin,84px)] h-[min(18cqmin,84px)]" />
                    <div className="absolute left-[clamp(16px,4.5cqw,30px)] right-[clamp(16px,4.5cqw,30px)] bottom-[clamp(13px,3.4cqh,26px)] grid gap-0.5">
                      <div className="text-[10px] tracking-[0.16em] uppercase font-bold opacity-60">Your answer</div>
                      <div className="text-[clamp(11px,2.9cqmin,15px)] font-bold tracking-tight tabular-nums">H{userColor.h} S{userColor.s} B{userColor.b}{wrongShape ? ' — wrong shape' : ''}</div>
                    </div>
                    <button
                      onClick={handleNextRound}
                      aria-label={round < 4 ? 'Next round' : 'See final score'}
                      className="absolute right-[clamp(16px,4.5cqw,30px)] bottom-[clamp(16px,4cqh,28px)] w-[clamp(52px,12cqmin,66px)] aspect-square rounded-full grid place-items-center active:scale-[0.93] transition-transform"
                      style={{ background: uInk, color: hsbToString(userColor) }}
                    >
                      <ArrowRight className="w-[44%] h-[44%]" />
                    </button>
                  </motion.div>
                </motion.div>
              );
            })()}

            {/* STATE: RESULT */}
            {gameState === 'result' && !BAND_RESULT && (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.95, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -40 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-[90vw] max-w-[810px] h-[65vh] min-h-[450px] max-h-[594px] bg-black backdrop-blur-2xl flex flex-col items-center justify-center shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] rounded-[2.5rem] overflow-hidden pointer-events-auto border border-white/10 p-8 md:p-12"
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
                className="w-full h-full fixed inset-0 overflow-y-auto lg:relative lg:w-[90vw] lg:max-w-[810px] lg:h-auto lg:min-h-[450px] lg:overflow-hidden bg-black backdrop-blur-2xl flex flex-col items-center justify-center shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] lg:rounded-[2.5rem] pointer-events-auto border border-white/10 py-12 px-6 md:px-12"
              >
                <button
                  onClick={() => { audio.playClick(); setGameState('start'); }}
                  className="absolute top-6 right-6 p-4 text-white hover:opacity-70 transition-opacity z-10"
                >
                  <FaTimes size={24} />
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

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Share2, X } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { audio } from '../utils/audio';
import { trackGameEnd } from '../analytics';
import { Color, VerticalSlider, AnimatedScore, getUserId, getUserType, getDeviceType, generateSessionId } from '../utils/colorMath';
import { getDailyCrestPuzzle, hexToHsb, colorToHex, calcScore, CREST_MAX_PER_ROUND, type CrestRound } from './crest-core';
import { getCurrentCycle, getNextResetTime, cycleDateLabel } from '../daily-cycle';
import { swapRegion, regionOutlineRaster, applyOverlay, viewBoxRatio, type Raster } from '../flag/flag-highlight';

type Phase = 'playing' | 'result' | 'final';

type RoundResult = {
  crestName: string;
  actualHex: string;
  guessHex: string;
  score: number;
};

const SAVE_KEY = 'colorsport_daily_state';

const ROUND_MSGS: Record<string, string[]> = {
  perfect: ['Kit man accuracy.', 'Perfect. Club shop approved.', 'Dead on. That badge is yours.', 'Uncanny colour memory.'],
  great: ['Sharp eye for the shade.', 'Nearly nailed the badge.', 'You know this badge.', 'Solid read on the colour.'],
  decent: ['Close enough for the away kit.', 'You had the right idea.', 'Not bad — a fair guess.', 'The badge forgives you.'],
  bad: ['Colour memory needs work.', 'Bold choice. Wrong, but bold.', 'The club shop frowns.', 'Were you guessing blind?'],
  terrible: ['Never seen this badge before?', 'Impressively off.', 'That badge is embarrassed.', 'Way off the mark.'],
};
function getRoundMsg(score: number): string {
  const key = score >= 21 ? 'perfect' : score >= 16 ? 'great' : score >= 11 ? 'decent' : score >= 5 ? 'bad' : 'terrible';
  const pool = ROUND_MSGS[key]!;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

// ── marching ants: every badge is curved, so the raster tracer always runs ──

// Must match MIN_LOOP_FRAC in scripts/build-crests.ts — the build only keeps regions
// that trace a ring at this setting, so rendering at a different one would either
// show confetti the build vetted out or nothing at all.
const CREST_MIN_LOOP_FRAC = 0.06;

async function rasterizeSvg(svg: string, width: number): Promise<Raster> {
  const height = Math.max(2, Math.round(width / viewBoxRatio(svg)));
  const sized = svg.replace(/^<svg/, `<svg width="${width}" height="${height}"`);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('svg rasterize failed'));
      img.src = url;
    });
    const cv = document.createElement('canvas');
    cv.width = width;
    cv.height = height;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function useRegionOutline(svg: string | undefined, hex: string): string | null {
  const [rastered, setRastered] = useState<{ key: string; overlay: string } | null>(null);
  const key = svg ? svg + hex : '';
  useEffect(() => {
    if (!svg) return;
    let live = true;
    regionOutlineRaster(svg, hex, rasterizeSvg, undefined, { minLoopFrac: CREST_MIN_LOOP_FRAC })
      .then((o) => { if (live) setRastered({ key, overlay: o }); })
      .catch(() => {});
    return () => { live = false; };
  }, [svg, hex, key]);
  return rastered?.key === key ? rastered.overlay : null;
}

const MAT_COLOR = '#808080';
const MAT_RATIO = 0.05;

function CrestImg({ svg, hiddenHex, swapHex, height }: { svg: string; hiddenHex: string; swapHex: string; height: number }) {
  const overlay = useRegionOutline(svg, hiddenHex);
  let out = swapRegion(svg, hiddenHex, swapHex);
  out = applyOverlay(out, overlay);
  const ratio = viewBoxRatio(svg);
  // Same neutral 18% grey mat as the flag daily: badges carry white and black
  // regions alike, so no page background bounds all of them, and grey is the
  // neutral ground for judging a colour.
  const mat = Math.max(3, Math.round(height * MAT_RATIO));
  return (
    <div
      className="shrink-0 rounded-xl"
      style={{
        padding: mat,
        background: MAT_COLOR,
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        maxWidth: '100%',
      }}
    >
      <div
        className="overflow-hidden rounded-md [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
        style={{ height, width: Math.round(height * ratio), maxWidth: '100%' }}
        dangerouslySetInnerHTML={{ __html: out }}
      />
    </div>
  );
}

const CARD_BASE = "w-full h-full fixed inset-0 lg:relative lg:w-[90vw] lg:max-w-[750px] bg-black backdrop-blur-2xl overflow-hidden pointer-events-auto border border-white/10";
const CARD_PLAY = `${CARD_BASE} lg:h-[65vh] lg:min-h-[450px] lg:max-h-[550px] flex flex-col shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] lg:rounded-[2.5rem]`;
const CARD_FINAL = `${CARD_BASE} lg:h-auto lg:min-h-[450px] flex flex-col items-center justify-center shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] lg:rounded-[2.5rem] py-12 px-6 md:px-12`;

interface CrestGameProps {
  hasPlayedToday: boolean;
  onPlayedToday: () => void;
  onExit: () => void;
  onReturnHome: () => void;
  playerName: string;
}

export default function CrestGame({ hasPlayedToday: _hasPlayedToday, onPlayedToday, onExit, onReturnHome, playerName }: CrestGameProps) {
  const [cycle] = useState(() => getCurrentCycle());
  const [rounds] = useState<CrestRound[]>(() => getDailyCrestPuzzle(getCurrentCycle()));
  const [currentRound, setCurrentRound] = useState(0);
  const [color, setColor] = useState<Color>({ h: 0, s: 0, b: 50 });
  const [phase, setPhase] = useState<Phase>('playing');
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const [roundMsg, setRoundMsg] = useState('');
  const [showScoreText, setShowScoreText] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [nextCountdown, setNextCountdown] = useState('');
  const [copied, setCopied] = useState(false);
  const crestBoxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  const [boxH, setBoxH] = useState(0);

  const round = rounds[currentRound];
  const maxTotal = rounds.length * CREST_MAX_PER_ROUND;

  useEffect(() => {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.cycleId === cycle && parsed.completed && parsed.results?.length === rounds.length) {
          setRoundResults(parsed.results);
          setTotalScore(parsed.totalScore || 0);
          setPhase('final');
          return;
        }
      } catch { /* ignore corrupt state */ }
    }
    const first = rounds[0];
    if (first) setColor(hexToHsb(first.wrongHex));
  }, []);

  useEffect(() => {
    if (phase !== 'final') return;
    const tick = () => {
      const diff = getNextResetTime() - Date.now();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setNextCountdown(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const el = crestBoxRef.current;
    if (!el) return;
    const update = () => { setBoxW(el.clientWidth); setBoxH(el.clientHeight); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase, currentRound]);

  const finishGame = async (total: number, results: RoundResult[]) => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ cycleId: cycle, completed: true, totalScore: total, results }));
    onPlayedToday();
    trackGameEnd(total, 'Color-sport - Daily');
    try {
      await addDoc(collection(db, 'colorsport_daily_scores'), {
        sessionId: generateSessionId(),
        createdAt: serverTimestamp(),
        period: cycle,
        score: total,
        mode: 'colorsport',
        deviceType: getDeviceType(),
        userId: getUserId(),
        userType: getUserType(),
        name: playerName || 'BB',
        isPosted: true,
      });
    } catch (e) {
      console.error('Failed to post Color-sport score', e);
    }
  };

  const handleSubmit = () => {
    if (!round) return;
    audio.playClick();
    const guessHex = colorToHex(color);
    const score = calcScore(round.hiddenHex, guessHex);
    if (score >= 21) audio.playSuccess();
    const result: RoundResult = { crestName: round.crest.name, actualHex: round.hiddenHex, guessHex, score };
    setLastResult(result);
    setShowScoreText(false);
    setRoundMsg(getRoundMsg(score));
    setRoundResults(prev => [...prev, result]);
    setPhase('result');
  };

  const handleContinue = () => {
    audio.playClick();
    if (!lastResult) return;
    const isLast = currentRound + 1 >= rounds.length;
    if (isLast) {
      const total = Math.round(roundResults.reduce((s, r) => s + r.score, 0));
      setTotalScore(total);
      setPhase('final');
      finishGame(total, roundResults);
    } else {
      const next = currentRound + 1;
      setCurrentRound(next);
      const r = rounds[next];
      if (r) setColor(hexToHsb(r.wrongHex));
      setLastResult(null);
      setPhase('playing');
    }
  };

  const handleShare = () => {
    audio.playClick();
    const dateStr = cycleDateLabel(cycle);
    let grid = "";
    roundResults.forEach(r => {
      if (r.score >= 21) grid += "🟩";
      else if (r.score >= 16) grid += "🟨";
      else if (r.score >= 11) grid += "🟧";
      else grid += "🟥";
    });
    const text = `Color-sport Daily - ${dateStr}\nScore: ${totalScore}/${maxTotal}\n${grid}\nPlay at: https://www.colorecall.com/`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const crestRatio = round ? viewBoxRatio(round.crest.svg) : 1;
  // /(1+2*MAT_RATIO): the mat sits outside `height`, so the badge shrinks to keep the framed card inside its box.
  const crestHeight = Math.max(40, Math.min(boxH || 200, boxW ? boxW / crestRatio : 200) / (1 + 2 * MAT_RATIO));

  if (phase === 'playing' && round) {
    return (
      <div className={CARD_PLAY} style={{ transformStyle: 'preserve-3d' }}>
        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex flex-shrink-0">
            <VerticalSlider
              value={color.h}
              max={360}
              onChange={(v) => setColor(prev => ({ ...prev, h: v }))}
              bg="linear-gradient(to bottom, #ff0000 0%, #ffff00 16.67%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.67%, #ff00ff 83.33%, #ff0000 100%)"
              type="H"
            />
            <VerticalSlider
              value={color.s}
              max={100}
              onChange={(v) => setColor(prev => ({ ...prev, s: v }))}
              bg={`linear-gradient(to bottom, ${colorToHex({ h: color.h, s: 100, b: color.b })}, ${colorToHex({ h: color.h, s: 0, b: color.b })})`}
              type="S"
            />
            <VerticalSlider
              value={color.b}
              max={100}
              onChange={(v) => setColor(prev => ({ ...prev, b: v }))}
              bg={`linear-gradient(to bottom, ${colorToHex({ h: color.h, s: color.s, b: 100 })}, ${colorToHex({ h: color.h, s: color.s, b: 0 })})`}
              type="B"
            />
          </div>

          <div className="absolute top-16 sm:top-6 left-32 sm:left-32 md:left-40 text-white text-xs tracking-widest uppercase z-20 pointer-events-none">
            {currentRound + 1}/{rounds.length}
          </div>

          <div className="flex-1 flex flex-col items-center justify-center relative px-4">
            <div className="absolute top-10 sm:top-12 left-1/2 -translate-x-1/2 text-white/60 text-xs sm:text-sm tracking-[0.15em] sm:tracking-[0.2em] uppercase font-bold z-20 text-center max-w-[80%]">
              Fix the wrong colour in the <span className="text-white">{round.crest.name}</span> badge
            </div>

            <div ref={crestBoxRef} className="w-full max-w-[200px] sm:max-w-[260px] md:max-w-xs h-28 sm:h-36 md:h-44 flex items-center justify-center">
              <CrestImg svg={round.crest.svg} hiddenHex={round.hiddenHex} swapHex={colorToHex(color)} height={crestHeight} />
            </div>

            <button
              onClick={handleSubmit}
              className="absolute bottom-6 right-6 px-8 py-3 bg-white text-black hover:bg-zinc-200 active:scale-[0.95] rounded-xl text-sm font-bold tracking-tight transition-all duration-300 shadow-2xl"
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'result' && lastResult) {
    const isLast = currentRound + 1 >= rounds.length;
    return (
      <div className={CARD_PLAY} style={{ transformStyle: 'preserve-3d' }}>
        <div className="relative flex-1 flex flex-col items-center justify-center p-8 md:p-12">
          <div className="absolute top-16 sm:top-6 left-6 text-white text-xs tracking-widest uppercase z-20">
            {currentRound + 1}/{rounds.length}
          </div>

          <div className="absolute top-6 right-6 flex flex-col items-end text-right">
            <div className="flex items-baseline gap-1 mb-1">
              <h2 className="text-5xl md:text-6xl font-bold tracking-tighter leading-none text-white">
                <AnimatedScore value={lastResult.score} onComplete={() => {
                  setTimeout(() => { setShowScoreText(true); audio.playScoreReveal(); }, 150);
                }} />
              </h2>
              <span className="text-xl md:text-2xl text-zinc-500 font-bold">/{CREST_MAX_PER_ROUND}</span>
            </div>
            <p className={`text-zinc-400 text-xs md:text-sm font-medium italic max-w-[200px] leading-tight transition-all duration-300 ease-out transform ${showScoreText ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              "{roundMsg}"
            </p>
          </div>

          <div className="flex items-center justify-center gap-10 md:gap-16 mb-6 mt-4">
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 md:w-28 md:h-28 rounded-2xl mb-4 shadow-[0_20px_50px_rgba(0,0,0,0.4)]" style={{ background: lastResult.actualHex }} />
              <p className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold mb-1">Actual</p>
              <p className="text-xs md:text-sm tracking-tight text-zinc-400 font-mono">{lastResult.actualHex}</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 md:w-28 md:h-28 rounded-2xl mb-4 shadow-[0_20px_50px_rgba(0,0,0,0.4)]" style={{ background: lastResult.guessHex }} />
              <p className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold mb-1">Your Guess</p>
              <p className="text-xs md:text-sm tracking-tight text-zinc-400 font-mono">{lastResult.guessHex}</p>
            </div>
          </div>
          <p className="text-white/50 text-[10px] uppercase tracking-widest font-bold">{lastResult.crestName}</p>

          <div className="absolute bottom-6 right-6">
            <button
              onClick={handleContinue}
              className="px-8 py-5 bg-white text-black rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-white/20 font-bold text-lg"
            >
              {isLast ? 'See Final Score' : ''}
              <ArrowRight size={24} className={isLast ? "ml-3" : ""} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // phase === 'final'
  return (
    <div className={CARD_FINAL}>
      <button
        onClick={() => { audio.playClick(); onExit(); }}
        className="absolute top-6 right-6 p-4 text-white hover:opacity-70 transition-opacity z-10"
      >
        <X size={24} />
      </button>

      <p className="text-white text-[10px] tracking-[0.3em] uppercase font-bold mb-4 opacity-50">Color-sport Mastery</p>

      <div className="flex items-baseline justify-center gap-2 mb-6">
        <h2 className="text-5xl md:text-6xl font-bold tracking-tighter leading-none text-white">
          <AnimatedScore value={totalScore} />
        </h2>
        <span className="text-xl text-zinc-500 font-bold">/{maxTotal}</span>
      </div>

      <p className="text-zinc-300 text-lg md:text-xl font-medium italic mb-4 max-w-lg text-center">
        {totalScore >= 85 ? '"Club colour encyclopedia. Remarkable."' :
          totalScore >= 60 ? '"Solid badge knowledge."' :
            totalScore >= 40 ? '"Some badges stumped you. Fair."' : '"Back to the club shop."'}
      </p>

      <div className="text-zinc-500 text-[10px] tracking-[0.2em] uppercase font-bold mb-6">
        Next in {nextCountdown}
      </div>

      <div className="flex gap-2 md:gap-3 mb-4 w-full justify-center flex-wrap px-4">
        {roundResults.map((r, i) => (
          <div key={i} className="relative w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden shadow-sm border border-white/10 flex-shrink-0 bg-black">
            <div className="absolute inset-0" style={{ background: r.actualHex, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
            <div className="absolute inset-0" style={{ background: r.guessHex, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-white text-[10px] md:text-xs font-bold drop-shadow-md bg-black/20 px-1 rounded">{r.score}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 w-full max-w-sm mt-4">
        <button
          onClick={handleShare}
          className="flex-1 px-6 py-4 bg-zinc-800 text-white hover:bg-zinc-700 rounded-2xl text-sm font-bold tracking-tight transition-all duration-300 flex items-center justify-center gap-3 border border-white/5"
        >
          <Share2 size={16} />
          {copied ? 'Copied!' : 'Share'}
        </button>
      </div>

      <p className="text-white/40 text-[10px] tracking-widest uppercase mt-4 text-center font-bold">
        Come back tomorrow for four new clubs.
      </p>

      <button
        onClick={() => { audio.playClick(); onReturnHome(); }}
        className="mt-6 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-black rounded-full shadow-lg hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] hover:scale-105 active:scale-95 transition-all duration-300 flex items-center justify-center gap-3 text-xs tracking-widest uppercase"
      >
        Play More Colorecall: Duo Edition <ArrowRight size={16} />
      </button>
    </div>
  );
}

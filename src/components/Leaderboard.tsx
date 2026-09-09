import { useEffect, useState } from 'react';
import { Trophy, User } from 'lucide-react';

const MEDAL_HEX = ['#fbbf24', '#cbd5e1', '#f0a868'];

export type BoardRow = {
  id: string;
  userId: string;
  name: string;
  score: number;
};

export type BoardData = {
  rows: BoardRow[];
  /** Every player in scope — larger than `rows` when the list is capped. */
  total: number;
  high: number | null;
  avg: number | null;
};

export type MyStats = {
  played: number;
  avg: number;
  streak: number;
  maxStreak: number;
};

type Theme = 'dark' | 'light';

const T = {
  dark: {
    heading: 'text-white',
    sub: 'text-zinc-500',
    close: 'text-white',
    trophy: 'text-white',
    pillTrack: 'bg-zinc-800/50',
    pillOn: 'bg-white text-black',
    pillOff: 'text-zinc-400 hover:text-white',
    row: 'bg-zinc-900 border-zinc-800 text-white',
    rowMine: 'bg-white/10 border-white/40 text-white',
    rowFaint: 'bg-zinc-900/60 border-zinc-700 text-white',
    rank: 'text-white/50',
    empty: 'text-white/50',
    strip: 'text-zinc-400',
    stripValue: 'text-white',
    bar: 'bg-white text-black',
    input: 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30',
    inputIcon: 'text-white/30',
    button: 'bg-white text-black hover:bg-zinc-200'
  },
  light: {
    heading: 'text-black',
    sub: 'text-zinc-400',
    close: 'text-black',
    trophy: 'text-amber-500',
    pillTrack: 'bg-zinc-100',
    pillOn: 'bg-black text-white',
    pillOff: 'text-zinc-500 hover:text-black',
    row: 'bg-zinc-50 border-zinc-100 text-black',
    rowMine: 'bg-amber-50 border-amber-300 text-black',
    rowFaint: 'bg-zinc-100/70 border-zinc-200 text-black',
    rank: 'text-black/30',
    empty: 'text-black/40',
    strip: 'text-zinc-500',
    stripValue: 'text-black',
    bar: 'bg-black text-white',
    input: 'bg-black/5 border-black/10 text-black placeholder:text-black/25 focus:border-black/30',
    inputIcon: 'text-black/30',
    button: 'bg-black text-white hover:bg-zinc-800'
  }
} as const;

const topPercent = (rank: number, total: number) =>
  Math.min(100, Math.max(1, Math.ceil((rank / total) * 100)));

type Props = {
  theme: Theme;
  scope: 'daily' | 'quickplay';
  view: 'today' | 'stats';
  onScopeChange: (s: 'daily' | 'quickplay') => void;
  onViewChange: (v: 'today' | 'stats') => void;
  onClose: () => void;
  editionLabel: string;
  board: BoardData | null;
  loading: boolean;
  myUserIds: string[];
  myBestScore: number | null;
  stats: MyStats | null;
  playerName: string;
  onRename: (name: string) => Promise<void> | void;
  canRename: boolean;
  onPlayToday: () => void;
};

export default function Leaderboard({
  theme, scope, view, onScopeChange, onViewChange, onClose, editionLabel,
  board, loading, myUserIds, myBestScore, stats, playerName, onRename, canRename, onPlayToday
}: Props) {
  const t = T[theme];

  const rows = board?.rows ?? [];
  const total = board?.total ?? 0;
  const capped = rows.length < total;
  const myBestIndex = rows.findIndex(r => myUserIds.includes(r.userId));
  const myRank = myBestIndex >= 0 ? myBestIndex + 1 : null;
  const myRow = myBestIndex >= 0 ? rows[myBestIndex] : null;

  return (
    <div className="flex flex-col w-full max-w-2xl z-10 h-full">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Trophy className={t.trophy} size={24} />
          <div className="flex flex-col">
            <h2 className={`text-3xl font-semibold tracking-tight leading-none ${t.heading}`}>Leaderboard</h2>
            <span className={`text-[10px] uppercase tracking-[0.2em] font-black mt-1 ${t.sub}`}>
              {total > 0
                ? `${total} ${editionLabel} ${scope === 'daily' ? 'today' : 'all time'}${capped ? ` · top ${rows.length}` : ''}`
                : 'Global Rankings'}
            </span>
          </div>
        </div>
        <button onClick={onClose} className={`hover:opacity-70 transition-opacity font-bold uppercase text-xs tracking-widest ${t.close}`}>
          Close
        </button>
      </div>

      <div className="flex justify-center mb-4">
        <div className={`flex p-1 rounded-full ${t.pillTrack}`}>
          <button
            onClick={() => onScopeChange('daily')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors ${scope === 'daily' ? t.pillOn : t.pillOff}`}
          >
            Daily
          </button>
          <button
            onClick={() => onScopeChange('quickplay')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors ${scope === 'quickplay' ? t.pillOn : t.pillOff}`}
          >
            Quick Play
          </button>
        </div>
      </div>

      {scope === 'daily' && (
        <div className="flex justify-center mb-5">
          <div className="flex gap-6">
            {(['today', 'stats'] as const).map(v => (
              <button
                key={v}
                onClick={() => onViewChange(v)}
                className={`text-[11px] font-bold uppercase tracking-widest pb-1 border-b-2 transition-colors ${
                  view === v
                    ? `${t.heading} border-current`
                    : `${t.pillOff} border-transparent`
                }`}
              >
                {v === 'today' ? 'Today' : 'My Stats'}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className={`py-20 font-bold italic uppercase tracking-widest text-xs text-center ${t.empty}`}>
          Loading…
        </div>
      ) : view === 'stats' && scope === 'daily' ? (
        <StatsPanel t={t} stats={stats} playerName={playerName} onRename={onRename} canRename={canRename} />
      ) : (
        <>
          {scope === 'quickplay' && rows.length > 0 && (
            <div className={`flex items-baseline justify-between mb-3 px-1 text-[11px] font-bold uppercase tracking-widest ${t.strip}`}>
              <span>
                All-time best:{' '}
                <span className={t.stripValue}>{rows[0].name} · {rows[0].score.toFixed(2)}</span>
              </span>
            </div>
          )}

          {rows.length > 0 && (
            myRank !== null ? (
              <div className={`mb-3 flex justify-between items-center px-4 py-3 rounded-2xl font-bold text-sm ${t.bar}`}>
                <span>#{myRank} · You</span>
                <span className="flex items-center gap-3">
                  <span className="opacity-60 text-xs uppercase tracking-widest">Top {topPercent(myRank, total)}%</span>
                  <span className="font-black">{myRow!.score.toFixed(2)}</span>
                </span>
              </div>
            ) : myBestScore !== null ? (
              <div className={`mb-3 flex justify-between items-center px-4 py-3 rounded-2xl font-bold text-sm ${t.bar}`}>
                <span>Your best · {myBestScore.toFixed(2)}</span>
                <span className="opacity-60 text-xs uppercase tracking-widest">Outside top {rows.length}</span>
              </div>
            ) : scope === 'daily' ? (
              <button
                onClick={onPlayToday}
                className={`mb-3 w-full px-4 py-3 rounded-2xl text-center text-xs font-bold uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all ${t.bar}`}
              >
                Play today's round to claim your rank
              </button>
            ) : (
              <div className={`mb-3 px-4 py-3 rounded-2xl text-center text-xs font-bold uppercase tracking-widest ${t.bar}`}>
                Post a score to appear on the board
              </div>
            )
          )}

          <div className="space-y-2 overflow-y-auto max-h-[55vh] pr-2 relative">
            {rows.length > 0 ? rows.map((entry, i) => {
              const isMine = myUserIds.includes(entry.userId);
              const isMyBest = i === myBestIndex;
              const medal = i < 3 ? MEDAL_HEX[i] : undefined;
              return (
                <div
                  key={entry.id}
                  className={`flex justify-between items-center p-4 rounded-2xl border ${
                    isMyBest ? t.rowMine : isMine ? t.rowFaint : t.row
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span
                      className={`font-bold w-8 text-lg shrink-0 ${medal ? '' : t.rank}`}
                      style={medal ? { color: medal } : undefined}
                    >
                      {i + 1}
                    </span>
                    <span className="font-bold text-base truncate">
                      {isMine ? (entry.name ? `You · ${entry.name}` : 'You') : entry.name}
                    </span>
                  </div>
                  <span className="font-black text-base shrink-0 ml-3">{entry.score.toFixed(2)}</span>
                </div>
              );
            }) : (
              <div className={`py-20 font-bold italic uppercase tracking-widest text-xs text-center ${t.empty}`}>
                {scope === 'daily'
                  ? 'No scores yet today. Be the first.'
                  : 'No scores yet. Be the first.'}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatsPanel({
  t, stats, playerName, onRename, canRename
}: {
  t: typeof T[Theme];
  stats: MyStats | null;
  playerName: string;
  onRename: (name: string) => Promise<void> | void;
  canRename: boolean;
}) {
  const [draft, setDraft] = useState(playerName);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(playerName), [playerName]);

  if (!stats || stats.played === 0) {
    return (
      <div className={`py-20 font-bold italic uppercase tracking-widest text-xs text-center ${t.empty}`}>
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
          <div key={s.label} className={`p-5 rounded-2xl border text-center ${t.row}`}>
            <div className="text-3xl font-black tracking-tight">{s.value}</div>
            <div className={`text-[10px] uppercase tracking-[0.2em] font-black mt-2 ${t.strip}`}>{s.label}</div>
          </div>
        ))}
      </div>

      {canRename && (
        <div className="flex gap-2 items-center">
          <div className="relative group flex-1">
            <div className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.inputIcon}`}>
              <User size={18} />
            </div>
            <input
              type="text"
              placeholder="Your name"
              value={draft}
              onChange={e => setDraft(e.target.value.slice(0, 20))}
              className={`w-full border rounded-2xl py-3 pl-10 pr-4 focus:outline-none transition-all font-bold ${t.input}`}
            />
          </div>
          <button
            onClick={save}
            disabled={saving || !draft.trim() || draft.trim() === playerName}
            className={`px-6 py-3 rounded-2xl text-sm font-bold tracking-tight transition-all disabled:opacity-40 ${t.button}`}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, X } from 'lucide-react';

const GUEST_KEY = 'mastery_guest_name';

export function getGuestName(): string {
  const saved = localStorage.getItem(GUEST_KEY);
  if (saved) return saved;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const name = `Guest ${code}`;
  localStorage.setItem(GUEST_KEY, name);
  return name;
}

export function DisplayNameButton({ name, onClick, className = '' }: { name: string; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label="Change display name"
      className={`flex items-center gap-1.5 hover:text-zinc-900 transition-colors cursor-pointer max-w-[160px] ${className}`}
    >
      <User size={14} className="shrink-0" />
      <span className="truncate">{name}</span>
    </button>
  );
}

export function DisplayNameModal({ open, name, suggested, onClose, onSave }: {
  open: boolean;
  name: string;
  suggested: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setDraft(name); }, [open, name]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const trimmed = draft.trim();
  const save = async () => {
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="display-name-title"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-3xl p-6 sm:p-8 text-white shadow-2xl select-text"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="display-name-title" className="text-2xl sm:text-3xl font-bold tracking-tight">Display name</h2>
              <button onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white transition-colors p-1 -mr-1">
                <X size={20} />
              </button>
            </div>
            <p className="mt-2 text-sm text-white/50">Shown on leaderboards. Saved in this browser.</p>
            <form onSubmit={(e) => { e.preventDefault(); save(); }} className="mt-6 flex flex-col gap-3">
              <input
                autoFocus
                type="text"
                value={draft}
                maxLength={20}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full bg-black border border-white/15 rounded-2xl px-4 py-3.5 text-lg font-bold text-white focus:outline-none focus:border-white/40 transition-colors"
              />
              <button
                type="submit"
                disabled={!trimmed || trimmed === name || saving}
                className="w-full py-3.5 rounded-2xl bg-orange-50 text-black font-bold text-base hover:bg-white disabled:opacity-50 transition-colors flex items-center justify-center"
              >
                {saving ? <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : 'Save name'}
              </button>
              {draft !== suggested && (
                <button
                  type="button"
                  onClick={() => setDraft(suggested)}
                  className="mt-1 text-sm font-bold text-white/40 hover:text-white/70 transition-colors"
                >
                  Use suggested name
                </button>
              )}
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { PAGES, type Edition } from './pages';

// Always in the DOM (hidden when closed) so crawlers index the text; prerender emits the same markup.
export default function HowToPlay({ edition, open, onClose }: { edition: Edition; open: boolean; onClose: () => void }) {
  const page = PAGES[edition];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      id="how-to-play"
      hidden={!open}
      onClick={onClose}
      className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-play-title"
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md max-h-[85dvh] overflow-y-auto bg-white text-zinc-900 rounded-3xl shadow-2xl p-6 sm:p-8"
      >
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-900 transition-colors cursor-pointer">
          <X size={20} />
        </button>
        <h2 id="how-to-play-title" className="text-2xl font-bold tracking-tight mb-4">How to play</h2>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-zinc-600 leading-relaxed">
          {page.howTo.map(step => <li key={step}>{step}</li>)}
        </ol>
        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-400 mt-6 mb-3">FAQ</h3>
        <div className="space-y-3">
          {page.faq.map(([q, a]) => (
            <div key={q}>
              <h4 className="text-sm font-semibold">{q}</h4>
              <p className="text-sm text-zinc-600 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

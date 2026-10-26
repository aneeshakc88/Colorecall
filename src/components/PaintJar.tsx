import { getCurrentCycle } from '../daily-cycle';
import { trackEvent } from '../analytics';

export const KOFI_URL = 'https://ko-fi.com/colorecall';

const PITCHES = [
  { title: 'Add a drop to the paint jar', sub: 'Tips keep Colorecall free, daily and ad-free' },
  { title: "Sponsor tomorrow's colors", sub: 'Every tip funds new shapes, flags and crests' },
  { title: 'Buy the palette a coffee', sub: 'Keeps the daily puzzle free for everyone' },
  { title: 'Tip the color mixer', sub: 'Small tips, big hues. No ads, ever' },
];

// Jar is filled with the colors the player just mixed, so the ask feels like part of their result.
export function PaintJar({ colors, source }: { colors: string[]; source: string }) {
  const pitch = PITCHES[getCurrentCycle() % PITCHES.length];
  const fill = colors.length ? colors : ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6'];
  const step = 100 / fill.length;
  const stripes = fill.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ');

  return (
    <a
      href={KOFI_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackEvent('Support', 'kofi_click', source)}
      className="dv2-focus group flex items-center gap-3 rounded-[18px] bg-white/5 border border-white/10 px-4 py-3 hover:bg-white/10 hover:border-white/25 transition"
    >
      <span className="relative shrink-0 w-8 h-10" aria-hidden>
        <span className="absolute left-1/2 -translate-x-1/2 top-0 w-5 h-1.5 rounded-sm bg-white/40" />
        <span
          className="absolute inset-x-0 bottom-0 top-1.5 rounded-b-[10px] rounded-t-[4px] border-2 border-white/40 overflow-hidden"
        >
          <span
            className="absolute inset-x-0 bottom-0 h-[70%] group-hover:h-[90%] transition-all duration-500"
            style={{ background: `linear-gradient(to top, ${stripes})` }}
          />
        </span>
      </span>
      <span className="min-w-0 text-left">
        <span className="block font-bold text-white leading-tight">{pitch.title}</span>
        <span className="block text-xs font-semibold text-white/50 leading-tight mt-0.5">{pitch.sub}</span>
      </span>
    </a>
  );
}

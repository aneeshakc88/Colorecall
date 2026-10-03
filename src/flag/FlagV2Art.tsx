import { use, useMemo } from 'react';
import { motion } from 'motion/react';
import './flag-showcase';
import { loadShowcaseFlags } from './flag-core';
import { swapRegion } from './flag-highlight';
import { flagDataUri, flagAspect } from './flag-card';
import { Ribbon } from './FlagSplitHero';
import './flag-v2.css';

// FlagV2Start's art, split out so the start screen's copy and buttons don't wait on these SVGs.
export function FlagHero() {
  const { hero } = use(loadShowcaseFlags());
  const heroUri = useMemo(() => flagDataUri(swapRegion(hero.flag.svg, hero.hiddenHex, hero.wrongHex, hero.hiddenIdx)), [hero]);
  return (
    <motion.div
      initial={{ y: 24, rotate: -7, opacity: 0 }}
      animate={{ y: 0, rotate: -3, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-[clamp(170px,52vw,240px)] tall:w-[min(68vw,300px)] lg:w-[clamp(180px,26vw,280px)]"
      style={{ aspectRatio: String(flagAspect(hero.flag.svg)) }}
    >
      <div
        className="absolute inset-0 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.08)]"
        style={{ backgroundImage: `url("${heroUri}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="fi-heroglint absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/70 to-transparent mix-blend-overlay" style={{ animation: 'fi-heroglint 3.6s ease-in-out infinite' }} />
      </div>
      <div className="absolute -right-4 top-[44%] flex items-center gap-1.5 bg-black/80 ring-1 ring-white/15 rounded-full pl-1.5 pr-3 py-1 shadow-lg whitespace-nowrap">
        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: hero.wrongHex, boxShadow: '0 0 0 2px rgba(255,255,255,0.85)' }} />
        <span className="text-[12px] font-semibold">Wrong color?</span>
      </div>
    </motion.div>
  );
}

export function FlagRibbon(props: { reverse?: boolean; duration: number; className: string }) {
  const { ribbon } = use(loadShowcaseFlags());
  const uris = useMemo(() => ribbon.map(flagDataUri), [ribbon]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
      <Ribbon flags={uris} {...props} />
    </motion.div>
  );
}

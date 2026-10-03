import { use, useMemo } from 'react';
import { motion } from 'motion/react';
import './crest-showcase';
import { loadShowcaseCrests } from './crest-core';
import { swapRegion, viewBoxRatio } from '../flag/flag-highlight';
import { Ribbon, crestDataUri } from './CrestSplitHero';
import { CrestBackdrop } from './crest-v2-parts';
import './crest-v2.css';

// CrestV2Start's art, split out so the start screen's copy and buttons don't wait on these SVGs.
export function CrestHeroBackdrop() {
  const { hero } = use(loadShowcaseCrests());
  return (
    <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
      <CrestBackdrop svg={hero.crest.svg} />
    </motion.div>
  );
}

export function CrestHero() {
  const { hero } = use(loadShowcaseCrests());
  const heroUri = useMemo(() => crestDataUri(swapRegion(hero.crest.svg, hero.hiddenHex, hero.wrongHex)), [hero]);
  return (
    <motion.div
      initial={{ y: 24, rotate: -7, opacity: 0 }}
      animate={{ y: 0, rotate: -3, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-[clamp(140px,40vw,200px)] tall:w-[min(52vw,240px)] lg:w-[clamp(150px,22vw,230px)]"
      style={{ aspectRatio: String(viewBoxRatio(hero.crest.svg)) }}
    >
      <div className="cv2-spot cv2-ring absolute -inset-[34%] pointer-events-none" aria-hidden />
      <div
        className="cv2-hero absolute inset-0"
        style={{ backgroundImage: `url("${heroUri}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}
      />
      <div className="absolute -right-5 top-[46%] flex items-center gap-1.5 bg-black/80 ring-1 ring-white/15 rounded-full pl-1.5 pr-3 py-1 shadow-lg whitespace-nowrap">
        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: hero.wrongHex, boxShadow: '0 0 0 2px rgba(255,255,255,0.85)' }} />
        <span className="text-[12px] font-semibold">Wrong color?</span>
      </div>
    </motion.div>
  );
}

export function CrestRibbon(props: { reverse?: boolean; duration: number; className: string }) {
  const { ribbon } = use(loadShowcaseCrests());
  const uris = useMemo(() => ribbon.map(crestDataUri), [ribbon]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
      <Ribbon crests={uris} {...props} />
    </motion.div>
  );
}

import { primeSvg } from '../art-loader';
import { CRESTS_INDEX, ART_DIR } from './crests-index';

// The intro screen's fixed badges (SHOWCASE_HERO/RIBBON in crest-core) ship inside this chunk, so the start
// screen paints them with its code instead of after ~13 more requests. A badge missing here just gets fetched.
const files = import.meta.glob<string>(
  '../../public/crest-art/{DFB-dortmund,RFEF-barcelona,theFA-liverpool,theFA-arsenal,FIGC-juventus,FFF-marseille,DFB-bayern-munich,RFEF-real-betis,theFA-chelsea,FIGC-ac-milan,USSF-la-galaxy,FFF-monaco,RFEF-villarreal}.svg',
  { query: '?raw', import: 'default', eager: true },
);

for (const [path, svg] of Object.entries(files)) {
  const code = path.slice(path.lastIndexOf('/') + 1, -'.svg'.length);
  const c = CRESTS_INDEX.find(x => x.code === code);
  if (c) primeSvg(`${ART_DIR}/${code}.svg?v=${c.v}`, svg);
}

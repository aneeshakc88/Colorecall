import { primeSvg } from '../art-loader';
import { FLAGS_INDEX, ART_DIR } from './flags-index';

// The intro screen's fixed flags (SHOWCASE_HERO/RIBBON in flag-core) ship inside this chunk, so the start
// screen paints them with its code instead of after ~10 more requests. A flag missing here just gets fetched.
const files = import.meta.glob<string>('../../public/flag-art/{br,jp,ca,za,se,jm,in,de,gr,kr}.svg', { query: '?raw', import: 'default', eager: true });

for (const [path, svg] of Object.entries(files)) {
  const code = path.slice(path.lastIndexOf('/') + 1, -'.svg'.length);
  const f = FLAGS_INDEX.find(x => x.code === code);
  if (f) primeSvg(`${ART_DIR}/${code}.svg?v=${f.v}`, svg);
}

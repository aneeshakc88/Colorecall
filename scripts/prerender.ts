// Post-build: writes one HTML file per route with its own head, JSON-LD and How to play text,
// so crawlers and link previews see page-specific content without running JavaScript.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PAGES, SITE_URL, type PageSeo } from '../src/seo/pages';

const DIST = 'dist';
const template = readFileSync(join(DIST, 'index.html'), 'utf8');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const templateTitle = unesc(template.match(/<title>([^<]*)<\/title>/)![1]);
const templateDesc = unesc(template.match(/<meta name="description" content="([^"]*)"/)![1]);
if (templateTitle !== PAGES.duo.title || templateDesc !== PAGES.duo.description) {
  throw new Error('index.html title/description differ from PAGES.duo in src/seo/pages.ts');
}

const replaceOnce = (html: string, re: RegExp, value: string) => {
  if (!re.test(html)) throw new Error(`prerender: pattern not found ${re}`);
  return html.replace(re, value);
};

const setMeta = (html: string, attr: 'name' | 'property', key: string, value: string) =>
  replaceOnce(html, new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`), `$1${esc(value)}$2`);

const jsonLd = (page: PageSeo, url: string) => JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', name: 'Colorecall', url: SITE_URL + '/' },
    {
      '@type': ['VideoGame', 'WebApplication'],
      name: page.name,
      url,
      description: page.description,
      applicationCategory: 'GameApplication',
      genre: ['Memory game', 'Puzzle'],
      gamePlatform: 'Web browser',
      operatingSystem: 'Any',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ],
}).replace(/</g, '\\u003c');

const howToHtml = (page: PageSeo) =>
  `<div id="how-to-play" hidden><section><h2>How to play</h2><ol>` +
  page.howTo.map(s => `<li>${esc(s)}</li>`).join('') +
  `</ol><h3>FAQ</h3>` +
  page.faq.map(([q, a]) => `<div><h4>${esc(q)}</h4><p>${esc(a)}</p></div>`).join('') +
  `</section></div>`;

const withCanonical = (html: string, url: string, extraHead = '') =>
  replaceOnce(html, /<\/head>/, `  <link rel="canonical" href="${url}" />\n${extraHead}  </head>`);

const write = (path: string, html: string) => {
  const dir = join(DIST, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
};

for (const page of Object.values(PAGES)) {
  const url = SITE_URL + page.path;
  let html = template;
  if (page.path !== '/') {
    const social = page.socialTitle ?? page.title;
    html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);
    html = setMeta(html, 'name', 'description', page.description);
    for (const p of ['og', 'twitter']) {
      html = setMeta(html, 'property', `${p}:title`, social);
      html = setMeta(html, 'property', `${p}:description`, page.description);
      html = setMeta(html, 'property', `${p}:url`, url);
    }
  }
  html = withCanonical(html, url, `    <script type="application/ld+json">${jsonLd(page, url)}</script>\n`);
  html = replaceOnce(html, /<div id="root"><\/div>/, `<div id="root">${howToHtml(page)}</div>`);
  write(page.path, html);
}

for (const path of ['/terms', '/privacy']) write(path, withCanonical(template, SITE_URL + path));

console.log('prerendered', Object.values(PAGES).map(p => p.path).concat('/terms', '/privacy').join(' '));

// Shared by the app (client-side head + How to play panel) and scripts/prerender.ts.
// Home title/description must match index.html exactly; prerender fails the build if they drift.
export type Edition = 'duo' | 'classic' | 'flag' | 'crest';

export interface PageSeo {
  path: string;
  title: string;
  socialTitle?: string;
  description: string;
  name: string;
  howTo: string[];
  faq: [string, string][];
}

const SHARED_FAQ: [string, string][] = [
  ['Is Colorecall free?', 'Yes. Colorecall is a free color memory game that runs in any web browser. There is nothing to download and no sign-up.'],
  ['How is my score calculated?', 'We compare your color with the original in CIELAB, a color space designed to match human vision. The closer your color is to the original, the higher your score.'],
  ['Why is it so hard to remember colors?', 'People remember color names more easily than exact shades, so a remembered color tends to drift toward a "typical" red, blue or green. Paying attention to brightness and saturation, as well as hue, helps.'],
];

export const PAGES: Record<Edition, PageSeo> = {
  duo: {
    path: '/',
    title: 'Color Memory Game | Daily Color Game - Colorecall - How good are you at remembering Colors?',
    socialTitle: 'Color Memory Game | Daily Color Game - Colorecall',
    description: 'Play the color memory game. We show you colors, you recreate them from memory. Colorecall is the ultimate color memory game. Play colors game today!',
    name: 'Colorecall – Daily Color Memory Game',
    howTo: [
      'You see two colored shapes for 5 seconds. Remember which color belongs to which shape.',
      'One shape comes back without its color. Recreate that color from memory using the hue, saturation and brightness sliders.',
      'There are 4 rounds. A new daily color memory game is released every day, with the same colors for everyone, so you can compare scores on the leaderboard.',
    ],
    faq: SHARED_FAQ,
  },
  classic: {
    path: '/classic',
    title: 'Classic Color Memory Game – Remember Colors & Shapes | Colorecall',
    description: 'We show you colored shapes, you recreate every color from memory. Play the classic daily color memory game and see how well you remember colors.',
    name: 'Colorecall Classic – Remember Colors',
    howTo: [
      'Each round shows a colored shape for 5 seconds. Remember both the shape and its exact color.',
      'Then pick the shape you saw and recreate its color from memory with the hue, saturation and brightness sliders.',
      'Play 4 rounds of the daily color game, or use Quick Play to practice as often as you like.',
    ],
    faq: [
      ['What is color recall?', 'Color recall means recreating a color you saw earlier without looking at it again. It tests visual memory rather than your ability to name colors.'],
      ...SHARED_FAQ,
    ],
  },
  flag: {
    path: '/flag',
    title: 'Flag ColorGuessr – Fix the Wrong Flag Color | Colorecall',
    description: 'One color on the flag is wrong. Slide it back to the right shade. A daily flag color quiz with a global leaderboard.',
    name: 'Flag ColorGuessr',
    howTo: [
      'Each flag has one area painted the wrong color, and that area is outlined.',
      'Use the sliders to restore the flag\'s real color from memory.',
      'There are 4 flags a day. The closer your color is to the real one, the more points you score.',
    ],
    faq: SHARED_FAQ,
  },
  crest: {
    path: '/football-logo',
    title: 'Football Logos – Guess the Club Colors (Soccer Logo Quiz) | Colorecall',
    description: 'One colour on the club badge is wrong – slide it back. Daily football (soccer) logo color quiz: Premier League, Real Madrid, MLS and more.',
    name: 'Football Logo – Club Colors Quiz',
    howTo: [
      'Each football club badge has one colour that is wrong, and that area is outlined.',
      'Slide it back to the club\'s real colour from memory.',
      'There are 4 badges a day, from Premier League clubs, Real Madrid, MLS teams and more. The closer you get, the higher you score.',
    ],
    faq: [
      ['Is it football or soccer?', 'Both. It is the same logo color quiz wherever you play.'],
      ...SHARED_FAQ,
    ],
  },
};

export const SITE_URL = 'https://www.colorecall.com';

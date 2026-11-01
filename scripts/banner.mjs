// Generates assets/banner-rocket-{dark,light}.svg (new name = new URL past GitHub image cache) (static, animated with CSS). Run once: node scripts/banner.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const THEMES = {
  dark: { bg1: '#0d1117', bg2: '#0f2a1a', grid: '#1f2937', title: '#ffffff', sub: '#9ca3af', accent: '#00d455', accent2: '#00a844', frame: '#374151' },
  light: { bg1: '#f6f8fa', bg2: '#dcfce7', grid: '#e5e7eb', title: '#111827', sub: '#4b5563', accent: '#00AE42', accent2: '#007a2f', frame: '#9ca3af' },
};

// Rocket, printed bottom to top. Each layer: [body width, fin reach per side, part].
const BODY = 36;
const ROCKET = [
  [22, 0, 'nozzle'], [26, 0, 'nozzle'],
  ...[24, 22, 19, 15, 10, 5].map((f) => [BODY, f, 'fin']),
  ...Array.from({ length: 10 }, () => [BODY, 0, 'body']),
  ...[34, 30, 25, 19, 12, 5].map((w) => [w, 0, 'nose']),
];
const STEP = 0.2;                      // seconds per printed layer
const PRINT_END = ROCKET.length * STEP + 0.3;

function banner(theme) {
  const t = THEMES[theme];
  const cx = 1010, base = 232, pitch = 5, h = 4;
  const color = { nozzle: t.frame, fin: t.accent2, body: t.accent, nose: t.accent2 };
  const layers = ROCKET.map(([w, fin, part], i) => {
    const y = base - i * pitch;
    const rects = [`<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" fill="${color[part]}" />`];
    if (fin) {
      rects.push(`<rect x="${cx - w / 2 - fin}" y="${y}" width="${fin}" height="${h}" fill="${t.accent2}" />`);
      rects.push(`<rect x="${cx + w / 2}" y="${y}" width="${fin}" height="${h}" fill="${t.accent2}" />`);
    }
    return `<g class="layer" style="animation-delay:${(i * STEP).toFixed(2)}s">${rects.join('')}</g>`;
  }).join('\n      ');
  const sweeps = Math.ceil(PRINT_END / 0.7);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="280" viewBox="0 0 1200 280">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.bg1}" /><stop offset="1" stop-color="${t.bg2}" />
    </linearGradient>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M24 0H0V24" fill="none" stroke="${t.grid}" stroke-width="1" />
    </pattern>
    <linearGradient id="flame" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff3b0" /><stop offset="0.45" stop-color="#ffb020" /><stop offset="1" stop-color="#ff4d1a" stop-opacity="0" />
    </linearGradient>
  </defs>
  <style>
    text { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif; }
    .layer { transform-box: fill-box; transform-origin: left center; transform: scaleX(0); animation: print ${STEP + 0.05}s linear forwards; }
    @keyframes print { to { transform: scaleX(1); } }
    .head { animation: sweep 0.7s ease-in-out ${sweeps} alternate; }
    @keyframes sweep { from { transform: translateX(-62px); } to { transform: translateX(62px); } }
    .park { animation: park 0.6s ease-in-out ${PRINT_END.toFixed(2)}s forwards; }
    @keyframes park { to { transform: translateX(78px); } }
    .window { opacity: 0; animation: show 0.3s ${(PRINT_END + 0.2).toFixed(2)}s forwards; }
    .rocket { animation: lift 1.2s cubic-bezier(.5,0,.3,1) ${(PRINT_END + 0.9).toFixed(2)}s forwards; }
    @keyframes lift { to { transform: translateY(-30px); } }
    .flame { opacity: 0; transform-box: fill-box; transform-origin: center top;
             animation: show 0.2s ${(PRINT_END + 0.7).toFixed(2)}s forwards, flicker 0.12s ${(PRINT_END + 0.7).toFixed(2)}s infinite alternate; }
    @keyframes flicker { from { transform: scaleY(0.85) scaleX(0.95); } to { transform: scaleY(1.15) scaleX(1.05); } }
    @keyframes show { to { opacity: 1; } }
    .blink { animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0; } }
  </style>
  <rect width="1200" height="280" rx="14" fill="url(#bg)" />
  <rect width="1200" height="280" rx="14" fill="url(#grid)" opacity="0.6" />

  <text x="70" y="118" font-size="64" font-weight="800" fill="${t.title}">Emanuele Tech</text>
  <text x="72" y="160" font-size="22" fill="${t.sub}">3D printing · Digital innovation &amp; AI · Electric vehicles</text>
  <text x="72" y="214" font-size="18" font-family="ui-monospace, 'Fira Code', Menlo, monospace" fill="${t.accent}">$ make things --open-source<tspan class="blink">▌</tspan></text>

  <!-- printer frame -->
  <g stroke="${t.frame}" stroke-width="4" fill="none" stroke-linecap="round">
    <path d="M900 250 V40 H1120 V250" />
    <path d="M890 250 H1130" />
  </g>
  <line x1="900" y1="70" x2="1120" y2="70" stroke="${t.frame}" stroke-width="3" />
  <rect x="920" y="240" width="180" height="6" rx="3" fill="${t.frame}" />

  <!-- the printed rocket: layers first, then the window lights up and it lifts off the bed -->
  <g class="rocket">
    <g class="flame">
      <path d="M${cx - 13} ${base + 4} Q${cx} ${base + 44} ${cx + 13} ${base + 4} Z" fill="url(#flame)" />
      <path d="M${cx - 7} ${base + 4} Q${cx} ${base + 28} ${cx + 7} ${base + 4} Z" fill="#fffbe6" />
    </g>
    <g>
      ${layers}
    </g>
    <circle class="window" cx="${cx}" cy="${base - 13 * pitch + 2}" r="9" fill="${t.bg1}" stroke="${t.accent2}" stroke-width="3" />
    <circle class="window" cx="${cx - 3}" cy="${base - 13 * pitch - 1}" r="3" fill="${t.title}" opacity="0.6" />
  </g>

  <g class="park">
    <g class="head">
      <rect x="985" y="58" width="50" height="34" rx="5" fill="${t.frame}" />
      <path d="M1002 92 h16 l-8 14 z" fill="${t.accent}" />
    </g>
  </g>
</svg>`;
}

mkdirSync('assets', { recursive: true });
for (const theme of Object.keys(THEMES)) writeFileSync(`assets/banner-rocket-${theme}.svg`, banner(theme));
console.log('banners written');

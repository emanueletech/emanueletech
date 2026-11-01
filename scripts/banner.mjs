// Generates assets/banner-{dark,light}.svg (static, animated with CSS). Run once: node scripts/banner.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const THEMES = {
  dark: { bg1: '#0d1117', bg2: '#0f2a1a', grid: '#1f2937', title: '#ffffff', sub: '#9ca3af', accent: '#00d455', frame: '#374151' },
  light: { bg1: '#f6f8fa', bg2: '#dcfce7', grid: '#e5e7eb', title: '#111827', sub: '#4b5563', accent: '#00AE42', frame: '#9ca3af' },
};

function banner(theme) {
  const t = THEMES[theme];
  // Printed "part": stacked layers that appear one after another, like a print in progress
  const layers = Array.from({ length: 14 }, (_, i) => {
    const w = 150 - Math.abs(7 - i) * 6;
    const x = 935 + (150 - w) / 2;
    const y = 232 - i * 9;
    return `<rect class="layer" x="${x}" y="${y}" width="${w}" height="7" rx="2" fill="${t.accent}" style="animation-delay:${(i * 0.35).toFixed(2)}s; opacity:${(0.45 + i * 0.04).toFixed(2)}" />`;
  }).join('\n    ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="280" viewBox="0 0 1200 280">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.bg1}" /><stop offset="1" stop-color="${t.bg2}" />
    </linearGradient>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M24 0H0V24" fill="none" stroke="${t.grid}" stroke-width="1" />
    </pattern>
  </defs>
  <style>
    text { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif; }
    .layer { transform-box: fill-box; transform-origin: left center; transform: scaleX(0); animation: print 0.35s linear forwards; }
    @keyframes print { to { transform: scaleX(1); } }
    .head { animation: sweep 0.7s ease-in-out infinite alternate; }
    @keyframes sweep { from { transform: translateX(-60px); } to { transform: translateX(60px); } }
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
  <g class="head">
    <rect x="985" y="58" width="50" height="34" rx="5" fill="${t.frame}" />
    <path d="M1002 92 h16 l-8 14 z" fill="${t.accent}" />
  </g>
  <g>
    ${layers}
  </g>
</svg>`;
}

mkdirSync('assets', { recursive: true });
for (const theme of Object.keys(THEMES)) writeFileSync(`assets/banner-${theme}.svg`, banner(theme));
console.log('banners written');

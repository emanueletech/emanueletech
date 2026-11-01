// Generates assets/banner-launch-{dark,light}.svg (new name = new URL past GitHub image cache) (static, animated with CSS). Run once: node scripts/banner.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const THEMES = {
  dark: { bg1: '#0d1117', bg2: '#0f2a1a', grid: '#1f2937', title: '#ffffff', sub: '#9ca3af', accent: '#00d455', accent2: '#00a844', frame: '#374151', smoke: '#9ca3af' },
  light: { bg1: '#f6f8fa', bg2: '#dcfce7', grid: '#e5e7eb', title: '#111827', sub: '#4b5563', accent: '#00AE42', accent2: '#007a2f', frame: '#9ca3af', smoke: '#cbd5e1' },
};

// Rocket, printed bottom to top. Each layer: [body width, fin reach per side, part].
const BODY = 36;
const ROCKET = [
  [22, 0, 'nozzle'], [26, 0, 'nozzle'],
  ...[24, 22, 19, 15, 10, 5].map((f) => [BODY, f, 'fin']),
  ...Array.from({ length: 10 }, () => [BODY, 0, 'body']),
  ...[34, 30, 25, 19, 12, 5].map((w) => [w, 0, 'nose']),
];
const STEP = 0.2;                       // seconds per printed layer
const GROW = 0.25;                      // seconds to lay down one layer
const PRINT_END = (ROCKET.length - 1) * STEP + GROW;
// One loop: print → window lights → engine on → lift-off out of the banner → empty bed → again.
const T_WINDOW = PRINT_END + 0.2, T_FLAME = PRINT_END + 0.7, T_LIFT = PRINT_END + 1.0;
const T_GONE = T_LIFT + 1.6, T_RESET = T_GONE + 0.1, CYCLE = T_RESET + 0.9;
const pct = (t) => `${((t / CYCLE) * 100).toFixed(3)}%`;
const EPS = 0.01;

function layerKeyframes(i) {
  const s0 = i * STEP, s1 = s0 + GROW;
  return `@keyframes l${i} { 0%, ${pct(s0)} { transform: scaleX(0); } ${pct(s1)}, ${pct(T_RESET)} { transform: scaleX(1); } ${pct(T_RESET + EPS)}, 100% { transform: scaleX(0); } }`;
}

// Head: sweeps while printing, parks aside for the launch, returns home before the next print.
function headKeyframes() {
  const frames = [];
  let t = 0, right = false;
  while (t < PRINT_END) { frames.push(`${pct(t)} { transform: translateX(${right ? 62 : -62}px); }`); right = !right; t += 0.7; }
  frames.push(`${pct(PRINT_END + 0.5)}, ${pct(CYCLE - 0.6)} { transform: translateX(78px); }`);
  frames.push(`100% { transform: translateX(-62px); }`);
  return `@keyframes head { ${frames.join(' ')} }`;
}

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
    return `<g class="layer" style="animation-name:l${i}">${rects.join('')}</g>`;
  }).join('\n      ');
  const css = `
    text { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif; }
    .layer { transform-box: fill-box; transform-origin: left center; transform: scaleX(0); animation-duration: ${CYCLE.toFixed(2)}s; animation-timing-function: linear; animation-iteration-count: infinite; }
    ${ROCKET.map((_, i) => layerKeyframes(i)).join('\n    ')}
    .head { animation: head ${CYCLE.toFixed(2)}s ease-in-out infinite; }
    ${headKeyframes()}
    .window { opacity: 0; animation: window ${CYCLE.toFixed(2)}s linear infinite; }
    @keyframes window { 0%, ${pct(T_WINDOW)} { opacity: 0; } ${pct(T_WINDOW + 0.3)}, ${pct(T_RESET)} { opacity: 1; } ${pct(T_RESET + EPS)}, 100% { opacity: 0; } }
    .rocket { animation: lift ${CYCLE.toFixed(2)}s infinite; }
    @keyframes lift {
      0%, ${pct(T_LIFT)} { transform: translateY(0); animation-timing-function: cubic-bezier(.55,0,.9,.6); }
      ${pct(T_GONE)}, ${pct(T_RESET)} { transform: translateY(-300px); }
      ${pct(T_RESET + EPS)}, 100% { transform: translateY(0); }
    }
    .flame { opacity: 0; transform-box: fill-box; transform-origin: center top;
             animation: flame ${CYCLE.toFixed(2)}s linear infinite, flicker 0.12s linear infinite alternate; }
    @keyframes flame { 0%, ${pct(T_FLAME)} { opacity: 0; } ${pct(T_FLAME + 0.15)}, ${pct(T_RESET)} { opacity: 1; } ${pct(T_RESET + EPS)}, 100% { opacity: 0; } }
    @keyframes flicker { from { transform: scaleY(0.85) scaleX(0.95); } to { transform: scaleY(1.2) scaleX(1.05); } }
    .smoke { opacity: 0; transform-box: fill-box; transform-origin: center; animation: smoke ${CYCLE.toFixed(2)}s ease-out infinite; }
    @keyframes smoke { 0%, ${pct(T_LIFT)} { opacity: 0; transform: scale(0.3); } ${pct(T_LIFT + 0.3)} { opacity: 0.55; } ${pct(T_GONE + 0.3)} { opacity: 0; transform: scale(1.6); } 100% { opacity: 0; transform: scale(0.3); } }
    .blink { animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0; } }`;
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
  <style>${css}
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

  <!-- launch smoke on the bed -->
  <g fill="${t.smoke}">
    <circle class="smoke" cx="${cx - 34}" cy="232" r="12" />
    <circle class="smoke" cx="${cx + 34}" cy="232" r="12" />
    <circle class="smoke" cx="${cx - 18}" cy="226" r="9" />
    <circle class="smoke" cx="${cx + 18}" cy="226" r="9" />
  </g>

  <!-- the printed rocket: layers, window, engine on, then it flies out of the banner; loops forever -->
  <g class="rocket">
    <g class="flame">
      <path d="M${cx - 13} ${base + 4} Q${cx} ${base + 44} ${cx + 13} ${base + 4} Z" fill="url(#flame)" />
      <path d="M${cx - 7} ${base + 4} Q${cx} ${base + 28} ${cx + 7} ${base + 4} Z" fill="#fffbe6" />
    </g>
    <g>
      ${layers}
    </g>
    <circle class="window" cx="${cx}" cy="${base - 13 * pitch + 2}" r="9" fill="${t.bg1}" stroke="${t.accent2}" stroke-width="3" />
    <circle class="window" cx="${cx - 3}" cy="${base - 13 * pitch - 1}" r="3" fill="${t.title}" fill-opacity="0.6" />
  </g>

  <g class="head">
    <rect x="985" y="58" width="50" height="34" rx="5" fill="${t.frame}" />
    <path d="M1002 92 h16 l-8 14 z" fill="${t.accent}" />
  </g>
</svg>`;
}

mkdirSync('assets', { recursive: true });
for (const theme of Object.keys(THEMES)) writeFileSync(`assets/banner-launch-${theme}.svg`, banner(theme));
console.log('banners written');

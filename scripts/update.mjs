// Daily profile refresh: latest YouTube videos and Teslers.it articles in README + self-generated stats cards.
// Runs in GitHub Actions (Node 20+, global fetch). No third-party services.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';

// File names carry a hash of the content: GitHub's image proxy caches by URL, so a changed card
// (new comment count, restyle) must get a new URL to show up.
const hashed = (id, svg) => `${id}-${createHash('sha1').update(svg).digest('hex').slice(0, 8)}.svg`;

const USER = 'emanueletech';
const YT_CHANNEL = 'UCauQaWv5nr5VdkDjXDmhskg';
const MAX_VIDEOS = 6;
const MAX_ARTICLES = 3;
const TESLERS_FEED = 'https://www.teslers.it/feed';
const token = process.env.GITHUB_TOKEN;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unxml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// ---------- YouTube ----------
export function parseFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1],
    title: unxml((e.match(/<title>([^<]*)<\/title>/) || [])[1] || ''),
  })).filter((v) => v.id);
}

// Thumbnail + play button + title, as one SVG card. The JPEG is embedded, so the card
// is a single file in the repo and the click still goes to YouTube (views count there).
export function videoCardSvg(v, jpegB64) {
  const title = v.title.length > 38 ? v.title.slice(0, 37).trimEnd() + '…' : v.title;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="320" height="180" viewBox="0 0 320 180">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.55" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity="0.85" />
    </linearGradient>
    <clipPath id="r"><rect width="320" height="180" rx="10" /></clipPath>
  </defs>
  <style>
    .play { transform-origin: 160px 82px; animation: pulse 2.4s ease-in-out infinite; }
    @keyframes pulse { 50% { transform: scale(1.08); } }
  </style>
  <g clip-path="url(#r)">
    <image width="320" height="180" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/jpeg;base64,${jpegB64}" href="data:image/jpeg;base64,${jpegB64}" />
    <rect width="320" height="180" fill="url(#fade)" />
  </g>
  <g class="play">
    <rect x="136" y="65" width="48" height="34" rx="9" fill="#FF0000" />
    <path d="M154 73 L169 82 L154 91 Z" fill="#fff" />
  </g>
  <text x="12" y="166" font-family="'Segoe UI', Ubuntu, Arial, sans-serif" font-size="13" font-weight="600" fill="#fff">${esc(title)}</text>
</svg>`;
}

export function videosHtml(videos) {
  const cells = videos.slice(0, MAX_VIDEOS).map((v) =>
    `<a href="https://www.youtube.com/watch?v=${v.id}" title="${esc(v.title)}"><img src="assets/videos/${v.file}" width="32%" alt="${esc(v.title)}" /></a>`);
  return `<p align="center">\n${cells.join('\n')}\n</p>`;
}

export function replaceSection(md, tag, html) {
  const re = new RegExp(`(<!-- ${tag}:START -->)[\\s\\S]*?(<!-- ${tag}:END -->)`);
  if (!re.test(md)) throw new Error(`markers ${tag} missing`);
  return md.replace(re, `$1\n${html}\n$2`);
}

async function updateVideos() {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${YT_CHANNEL}`);
  if (!res.ok) throw new Error(`YouTube feed HTTP ${res.status}`);
  const videos = parseFeed(await res.text()).slice(0, MAX_VIDEOS);
  if (!videos.length) throw new Error('YouTube feed empty');
  mkdirSync('assets/videos', { recursive: true });
  const keep = new Set();
  for (const v of videos) {
    const img = await fetch(`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`);
    if (!img.ok) throw new Error(`thumbnail ${v.id} HTTP ${img.status}`);
    const b64 = Buffer.from(await img.arrayBuffer()).toString('base64');
    const svg = videoCardSvg(v, b64);
    v.file = hashed(v.id, svg);
    writeFileSync(`assets/videos/${v.file}`, svg);
    keep.add(v.file);
  }
  // Files are named by video id, so a new video is a new URL and never a stale cached image.
  for (const f of readdirSync('assets/videos')) if (!keep.has(f)) unlinkSync(`assets/videos/${f}`);
  const md = readFileSync('README.md', 'utf8');
  writeFileSync('README.md', replaceSection(md, 'YOUTUBE', videosHtml(videos)));
  console.log(`videos: ${videos.length}`);
}

// ---------- Teslers.it ----------
const decodeEntities = (s) => unxml(s)
  .replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘').replace(/&#8220;/g, '“').replace(/&#8221;/g, '”')
  .replace(/&#8211;/g, '–').replace(/&#8230;/g, '…').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const cdata = (s) => (s || '').replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();

export function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, e]) => {
    const link = ((e.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim();
    return {
      id: (link.match(/teslers\.it\/(\d+)\//) || [])[1],
      title: decodeEntities((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''),
      link,
      image: (e.match(/<media:content url="([^"]+)"/) || [])[1],
      category: decodeEntities(cdata((e.match(/<category>([\s\S]*?)<\/category>/) || [])[1])),
      date: new Date((e.match(/<pubDate>([^<]+)<\/pubDate>/) || [])[1]),
      comments: +((e.match(/<slash:comments>(\d+)<\/slash:comments>/) || [])[1] || 0),
    };
  }).filter((a) => a.id && a.link.startsWith('https://www.teslers.it/') && a.image);
}

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const dataIt = (d) => {
  const r = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  return `${r.getDate()} ${MESI[r.getMonth()]} ${r.getFullYear()}`;
};

// Greedy word wrap on an estimated character budget (SVG has no automatic wrapping).
export function wrap(text, maxChars, maxLines) {
  const lines = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[\s,.:;]*$/, '') + '…';
    return kept;
  }
  return lines;
}

// Same anatomy and proportions as the hero cards on teslers.it: each SVG carries its own slice of the
// red band, so three of them side by side (no whitespace between) read as the site's hero row.
export function articleCardSvg(a, imgB64, avatarB64, avatarMime = 'image/jpeg') {
  const W = 400, M = 12, TOP = 28;               // card width, side gutter, band margin above/below
  const P = 26, IMG_H = 225, H = 531;            // inner padding, cover height, card height
  const font = "'Poppins', 'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif";
  const lines = wrap(a.title, 28, 4);
  const title = lines.map((l, i) => `<text x="${P}" y="${IMG_H + 77 + i * 30}" font-family="${font}" font-size="22.5" font-weight="700" letter-spacing="-0.3" fill="#1A1A1E">${esc(l)}</text>`).join('\n    ');
  const n = String(a.comments);
  const boxW = 42 + n.length * 9, boxH = 36, footY = 487;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W + 2 * M}" height="${H + 2 * TOP}" viewBox="0 0 ${W + 2 * M} ${H + 2 * TOP}">
  <defs>
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgb(220,39,67)" /><stop offset="1" stop-color="rgb(146,42,58)" />
    </linearGradient>
    <clipPath id="av"><circle cx="${P + 14}" cy="${footY}" r="14" /></clipPath>
  </defs>
  <rect width="${W + 2 * M}" height="${H + 2 * TOP}" fill="url(#band)" />
  <g transform="translate(${M}, ${TOP})">
    <rect width="${W}" height="${H}" fill="#ffffff" />
    <image width="${W}" height="${IMG_H}" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/jpeg;base64,${imgB64}" href="data:image/jpeg;base64,${imgB64}" />
    <text x="${P}" y="${IMG_H + 38}" font-family="${font}" font-size="14" font-weight="700" letter-spacing="1.4" fill="#E51837">${esc((a.category || 'Notizie').toUpperCase())}</text>
    ${title}
    <image x="${P}" y="${footY - 14}" width="28" height="28" clip-path="url(#av)" xlink:href="data:${avatarMime};base64,${avatarB64}" href="data:${avatarMime};base64,${avatarB64}" />
    <text x="${P + 38}" y="${footY + 6}" font-family="${font}" font-size="17" fill="#555555">${esc(dataIt(a.date))}</text>
    <g transform="translate(${W - P - boxW}, ${footY - boxH / 2})">
      <rect width="${boxW}" height="${boxH}" fill="#FDEDEF" />
      <path d="M11 10.5h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-9.5l-4.5 4v-4H11a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" fill="none" stroke="#1A1A1E" stroke-width="1.8" stroke-linejoin="round" />
      <text x="34" y="24" font-family="${font}" font-size="17" fill="#1A1A1E">${n}</text>
    </g>
  </g>
</svg>`;
}

export function articlesHtml(items) {
  // No whitespace between the links: GitHub would render it as gaps in the red band.
  const cells = items.slice(0, MAX_ARTICLES).map((a) =>
    `<a href="${esc(a.link)}" title="${esc(a.title)}"><img src="assets/teslers/${a.file}" width="33%" alt="${esc(a.title)}" /></a>`);
  return `<p align="center">${cells.join('')}</p>`;
}

const UA = { headers: { 'User-Agent': `${USER}-profile-readme` } };
async function getB64(url) {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer()).toString('base64');
}

async function updateTeslers() {
  const res = await fetch(TESLERS_FEED, UA);
  if (!res.ok) throw new Error(`Teslers feed HTTP ${res.status}`);
  const items = parseRss(await res.text()).slice(0, MAX_ARTICLES);
  if (!items.length) throw new Error('Teslers feed empty');
  const icon = await getB64(TESLERS_ICON);
  mkdirSync('assets/teslers', { recursive: true });
  const keep = new Set();
  for (const a of items) {
    const img = await getB64(a.image);
    // Author avatar from the WordPress REST API, like on the site; the Teslers icon if unavailable.
    let avatar = icon, mime = 'image/jpeg';
    try {
      const r = await fetch(`https://www.teslers.it/wp-json/wp/v2/posts/${a.id}?_embed=author`, UA);
      const url = (await r.json())._embedded?.author?.[0]?.avatar_urls?.['96'];
      if (url) {
        const ar = await fetch(url, UA);
        if (ar.ok) { mime = (ar.headers.get('content-type') || 'image/jpeg').split(';')[0]; avatar = Buffer.from(await ar.arrayBuffer()).toString('base64'); }
      }
    } catch (e) { console.log(`avatar ${a.id}: ${e.message}`); }
    const svg = articleCardSvg(a, img, avatar, mime);
    a.file = hashed(a.id, svg);
    writeFileSync(`assets/teslers/${a.file}`, svg);
    keep.add(a.file);
  }
  for (const f of readdirSync('assets/teslers')) if (!keep.has(f)) unlinkSync(`assets/teslers/${f}`);
  const md = readFileSync('README.md', 'utf8');
  writeFileSync('README.md', replaceSection(md, 'TESLERS', articlesHtml(items)));
  console.log(`articles: ${items.length}`);
}

// Teslers.it badge in the same look as the shields.io "for-the-badge" ones, with the site's real favicon.
const TESLERS_ICON = 'https://www.teslers.it/wp-content/uploads/2025/06/cropped-ispazio-2-192x192.jpg';

export function teslersBadgeSvg(iconB64) {
  // Only the white T of the favicon, no red tile: luminance → alpha keeps the bright glyph and drops
  // the red background; the icon is drawn larger than the slot so the T itself reads bigger.
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="127" height="28" viewBox="0 0 127 28">
  <defs>
    <filter id="t" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feColorMatrix type="luminanceToAlpha" />
      <feComponentTransfer>
        <feFuncR type="linear" slope="0" intercept="1" />
        <feFuncG type="linear" slope="0" intercept="1" />
        <feFuncB type="linear" slope="0" intercept="1" />
        <feFuncA type="linear" slope="4" intercept="-2.2" />
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="127" height="28" fill="#CC0000" />
  <image x="3" y="1" width="26" height="26" filter="url(#t)" xlink:href="data:image/jpeg;base64,${iconB64}" href="data:image/jpeg;base64,${iconB64}" />
  <text x="31" y="17.8" fill="#fff" font-family="Verdana, Geneva, DejaVu Sans, sans-serif" font-size="10" font-weight="700" letter-spacing="1.25">TESLERS.IT</text>
</svg>`;
}

async function updateTeslersBadge() {
  const res = await fetch(TESLERS_ICON, { headers: { 'User-Agent': `${USER}-profile-readme` } });
  if (!res.ok) throw new Error(`Teslers icon HTTP ${res.status}`);
  mkdirSync('assets', { recursive: true });
  writeFileSync('assets/badge-teslers-t.svg', teslersBadgeSvg(Buffer.from(await res.arrayBuffer()).toString('base64')));
  console.log('teslers badge written');
}

// ---------- Stats ----------
async function gql(query) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': USER },
    body: JSON.stringify({ query }),
  });
  const j = await res.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

export async function fetchStats() {
  const d = await gql(`{
    user(login: "${USER}") {
      followers { totalCount }
      repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: 100) {
        totalCount
        nodes { name stargazerCount forkCount
          languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } } }
      }
      contributionsCollection { contributionCalendar { totalContributions } }
    }
  }`);
  const u = d.user;
  const repos = u.repositories.nodes.filter((r) => r.name !== USER);
  const langs = {};
  for (const r of repos) for (const e of r.languages.edges) {
    langs[e.node.name] ??= { size: 0, color: e.node.color || '#888' };
    langs[e.node.name].size += e.size;
  }
  return {
    stars: repos.reduce((a, r) => a + r.stargazerCount, 0),
    forks: repos.reduce((a, r) => a + r.forkCount, 0),
    repos: repos.length,
    followers: u.followers.totalCount,
    contributions: u.contributionsCollection.contributionCalendar.totalContributions,
    langs: Object.entries(langs).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.size - a.size),
  };
}

const THEMES = {
  dark: { bg: '#0d1117', border: '#30363d', title: '#3fb950', text: '#e6edf3', muted: '#8b949e', track: '#21262d' },
  light: { bg: '#ffffff', border: '#d0d7de', title: '#1a7f37', text: '#1f2328', muted: '#57606a', track: '#eaeef2' },
};

export function statsSvg(s, theme) {
  const t = THEMES[theme];
  const items = [
    ['★', 'Stars', s.stars], ['⑂', 'Forks', s.forks], ['▣', 'Public repos', s.repos],
    ['◉', 'Followers', s.followers], ['▲', 'Public contributions (1y)', s.contributions],
  ];
  const rows = items.map(([icon, label, val], i) => `
    <g transform="translate(25, ${62 + i * 26})" class="fade" style="animation-delay:${i * 120}ms">
      <text class="icon" x="0" y="0">${icon}</text>
      <text class="label" x="22" y="0">${esc(label)}</text>
      <text class="val" x="215" y="0" text-anchor="end">${val}</text>
    </g>`).join('');
  const total = s.langs.reduce((a, l) => a + l.size, 0) || 1;
  const top = s.langs.slice(0, 5);
  let x = 0;
  const bar = top.map((l) => {
    const w = Math.max(2, (l.size / total) * 210);
    const r = `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="8" fill="${l.color}" />`;
    x += w; return r;
  }).join('');
  const legend = top.map((l, i) => `
    <g transform="translate(0, ${30 + i * 22})" class="fade" style="animation-delay:${300 + i * 120}ms">
      <circle cx="5" cy="-4" r="5" fill="${l.color}" />
      <text class="label" x="16" y="0">${esc(l.name)}</text>
      <text class="muted" x="210" y="0" text-anchor="end">${((l.size / total) * 100).toFixed(1)}%</text>
    </g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="205" viewBox="0 0 520 205">
  <style>
    text { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif; }
    .title { font-size: 16px; font-weight: 700; fill: ${t.title}; }
    .label { font-size: 13px; fill: ${t.text}; }
    .val { font-size: 13px; font-weight: 700; fill: ${t.text}; }
    .icon { font-size: 13px; fill: ${t.title}; }
    .muted { font-size: 12px; fill: ${t.muted}; }
    .fade { opacity: 0; animation: in .5s ease forwards; }
    @keyframes in { to { opacity: 1; } }
  </style>
  <rect x="0.5" y="0.5" width="519" height="204" rx="8" fill="${t.bg}" stroke="${t.border}" />
  <text class="title" x="25" y="34">GitHub stats</text>
  <text class="title" x="285" y="34">Top languages</text>
  ${rows}
  <line x1="262" y1="22" x2="262" y2="185" stroke="${t.border}" />
  <g transform="translate(285, 52)">
    <clipPath id="bar"><rect width="210" height="8" rx="4" /></clipPath>
    <rect width="210" height="8" rx="4" fill="${t.track}" />
    <g clip-path="url(#bar)">${bar}</g>
    ${legend}
  </g>
</svg>`;
}

async function updateStats() {
  if (!token) { console.log('no GITHUB_TOKEN: skipping stats'); return; }
  const s = await fetchStats();
  mkdirSync('assets', { recursive: true });
  writeFileSync('assets/stats-dark.svg', statsSvg(s, 'dark'));
  writeFileSync('assets/stats-light.svg', statsSvg(s, 'light'));
  console.log('stats:', JSON.stringify({ ...s, langs: s.langs.map((l) => l.name) }));
}

if (process.argv[1] && process.argv[1].endsWith('update.mjs')) {
  // Each part fails independently so one broken source never blocks the other.
  const jobs = [['videos', updateVideos], ['teslers', updateTeslers], ['teslers-badge', updateTeslersBadge], ['stats', updateStats]];
  let failed = 0;
  for (const [name, fn] of jobs) {
    try { await fn(); } catch (e) { failed++; console.error(`${name} failed:`, e.message); }
  }
  if (failed === jobs.length) process.exit(1);
}

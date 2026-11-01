// Daily profile refresh: latest YouTube videos in README + self-generated stats cards.
// Runs in GitHub Actions (Node 20+, global fetch). No third-party services.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const USER = 'emanueletech';
const YT_CHANNEL = 'UCauQaWv5nr5VdkDjXDmhskg';
const MAX_VIDEOS = 6;
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

export function videosHtml(videos) {
  const cells = videos.slice(0, MAX_VIDEOS).map((v) =>
    `<a href="https://www.youtube.com/watch?v=${v.id}" title="${esc(v.title)}"><img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" width="32%" alt="${esc(v.title)}" /></a>`);
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
  const videos = parseFeed(await res.text());
  if (!videos.length) throw new Error('YouTube feed empty');
  const md = readFileSync('README.md', 'utf8');
  writeFileSync('README.md', replaceSection(md, 'YOUTUBE', videosHtml(videos)));
  console.log(`videos: ${videos.length}`);
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
    ['◉', 'Followers', s.followers], ['▲', 'Contributions (1y)', s.contributions],
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
  let failed = 0;
  for (const [name, fn] of [['videos', updateVideos], ['stats', updateStats]]) {
    try { await fn(); } catch (e) { failed++; console.error(`${name} failed:`, e.message); }
  }
  if (failed === 2) process.exit(1);
}

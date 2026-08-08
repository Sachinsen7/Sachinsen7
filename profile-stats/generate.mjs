import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_PATHS } from './icons.mjs';

const USERNAME = process.env.STATS_USERNAME || process.argv[2] || 'Sachinsen7';
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(OUT, 'snapshot.json');

const INK = '#12100E';
const PAPER = '#FFFDF7';
const LIGHT = '#EDEAE2';
const BOLT = 'M60 6 L25 57 L45 57 L39 94 L76 43 L54 43 Z';
const SHADOW = 4;
const HEADER = 30;
const CARD_W = 400;
const MONO = "'Cascadia Code', 'JetBrains Mono', 'Fira Code', ui-monospace, 'SF Mono', Consolas, monospace";

const SKILLS = [
  { label: 'TypeScript', icon: 'typescript' },
  { label: 'JavaScript', icon: 'javascript' },
  { label: 'Rust', icon: 'rust' },
  { label: 'Go', icon: 'go' },
  { label: 'Angular', icon: 'angular' },
  { label: 'HTML5', icon: 'html5' },
  { label: 'CSS3', icon: 'css3' },
  { label: 'Git', icon: 'git' },
];
const SOCIALS = [
  { file: 'li', label: 'LinkedIn', icon: 'linkedin' },
  { file: 'x', label: 'X / Twitter', icon: 'x' },
  { file: 'mail', label: 'Email', icon: 'gmail' },
];

function iconGroup(icon, x, y, size) {
  const path = ICON_PATHS[icon];
  if (!path) return '';
  return `<g transform="translate(${x}, ${y}) scale(${size / 24})"><path d="${path}" fill="${INK}" /></g>`;
}

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

async function fetchRepos(username) {
  const repos = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await api(`/users/${username}/repos?per_page=100&page=${page}&type=owner`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((r) => !r.fork);
}

async function fetchLanguages(username, repos) {
  const totals = {};
  for (const repo of repos) {
    let bytes;
    try {
      bytes = await api(`/repos/${username}/${repo.name}/languages`);
    } catch (err) {
      console.warn(`skipping ${repo.name}: ${err.message}`);
      continue;
    }
    for (const [lang, count] of Object.entries(bytes)) {
      totals[lang] = (totals[lang] || 0) + count;
    }
  }
  return totals;
}

async function fetchActivityDays(username) {
  const days = new Set();
  const weekdayCounts = new Array(7).fill(0);
  for (let page = 1; page <= 3; page++) {
    let batch;
    try {
      batch = await api(`/users/${username}/events/public?per_page=100&page=${page}`);
    } catch {
      break;
    }
    if (!batch.length) break;
    for (const event of batch) {
      const date = new Date(event.created_at);
      days.add(date.toISOString().slice(0, 10));
      weekdayCounts[date.getUTCDay()]++;
    }
    if (batch.length < 100) break;
  }
  const busiest = weekdayCounts.indexOf(Math.max(...weekdayCounts));
  const weekdayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][busiest];
  return { days, busiestWeekday: weekdayCounts.some((n) => n > 0) ? weekdayName : null };
}

function escapeXml(value) {
  return String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

export function card(width, height, title, body) {
  const w = width - SHADOW;
  const h = height - SHADOW;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="${MONO}">
  <rect x="${SHADOW}" y="${SHADOW}" width="${w}" height="${h}" fill="${INK}" />
  <rect x="0" y="0" width="${w}" height="${h}" fill="${PAPER}" stroke="${INK}" stroke-width="2" />
  <g transform="translate(14, 8) scale(0.14)">
    <path d="${BOLT}" fill="${INK}" />
  </g>
  <text x="30" y="${HEADER / 2 + 4}" font-size="11" font-weight="700" letter-spacing="0.4" fill="${INK}">${escapeXml(title.toUpperCase())}</text>
  <line x1="0" y1="${HEADER}" x2="${w}" y2="${HEADER}" stroke="${INK}" stroke-width="1.5" opacity="0.15" />
  ${body}
</svg>`;
}

function delta(value) {
  if (value === null || value === 0) return '';
  const sign = value > 0 ? '+' : '';
  return ` <tspan font-size="10" opacity="0.5">(${sign}${value})</tspan>`;
}

export function statsCard(user, previous) {
  const rows = [
    ['Public Repos', user.public_repos, previous ? user.public_repos - previous.publicRepos : null],
    ['Total Stars', user.totalStars, previous ? user.totalStars - previous.totalStars : null],
    ['Followers', user.followers, previous ? user.followers - previous.followers : null],
  ];
  const rowGap = 24;
  const top = HEADER + 22;

  const rowsSvg = rows.map(([label, value, change], i) => {
    const y = top + i * rowGap;
    return `
    <text x="14" y="${y}" font-size="10" font-weight="700" letter-spacing="0.4" fill="${INK}" opacity="0.6">${escapeXml(label.toUpperCase())}</text>
    <text x="${CARD_W - SHADOW - 14}" y="${y}" font-size="13" font-weight="800" fill="${INK}" text-anchor="end">${value}${delta(change)}</text>`;
  }).join('');

  const height = top + (rows.length - 1) * rowGap + 18;
  return card(CARD_W, height, `${user.name || user.login}'s GitHub Stats`, rowsSvg);
}

export function langsCard(totals) {
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1;
  const shades = [1, 0.75, 0.55, 0.4, 0.28, 0.18];

  const barWidth = CARD_W - SHADOW - 28;
  const barY = HEADER + 16;
  let barX = 14;
  const barSvg = entries.map(([, value], i) => {
    const width = (value / total) * barWidth;
    const rect = `<rect x="${barX}" y="${barY}" width="${width}" height="8" fill="${INK}" opacity="${shades[i] ?? 0.15}" />`;
    barX += width;
    return rect;
  }).join('');

  const legendSvg = entries.map(([lang, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 14 + col * ((CARD_W - SHADOW - 28) / 2);
    const y = barY + 26 + row * 18;
    const pct = ((value / total) * 100).toFixed(1);
    return `
    <rect x="${x}" y="${y - 7}" width="7" height="7" fill="${INK}" opacity="${shades[i] ?? 0.15}" />
    <text x="${x + 11}" y="${y}" font-size="10" font-weight="600" fill="${INK}" opacity="0.8">${escapeXml(lang)} ${pct}%</text>`;
  }).join('');

  const rows = Math.ceil(entries.length / 2);
  const height = barY + 26 + rows * 18 + 10;
  return card(CARD_W, height, 'Most Used Languages', `
    <rect x="14" y="${barY}" width="${barWidth}" height="8" fill="${LIGHT}" stroke="${INK}" stroke-width="1.5" />
    <clipPath id="bar"><rect x="15" y="${barY + 1}" width="${barWidth - 2}" height="6" /></clipPath>
    <g clip-path="url(#bar)">${barSvg}</g>
    ${legendSvg}
  `);
}

export function skillsCard(skills) {
  const margin = 14;
  const gap = 7;
  const cols = 3;
  const chipW = (CARD_W - SHADOW - margin * 2 - gap * (cols - 1)) / cols;
  const chipH = 24;
  const rows = Math.ceil(skills.length / cols);

  const iconSize = 13;
  const chips = skills.map(({ label, icon }, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * (chipW + gap);
    const y = HEADER + 14 + row * (chipH + gap);
    const iconX = x + 8;
    const iconY = y + chipH / 2 - iconSize / 2;
    return `
    <rect x="${x}" y="${y}" width="${chipW}" height="${chipH}" fill="${LIGHT}" stroke="${INK}" stroke-width="1.4" />
    ${iconGroup(icon, iconX, iconY, iconSize)}
    <text x="${x + 8 + iconSize + 6}" y="${y + chipH / 2 + 4}" font-size="10" font-weight="700" fill="${INK}">${escapeXml(label)}</text>`;
  }).join('');

  const height = HEADER + 14 + rows * chipH + (rows - 1) * gap + 14;
  return card(CARD_W, height, 'Skills & Tools', chips);
}

export function socialBadge(label, icon) {
  const width = 132;
  const height = 38;
  const w = width - SHADOW;
  const h = height - SHADOW;
  const iconSize = 15;
  const iconX = 12;
  const iconY = h / 2 - iconSize / 2;
  const textX = iconX + iconSize + 8;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="${MONO}">
  <rect x="${SHADOW}" y="${SHADOW}" width="${w}" height="${h}" fill="${INK}" />
  <rect x="0" y="0" width="${w}" height="${h}" fill="${PAPER}" stroke="${INK}" stroke-width="2" />
  ${iconGroup(icon, iconX, iconY, iconSize)}
  <text x="${textX}" y="${h / 2 + 4}" font-size="10" font-weight="800" letter-spacing="0.3" fill="${INK}">${escapeXml(label.toUpperCase())}</text>
</svg>`;
}

export function joinedLabel(createdAt) {
  const joined = new Date(createdAt);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[joined.getUTCMonth()]} ${joined.getUTCFullYear()}`;
}

function daysSince(createdAt) {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.floor(ms / 86400000);
}

export function flowCard(user, activity) {
  const today = new Date();
  const cells = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - i);
    const key = day.toISOString().slice(0, 10);
    cells.push(activity.days.has(key));
  }
  const activeCount = cells.filter(Boolean).length;

  const cellSize = 18;
  const gap = 4;
  const stripY = HEADER + 40;
  const stripSvg = cells.map((active, i) => {
    const x = 14 + i * (cellSize + gap);
    return `<rect x="${x}" y="${stripY}" width="${cellSize}" height="${cellSize}" fill="${active ? INK : LIGHT}" stroke="${INK}" stroke-width="1.4" />`;
  }).join('');

  const busyLine = activity.busiestWeekday
    ? `Most active recently: ${activity.busiestWeekday}s`
    : 'No recent public activity yet';

  const footerY = stripY + cellSize + 34;

  return card(CARD_W, HEADER + 118, 'Activity Flow', `
    <text x="14" y="${HEADER + 20}" font-size="11" font-weight="700" fill="${INK}">${daysSince(user.created_at).toLocaleString()} days on GitHub · since ${joinedLabel(user.created_at)}</text>
    ${stripSvg}
    <text x="14" y="${stripY + cellSize + 18}" font-size="10" font-weight="600" fill="${INK}" opacity="0.7">${activeCount}/14 active days · ${escapeXml(busyLine)}</text>
    <line x1="14" y1="${footerY - 14}" x2="${CARD_W - SHADOW - 14}" y2="${footerY - 14}" stroke="${INK}" stroke-width="1" stroke-dasharray="2 3" opacity="0.3" />
    <text x="14" y="${footerY}" font-size="9" font-weight="700" letter-spacing="0.6" fill="${INK}" opacity="0.5">DESIGNED &amp; BUILT BY SACHIN SEN</text>
  `);
}

function loadSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  writeFileSync(join(OUT, 'skills.svg'), skillsCard(SKILLS));
  for (const social of SOCIALS) {
    writeFileSync(join(OUT, `${social.file}.svg`), socialBadge(social.label, social.icon));
  }
  console.log(`profile-stats/skills.svg — ${SKILLS.length} skills`);
  console.log(`profile-stats/{${SOCIALS.map((s) => s.file).join(',')}}.svg — social badges`);

  const previous = loadSnapshot();

  const user = await api(`/users/${USERNAME}`);
  const repos = await fetchRepos(USERNAME);
  user.totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const [languages, activity] = await Promise.all([
    fetchLanguages(USERNAME, repos),
    fetchActivityDays(USERNAME),
  ]);

  writeFileSync(join(OUT, 'stats.svg'), statsCard(user, previous));
  writeFileSync(join(OUT, 'langs.svg'), langsCard(languages));
  writeFileSync(join(OUT, 'flow.svg'), flowCard(user, activity));
  writeFileSync(SNAPSHOT_PATH, JSON.stringify({
    publicRepos: user.public_repos,
    totalStars: user.totalStars,
    followers: user.followers,
    updated: new Date().toISOString(),
  }, null, 2));

  console.log(`profile-stats/stats.svg — ${user.totalStars} stars, ${user.public_repos} repos, ${user.followers} followers`);
  console.log(`profile-stats/langs.svg — ${Object.keys(languages).length} languages`);
  console.log(`profile-stats/flow.svg — ${activity.days.size} active days seen, joined ${joinedLabel(user.created_at)}`);
}

const isDirectRun = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isDirectRun) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

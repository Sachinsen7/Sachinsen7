import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USERNAME = process.env.STATS_USERNAME || process.argv[2] || 'Sachinsen7';
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(OUT, 'snapshot.json');

const INK = '#12100E';
const PAPER = '#FFFDF7';
const YELLOW = '#FFD400';
const PALETTE = ['#FFD400', '#FF5D3B', '#00D19B', '#4D7CFE', '#B15BFF'];
const BOLT = 'M60 6 L25 57 L45 57 L39 94 L76 43 L54 43 Z';
const SHADOW = 6;
const HEADER = 44;
const MONO = "'Cascadia Code', 'JetBrains Mono', 'Fira Code', ui-monospace, 'SF Mono', Consolas, monospace";

const SKILLS = ['JavaScript', 'Rust', 'Java', 'Go', 'Angular', 'HTML5', 'CSS3', 'Git'];
const SOCIALS = [
  { file: 'li', label: 'LinkedIn', color: PALETTE[3] },
  { file: 'x', label: 'X / Twitter', color: PALETTE[0] },
  { file: 'mail', label: 'Email', color: PALETTE[1] },
];

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

let cardSerial = 0;

export function card(width, height, title, body) {
  const w = width - SHADOW;
  const h = height - SHADOW;
  const uid = `c${cardSerial++}`;
  const headerPath = `M0,14 a14,14 0 0 1 14,-14 h${w - 28} a14,14 0 0 1 14,14 v${HEADER - 14} h-${w} Z`;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="${MONO}">
  <defs>
    <pattern id="dots-${uid}" width="9" height="9" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1" fill="${INK}" opacity="0.12" />
    </pattern>
    <clipPath id="head-${uid}"><path d="${headerPath}" /></clipPath>
  </defs>
  <rect x="${SHADOW}" y="${SHADOW}" width="${w}" height="${h}" rx="14" fill="${INK}" />
  <rect x="0" y="0" width="${w}" height="${h}" rx="14" fill="${PAPER}" stroke="${INK}" stroke-width="3" />
  <path d="${headerPath}" fill="${YELLOW}" stroke="${INK}" stroke-width="3" />
  <rect x="0" y="0" width="${w}" height="${HEADER}" fill="url(#dots-${uid})" clip-path="url(#head-${uid})" />
  <g transform="translate(18, 12) scale(0.2)">
    <path d="${BOLT}" fill="${INK}">
      <animate attributeName="opacity" values="1;1;0.35;1;1" keyTimes="0;0.85;0.9;0.95;1" dur="5s" repeatCount="indefinite" />
    </path>
  </g>
  <text x="42" y="${HEADER / 2 + 6}" font-size="14" font-weight="700" letter-spacing="0.5" fill="${INK}">${escapeXml(title.toUpperCase())}</text>
  ${body}
</svg>`;
}

function delta(value) {
  if (value === null || value === 0) return '';
  const sign = value > 0 ? '+' : '';
  const color = value > 0 ? PALETTE[2] : PALETTE[1];
  return ` <tspan fill="${color}" font-size="12">(${sign}${value})</tspan>`;
}

export function statsCard(user, previous) {
  const rows = [
    ['Public Repos', user.public_repos, previous ? user.public_repos - previous.publicRepos : null, PALETTE[0]],
    ['Total Stars', user.totalStars, previous ? user.totalStars - previous.totalStars : null, PALETTE[1]],
    ['Followers', user.followers, previous ? user.followers - previous.followers : null, PALETTE[2]],
  ];

  const rowsSvg = rows.map(([label, value, change, color], i) => {
    const y = HEADER + 46 + i * 40;
    return `
    <rect x="20" y="${y - 16}" width="14" height="14" rx="4" fill="${color}" stroke="${INK}" stroke-width="1.5" />
    <text x="44" y="${y}" font-size="12" font-weight="700" letter-spacing="0.6" fill="${INK}" opacity="0.85">${escapeXml(label.toUpperCase())}</text>
    <text x="432" y="${y}" font-size="18" font-weight="800" fill="${INK}" text-anchor="end">${value}${delta(change)}</text>`;
  }).join('');

  return card(460, HEADER + 150, `${user.name || user.login}'s GitHub Stats`, `
    <text x="440" y="${HEADER + 18}" font-size="9" font-weight="700" fill="${INK}" opacity="0.45" text-anchor="end">${new Date().toISOString().slice(0, 10)}</text>
    ${rowsSvg}
  `);
}

export function langsCard(totals) {
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1;

  const barY = HEADER + 34;
  let barX = 21;
  const barWidth = 410;
  const barSvg = entries.map(([, value], i) => {
    const width = (value / total) * barWidth;
    const rect = `<rect x="${barX}" y="${barY}" width="${width}" height="12" fill="${PALETTE[i % PALETTE.length]}">
      <animate attributeName="width" values="0;${width}" keyTimes="0;1" begin="${i * 0.08}s" dur="0.6s" fill="freeze" calcMode="spline" keySplines="0.2 0.9 0.3 1" />
    </rect>`;
    barX += width;
    return rect;
  }).join('');

  const legendSvg = entries.map(([lang, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 20 + col * 220;
    const y = HEADER + 68 + row * 22;
    const pct = ((value / total) * 100).toFixed(1);
    return `
    <rect x="${x}" y="${y - 9}" width="10" height="10" rx="3" fill="${PALETTE[i % PALETTE.length]}" stroke="${INK}" stroke-width="1.5" />
    <text x="${x + 16}" y="${y}" font-size="12" font-weight="600" fill="${INK}">${escapeXml(lang)} ${pct}%</text>`;
  }).join('');

  return card(460, HEADER + 150, 'Most Used Languages', `
    <rect x="20" y="${barY}" width="412" height="14" rx="7" fill="${PAPER}" stroke="${INK}" stroke-width="2" />
    <clipPath id="bar"><rect x="21" y="${barY + 1}" width="410" height="12" rx="6" /></clipPath>
    <g clip-path="url(#bar)">${barSvg}</g>
    ${legendSvg}
  `);
}

export function skillsCard(skills) {
  const margin = 20;
  const gap = 10;
  const cols = 3;
  const chipW = (460 - margin * 2 - gap * (cols - 1)) / cols;
  const chipH = 34;
  const rows = Math.ceil(skills.length / cols);

  const chips = skills.map((label, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * (chipW + gap);
    const y = HEADER + 20 + row * (chipH + gap);
    const color = PALETTE[i % PALETTE.length];
    return `
    <rect x="${x}" y="${y}" width="${chipW}" height="${chipH}" rx="9" fill="${PAPER}" stroke="${INK}" stroke-width="2" opacity="0">
      <animate attributeName="opacity" values="0;1" keyTimes="0;1" begin="${i * 0.04}s" dur="0.3s" fill="freeze" />
    </rect>
    <rect x="${x + 9}" y="${y + chipH / 2 - 5}" width="10" height="10" rx="3" fill="${color}" stroke="${INK}" stroke-width="1.4" />
    <text x="${x + 26}" y="${y + chipH / 2 + 4}" font-size="12" font-weight="700" fill="${INK}">${escapeXml(label)}</text>`;
  }).join('');

  const height = HEADER + 20 + rows * chipH + (rows - 1) * gap + 20;
  return card(460, height, 'Skills & Tools', chips);
}

export function socialBadge(label, color) {
  const width = 148;
  const height = 50;
  const w = width - SHADOW;
  const h = height - SHADOW;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="${MONO}">
  <rect x="${SHADOW}" y="${SHADOW}" width="${w}" height="${h}" rx="10" fill="${INK}" />
  <rect x="0" y="0" width="${w}" height="${h}" rx="10" fill="${color}" stroke="${INK}" stroke-width="3" />
  <text x="${w / 2}" y="${h / 2 + 5}" font-size="13" font-weight="800" letter-spacing="0.4" fill="${INK}" text-anchor="middle">${escapeXml(label.toUpperCase())}</text>
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

  const cellSize = 22;
  const gap = 6;
  const stripY = HEADER + 62;
  const stripSvg = cells.map((active, i) => {
    const x = 20 + i * (cellSize + gap);
    const target = active ? 1 : 0.4;
    return `<rect x="${x}" y="${stripY}" width="${cellSize}" height="${cellSize}" rx="5" fill="${active ? PALETTE[0] : PAPER}" stroke="${INK}" stroke-width="${active ? 2 : 1.5}" opacity="0">
      <animate attributeName="opacity" values="0;${target}" keyTimes="0;1" begin="${i * 0.05}s" dur="0.35s" fill="freeze" />
    </rect>`;
  }).join('');

  const busyLine = activity.busiestWeekday
    ? `Most active recently: ${activity.busiestWeekday}s`
    : 'No recent public activity yet';

  const footerY = stripY + cellSize + 44;

  return card(460, HEADER + 138, 'Activity Flow', `
    <text x="20" y="${HEADER + 24}" font-size="13" font-weight="700" fill="${INK}">${daysSince(user.created_at).toLocaleString()} days on GitHub · since ${joinedLabel(user.created_at)}</text>
    ${stripSvg}
    <text x="20" y="${stripY + cellSize + 22}" font-size="12" font-weight="600" fill="${INK}" opacity="0.75">${activeCount}/14 active days · ${escapeXml(busyLine)}</text>
    <line x1="20" y1="${footerY - 16}" x2="440" y2="${footerY - 16}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="3 4" opacity="0.35" />
    <text x="20" y="${footerY}" font-size="10" font-weight="700" letter-spacing="0.8" fill="${INK}" opacity="0.55">DESIGNED &amp; BUILT BY SACHIN SEN</text>
    <text x="440" y="${footerY}" font-size="10" font-weight="600" fill="${INK}" opacity="0.4" text-anchor="end">github.com/Sachinsen7</text>
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
    writeFileSync(join(OUT, `${social.file}.svg`), socialBadge(social.label, social.color));
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

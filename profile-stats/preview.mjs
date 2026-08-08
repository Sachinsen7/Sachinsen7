import { writeFileSync } from 'node:fs';
import { statsCard, langsCard, flowCard, skillsCard, socialBadge } from './generate.mjs';

const user = {
  login: 'Sachinsen7',
  name: 'Sachin Sen',
  public_repos: 57,
  followers: 17,
  totalStars: 23,
  created_at: '2023-02-14T00:00:00Z',
};

const previous = { publicRepos: 54, totalStars: 19, followers: 15 };

const languages = {
  JavaScript: 480000,
  Rust: 210000,
  Java: 150000,
  TypeScript: 90000,
  Go: 40000,
  HTML: 20000,
};

const today = new Date();
const activityDays = new Set();
[0, 1, 3, 4, 7, 8, 9, 12].forEach((offset) => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - offset);
  activityDays.add(d.toISOString().slice(0, 10));
});

const skills = ['JavaScript', 'Rust', 'Java', 'Go', 'Angular', 'HTML5', 'CSS3', 'Git'];

writeFileSync('preview-stats.svg', statsCard(user, previous));
writeFileSync('preview-langs.svg', langsCard(languages));
writeFileSync('preview-flow.svg', flowCard(user, { days: activityDays, busiestWeekday: 'Tuesday' }));
writeFileSync('preview-skills.svg', skillsCard(skills));
writeFileSync('preview-li.svg', socialBadge('LinkedIn'));
writeFileSync('preview-x.svg', socialBadge('X / Twitter'));
writeFileSync('preview-mail.svg', socialBadge('Email'));

console.log('wrote preview-{stats,langs,flow,skills,li,x,mail}.svg');

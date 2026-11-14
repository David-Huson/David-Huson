// Fit analysis.
//
// 1. A rule-based baseline compares a posting with your profile (skills, title, seniority, location, salary).
// 2. A small logistic model learns from your real outcomes (rejections vs. advancements). The baseline is the
//    model's prior, so with no history the score equals the baseline, and each recorded outcome moves future
//    scores for postings that share traits (skills mentioned, level, role family, work mode, source...).
import { rank } from './db.js';

// [canonical, ...aliases]
const SKILLS = [
  ['javascript', 'js', 'es6'], ['typescript'], ['python'], ['java'], ['c#', 'csharp'], ['c++', 'cpp'], ['golang'],
  ['rust'], ['ruby'], ['php'], ['kotlin'], ['swift'], ['scala'], ['elixir'], ['sql'], ['bash', 'shell scripting'],
  ['react', 'react.js', 'reactjs'], ['next.js', 'nextjs', 'next js'], ['vue', 'vue.js', 'vuejs'], ['nuxt'], ['angular'],
  ['svelte', 'sveltekit'], ['remix'], ['astro'], ['redux'], ['react native'], ['flutter'], ['html'], ['css'],
  ['tailwind', 'tailwindcss', 'tailwind css'], ['sass', 'scss'], ['node.js', 'nodejs', 'node js', 'node'], ['express.js', 'expressjs'],
  ['nestjs', 'nest.js'], ['trpc'], ['prisma'], ['drizzle'], ['graphql'], ['rest api', 'restful', 'rest apis'], ['grpc'],
  ['django'], ['flask'], ['fastapi'], ['rails', 'ruby on rails'], ['spring boot', 'spring framework'], ['.net', 'dotnet', 'asp.net'], ['laravel'],
  ['postgresql', 'postgres'], ['mysql'], ['sqlite'], ['mongodb', 'mongo'], ['redis'], ['dynamodb'], ['elasticsearch', 'opensearch'],
  ['snowflake'], ['bigquery'], ['kafka'], ['rabbitmq'], ['supabase'], ['firebase'],
  ['aws', 'amazon web services'], ['gcp', 'google cloud'], ['azure'], ['vercel'], ['cloudflare'], ['docker'], ['kubernetes', 'k8s'],
  ['terraform'], ['ansible'], ['ci/cd', 'cicd', 'continuous integration'], ['github actions'], ['jenkins'], ['linux'],
  ['datadog'], ['grafana'], ['prometheus'], ['sentry'], ['microservices'], ['serverless', 'lambda'], ['websockets', 'websocket'],
  ['oauth', 'oauth2'], ['stripe'], ['jest'], ['vitest'], ['playwright'], ['cypress'], ['storybook'], ['webpack'], ['vite'],
  ['machine learning', 'ml'], ['llm', 'llms', 'large language models'], ['generative ai', 'genai', 'gen ai'], ['rag'], ['pytorch'],
  ['tensorflow'], ['langchain'], ['openai'], ['anthropic', 'claude'], ['pandas'], ['apache spark', 'pyspark'], ['airflow'], ['dbt'],
  ['figma'], ['accessibility', 'a11y', 'wcag'], ['agile', 'scrum'], ['system design', 'distributed systems'],
  ['security clearance', 'secret clearance'],
];

const ALIAS = new Map();
for (const [canon, ...aliases] of SKILLS) for (const a of [canon, ...aliases]) ALIAS.set(a, canon);
export const canonicalSkill = (s) => {
  const k = String(s).trim().toLowerCase();
  return ALIAS.get(k) ?? k;
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termRe = (term) => new RegExp(`(?<![a-z0-9+#.])${esc(term).replace(/\\?\s+/g, '[\\s-]+')}(?![a-z0-9+#]|\\.[a-z])`, 'g');
const TERM_RE = new Map();
const reFor = (term) => TERM_RE.get(term) ?? TERM_RE.set(term, termRe(term)).get(term);
// "Go" is too ambiguous in lowercase prose; only match the capitalised language name in list-like contexts.
const GO_RE = /(?<![A-Za-z0-9])Go(?=\s*[,/)]|\s+(?:and|or|developer|engineer|experience|services)\b|\s*$)|(?<=[,/(]\s*|(?:and|or|in|with)\s)Go(?![A-Za-z0-9])/g;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const logit = (p) => Math.log(p / (1 - p));

/** Skills mentioned in text -> Map(canonical -> mention count). */
export function findSkills(text, extraTerms = []) {
  const lower = String(text).toLowerCase();
  const found = new Map();
  const bump = (canon, n) => n && found.set(canon, (found.get(canon) ?? 0) + n);
  for (const [alias, canon] of ALIAS) bump(canon, lower.match(reFor(alias))?.length ?? 0);
  for (const t of extraTerms) {
    const term = String(t).trim().toLowerCase();
    if (term.length < 2 || ALIAS.has(term)) continue;
    bump(term, lower.match(reFor(term))?.length ?? 0);
  }
  bump('golang', String(text).match(GO_RE)?.length ?? 0);
  return found;
}

const LEVELS = [
  ['intern', /\bintern(ship)?\b|\bco-?op\b/],
  ['junior', /\b(junior|jr|entry[- ]level|associate|new grad|graduate)\b/],
  ['principal', /\b(principal|distinguished|fellow)\b/],
  ['staff', /\bstaff\b/],
  ['director', /\b(director|vp|vice president|head of|chief)\b/],
  ['manager', /\bmanager\b/],
  ['lead', /\b(lead|tech lead)\b/],
  ['senior', /\b(senior|sr|iii|iv)\b/],
  ['mid', /\b(mid|mid-level|ii|intermediate)\b/],
];
const LEVEL_MIN_YEARS = { intern: 0, junior: 0, mid: 2, senior: 5, lead: 6, manager: 6, staff: 8, principal: 10, director: 10 };

const FAMILIES = [
  ['management', /engineering manager|\b(director|head of|vp)\b/],
  ['product', /product (manager|owner)|\bpm\b/],
  ['ml', /machine learning|\bml\b|\bai\b|data scien|research (scientist|engineer)|\bllm/],
  ['data', /data engineer|analytics|\bdata\b|\bbi\b/],
  ['security', /security|appsec|infosec/],
  ['devops', /devops|\bsre\b|site reliability|platform|infrastructure|cloud engineer/],
  ['mobile', /\bios\b|android|mobile|react native/],
  ['fullstack', /full[- ]?stack/],
  ['frontend', /front[- ]?end|\bui\b|web developer/],
  ['backend', /back[- ]?end|\bapi\b|server[- ]side/],
  ['qa', /\bqa\b|quality|\bsdet\b|test engineer/],
  ['design', /designer|\bux\b/],
  ['software', /engineer|developer|programmer|\bswe\b/],
];

export const levelOf = (title) => LEVELS.find(([, re]) => re.test(String(title).toLowerCase()))?.[0] ?? null;
export const familyOf = (title) => FAMILIES.find(([, re]) => re.test(String(title).toLowerCase()))?.[0] ?? 'other';

const TITLE_NOISE = new Set(['senior', 'sr', 'junior', 'jr', 'staff', 'principal', 'lead', 'mid', 'level', 'i', 'ii', 'iii', 'iv',
  'the', 'a', 'of', 'and', 'for', 'at', 'in', 'remote', 'hybrid', 'associate']);
function titleTokens(title) {
  const t = String(title).toLowerCase()
    .replace(/full[- ]stack/g, 'fullstack').replace(/front[- ]end/g, 'frontend').replace(/back[- ]end/g, 'backend')
    .replace(/\b(developer|dev|programmer)\b/g, 'engineer').replace(/\bswe\b/g, 'software engineer')
    .replace(/\([^)]*\)/g, ' ');
  return new Set(t.split(/[^a-z0-9+#.]+/).filter((w) => w && !TITLE_NOISE.has(w)));
}

export function requiredYears(text) {
  const re = /(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*\+?\s*)?(?:years?|yrs?)[^.\n]{0,60}?(?:experience|exp\b)/gi;
  const nums = [...String(text).matchAll(re)].map((m) => Number(m[1])).filter((n) => n <= 20);
  return nums.length ? Math.max(...nums) : null;
}

export function parseSalary(text) {
  const vals = [];
  for (const m of String(text).matchAll(/[$£€]\s?(\d{1,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?\s?k\b|\d{5,7})/gi)) {
    const raw = m[1].toLowerCase();
    const v = raw.endsWith('k') ? parseFloat(raw) * 1000 : Number(raw.replace(/,/g, ''));
    if (v >= 20000 && v <= 1500000) vals.push(Math.round(v));
    if (vals.length === 2) break;
  }
  if (!vals.length) return { min: null, max: null };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

export function workMode(job) {
  if (['remote', 'hybrid', 'onsite'].includes(job.remote_mode)) return job.remote_mode;
  const head = `${job.title ?? ''} ${job.location ?? ''}`.toLowerCase();
  if (/hybrid/.test(head)) return 'hybrid';
  if (/remote/.test(head)) return 'remote';
  const d = String(job.description ?? '').toLowerCase();
  if (/\bhybrid\b/.test(d)) return 'hybrid';
  if (/(fully|100%|completely)[- ]remote|remote[- ]first|work from anywhere|this is a remote|remote (position|role|opportunity)/.test(d)) return 'remote';
  if (/\bon[- ]?site\b|in[- ]office|in the office/.test(d)) return 'onsite';
  if (/\bremote\b/.test(d)) return 'remote';
  return '';
}

/** Everything we can read off a posting, independent of outcomes. */
export function analyzeJob(job, profile) {
  const text = `${job.title ?? ''}\n${job.description ?? ''}`;
  const profileSkills = new Set((profile.skills ?? []).map(canonicalSkill));
  const counts = findSkills(text, [...profileSkills]);
  const inTitle = findSkills(job.title ?? '', [...profileSkills]);
  const skills = [...counts].map(([name, n]) => ({
    name, weight: 1 + Math.min(n - 1, 2) * 0.5 + (inTitle.has(name) ? 1 : 0), have: profileSkills.has(name),
  })).sort((a, b) => b.weight - a.weight);

  const parsed = parseSalary(job.description ?? '');
  const lowerText = text.toLowerCase();
  return {
    skills,
    level: levelOf(job.title ?? ''),
    family: familyOf(job.title ?? ''),
    years: requiredYears(job.description ?? ''),
    mode: workMode(job),
    salaryMin: job.salary_min ?? parsed.min,
    salaryMax: job.salary_max ?? job.salary_min ?? parsed.max,
    dealbreakers: (profile.dealbreakers ?? []).filter((d) => d && lowerText.includes(String(d).toLowerCase())),
  };
}

const WEIGHTS = { skills: 0.4, title: 0.25, seniority: 0.2, location: 0.1, salary: 0.05 };

/** Rule-based baseline: component scores in 0..1 (null when unknown) and a 0..100 total. */
export function baseline(job, profile, a = analyzeJob(job, profile)) {
  const c = {};

  if (a.skills.length && profile.skills?.length) {
    const total = a.skills.reduce((s, k) => s + k.weight, 0);
    const have = a.skills.filter((k) => k.have).reduce((s, k) => s + k.weight, 0);
    c.skills = { score: have / total, note: `${a.skills.filter((k) => k.have).length} of ${a.skills.length} listed skills` };
  } else c.skills = { score: null, note: profile.skills?.length ? 'No recognisable skills in posting' : 'Add skills to your profile' };

  if (profile.targetTitles?.length && job.title) {
    const jt = titleTokens(job.title);
    let best = 0, bestTitle = '';
    for (const target of profile.targetTitles) {
      const tt = titleTokens(target);
      const overlap = [...tt].filter((w) => jt.has(w)).length;
      let s = tt.size && jt.size ? 0.7 * (overlap / tt.size) + 0.3 * (overlap / jt.size) : 0;
      if (a.family !== 'other' && familyOf(target) === a.family) s = Math.max(s, 0.7);
      if (s > best) [best, bestTitle] = [s, target];
    }
    c.title = { score: best, note: best ? `Closest target: ${bestTitle}` : 'Unlike your target titles' };
  } else c.title = { score: null, note: 'Add target titles to your profile' };

  const need = a.years ?? (a.level ? LEVEL_MIN_YEARS[a.level] : null);
  if (need != null && profile.years != null) {
    const gap = need - profile.years;
    let s = gap <= 0 ? 1 : clamp(1 - 0.22 * gap, 0.1, 1);
    let note = gap <= 0 ? `Asks ~${need}y, you have ${profile.years}y` : `Asks ~${need}y, you have ${profile.years}y (${gap}y short)`;
    if (['intern', 'junior'].includes(a.level) && profile.years >= 5) { s = 0.5; note = 'Likely overqualified'; }
    c.seniority = { score: s, note };
  } else c.seniority = { score: null, note: profile.years == null ? 'Add years of experience to your profile' : 'Level not stated' };

  const prefs = profile.remotePref?.length ? profile.remotePref : ['remote', 'hybrid', 'onsite'];
  const locHit = (profile.locations ?? []).some((l) => l && String(job.location ?? '').toLowerCase().includes(String(l).toLowerCase().split(',')[0].trim()));
  if (a.mode === 'remote') c.location = prefs.includes('remote') ? { score: 1, note: 'Remote' } : { score: locHit ? 0.7 : 0.4, note: 'Remote, not your preference' };
  else if (a.mode) {
    if (!prefs.includes(a.mode)) c.location = { score: 0.1, note: `${a.mode} is outside your preferences` };
    else if (locHit) c.location = { score: 1, note: `${a.mode} in your area` };
    else if (!job.location || !profile.locations?.length) c.location = { score: 0.6, note: `${a.mode}, location unclear` };
    else c.location = { score: 0.2, note: `${a.mode} outside your locations` };
  } else c.location = locHit ? { score: 0.85, note: 'In your area' } : { score: null, note: 'Work mode not stated' };

  if (profile.minSalary && a.salaryMax) {
    const s = a.salaryMin >= profile.minSalary ? 1 : a.salaryMax >= profile.minSalary ? 0.8 : clamp((a.salaryMax / profile.minSalary - 0.6) * 1.5, 0.05, 0.6);
    c.salary = { score: s, note: `${fmtK(a.salaryMin)}–${fmtK(a.salaryMax)} vs. your ${fmtK(profile.minSalary)} minimum` };
  } else c.salary = { score: null, note: 'Salary not listed' };

  let sum = 0, wsum = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) if (c[k].score != null) { sum += w * c[k].score; wsum += w; }
  for (const k of Object.keys(c)) c[k].weight = WEIGHTS[k];
  return { components: c, score: wsum ? (100 * sum) / wsum : 50 };
}
const fmtK = (n) => (n == null ? '?' : `$${Math.round(n / 1000)}k`);

/** Sparse features the outcome model can attach weight to. */
export function learnFeatures(job, a, base) {
  const x = {};
  for (const k of a.skills.slice(0, 25)) x[`skill:${k.name}`] = 1;
  if (a.level) x[`level:${a.level}`] = 1;
  x[`family:${a.family}`] = 1;
  if (a.mode) x[`mode:${a.mode}`] = 1;
  if (job.source) x[`source:${String(job.source).toLowerCase()}`] = 1;
  for (const k of ['skills', 'title', 'seniority']) {
    const s = base.components[k].score;
    if (s != null) x[`match:${k}`] = s - 0.5;
  }
  return x;
}

const STALE_DAYS = 30;
/** Training label for a job, or null if it has no outcome yet. */
export function outcomeLabel(job, now = Date.now()) {
  const peak = rank(job.peak_stage);
  if (peak >= 2) {
    // Got at least a recruiter screen: the application itself was a fit. Deeper = stronger signal.
    const w = job.stage === 'rejected' && peak === 2 ? 0.6 : Math.min(1 + (peak - 2) * 0.5, 2.5);
    return { y: 1, w, kind: 'advanced' };
  }
  if (job.stage === 'rejected') return { y: 0, w: 1, kind: 'rejected' };
  if (job.stage === 'ghosted') return { y: 0, w: 0.6, kind: 'ghosted' };
  if (job.stage === 'applied' && now - Date.parse(job.stage_changed_at) > STALE_DAYS * 864e5) return { y: 0, w: 0.3, kind: 'stale' };
  return null;
}

const MIN_SUPPORT = 2;
/**
 * Weighted logistic regression with the baseline as a fixed offset:
 *   p(advance) = sigmoid(logit(baseline) + bias + w.x),  L2 on w.
 * examples: [{ base: 0..100, x: {feature: value}, y: 0|1, w: weight }]
 */
export function trainModel(examples, { l2 = 1.5, iters = 400 } = {}) {
  const support = {};
  for (const e of examples) for (const k of Object.keys(e.x)) (support[k] ??= { n: 0, pos: 0, neg: 0 }, support[k].n++, e.y ? support[k].pos++ : support[k].neg++);
  const keys = Object.keys(support).filter((k) => support[k].n >= MIN_SUPPORT);
  const idx = new Map(keys.map((k, i) => [k, i]));
  const rows = examples.map((e) => ({
    off: logit(clamp(e.base / 100, 0.05, 0.95)), y: e.y, w: e.w,
    f: Object.entries(e.x).filter(([k]) => idx.has(k)).map(([k, v]) => [idx.get(k), v]),
  }));
  const n = keys.length;
  const theta = new Float64Array(n + 1); // last = bias
  const m = new Float64Array(n + 1), v = new Float64Array(n + 1), g = new Float64Array(n + 1);
  const lr = 0.05, b1 = 0.9, b2 = 0.999;
  for (let t = 1; rows.length && t <= iters; t++) {
    for (let i = 0; i < n; i++) g[i] = l2 * theta[i];
    g[n] = 0.05 * theta[n];
    for (const r of rows) {
      let z = r.off + theta[n];
      for (const [i, val] of r.f) z += theta[i] * val;
      const err = r.w * (sigmoid(z) - r.y);
      for (const [i, val] of r.f) g[i] += err * val;
      g[n] += err;
    }
    for (let i = 0; i <= n; i++) {
      m[i] = b1 * m[i] + (1 - b1) * g[i];
      v[i] = b2 * v[i] + (1 - b2) * g[i] * g[i];
      theta[i] -= (lr * (m[i] / (1 - b1 ** t))) / (Math.sqrt(v[i] / (1 - b2 ** t)) + 1e-8);
    }
  }
  return {
    bias: theta[n],
    weights: Object.fromEntries(keys.map((k, i) => [k, theta[i]])),
    support,
    n: examples.length,
    advanced: examples.filter((e) => e.y === 1).length,
    rejected: examples.filter((e) => e.y === 0).length,
  };
}

export function buildModel(jobs, profile, now = Date.now()) {
  const examples = [];
  for (const job of jobs) {
    const label = outcomeLabel(job, now);
    if (!label) continue;
    const a = analyzeJob(job, profile);
    const base = baseline(job, profile, a);
    examples.push({ base: base.score, x: learnFeatures(job, a, base), y: label.y, w: label.w });
  }
  return trainModel(examples);
}

export function describeFeature(key) {
  const [type, name] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  return {
    skill: `Postings mentioning ${name}`, level: `${name[0].toUpperCase()}${name.slice(1)}-level roles`, family: `${name} roles`,
    mode: `${name} roles`, source: `Postings from ${name}`, match: `Strong ${name} match`,
  }[type] ?? key;
}

/** Full fit result for one job given the trained outcome model. */
export function fit(job, profile, model) {
  const a = analyzeJob(job, profile);
  const base = baseline(job, profile, a);
  const x = learnFeatures(job, a, base);
  const signals = [];
  let adj = 0;
  for (const [k, val] of Object.entries(x)) {
    const w = model?.weights[k];
    if (!w) continue;
    adj += w * val;
    if (Math.abs(w * val) >= 0.12) signals.push({ feature: k, label: describeFeature(k), effect: w * val, ...model.support[k] });
  }
  adj = clamp(adj, -2.5, 2.5);
  const off = logit(clamp(base.score / 100, 0.05, 0.95));
  let score = model?.n ? 100 * sigmoid(off + adj) : base.score;
  if (a.dealbreakers.length) score = Math.min(score, 15);
  signals.sort((p, q) => Math.abs(q.effect) - Math.abs(p.effect));
  return {
    score: Math.round(score),
    baseline: Math.round(base.score),
    learned: Math.round(score) - Math.round(base.score),
    // Calibrated odds of getting past the application, only once there is enough history to mean anything.
    advanceChance: model?.n >= 8 && model.advanced && model.rejected ? Math.round(100 * sigmoid(off + model.bias + adj)) : null,
    components: base.components,
    matched: a.skills.filter((k) => k.have).map((k) => k.name),
    missing: a.skills.filter((k) => !k.have).map((k) => k.name),
    level: a.level, family: a.family, mode: a.mode, years: a.years,
    salaryMin: a.salaryMin, salaryMax: a.salaryMax,
    dealbreakers: a.dealbreakers,
    signals: signals.slice(0, 6),
  };
}

/** Learned signals across the whole history, for the insights page. */
export function modelSignals(model) {
  return Object.entries(model.weights)
    .map(([feature, weight]) => ({ feature, label: describeFeature(feature), weight, ...model.support[feature] }))
    .filter((s) => Math.abs(s.weight) >= 0.05)
    .sort((p, q) => Math.abs(q.weight) - Math.abs(p.weight));
}

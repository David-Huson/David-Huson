import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { openDb, STAGES, PIPELINE, rank } from './db.js';
import { resumePrompt } from './resume.js';
import { buildModel, fit, modelSignals, outcomeLabel, findSkills, parseSalary, workMode } from './fit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

export function createApp({ dbPath = join(ROOT, 'data', 'crm.db') } = {}) {
  const db = openDb(dbPath);

  // The outcome model is cheap to train but needed on every list call; retrain only after writes.
  let model = null;
  const getModel = () => (model ??= buildModel(db.listJobs(), db.getProfile()));
  const dirty = () => { model = null; };

  const withFit = (job, profile = db.getProfile()) => ({ ...job, fit: fit(job, profile, getModel()) });
  const summary = (job, profile) => {
    const { description, tailored_resume, ...rest } = withFit(job, profile);
    const f = rest.fit;
    return { ...rest, fit: { score: f.score, baseline: f.baseline, learned: f.learned, dealbreakers: f.dealbreakers } };
  };

  /** Fill in fields the clipper or a manual paste left blank. */
  const enrich = (input) => {
    const out = { ...input };
    if (out.salary_min == null && out.salary_max == null && out.description) {
      const s = parseSalary(out.description);
      if (s.min) [out.salary_min, out.salary_max] = [s.min, s.max];
    }
    if (!out.remote_mode) out.remote_mode = workMode(out);
    return out;
  };

  function insights() {
    const jobs = db.listJobs();
    const m = getModel();
    const reached = (stage) => jobs.filter((j) => rank(j.peak_stage) >= rank(stage)).length;
    const applied = reached('applied');
    const labels = jobs.map((j) => outcomeLabel(j)).filter(Boolean);
    const bySource = {};
    for (const j of jobs) {
      if (rank(j.peak_stage) < 1) continue;
      const s = (bySource[j.source || 'unknown'] ??= { source: j.source || 'unknown', applied: 0, advanced: 0 });
      s.applied++;
      if (rank(j.peak_stage) >= 2) s.advanced++;
    }
    return {
      total: jobs.length,
      active: jobs.filter((j) => rank(j.stage) >= 1 && rank(j.stage) < 6).length,
      funnel: PIPELINE.slice(1, 6).map((stage) => ({ stage, count: reached(stage) })),
      responseRate: applied ? reached('screen') / applied : null,
      outcomes: Object.fromEntries(['advanced', 'rejected', 'ghosted', 'stale'].map((k) => [k, labels.filter((l) => l.kind === k).length])),
      bySource: Object.values(bySource).sort((a, b) => b.applied - a.applied),
      model: { n: m.n, advanced: m.advanced, rejected: m.rejected, signals: modelSignals(m).slice(0, 30) },
      tasks: db.openTasks(),
    };
  }

  const routes = [
    ['GET', /^\/api\/health$/, () => ({ ok: true, app: 'job-crm' })],
    ['GET', /^\/api\/meta$/, () => ({ stages: STAGES, pipeline: PIPELINE })],

    ['GET', /^\/api\/jobs$/, () => { const p = db.getProfile(); return db.listJobs().map((j) => summary(j, p)); }],
    ['GET', /^\/api\/jobs\/lookup$/, ({ query }) => {
      const job = db.findByUrl(query.get('url'));
      return job ? { found: true, job: summary(job) } : { found: false };
    }],
    ['POST', /^\/api\/jobs$/, ({ body }) => {
      if (!body.title && !body.company) throw httpError(400, 'title or company is required');
      const existing = body.url && db.findByUrl(body.url);
      if (existing) return { duplicate: true, job: summary(existing) };
      const job = db.createJob(enrich(body));
      dirty();
      return { duplicate: false, job: summary(job) };
    }],
    ['GET', /^\/api\/jobs\/(\d+)$/, ({ id }) => {
      const job = db.getJob(id);
      if (!job) throw httpError(404, 'job not found');
      return { ...withFit(job), outcome: outcomeLabel(job), events: db.listEvents(id), contacts: db.listContacts(id), tasks: db.listTasks(id) };
    }],
    ['PATCH', /^\/api\/jobs\/(\d+)$/, ({ id, body }) => {
      if (body.stage && !STAGES.includes(body.stage)) throw httpError(400, 'unknown stage');
      const job = db.updateJob(id, body);
      if (!job) throw httpError(404, 'job not found');
      dirty();
      return summary(job);
    }],
    ['DELETE', /^\/api\/jobs\/(\d+)$/, ({ id }) => { dirty(); return { deleted: db.deleteJob(id) }; }],

    ['GET', /^\/api\/jobs\/(\d+)\/resume-prompt$/, ({ id }) => {
      const job = db.getJob(id);
      if (!job) throw httpError(404, 'job not found');
      const profile = db.getProfile();
      return resumePrompt(job, profile, fit(job, profile, getModel()));
    }],
    ['POST', /^\/api\/jobs\/(\d+)\/events$/, ({ id, body }) => {
      if (!db.getJob(id)) throw httpError(404, 'job not found');
      db.addEvent(id, { kind: 'note', note: body.note ?? '' });
      return { ok: true };
    }],
    ['POST', /^\/api\/jobs\/(\d+)\/contacts$/, ({ id, body }) => {
      if (!db.getJob(id)) throw httpError(404, 'job not found');
      db.addContact(id, body);
      return { ok: true };
    }],
    ['DELETE', /^\/api\/contacts\/(\d+)$/, ({ id }) => ({ deleted: db.deleteContact(id) })],
    ['POST', /^\/api\/jobs\/(\d+)\/tasks$/, ({ id, body }) => {
      if (!db.getJob(id)) throw httpError(404, 'job not found');
      if (!body.title) throw httpError(400, 'title is required');
      db.addTask(id, body);
      return { ok: true };
    }],
    ['PATCH', /^\/api\/tasks\/(\d+)$/, ({ id, body }) => { db.updateTask(id, body); return { ok: true }; }],
    ['DELETE', /^\/api\/tasks\/(\d+)$/, ({ id }) => ({ deleted: db.deleteTask(id) })],

    ['GET', /^\/api\/profile$/, () => db.getProfile()],
    ['PUT', /^\/api\/profile$/, ({ body }) => { const p = db.setProfile(body); dirty(); return p; }],
    ['POST', /^\/api\/profile\/extract-skills$/, ({ body }) => ({ skills: [...findSkills(body.text ?? '').keys()] })],

    ['POST', /^\/api\/fit\/preview$/, ({ body }) => fit(enrich(body), db.getProfile(), getModel())],
    ['GET', /^\/api\/insights$/, insights],
    ['GET', /^\/api\/export$/, () => db.exportAll()],
  ];

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const origin = req.headers.origin;
    // Only this app's own pages and browser extensions may call the API; other websites may not.
    const hostOk = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host ?? ''); // blocks DNS rebinding
    const allowed = hostOk && (!origin || /^(chrome|moz)-extension:\/\//.test(origin) || isLoopbackOrigin(origin));
    const cors = origin && allowed ? {
      'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
    } : {};
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors });
      res.end(JSON.stringify(data));
    };

    if (url.pathname.startsWith('/api/')) {
      if (!allowed) return send(403, { error: 'origin not allowed' });
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      try {
        for (const [method, re, fn] of routes) {
          const m = req.method === method && url.pathname.match(re);
          if (!m) continue;
          let body = {};
          if (['POST', 'PUT', 'PATCH'].includes(method)) {
            if (!/^application\/json/.test(req.headers['content-type'] ?? '')) throw httpError(415, 'JSON body required');
            body = await readJson(req);
          }
          return send(200, fn({ id: m[1] ? Number(m[1]) : undefined, body, query: url.searchParams }));
        }
        return send(404, { error: 'not found' });
      } catch (err) {
        if (!err.status) console.error(err);
        return send(err.status ?? 500, { error: err.status ? err.message : 'internal error' });
      }
    }

    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    const rel = normalize(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  }

  return { db, server: createServer(handle) };
}

function isLoopbackOrigin(origin) {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname); } catch { return false; }
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 2_000_000) throw httpError(413, 'body too large');
    chunks.push(c);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw httpError(400, 'invalid JSON');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4319);
  const { server } = createApp({ dbPath: process.env.CRM_DB });
  server.listen(port, '127.0.0.1', () => console.log(`Job CRM running at http://localhost:${port}`));
}

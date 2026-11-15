import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const PIPELINE = ['saved', 'applied', 'screen', 'interview', 'final', 'offer', 'accepted'];
export const TERMINAL = ['rejected', 'ghosted', 'withdrawn'];
export const STAGES = [...PIPELINE, ...TERMINAL];
export const rank = (stage) => PIPELINE.indexOf(stage);

export const DEFAULT_PROFILE = {
  skills: [],
  targetTitles: [],
  years: null,
  remotePref: ['remote', 'hybrid', 'onsite'],
  locations: [],
  minSalary: null,
  dealbreakers: [],
  resume: '',
};

const JOB_FIELDS = [
  'company', 'title', 'location', 'remote_mode', 'salary_min', 'salary_max',
  'url', 'source', 'description', 'notes', 'excitement', 'applied_at', 'tailored_resume',
];

const now = () => new Date().toISOString();

const TRACKING_PARAMS = /^(utm_.*|ref|refid|trackingid|trk|gh_src|src|source|lipi|position|pagenum|ebp|from|vjs|tk|advn|adid|sjdu|xkcb|xpse|xfps|fbclid|gclid)$/i;

/** Canonical key for de-duplicating postings saved from the web. */
export function urlKey(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    const path = u.pathname.replace(/\/+$/, '');
    const qs = u.searchParams.toString();
    return `${u.hostname.replace(/^www\./, '').toLowerCase()}${path}${qs ? '?' + qs : ''}`;
  } catch {
    return String(url).trim().toLowerCase() || null;
  }
}

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      company TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      remote_mode TEXT NOT NULL DEFAULT '',
      salary_min INTEGER,
      salary_max INTEGER,
      url TEXT NOT NULL DEFAULT '',
      url_key TEXT,
      source TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      excitement INTEGER,
      stage TEXT NOT NULL DEFAULT 'saved',
      peak_stage TEXT NOT NULL DEFAULT 'saved',
      applied_at TEXT,
      stage_changed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jobs_url_key ON jobs(url_key);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      from_stage TEXT,
      to_stage TEXT,
      note TEXT NOT NULL DEFAULT '',
      at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      due TEXT,
      done INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  // Migrations for databases created by earlier versions.
  const jobCols = db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
  if (!jobCols.includes('tailored_resume')) db.exec("ALTER TABLE jobs ADD COLUMN tailored_resume TEXT NOT NULL DEFAULT ''");

  const clean = (input) => {
    const out = {};
    for (const f of JOB_FIELDS) {
      if (!(f in input)) continue;
      let v = input[f];
      if (['salary_min', 'salary_max', 'excitement'].includes(f)) {
        v = v === '' || v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v));
      } else if (f === 'applied_at') {
        v = v || null;
      } else {
        v = v == null ? '' : String(v).slice(0, ['description', 'tailored_resume'].includes(f) ? 60000 : 5000).trim();
      }
      out[f] = v;
    }
    return out;
  };

  const api = {
    raw: db,

    listJobs: () => db.prepare('SELECT * FROM jobs ORDER BY updated_at DESC').all(),
    getJob: (id) => db.prepare('SELECT * FROM jobs WHERE id = ?').get(id),
    findByUrl: (url) => {
      const key = urlKey(url);
      return key ? db.prepare('SELECT * FROM jobs WHERE url_key = ?').get(key) : undefined;
    },

    createJob(input) {
      const f = clean(input);
      const stage = STAGES.includes(input.stage) ? input.stage : 'saved';
      const t = now();
      const cols = { ...f, url_key: urlKey(f.url), stage, peak_stage: rank(stage) >= 0 ? stage : 'saved', stage_changed_at: t, created_at: t, updated_at: t };
      if (stage !== 'saved' && !cols.applied_at) cols.applied_at = t;
      const keys = Object.keys(cols);
      const res = db.prepare(`INSERT INTO jobs (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => cols[k]));
      const id = Number(res.lastInsertRowid);
      api.addEvent(id, { kind: 'created', to_stage: stage, note: f.source ? `Added from ${f.source}` : 'Added' });
      return api.getJob(id);
    },

    updateJob(id, input) {
      const job = api.getJob(id);
      if (!job) return undefined;
      const cols = clean(input);
      if ('url' in cols) cols.url_key = urlKey(cols.url);
      const t = now();
      if (input.stage && input.stage !== job.stage && STAGES.includes(input.stage)) {
        const to = input.stage;
        cols.stage = to;
        cols.stage_changed_at = t;
        // Peak tracks how far the application got. Moving backwards within the pipeline is treated as a correction.
        if (rank(to) >= 0) cols.peak_stage = to;
        if (rank(to) >= 1 && !job.applied_at && !cols.applied_at) cols.applied_at = t;
        api.addEvent(id, { kind: 'stage', from_stage: job.stage, to_stage: to, note: input.stage_note || '' });
      }
      cols.updated_at = t;
      const keys = Object.keys(cols);
      db.prepare(`UPDATE jobs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => cols[k]), id);
      return api.getJob(id);
    },

    deleteJob: (id) => db.prepare('DELETE FROM jobs WHERE id = ?').run(id).changes > 0,

    addEvent(jobId, { kind = 'note', from_stage = null, to_stage = null, note = '' }) {
      db.prepare('INSERT INTO events (job_id, kind, from_stage, to_stage, note, at) VALUES (?,?,?,?,?,?)')
        .run(jobId, kind, from_stage, to_stage, String(note).slice(0, 5000), now());
    },
    listEvents: (jobId) => db.prepare('SELECT * FROM events WHERE job_id = ? ORDER BY at DESC, id DESC').all(jobId),

    listContacts: (jobId) => db.prepare('SELECT * FROM contacts WHERE job_id = ? ORDER BY id').all(jobId),
    addContact(jobId, c) {
      const s = (v) => String(v ?? '').slice(0, 2000).trim();
      db.prepare('INSERT INTO contacts (job_id, name, role, email, link, notes) VALUES (?,?,?,?,?,?)')
        .run(jobId, s(c.name), s(c.role), s(c.email), s(c.link), s(c.notes));
    },
    deleteContact: (id) => db.prepare('DELETE FROM contacts WHERE id = ?').run(id).changes > 0,

    listTasks: (jobId) => db.prepare('SELECT * FROM tasks WHERE job_id = ? ORDER BY done, due IS NULL, due, id').all(jobId),
    openTasks: () => db.prepare(`SELECT t.*, j.company, j.title AS job_title FROM tasks t JOIN jobs j ON j.id = t.job_id
      WHERE t.done = 0 ORDER BY t.due IS NULL, t.due, t.id`).all(),
    addTask(jobId, t) {
      db.prepare('INSERT INTO tasks (job_id, title, due) VALUES (?,?,?)').run(jobId, String(t.title ?? '').slice(0, 500).trim(), t.due || null);
    },
    updateTask(id, t) {
      if ('done' in t) db.prepare('UPDATE tasks SET done = ? WHERE id = ?').run(t.done ? 1 : 0, id);
      if ('title' in t) db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(String(t.title).slice(0, 500), id);
      if ('due' in t) db.prepare('UPDATE tasks SET due = ? WHERE id = ?').run(t.due || null, id);
    },
    deleteTask: (id) => db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0,

    getProfile() {
      const row = db.prepare("SELECT value FROM kv WHERE key = 'profile'").get();
      return { ...DEFAULT_PROFILE, ...(row ? JSON.parse(row.value) : {}) };
    },
    setProfile(p) {
      const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,\n]/)).map((s) => String(s).trim()).filter(Boolean);
      const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
      const profile = {
        skills: [...new Set(list(p.skills).map((s) => s.toLowerCase()))],
        targetTitles: list(p.targetTitles),
        years: num(p.years),
        remotePref: list(p.remotePref).filter((m) => ['remote', 'hybrid', 'onsite'].includes(m)),
        locations: list(p.locations),
        minSalary: num(p.minSalary),
        dealbreakers: list(p.dealbreakers),
        resume: String(p.resume ?? '').slice(0, 60000),
      };
      db.prepare("INSERT INTO kv (key, value) VALUES ('profile', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(profile));
      return profile;
    },

    exportAll: () => ({
      exported_at: now(),
      profile: api.getProfile(),
      jobs: api.listJobs(),
      events: db.prepare('SELECT * FROM events').all(),
      contacts: db.prepare('SELECT * FROM contacts').all(),
      tasks: db.prepare('SELECT * FROM tasks').all(),
    }),
  };
  return api;
}

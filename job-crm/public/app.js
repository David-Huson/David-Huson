const PIPELINE = ['saved', 'applied', 'screen', 'interview', 'final', 'offer', 'accepted'];
const TERMINAL = ['rejected', 'ghosted', 'withdrawn'];
const STAGES = [...PIPELINE, ...TERMINAL];
const VIEWS = { board: 'Board', list: 'List', insights: 'Insights', profile: 'Profile' };

const state = { view: location.hash.slice(1) in VIEWS ? location.hash.slice(1) : 'board', jobs: [], q: '', sort: { key: 'fit', dir: -1 } };
const $ = (id) => document.getElementById(id);

async function api(method, path, body) {
  const res = await fetch(`/api${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { toast(data.error ?? 'Request failed'); throw new Error(data.error); }
  return data;
}

/** Tiny DOM builder. Strings always become text nodes, so scraped posting text can never inject markup. */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  el.append(...kids.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

const tone = (s) => (s >= 70 ? 'hi' : s >= 45 ? 'md' : 'lo');
const scoreBadge = (fit, big) => h('span', { class: `score ${tone(fit.score)}${big ? ' big' : ''}`, title: `Fit ${fit.score} (profile match ${fit.baseline}, learned ${signed(fit.learned)})` }, fit.score);
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const money = (j) => (j.salary_min || j.salary_max ? [j.salary_min, j.salary_max].filter(Boolean).map((n) => `$${Math.round(n / 1000)}k`).filter((v, i, a) => a.indexOf(v) === i).join('–') : '');
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
const safeUrl = (u) => (/^https?:\/\//i.test(u ?? '') ? u : null);
const pct = (v) => `${Math.round(v * 100)}%`;

async function load() {
  state.jobs = await api('GET', '/jobs');
  render();
}

function visibleJobs() {
  const q = state.q.trim().toLowerCase();
  return q ? state.jobs.filter((j) => `${j.company} ${j.title} ${j.location} ${j.source}`.toLowerCase().includes(q)) : state.jobs;
}

function render() {
  $('nav').replaceChildren(...Object.entries(VIEWS).map(([k, label]) =>
    h('button', { class: state.view === k ? 'on' : '', onclick: () => { state.view = k; location.hash = k; ['board', 'list'].includes(k) ? load() : render(); } }, label)));
  $('search').hidden = !['board', 'list'].includes(state.view);
  ({ board: renderBoard, list: renderList, insights: renderInsights, profile: renderProfile })[state.view]();
}

// ---------- board ----------
function renderBoard() {
  const jobs = visibleJobs();
  if (!state.jobs.length) return $('view').replaceChildren(emptyState());
  const column = (stage) => {
    const items = jobs.filter((j) => j.stage === stage).sort((a, b) => b.fit.score - a.fit.score);
    return h('section', {
      class: 'col',
      ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); },
      ondragleave: (e) => e.currentTarget.classList.remove('over'),
      ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); moveJob(Number(e.dataTransfer.getData('text/plain')), stage); },
    }, h('header', {}, h('span', {}, stage), h('span', {}, items.length)), items.map(card));
  };
  $('view').replaceChildren(
    h('div', { class: 'board' }, PIPELINE.map(column)),
    h('h3', { class: 'closed' }, 'Closed'),
    h('div', { class: 'board' }, TERMINAL.map(column)),
  );
}

function card(j) {
  return h('article', {
    class: 'card', draggable: true, tabIndex: 0,
    ondragstart: (e) => e.dataTransfer.setData('text/plain', j.id),
    onclick: () => openJob(j.id),
    onkeydown: (e) => e.key === 'Enter' && openJob(j.id),
  },
  h('div', { class: 't' }, j.title || '(untitled)'), scoreBadge(j.fit),
  h('div', { class: 'c' }, [j.company, j.remote_mode || j.location, money(j)].filter(Boolean).join(' · ')));
}

async function moveJob(id, stage) {
  const job = state.jobs.find((j) => j.id === id);
  if (!job || job.stage === stage) return;
  await api('PATCH', `/jobs/${id}`, { stage });
  toast(`${job.company || job.title} → ${stage}`);
  await load();
}

const emptyState = () => h('div', { class: 'empty' },
  h('p', {}, 'No jobs yet. Add one here or clip postings with the Chrome extension.'),
  h('p', {}, h('button', { class: 'link', onclick: () => { state.view = 'profile'; render(); } }, 'Set up your profile'), ' first so fit scores mean something.'));

// ---------- list ----------
function renderList() {
  if (!state.jobs.length) return $('view').replaceChildren(emptyState());
  const cols = [
    ['fit', 'Fit', (j) => j.fit.score], ['company', 'Company', (j) => j.company.toLowerCase()], ['title', 'Title', (j) => j.title.toLowerCase()],
    ['stage', 'Stage', (j) => STAGES.indexOf(j.stage)], ['mode', 'Mode', (j) => j.remote_mode], ['salary', 'Salary', (j) => j.salary_max ?? j.salary_min ?? 0],
    ['source', 'Source', (j) => j.source], ['applied', 'Applied', (j) => j.applied_at ?? ''], ['updated', 'Updated', (j) => j.updated_at],
  ];
  const { key, dir } = state.sort;
  const get = cols.find((c) => c[0] === key)[2];
  const rows = [...visibleJobs()].sort((a, b) => (get(a) > get(b) ? 1 : get(a) < get(b) ? -1 : 0) * dir);
  $('view').replaceChildren(h('div', { class: 'tablewrap' }, h('table', {},
    h('thead', {}, h('tr', {}, cols.map(([k, label]) => h('th', {
      onclick: () => { state.sort = { key: k, dir: key === k ? -dir : k === 'fit' ? -1 : 1 }; render(); },
    }, label, key === k ? (dir > 0 ? ' ▲' : ' ▼') : '')))),
    h('tbody', {}, rows.map((j) => h('tr', { onclick: () => openJob(j.id) },
      h('td', {}, scoreBadge(j.fit), j.fit.learned ? h('span', { class: `small delta ${j.fit.learned > 0 ? 'up' : 'down'}` }, ` ${signed(j.fit.learned)}`) : null),
      h('td', {}, j.company), h('td', {}, j.title), h('td', { class: 'stage' }, j.stage), h('td', {}, j.remote_mode),
      h('td', {}, money(j)), h('td', {}, j.source), h('td', {}, day(j.applied_at)), h('td', {}, day(j.updated_at))))))));
}

// ---------- insights ----------
async function renderInsights() {
  const d = await api('GET', '/insights');
  const top = d.funnel[0]?.count || 1;
  const maxW = Math.max(0.01, ...d.model.signals.map((s) => Math.abs(s.weight)));
  const stat = (label, value) => h('div', { class: 'panel stat' }, h('b', {}, value), h('span', { class: 'muted' }, label));
  $('view').replaceChildren(
    h('div', { class: 'stats' },
      stat('Tracked', d.total), stat('In progress', d.active),
      stat('Response rate', d.responseRate == null ? '–' : pct(d.responseRate)),
      stat('Advanced', d.outcomes.advanced), stat('Rejected', d.outcomes.rejected), stat('No response', d.outcomes.ghosted + d.outcomes.stale)),
    h('div', { class: 'grid' },
      h('section', { class: 'panel' }, h('h2', {}, 'Funnel'),
        h('div', { class: 'kv' }, d.funnel.map((f) => [
          h('span', { class: 'stage' }, f.stage), h('div', { class: 'bar' }, h('i', { style: `width:${(100 * f.count) / top}%` })), h('span', { class: 'num' }, f.count)])),
        h('h3', {}, 'By source'),
        d.bySource.length ? h('div', { class: 'kv' }, d.bySource.map((s) => [
          h('span', {}, s.source), h('div', { class: 'bar pos' }, h('i', { style: `width:${(100 * s.advanced) / s.applied}%` })),
          h('span', { class: 'num small' }, `${s.advanced}/${s.applied}`)])) : h('p', { class: 'muted' }, 'Nothing applied to yet.')),
      h('section', { class: 'panel' }, h('h2', {}, 'What your outcomes are teaching the fit score'),
        h('p', { class: 'muted small' }, d.model.n
          ? `Learning from ${d.model.n} outcomes (${d.model.advanced} advanced, ${d.model.rejected} rejected or unanswered). Green raises future scores for similar postings, red lowers them.`
          : 'No outcomes yet. Move jobs to Screen or beyond, or to Rejected, and scores will start adapting.'),
        d.model.signals.length ? d.model.signals.map((s) => h('div', { class: 'sig' },
          h('span', {}, s.label), h('div', { class: `bar ${s.weight > 0 ? 'pos' : 'neg'}` }, h('i', { style: `width:${(100 * Math.abs(s.weight)) / maxW}%` })),
          h('span', { class: 'small muted num' }, `${s.pos}✓ ${s.neg}✗`)))
          : d.model.n ? h('p', { class: 'muted' }, 'Not enough repeated patterns yet.') : null),
      h('section', { class: 'panel' }, h('h2', {}, 'Open follow-ups'),
        d.tasks.length ? d.tasks.map((t) => h('div', { class: 'item' },
          h('input', { type: 'checkbox', onchange: async () => { await api('PATCH', `/tasks/${t.id}`, { done: true }); renderInsights(); } }),
          h('button', { class: 'link grow', style: 'text-align:left', onclick: () => openJob(t.job_id) }, `${t.title} — ${t.company || t.job_title}`),
          h('span', { class: `small ${t.due && t.due < new Date().toISOString().slice(0, 10) ? 'warn' : 'muted'}` }, t.due ? day(`${t.due}T12:00`) : '')))
          : h('p', { class: 'muted' }, 'Nothing due.'))),
    h('p', { class: 'small', style: 'margin-top:16px' }, h('a', { href: '/api/export', download: 'job-crm-export.json' }, 'Export all data (JSON)')),
  );
}

// ---------- profile ----------
async function renderProfile() {
  const p = await api('GET', '/profile');
  const f = (name, label, value, extra = {}) => h('label', {}, label, h(extra.tag ?? 'input', { name, value: value ?? '', ...extra, tag: undefined }));
  const form = h('form', { class: 'panel', style: 'max-width:820px', onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    await api('PUT', '/profile', { ...Object.fromEntries(fd), remotePref: fd.getAll('remotePref') });
    toast('Profile saved — fit scores updated');
    await load();
  } },
  h('h2', {}, 'Your profile'),
  h('p', { class: 'muted small' }, 'Fit scores compare each posting against this. Outcomes you record then adjust the scores over time.'),
  f('skills', 'Skills (comma separated)', p.skills.join(', '), { tag: 'textarea', id: 'skills' }),
  h('div', { class: 'form2' },
    f('targetTitles', 'Target titles (comma separated)', p.targetTitles.join(', '), { placeholder: 'Full Stack Engineer, Software Engineer' }),
    f('years', 'Years of experience', p.years, { type: 'number', min: 0, step: 0.5 }),
    f('locations', 'Locations you can work from/in', p.locations.join(', '), { placeholder: 'Denver, Boulder' }),
    f('minSalary', 'Minimum salary (annual)', p.minSalary, { type: 'number', min: 0, step: 1000 })),
  h('label', {}, 'Work modes you would take'),
  h('div', { class: 'checks', style: 'margin:-6px 0 10px' }, ['remote', 'hybrid', 'onsite'].map((m) =>
    h('label', {}, h('input', { type: 'checkbox', name: 'remotePref', value: m, checked: p.remotePref.includes(m) }), m))),
  f('dealbreakers', 'Dealbreaker phrases (comma separated) — any match caps the score at 15', p.dealbreakers.join(', '), { placeholder: 'security clearance, relocation required' }),
  f('resume', 'Resume text (optional, used to suggest skills)', p.resume, { tag: 'textarea', id: 'resume', style: 'min-height:120px' }),
  h('div', { class: 'row' },
    h('button', { class: 'primary' }, 'Save profile'),
    h('button', { type: 'button', onclick: async () => {
      const { skills } = await api('POST', '/profile/extract-skills', { text: $('resume').value });
      const cur = $('skills').value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const add = skills.filter((s) => !cur.includes(s));
      $('skills').value = [...cur, ...add].join(', ');
      toast(add.length ? `Added ${add.length} skills from resume — review, then save` : 'No new skills found');
    } }, 'Pull skills from resume')));
  $('view').replaceChildren(form);
}

// ---------- job dialog ----------
const dlg = $('dialog');
dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());

function fitPanel(fit) {
  const comps = Object.entries(fit.components);
  return h('section', { class: 'panel' },
    h('div', { class: 'row' }, scoreBadge(fit, true),
      h('div', { class: 'grow' },
        h('div', {}, h('b', {}, 'Fit score')),
        h('div', { class: 'small muted' }, `Profile match ${fit.baseline}`,
          fit.learned ? h('span', { class: `delta ${fit.learned > 0 ? 'up' : 'down'}` }, ` · ${signed(fit.learned)} from your outcomes`) : ' · no outcome adjustment',
          fit.advanceChance != null ? ` · ~${fit.advanceChance}% chance of a response` : ''))),
    fit.dealbreakers.length ? h('p', { class: 'warn' }, `Dealbreaker: ${fit.dealbreakers.join(', ')}`) : null,
    h('h3', {}, 'Profile match'),
    h('div', { class: 'kv' }, comps.map(([k, c]) => [
      h('span', { class: 'stage', title: c.note }, k),
      h('div', { class: 'bar', title: c.note }, h('i', { style: `width:${(c.score ?? 0) * 100}%` })),
      h('span', { class: 'num small' }, c.score == null ? '–' : pct(c.score))])),
    h('p', { class: 'small muted' }, comps.map(([, c]) => c.note).join(' · ')),
    fit.matched.length + fit.missing.length ? [h('h3', {}, 'Skills in posting'),
      h('div', {}, fit.matched.map((s) => h('span', { class: 'pill have' }, `✓ ${s}`)), fit.missing.map((s) => h('span', { class: 'pill miss' }, `✗ ${s}`)))] : null,
    fit.signals.length ? [h('h3', {}, 'Learned from your history'),
      fit.signals.map((s) => h('div', { class: 'small' },
        h('span', { class: `delta ${s.effect > 0 ? 'up' : 'down'}` }, s.effect > 0 ? '▲ ' : '▼ '),
        `${s.label} — ${s.pos} advanced, ${s.neg} rejected`))] : null);
}

async function openJob(id) {
  const j = await api('GET', `/jobs/${id}`);
  const refresh = async () => { await load(); await openJob(id); };
  const patch = async (body) => { await api('PATCH', `/jobs/${id}`, body); await refresh(); };
  const field = (name, label, extra = {}) => h('label', {}, label,
    h(extra.tag ?? 'input', { value: j[name] ?? '', ...extra, tag: undefined, onchange: (e) => patch({ [name]: e.target.value }) }));
  const url = safeUrl(j.url);

  const left = h('div', {},
    h('section', { class: 'panel' },
      h('div', { class: 'form2' },
        field('company', 'Company'), field('title', 'Title'), field('location', 'Location'),
        h('label', {}, 'Work mode', h('select', { onchange: (e) => patch({ remote_mode: e.target.value }) },
          ['', 'remote', 'hybrid', 'onsite'].map((m) => h('option', { value: m, selected: j.remote_mode === m }, m || 'unknown')))),
        field('salary_min', 'Salary min', { type: 'number' }), field('salary_max', 'Salary max', { type: 'number' }),
        field('url', 'Posting URL'), field('source', 'Source')),
      field('notes', 'Notes', { tag: 'textarea' }),
      h('details', {}, h('summary', { class: 'muted small' }, 'Job description'),
        h('textarea', { style: 'min-height:220px;margin-top:6px', value: j.description, onchange: (e) => patch({ description: e.target.value }) }))),
    h('h3', {}, 'Timeline'),
    h('form', { class: 'row', onsubmit: async (e) => { e.preventDefault(); const note = e.target.note.value.trim(); if (note) { await api('POST', `/jobs/${id}/events`, { note }); await refresh(); } } },
      h('input', { name: 'note', class: 'grow', placeholder: 'Log a call, email, interview note…', style: 'width:auto' }), h('button', {}, 'Log')),
    h('ul', { class: 'timeline', style: 'margin-top:10px' }, j.events.map((e) => h('li', {},
      h('span', { class: 'small muted' }, `${day(e.at)} · `),
      e.kind === 'stage' ? h('b', {}, `${e.from_stage} → ${e.to_stage}`) : null, e.kind === 'stage' && e.note ? ' — ' : '', e.note))));

  const right = h('div', {},
    fitPanel(j.fit),
    h('h3', {}, 'Follow-ups'),
    j.tasks.map((t) => h('div', { class: 'item' },
      h('input', { type: 'checkbox', checked: !!t.done, onchange: async (e) => { await api('PATCH', `/tasks/${t.id}`, { done: e.target.checked }); await refresh(); } }),
      h('span', { class: `grow ${t.done ? 'done' : ''}` }, t.title), h('span', { class: 'small muted' }, t.due ? day(`${t.due}T12:00`) : ''),
      h('button', { class: 'link danger', title: 'Delete', onclick: async () => { await api('DELETE', `/tasks/${t.id}`); await refresh(); } }, '✕'))),
    h('form', { class: 'row', onsubmit: async (e) => { e.preventDefault(); await api('POST', `/jobs/${id}/tasks`, { title: e.target.title.value, due: e.target.due.value }); await refresh(); } },
      h('input', { name: 'title', required: true, placeholder: 'Follow up with recruiter', class: 'grow', style: 'width:auto' }),
      h('input', { name: 'due', type: 'date', style: 'width:auto' }), h('button', {}, 'Add')),
    h('h3', {}, 'Contacts'),
    j.contacts.map((c) => h('div', { class: 'item' },
      h('span', { class: 'grow' }, h('b', {}, c.name), c.role ? ` · ${c.role}` : '', c.email ? [' · ', h('a', { href: `mailto:${c.email}` }, c.email)] : '',
        safeUrl(c.link) ? [' · ', h('a', { href: c.link, target: '_blank', rel: 'noopener' }, 'profile')] : ''),
      h('button', { class: 'link danger', title: 'Delete', onclick: async () => { await api('DELETE', `/contacts/${c.id}`); await refresh(); } }, '✕'))),
    h('form', { class: 'form2', onsubmit: async (e) => { e.preventDefault(); await api('POST', `/jobs/${id}/contacts`, Object.fromEntries(new FormData(e.target))); await refresh(); } },
      h('input', { name: 'name', required: true, placeholder: 'Name' }), h('input', { name: 'role', placeholder: 'Role' }),
      h('input', { name: 'email', type: 'email', placeholder: 'Email', style: 'margin-top:6px' }),
      h('div', { class: 'row', style: 'margin-top:6px;flex-wrap:nowrap' }, h('input', { name: 'link', placeholder: 'LinkedIn URL' }), h('button', {}, 'Add'))));

  dlg.replaceChildren(
    h('div', { class: 'dhead' },
      h('div', { class: 'grow' }, h('h2', {}, j.title || '(untitled)'),
        h('div', { class: 'muted' }, [j.company, j.location].filter(Boolean).join(' · '), url ? [' · ', h('a', { href: url, target: '_blank', rel: 'noopener' }, 'Open posting ↗')] : null)),
      h('select', { style: 'width:auto', 'aria-label': 'Stage', onchange: (e) => patch({ stage: e.target.value }) },
        STAGES.map((s) => h('option', { value: s, selected: j.stage === s }, s[0].toUpperCase() + s.slice(1)))),
      h('button', { class: 'primary', onclick: () => openResume(j) }, j.tailored_resume ? 'Resume ✓' : 'Tailor resume'),
      h('button', { class: 'danger', onclick: async () => { if (confirm('Delete this job and its history?')) { await api('DELETE', `/jobs/${id}`); dlg.close(); await load(); } } }, 'Delete'),
      h('button', { onclick: () => dlg.close() }, 'Close')),
    h('div', { class: 'dbody' }, left, right));
  if (!dlg.open) dlg.showModal();
}

async function openResume(j) {
  const r = await api('GET', `/jobs/${j.id}/resume-prompt`);
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast('Copy failed — select the text and copy manually'); }
  };
  const promptBox = h('textarea', { readOnly: true, style: 'min-height:300px;font-family:ui-monospace,monospace;font-size:12px', value: r.prompt ?? '' });
  const saved = h('textarea', { style: 'min-height:300px', placeholder: 'Paste the resume Claude wrote here to keep it with this application.', value: j.tailored_resume ?? '' });
  dlg.replaceChildren(
    h('div', { class: 'dhead' },
      h('div', { class: 'grow' }, h('h2', {}, 'Tailor resume'), h('div', { class: 'muted' }, [j.title, j.company].filter(Boolean).join(' · '))),
      h('button', { onclick: () => openJob(j.id) }, '← Back')),
    h('div', { class: 'dbody' },
      h('section', {}, h('h3', { style: 'margin-top:0' }, '1 · Give this prompt to Claude'),
        r.ok ? [
          h('p', { class: 'small muted' }, 'Includes your resume, the posting, the skills you match and miss, and what your past outcomes say about postings like this.'),
          promptBox,
          h('div', { class: 'row', style: 'margin-top:8px' },
            h('button', { class: 'primary', onclick: () => copy(r.prompt, 'Prompt') }, 'Copy prompt'),
            h('a', { href: 'https://claude.ai/new', target: '_blank', rel: 'noopener' }, 'Open Claude ↗'),
            h('span', { class: 'small muted' }, `${r.prompt.length.toLocaleString()} characters`))]
          : h('p', { class: 'warn' }, r.reason)),
      h('section', {}, h('h3', { style: 'margin-top:0' }, '2 · Save the result'),
        h('p', { class: 'small muted' }, 'So you know exactly which version you sent.'),
        saved,
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'primary', onclick: async () => { await api('PATCH', `/jobs/${j.id}`, { tailored_resume: saved.value }); j.tailored_resume = saved.value; toast('Resume saved'); } }, 'Save'),
          h('button', { onclick: () => copy(saved.value, 'Resume') }, 'Copy')))));
  if (!dlg.open) dlg.showModal();
}

function openAdd() {
  const preview = h('div', {});
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    const r = await api('POST', '/jobs', Object.fromEntries(new FormData(form)));
    toast(r.duplicate ? 'Already tracked — opening it' : 'Job added');
    await load();
    await openJob(r.job.id);
  } },
  h('div', { class: 'form2' },
    h('label', {}, 'Title', h('input', { name: 'title', required: true })), h('label', {}, 'Company', h('input', { name: 'company' })),
    h('label', {}, 'Posting URL', h('input', { name: 'url', type: 'url' })), h('label', {}, 'Location', h('input', { name: 'location' })),
    h('label', {}, 'Stage', h('select', { name: 'stage' }, STAGES.map((s) => h('option', { value: s }, s)))),
    h('label', {}, 'Source', h('input', { name: 'source', placeholder: 'referral, linkedin…' }))),
  h('label', {}, 'Job description (paste it — this is what gets scored)', h('textarea', { name: 'description', style: 'min-height:180px' })),
  h('div', { class: 'row' }, h('button', { class: 'primary' }, 'Add job'),
    h('button', { type: 'button', onclick: async () => preview.replaceChildren(fitPanel(await api('POST', '/fit/preview', Object.fromEntries(new FormData(form))))) }, 'Preview fit'),
    h('button', { type: 'button', onclick: () => dlg.close() }, 'Cancel')));
  dlg.replaceChildren(h('div', { class: 'dhead' }, h('h2', { class: 'grow' }, 'Add job')), h('div', { class: 'dbody' }, form, preview));
  dlg.showModal();
}

$('add').addEventListener('click', openAdd);
$('search').addEventListener('input', (e) => { state.q = e.target.value; render(); });
// Pick up jobs clipped by the extension while this tab was in the background.
document.addEventListener('visibilitychange', () => !document.hidden && !dlg.open && load());
load();

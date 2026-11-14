const $ = (id) => document.getElementById(id);
const form = $('form');
const DEFAULT_SERVER = 'http://localhost:4319';
let server = DEFAULT_SERVER;
let page = {};

const status = (msg, err) => { $('status').textContent = msg; $('status').className = err ? 'err' : 'muted'; $('status').hidden = !msg; };

async function api(method, path, body) {
  const res = await fetch(`${server}/api${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

const posting = () => ({ ...page, ...Object.fromEntries(new FormData(form)) });

function showScore(fit) {
  const el = $('score');
  el.textContent = `Fit ${fit.score}`;
  el.className = `score ${fit.score >= 70 ? 'hi' : fit.score >= 45 ? 'md' : 'lo'}`;
  el.hidden = false;
}

async function preview() {
  try {
    const fit = await api('POST', '/fit/preview', posting());
    showScore(fit);
    const box = $('fit');
    box.replaceChildren();
    const line = (cls, label, items) => {
      if (!items.length) return;
      const p = document.createElement('div');
      p.className = cls;
      p.textContent = `${label} ${items.slice(0, 10).join(', ')}`;
      box.append(p);
    };
    line('have', '✓', fit.matched);
    line('miss', '✗', fit.missing);
    if (fit.learned) line('muted', '', [`${fit.learned > 0 ? '+' : ''}${fit.learned} from your past outcomes (profile match ${fit.baseline})`]);
    if (fit.dealbreakers.length) line('err', 'Dealbreaker:', fit.dealbreakers);
  } catch { /* preview is best-effort */ }
}

function showTracked(job, isNew) {
  showScore(job.fit);
  status(isNew ? `Saved ✓ — ${job.stage}` : `Already in your CRM — ${job.stage}`);
  $('save').disabled = true;
  $('save').textContent = isNew ? 'Saved' : 'Tracked';
}

async function init() {
  ({ server = DEFAULT_SERVER } = await chrome.storage.sync.get('server'));
  $('server').value = server;
  $('open').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: server }); });
  $('server').addEventListener('change', async (e) => {
    server = e.target.value.trim().replace(/\/+$/, '') || DEFAULT_SERVER;
    await chrome.storage.sync.set({ server });
    location.reload();
  });

  try { await api('GET', '/health'); } catch {
    return status(`Can't reach the CRM at ${server}. Start it with "npm start" in job-crm/.`, true);
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract.js'] });
    page = result ?? {};
  } catch {
    return status("This page can't be read (browser pages and the Web Store are off-limits).", true);
  }

  for (const k of ['title', 'company', 'location', 'description']) form.elements[k].value = page[k] ?? '';
  form.hidden = false;
  status(page.description?.length > 200 ? '' : 'Could not find much of a description — select the posting text on the page and reopen, or paste it below.');

  const existing = await api('GET', `/jobs/lookup?url=${encodeURIComponent(page.url)}`);
  if (existing.found) showTracked(existing.job, false);
  preview();
}

let timer;
form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(preview, 400); });
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  $('save').disabled = true;
  try {
    const r = await api('POST', '/jobs', posting());
    showTracked(r.job, !r.duplicate);
  } catch (err) {
    $('save').disabled = false;
    status(`Save failed: ${err.message}`, true);
  }
});

init();

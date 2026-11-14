import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';

const { server } = createApp({ dbPath: ':memory:' });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());
const call = async (method, path, body, headers = {}) => {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json(), headers: res.headers };
};

test('profile, create, dedupe, stage flow, learning', async () => {
  await call('PUT', '/api/profile', { skills: 'TypeScript, React, nextjs', targetTitles: ['Full Stack Engineer'], years: 4, remotePref: ['remote'] });
  const prof = (await call('GET', '/api/profile')).data;
  assert.deepEqual(prof.skills, ['typescript', 'react', 'nextjs']);

  const posting = { title: 'Full Stack Engineer', company: 'Acme', url: 'https://jobs.acme.com/123?utm_source=x', source: 'acme',
    description: 'TypeScript, React, Next.js, Kubernetes. Fully remote. $140,000 - $170,000. 3+ years of experience' };
  const created = (await call('POST', '/api/jobs', posting)).data;
  assert.equal(created.duplicate, false);
  assert.equal(created.job.salary_min, 140000);
  assert.equal(created.job.remote_mode, 'remote');
  assert.ok(created.job.fit.score > 60);

  const dup = (await call('POST', '/api/jobs', { ...posting, url: 'https://www.jobs.acme.com/123/#apply' })).data;
  assert.equal(dup.duplicate, true);
  assert.equal((await call('GET', '/api/jobs/lookup?url=' + encodeURIComponent('https://jobs.acme.com/123'))).data.found, true);

  const id = created.job.id;
  await call('PATCH', `/api/jobs/${id}`, { stage: 'applied' });
  await call('PATCH', `/api/jobs/${id}`, { stage: 'screen' });
  const rej = (await call('PATCH', `/api/jobs/${id}`, { stage: 'rejected', stage_note: 'went with another candidate' })).data;
  assert.equal(rej.peak_stage, 'screen');
  const full = (await call('GET', `/api/jobs/${id}`)).data;
  assert.equal(full.outcome.kind, 'advanced');
  assert.equal(full.events.filter((e) => e.kind === 'stage').length, 3);
  assert.ok(full.applied_at);

  for (let i = 0; i < 3; i++) {
    const j = (await call('POST', '/api/jobs', { title: 'Platform Engineer', company: `K${i}`, description: 'Kubernetes, Terraform, AWS', stage: 'applied' })).data.job;
    await call('PATCH', `/api/jobs/${j.id}`, { stage: 'rejected' });
  }
  const ins = (await call('GET', '/api/insights')).data;
  assert.equal(ins.model.n, 4);
  assert.equal(ins.outcomes.rejected, 3);
  assert.ok(ins.model.signals.some((s) => s.feature === 'skill:terraform' && s.weight < 0));

  await call('POST', `/api/jobs/${id}/tasks`, { title: 'Send thank-you', due: '2030-01-01' });
  await call('POST', `/api/jobs/${id}/contacts`, { name: 'Pat', role: 'Recruiter' });
  const again = (await call('GET', `/api/jobs/${id}`)).data;
  assert.equal(again.tasks.length, 1);
  assert.equal(again.contacts[0].name, 'Pat');
  assert.equal((await call('DELETE', `/api/jobs/${id}`)).data.deleted, true);
});

test('rejects foreign origins, allows extensions', async () => {
  assert.equal((await call('GET', '/api/jobs', null, { Origin: 'https://evil.example' })).status, 403);
  const ext = await call('GET', '/api/jobs', null, { Origin: 'chrome-extension://abcdef' });
  assert.equal(ext.status, 200);
  assert.equal(ext.headers.get('access-control-allow-origin'), 'chrome-extension://abcdef');
  const res = await fetch(base + '/api/jobs', { method: 'POST', body: '{"title":"x"}', headers: { 'Content-Type': 'text/plain' } });
  assert.equal(res.status, 415);
});

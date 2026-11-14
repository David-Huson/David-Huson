import test from 'node:test';
import assert from 'node:assert/strict';
import { findSkills, levelOf, familyOf, requiredYears, parseSalary, baseline, trainModel, buildModel, fit, outcomeLabel } from '../server/fit.js';

const profile = {
  skills: ['typescript', 'react', 'next.js', 'node.js', 'postgresql', 'trpc'], targetTitles: ['Full Stack Engineer', 'Software Engineer'],
  years: 4, remotePref: ['remote', 'hybrid'], locations: ['Denver, CO'], minSalary: 120000, dealbreakers: ['security clearance'],
};
const job = (o = {}) => ({ title: 'Full Stack Engineer', description: 'We use TypeScript, React, Next.js and Postgres. 3+ years of experience. Fully remote. $130,000 - $160,000',
  location: '', remote_mode: '', source: 'linkedin', stage: 'saved', peak_stage: 'saved', stage_changed_at: new Date().toISOString(), ...o });

test('skill extraction handles aliases and avoids substrings', () => {
  const s = findSkills('Node.js, NextJS, k8s, C++, C#, .NET; written in Go, Rust. Go to the office. JavaScript not Java? restful');
  for (const k of ['node.js', 'next.js', 'kubernetes', 'c++', 'c#', '.net', 'golang', 'rust', 'javascript', 'rest api']) assert.ok(s.has(k), k);
  assert.equal(s.get('golang'), 1);
  assert.ok(!findSkills('JavaScript and expressive nodes').has('java'));
  assert.ok(!findSkills('the rest of the team').has('rest api'));
});

test('title, years and salary parsing', () => {
  assert.equal(levelOf('Sr. Software Engineer'), 'senior');
  assert.equal(levelOf('Software Engineer II'), 'mid');
  assert.equal(levelOf('Software Engineer'), null);
  assert.equal(familyOf('Senior Full-Stack Developer'), 'fullstack');
  assert.equal(requiredYears('5+ years of professional experience; 2 years experience with AWS. Founded 12 years ago.'), 5);
  assert.deepEqual(parseSalary('Pay: $120k - $150k plus $500 stipend'), { min: 120000, max: 150000 });
});

test('baseline rewards a matching posting and penalises a poor one', () => {
  const good = baseline(job(), profile).score;
  const bad = baseline(job({ title: 'Principal Data Engineer', description: 'Spark, Airflow, Snowflake, Scala. 10+ years of experience. Onsite in NYC.', location: 'New York' }), profile).score;
  assert.ok(good > 85, `good=${good}`);
  assert.ok(bad < 30, `bad=${bad}`);
});

test('no history: score equals baseline', () => {
  const f = fit(job(), profile, buildModel([], profile));
  assert.equal(f.score, f.baseline);
  assert.equal(f.learned, 0);
});

test('outcome labels', () => {
  assert.equal(outcomeLabel(job({ stage: 'saved' })), null);
  assert.equal(outcomeLabel(job({ stage: 'applied', peak_stage: 'applied' })), null);
  assert.equal(outcomeLabel(job({ stage: 'rejected', peak_stage: 'applied' })).y, 0);
  assert.equal(outcomeLabel(job({ stage: 'rejected', peak_stage: 'interview' })).y, 1);
  assert.equal(outcomeLabel(job({ stage: 'screen', peak_stage: 'screen' })).y, 1);
  assert.equal(outcomeLabel(job({ stage: 'applied', peak_stage: 'applied', stage_changed_at: '2020-01-01T00:00:00Z' })).kind, 'stale');
});

test('rejections and advancements shift future scores', () => {
  const k8s = (o) => job({ description: 'TypeScript, React, Kubernetes, AWS. 3+ years of experience. Remote.', ...o });
  const plain = (o) => job({ description: 'TypeScript, React, Next.js, tRPC. 3+ years of experience. Remote.', ...o });
  const history = [
    ...Array.from({ length: 5 }, () => k8s({ stage: 'rejected', peak_stage: 'applied' })),
    ...Array.from({ length: 5 }, () => plain({ stage: 'interview', peak_stage: 'interview' })),
  ];
  const model = buildModel(history, profile);
  assert.equal(model.n, 10);
  assert.ok(model.weights['skill:kubernetes'] < -0.2);
  assert.ok(model.weights['skill:trpc'] > 0.2);

  const none = buildModel([], profile);
  const a = fit(k8s(), profile, model), a0 = fit(k8s(), profile, none);
  const b = fit(plain(), profile, model), b0 = fit(plain(), profile, none);
  assert.ok(a.score < a0.score, `k8s ${a0.score} -> ${a.score}`);
  assert.ok(b.score > b0.score || b0.score >= 95, `plain ${b0.score} -> ${b.score}`);
  assert.ok(a.signals.some((s) => s.feature === 'skill:kubernetes' && s.effect < 0));
  assert.equal(typeof a.advanceChance, 'number');
});

test('one-sided history does not sink every score', () => {
  const history = Array.from({ length: 12 }, () => job({ stage: 'rejected', peak_stage: 'applied' }));
  const other = job({ title: 'Software Engineer', description: 'Python, Django, Postgres. 4 years of experience. Hybrid.', location: 'Denver, CO', source: 'indeed' });
  const before = fit(other, profile, buildModel([], profile)).score;
  const after = fit(other, profile, buildModel(history, profile)).score;
  assert.ok(Math.abs(after - before) <= 12, `${before} -> ${after}`);
});

test('dealbreakers cap the score', () => {
  const f = fit(job({ description: 'TypeScript React. Active security clearance required.' }), profile, trainModel([]));
  assert.ok(f.score <= 15);
  assert.deepEqual(f.dealbreakers, ['security clearance']);
});

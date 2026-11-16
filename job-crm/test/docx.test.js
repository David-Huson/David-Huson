import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../server/docx.js';

test('markdown subset', () => {
  const b = parseMarkdown('# Name\nemail@x.com | [site](https://x.com)\n\n## Skills\n* a_b_c, **TS** and *React*\n1. one\n\nwrapped\nline\n---\n### Role');
  assert.deepEqual(b.map((x) => x.type), ['h1', 'p', 'h2', 'li', 'li', 'p', 'h3']);
  assert.equal(b[1].runs.map((r) => r.text).join(''), 'email@x.com | site (https://x.com)');
  assert.deepEqual(b[3].runs, [{ text: 'a_b_c, ' }, { text: 'TS', bold: true }, { text: ' and ' }, { text: 'React', italic: true }]);
  assert.equal(b[5].runs[0].text, 'wrapped line');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lintText, fixText } from '../src/lint.js';
import { isSuppressed, parseSuppressions } from '../src/suppress.js';

test('parseSuppressions understands line and next-line scopes', () => {
  const map = parseSuppressions([
    '第一行',
    '代码 <!-- zdl-disable-line -->',
    '<!-- zdl-disable-next-line repeated-word -->',
    '我的的书'
  ]);
  assert.deepEqual([...map.get(2)], ['*']);
  assert.deepEqual([...map.get(4)], ['repeated-word']);
});

test('rule lists are split on commas and spaces', () => {
  const map = parseSuppressions(['<!-- zdl-disable-line a,b  c -->']);
  assert.deepEqual([...map.get(1)].sort(), ['a', 'b', 'c']);
});

test('isSuppressed matches specific rules only', () => {
  const map = parseSuppressions(['x <!-- zdl-disable-line repeated-word -->']);
  assert.equal(isSuppressed(map, 1, 'repeated-word'), true);
  assert.equal(isSuppressed(map, 1, 'cjk-latin-space'), false);
  assert.equal(isSuppressed(map, 2, 'repeated-word'), false);
});

test('disable-line silences the whole line', () => {
  const text = '使用Node开发 <!-- zdl-disable-line -->';
  assert.deepEqual(lintText(text), []);
});

test('disable-line only silences the listed rule', () => {
  const text = '使用Node的的 <!-- zdl-disable-line repeated-word -->';
  const rules = lintText(text).map((issue) => issue.rule);
  assert.ok(rules.includes('cjk-latin-space'));
  assert.ok(!rules.includes('repeated-word'));
});

test('disable-next-line applies to the following line', () => {
  const text = ['<!-- zdl-disable-next-line cjk-latin-space -->', '使用Node的的'].join('\n');
  const rules = lintText(text).map((issue) => issue.rule);
  assert.deepEqual(rules, ['repeated-word']);
});

test('suppression does not leak into other lines', () => {
  const text = ['使用Node <!-- zdl-disable-line -->', '使用Node'].join('\n');
  const issues = lintText(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].line, 2);
});

test('fixing respects suppressions', () => {
  const text = '使用Node <!-- zdl-disable-line -->';
  const result = fixText(text);
  assert.equal(result.fixed, 0);
  assert.equal(result.text, text);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyEdits, fixText } from '../src/lint.js';

const fix = (text, options) => fixText(text, options).text;

test('inserts spaces around latin words', () => {
  assert.equal(fix('使用Node开发'), '使用 Node 开发');
  assert.equal(fix('Node 开发'), 'Node 开发');
});

test('rewrites ascii punctuation', () => {
  assert.equal(fix('这是一个测试,对吗'), '这是一个测试，对吗');
  assert.equal(fix('注意: 先备份'), '注意： 先备份');
});

test('collapses duplicated punctuation', () => {
  assert.equal(fix('真的吗？？'), '真的吗？');
  assert.equal(fix('好。。。'), '好。');
});

test('removes spaces before full-width punctuation', () => {
  assert.equal(fix('你好 ，世界'), '你好，世界');
});

test('trims trailing whitespace', () => {
  assert.equal(fix('一行文字   \n第二行'), '一行文字\n第二行');
});

test('combines every rule in one pass without leftovers', () => {
  const input = '我们用React开发,效果不错  \n下一行Node.js也不错!!';
  const { text, remaining } = fixText(input);
  assert.deepEqual(remaining, []);
  assert.equal(text, '我们用 React 开发，效果不错\n下一行 Node.js 也不错！');
});

test('never touches inline code or fenced blocks', () => {
  const input = ['运行 `npm run build, 后` 即可', '```bash', 'git commit -m "中文,不改"', '```'].join('\n');
  const result = fixText(input);
  assert.ok(result.text.includes('`npm run build, 后`'));
  assert.ok(result.text.includes('git commit -m "中文,不改"'));
  assert.equal(result.remaining.length, 0);
});

test('never touches URLs', () => {
  const input = '见 https://example.com/a,b?c=1 说明';
  assert.equal(fix(input), input);
});

test('fixing is idempotent', () => {
  const once = fixText('使用Node开发,好吗   ').text;
  const twice = fixText(once);
  assert.equal(twice.text, once);
  assert.equal(twice.fixed, 0);
});

test('reports what it fixed', () => {
  const result = fixText('使用Node');
  assert.equal(result.fixed, 1);
  assert.equal(result.text, '使用 Node');
});

test('applyEdits handles several edits at once', () => {
  const text = 'abcdef';
  const out = applyEdits(text, [
    { start: 1, end: 2, text: 'B' },
    { start: 4, end: 4, text: '-' },
    { start: 5, end: 6, text: '' }
  ]);
  assert.equal(out, 'aBcd-e');
});

test('applyEdits drops overlapping edits', () => {
  const out = applyEdits('abcdef', [
    { start: 1, end: 4, text: 'X' },
    { start: 2, end: 3, text: 'Y' }
  ]);
  assert.equal(out, 'aXef');
});

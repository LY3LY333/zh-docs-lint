import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isCJK, isLatin, maskLine, parseDocument, splitLines } from '../src/document.js';

test('splitLines keeps offsets', () => {
  const lines = splitLines('a\nbb\n');
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0], { text: 'a', start: 0, end: 1 });
  assert.deepEqual(lines[1], { text: 'bb', start: 2, end: 4 });
});

test('inline code is masked but keeps its length', () => {
  const line = '使用 `npm run build` 构建';
  const masked = maskLine(line);
  assert.equal(masked.length, line.length);
  assert.ok(masked.includes('\u0000'));
  assert.ok(!masked.includes('npm'));
});

test('URLs and e-mail addresses are masked', () => {
  const line = '见 https://example.com/a?b=1 或 mail@example.com';
  const masked = maskLine(line);
  assert.ok(!masked.includes('example.com'));
  assert.equal(masked.length, line.length);
});

test('HTML tags are masked', () => {
  const masked = maskLine('用 <kbd>Ctrl</kbd> 保存');
  assert.ok(!masked.includes('kbd')); // the tags themselves are protected
  assert.ok(masked.includes('Ctrl')); // text between tags is still prose
  assert.ok(masked.includes('用'));
});

test('fenced code is marked as code, not text', () => {
  const doc = parseDocument('前文\n```js\nconst a=1;\n```\n后文\n');
  assert.deepEqual(
    doc.lines.map((line) => line.type),
    ['text', 'fence', 'code', 'fence', 'text', 'text']
  );
  assert.equal(doc.unclosedFence, null);
});

test('unclosed fence is reported', () => {
  const doc = parseDocument('标题\n```js\nconst a=1;\n');
  assert.ok(doc.unclosedFence);
  assert.equal(doc.unclosedFence.lineNo, 2);
});

test('CJK and latin detection', () => {
  assert.ok(isCJK('中'));
  assert.ok(!isCJK('a'));
  assert.ok(isLatin('a'));
  assert.ok(isLatin('7'));
  assert.ok(!isLatin('中'));
});

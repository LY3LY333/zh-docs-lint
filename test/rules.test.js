import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixText, lintText } from '../src/lint.js';

const rulesOf = (text, options = {}) => lintText(text, options).map((issue) => issue.rule);
const only = (id) => ({ rules: [id] });

test('cjk-latin-space flags both directions', () => {
  assert.deepEqual(rulesOf('使用Node开发'), ['cjk-latin-space', 'cjk-latin-space']);
  assert.deepEqual(rulesOf('Node开发'), ['cjk-latin-space']);
  assert.deepEqual(rulesOf('用3天完成'), ['cjk-latin-space', 'cjk-latin-space']);
});

test('cjk-latin-space accepts already spaced text', () => {
  assert.deepEqual(rulesOf('使用 Node 开发'), []);
  assert.deepEqual(rulesOf('使用 Node开发'), ['cjk-latin-space']);
});

test('cjk-latin-space ignores inline code and urls', () => {
  assert.deepEqual(rulesOf('运行 `npm run build` 即可'), []);
  assert.deepEqual(rulesOf('见 https://example.com/a 说明'), []);
});

test('fullwidth-punct converts ascii punctuation inside chinese sentences', () => {
  assert.deepEqual(rulesOf('这是一个测试,对吗', only('fullwidth-punct')), ['fullwidth-punct']);
  assert.deepEqual(rulesOf('真的吗?', only('fullwidth-punct')), ['fullwidth-punct']);
  assert.deepEqual(rulesOf('注意: 先备份', only('fullwidth-punct')), ['fullwidth-punct']);
});

test('fullwidth-punct collapses ascii runs into one full-width mark', () => {
  assert.equal(fixText('真的吗??').text, '真的吗？');
});

test('fullwidth-punct leaves numbers, versions and latin alone', () => {
  assert.deepEqual(rulesOf('版本1.0发布', only('fullwidth-punct')), []);
  assert.deepEqual(rulesOf('e.g. 的例子', only('fullwidth-punct')), []);
  assert.deepEqual(rulesOf('见 https://a.com/x,y', only('fullwidth-punct')), []);
});

test('duplicated-punct collapses repeated full-width marks', () => {
  assert.deepEqual(rulesOf('真的吗？？'), ['duplicated-punct']);
  assert.deepEqual(rulesOf('好。。。'), ['duplicated-punct', 'duplicated-punct']);
});

test('duplicated-punct leaves ellipsis and dashes alone', () => {
  assert.deepEqual(rulesOf('等等……'), []);
  assert.deepEqual(rulesOf('注意——这里'), []);
});

test('space-before-punct', () => {
  assert.deepEqual(rulesOf('你好 ，世界'), ['space-before-punct']);
  assert.deepEqual(rulesOf('你好，世界'), []);
});

test('trailing-space', () => {
  assert.deepEqual(rulesOf('一行文字   '), ['trailing-space']);
  assert.deepEqual(rulesOf('一行文字'), []);
});

test('repeated-word is conservative', () => {
  assert.deepEqual(rulesOf('我的的书'), ['repeated-word']);
  assert.deepEqual(rulesOf('谢谢大家'), []);
  assert.deepEqual(rulesOf('哈哈哈哈'), []);
});

test('heading-jump reports skipped levels', () => {
  assert.deepEqual(rulesOf('# 一级\n\n### 三级'), ['heading-jump']);
  assert.deepEqual(rulesOf('# 一级\n\n## 二级\n\n### 三级'), []);
});

test('unclosed-fence', () => {
  assert.deepEqual(rulesOf('```js\nconst a = 1;\n'), ['unclosed-fence']);
});

test('nothing is reported inside fenced code', () => {
  const text = ['```js', 'const 中文=1; // TODO:使用x', '```'].join('\n');
  assert.deepEqual(rulesOf(text), []);
});

test('issues carry position information', () => {
  const [issue] = lintText('使用Node');
  assert.equal(issue.line, 1);
  assert.equal(issue.column, 3);
  assert.equal(issue.file, '<text>');
});

test('rules can be selected', () => {
  assert.deepEqual(rulesOf('使用Node,好', { rules: ['cjk-latin-space'] }), ['cjk-latin-space']);
  assert.deepEqual(rulesOf('这是测试,好', { rules: ['fullwidth-punct'] }), ['fullwidth-punct']);
});

test('messages are human readable', () => {
  const [issue] = lintText('使用Node');
  assert.match(issue.message, /空格/);
});

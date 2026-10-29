import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { run, collectFiles, parseArgs } from '../src/cli.js';

function workspace(files) {
  const dir = mkdtempSync(join(tmpdir(), 'zdl-'));
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }
  const out = [];
  const err = [];
  const io = { out: (text) => out.push(text), err: (text) => err.push(text) };
  const invoke = (argv) => run(argv, { cwd: dir, io, isTTY: false });
  return { dir, out, err, invoke, read: (name) => readFileSync(join(dir, name), 'utf8') };
}

test('clean document exits 0', () => {
  const w = workspace({ 'README.md': '# 标题\n\n使用 Node 开发，很简单。\n' });
  assert.equal(w.invoke([]), 0);
  assert.match(w.out.join('\n'), /没有发现问题/);
});

test('issues exit 1 and print the rule id', () => {
  const w = workspace({ 'README.md': '使用Node开发.\n' });
  assert.equal(w.invoke([]), 1);
  const text = w.out.join('\n');
  assert.match(text, /cjk-latin-space/);
  assert.match(text, /README\.md:1:/);
});

test('--fix rewrites the file and exits 0', () => {
  const w = workspace({ 'README.md': '使用Node开发,好吗   \n' });
  assert.equal(w.invoke(['--fix']), 0);
  assert.equal(w.read('README.md'), '使用 Node 开发，好吗\n');
  assert.match(w.out.join('\n'), /自动修复/);
});

test('--json is machine readable', () => {
  const w = workspace({ 'a.md': '使用Node\n' });
  assert.equal(w.invoke(['--json']), 1);
  const payload = JSON.parse(w.out.join('\n'));
  assert.equal(payload.issues.length, 1);
  assert.equal(payload.issues[0].rule, 'cjk-latin-space');
  assert.equal(payload.issues[0].file, 'a.md');
});

test('--list-rules prints every rule', () => {
  const w = workspace({});
  assert.equal(w.invoke(['--list-rules']), 0);
  const text = w.out.join('\n');
  for (const id of ['cjk-latin-space', 'fullwidth-punct', 'heading-jump', 'unclosed-fence']) {
    assert.ok(text.includes(id), `missing ${id}`);
  }
});

test('only selected rules run', () => {
  const w = workspace({ 'a.md': '这是测试,好\n' });
  assert.equal(w.invoke(['--rules', 'fullwidth-punct']), 1);
  assert.match(w.out.join('\n'), /fullwidth-punct/);
  assert.doesNotMatch(w.out.join('\n'), /cjk-latin-space/);
});

test('ignored rules are skipped', () => {
  const w = workspace({ 'a.md': '使用Node\n' });
  assert.equal(w.invoke(['--ignore-rules', 'cjk-latin-space']), 0);
});

test('unknown rule and unknown flag are usage errors', () => {
  const w = workspace({ 'a.md': 'ok\n' });
  assert.equal(w.invoke(['--rules', 'nope']), 2);
  assert.match(w.err.join('\n'), /未知规则/);
  assert.equal(w.invoke(['--bogus']), 2);
});

test('empty directory is not an error', () => {
  const w = workspace({});
  assert.equal(w.invoke([]), 0);
  assert.match(w.out.join('\n'), /没有找到/);
});

test('nested directories are walked, node_modules is skipped', () => {
  const w = workspace({
    'docs/guide.md': '使用Node\n',
    'node_modules/pkg/readme.md': '使用Node\n'
  });
  const files = collectFiles(['.'], w.dir).map((file) => file.replace(/\\/g, '/'));
  assert.equal(files.length, 1);
  assert.ok(files[0].endsWith('docs/guide.md'));
});

test('plain text files are checked without markdown rules', () => {
  const w = workspace({ 'notes.txt': '# 不是标题, 只是文本\n' });
  assert.equal(w.invoke([]), 1);
  assert.match(w.out.join('\n'), /fullwidth-punct/);
  assert.doesNotMatch(w.out.join('\n'), /heading-jump/);
});

test('parseArgs understands flags and inline values', () => {
  const parsed = parseArgs(['docs', '--fix', '--rules=cjk-latin-space', '--json']);
  assert.equal(parsed.flags.fix, true);
  assert.equal(parsed.flags.json, true);
  assert.deepEqual(parsed.rules, ['cjk-latin-space']);
  assert.deepEqual(parsed.targets, ['docs']);
});

test('--quiet only prints the summary', () => {
  const w = workspace({ 'a.md': '使用Node\n' });
  assert.equal(w.invoke(['--quiet']), 1);
  const text = w.out.join('\n');
  assert.match(text, /共 1 个文件/);
  assert.doesNotMatch(text, /cjk-latin-space/);
});

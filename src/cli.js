import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

import { fixText, lintText } from './lint.js';
import { RULE_IDS, ruleById } from './rules.js';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', 'vendor', '.next', '.nuxt', '.cache'
]);

const EXTENSIONS = new Set(['.md', '.markdown', '.mdx', '.txt']);

const HELP = `zh-docs-lint — 中文技术文档排版检查

用法：
  zh-docs-lint [路径...] [选项]

选项：
  --fix                 自动修复可修复的问题（默认只报告）
  --json                以 JSON 输出，便于接入其他工具
  --rules a,b           只启用指定规则
  --ignore-rules a,b    禁用指定规则
  --list-rules          列出所有规则
  --quiet               只输出汇总
  -h, --help            显示帮助
  -v, --version         显示版本

不传路径时检查当前目录下的 .md / .markdown / .mdx / .txt 文件。
退出码：0 无问题，1 有问题，2 用法错误。
`;

const USAGE_ERROR = 2;

export function parseArgs(argv) {
  const flags = { fix: false, json: false, quiet: false, help: false, version: false, listRules: false };
  const targets = [];
  let rules = null;
  let ignoreRules = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--fix': flags.fix = true; break;
      case '--json': flags.json = true; break;
      case '--quiet': flags.quiet = true; break;
      case '--help': case '-h': flags.help = true; break;
      case '--version': case '-v': flags.version = true; break;
      case '--list-rules': flags.listRules = true; break;
      case '--rules': rules = splitList(argv[++i]); break;
      case '--ignore-rules': ignoreRules = splitList(argv[++i]); break;
      default:
        if (arg.startsWith('--rules=')) rules = splitList(arg.slice(8));
        else if (arg.startsWith('--ignore-rules=')) ignoreRules = splitList(arg.slice(15));
        else if (arg.startsWith('-')) return { error: `未知选项：${arg}` };
        else targets.push(arg);
    }
  }

  return { flags, targets, rules, ignoreRules };
}

function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Walk directories and pick markdown-ish files, skipping noise directories. */
export function collectFiles(targets, cwd = process.cwd()) {
  const files = [];

  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (entry.isFile() && EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(full);
      }
    }
  };

  for (const target of targets) {
    const abs = resolve(cwd, target);
    let stats;
    try {
      stats = statSync(abs);
    } catch {
      continue;
    }
    if (stats.isDirectory()) walk(abs);
    else if (EXTENSIONS.has(extname(abs).toLowerCase())) files.push(abs);
  }

  return files;
}

function makePalette(enabled) {
  const wrap = (code) => (text) => (enabled ? `\u001b[${code}m${text}\u001b[0m` : String(text));
  return { dim: wrap('2'), red: wrap('31'), green: wrap('32'), bold: wrap('1') };
}

function pad(text, width) {
  return String(text).padEnd(width);
}

export function formatIssues(issues, { cwd = process.cwd(), palette = makePalette(false) } = {}) {
  if (issues.length === 0) return '';

  const rows = issues.map((issue) => ({
    location: `${relative(cwd, issue.file) || issue.file}:${issue.line}:${issue.column}`,
    rule: issue.rule,
    message: issue.message
  }));

  const locationWidth = Math.min(48, Math.max(...rows.map((row) => row.location.length)));
  const ruleWidth = Math.max(...rows.map((row) => row.rule.length));

  return rows
    .map(
      (row) =>
        `${palette.dim(pad(row.location, locationWidth))}  ${palette.red(pad(row.rule, ruleWidth))}  ${row.message}`
    )
    .join('\n');
}

/**
 * @param {string[]} argv
 * @param {{cwd?: string, io?: {out: Function, err: Function}, isTTY?: boolean}} [options]
 */
export function run(argv, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const io = options.io ?? {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`)
  };
  const palette = makePalette((options.isTTY ?? Boolean(process.stdout.isTTY)) && !process.env.NO_COLOR);

  const parsed = parseArgs(argv);
  if (parsed.error) {
    io.err(parsed.error);
    io.err('运行 zh-docs-lint --help 查看用法');
    return USAGE_ERROR;
  }

  const { flags, targets, rules, ignoreRules } = parsed;
  if (flags.help) {
    io.out(HELP.trimEnd());
    return 0;
  }
  if (flags.version) {
    io.out('zh-docs-lint 0.1.0');
    return 0;
  }
  if (flags.listRules) {
    const width = Math.max(...RULE_IDS.map((id) => id.length));
    for (const id of RULE_IDS) {
      const rule = ruleById(id);
      io.out(`${pad(id, width)}  ${rule.fixable ? '可修复' : '仅提示'}  ${rule.summary}`);
    }
    return 0;
  }

  const unknown = [...(rules ?? []), ...ignoreRules].filter((id) => !ruleById(id));
  if (unknown.length > 0) {
    io.err(`未知规则：${unknown.join(', ')}`);
    io.err(`可用规则：${RULE_IDS.join(', ')}`);
    return USAGE_ERROR;
  }

  const enabled = rules ?? RULE_IDS.filter((id) => !ignoreRules.includes(id));
  const files = collectFiles(targets.length > 0 ? targets : ['.'], cwd);

  if (files.length === 0) {
    io.out('没有找到可检查的文件（.md / .markdown / .mdx / .txt）');
    return 0;
  }

  let fixedCount = 0;
  let changedFiles = 0;
  const remaining = [];

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const markdown = extname(file).toLowerCase() !== '.txt';
    const lintOptions = { file, markdown, rules: enabled };

    if (flags.fix) {
      const result = fixText(text, lintOptions);
      if (result.fixed > 0) {
        writeFileSync(file, result.text, 'utf8');
        fixedCount += result.fixed;
        changedFiles += 1;
      }
      remaining.push(...result.remaining);
    } else {
      remaining.push(...lintText(text, lintOptions));
    }
  }

  if (flags.json) {
    io.out(
      JSON.stringify(
        {
          files: files.length,
          issues: remaining.map((issue) => ({
            file: relative(cwd, issue.file) || issue.file,
            line: issue.line,
            column: issue.column,
            rule: issue.rule,
            message: issue.message,
            fixable: issue.fixable
          })),
          fixed: fixedCount
        },
        null,
        2
      )
    );
    return remaining.length > 0 ? 1 : 0;
  }

  if (fixedCount > 0) {
    io.out(palette.green(`✓ 自动修复 ${fixedCount} 处（${changedFiles} 个文件）`));
  }

  if (remaining.length > 0) {
    if (!flags.quiet) {
      io.out(formatIssues(remaining, { cwd, palette }));
    }
    const fixable = remaining.filter((issue) => issue.fixable).length;
    const summary = `共 ${files.length} 个文件，${remaining.length} 个问题` + (fixable ? `（${fixable} 个可自动修复）` : '');
    io.out(palette.bold(summary));
    if (fixable > 0 && !flags.fix) io.out(palette.dim('运行 zh-docs-lint --fix 自动修复可修复项'));
    return 1;
  }

  if (!flags.quiet) {
    io.out(palette.green(`✓ ${files.length} 个文件没有发现问题`));
  }
  return 0;
}

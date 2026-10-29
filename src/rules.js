/**
 * Rules operate on a single text line (or, for `kind: 'document'`, on the whole
 * parsed document) and return positions plus an optional fix.
 *
 * A fix is `{ start, end, text }` with absolute offsets into the original
 * document — `start === end` means "insert", `text === ''` means "delete".
 */

import { FULLWIDTH_PUNCT, MASK, isCJK, isLatin } from './document.js';

const ASCII_TO_FULLWIDTH = new Map([
  [',', '，'],
  ['.', '。'],
  [';', '；'],
  [':', '：'],
  ['!', '！'],
  ['?', '？']
]);

/** Common accidental word repetitions. Kept conservative on purpose. */
const REPEATED_WORDS = ['的', '了', '是', '在', '和', '就', '都', '很', '对', '与'];

function fix(start, end, text) {
  return { start, end, text };
}

function isBoundary(next, allowed) {
  if (next === undefined) return true;
  return allowed.includes(next);
}

export const cjkLatinSpace = {
  id: 'cjk-latin-space',
  summary: '中英文/数字之间需要一个空格',
  fixable: true,
  kind: 'line',
  check(block) {
    const issues = [];
    const { masked, text, start } = block;

    for (let i = 0; i < masked.length - 1; i += 1) {
      const a = masked[i];
      const b = masked[i + 1];
      if (a === MASK || b === MASK) continue;

      const boundary = (isCJK(a) && isLatin(b)) || (isLatin(a) && isCJK(b));
      if (!boundary) continue;

      issues.push({
        column: i + 2,
        message: `「${text[i]}${text[i + 1]}」之间需要空格`,
        fix: fix(start + i + 1, start + i + 1, ' ')
      });
    }

    return issues;
  }
};

export const fullwidthPunct = {
  id: 'fullwidth-punct',
  summary: '中文句子应使用全角标点',
  fixable: true,
  kind: 'line',
  check(block) {
    const issues = [];
    const { masked, text, start } = block;

    for (let i = 0; i < masked.length; i += 1) {
      const char = masked[i];
      const replacement = ASCII_TO_FULLWIDTH.get(char);
      if (!replacement) continue;

      const prev = masked[i - 1];
      if (!isCJK(prev)) continue;

      // Consume a run of identical marks: "真的吗??" becomes "真的吗？".
      let end = i + 1;
      while (masked[end] === char) end += 1;

      // Never touch something that is followed by a latin word or digit, e.g.
      // "版本1.0" or a decimal number inside Chinese prose.
      if (isLatin(masked[end])) continue;

      issues.push({
        column: i + 1,
        message: `「${prev}${char}」应写成全角「${replacement}」`,
        fix: fix(start + i, start + end, replacement)
      });
      i = end - 1;
    }

    return issues;
  }
};

export const duplicatedPunct = {
  id: 'duplicated-punct',
  summary: '重复的全角标点',
  fixable: true,
  kind: 'line',
  check(block) {
    const issues = [];
    const { masked, start } = block;

    for (let i = 0; i < masked.length - 1; i += 1) {
      const char = masked[i];
      if (!FULLWIDTH_PUNCT.includes(char)) continue;
      if (masked[i + 1] !== char) continue;

      issues.push({
        column: i + 2,
        message: `重复的标点「${char}${char}」`,
        fix: fix(start + i + 1, start + i + 2, '')
      });
    }

    return issues;
  }
};

export const spacedBeforePunct = {
  id: 'space-before-punct',
  summary: '全角标点前不要空格',
  fixable: true,
  kind: 'line',
  check(block) {
    const issues = [];
    const { masked, start } = block;

    for (let i = 1; i < masked.length - 1; i += 1) {
      if (masked[i] !== ' ') continue;
      if (!isCJK(masked[i - 1])) continue;
      if (!FULLWIDTH_PUNCT.includes(masked[i + 1])) continue;

      issues.push({
        column: i + 1,
        message: '中文标点前多余的空格',
        fix: fix(start + i, start + i + 1, '')
      });
    }

    return issues;
  }
};

export const trailingSpace = {
  id: 'trailing-space',
  summary: '行尾多余空格',
  fixable: true,
  kind: 'line',
  check(block) {
    const match = /[ \t]+$/.exec(block.text);
    if (!match) return [];
    return [
      {
        column: match.index + 1,
        message: '行尾多余空白',
        fix: fix(block.start + match.index, block.start + block.end - block.start, '')
      }
    ];
  }
};

export const repeatedWord = {
  id: 'repeated-word',
  summary: '疑似重复的词',
  fixable: false,
  kind: 'line',
  check(block) {
    const issues = [];
    const { masked, text } = block;

    for (const word of REPEATED_WORDS) {
      const needle = word + word;
      let index = masked.indexOf(needle);
      while (index !== -1) {
        issues.push({
          column: index + 1,
          message: `疑似重复：「${needle}」（${text.slice(Math.max(0, index - 4), index + 6)}）`
        });
        index = masked.indexOf(needle, index + needle.length);
      }
    }

    return issues;
  }
};

export const headingJump = {
  id: 'heading-jump',
  summary: 'Markdown 标题层级跳跃',
  fixable: false,
  kind: 'document',
  check(doc) {
    const issues = [];
    let previous = 0;

    for (const block of doc.lines) {
      if (block.type !== 'text') continue;
      const match = /^(#{1,6})\s+\S/.exec(block.text);
      if (!match) continue;

      const level = match[1].length;
      if (previous !== 0 && level > previous + 1) {
        issues.push({
          line: block.lineNo,
          column: 1,
          message: `标题从 h${previous} 跳到 h${level}`
        });
      }
      previous = level;
    }

    return issues;
  }
};

export const unclosedFence = {
  id: 'unclosed-fence',
  summary: '未闭合的代码围栏',
  fixable: false,
  kind: 'document',
  check(doc) {
    if (!doc.unclosedFence) return [];
    return [
      {
        line: doc.unclosedFence.lineNo,
        column: 1,
        message: `代码围栏「${doc.unclosedFence.char.repeat(3)}」没有闭合`
      }
    ];
  }
};

export const RULES = [
  cjkLatinSpace,
  fullwidthPunct,
  duplicatedPunct,
  spacedBeforePunct,
  trailingSpace,
  repeatedWord,
  headingJump,
  unclosedFence
];

export const RULE_IDS = RULES.map((rule) => rule.id);

export function ruleById(id) {
  return RULES.find((rule) => rule.id === id) ?? null;
}

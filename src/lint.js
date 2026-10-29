/**
 * Linting and fixing orchestration.
 *
 * Fixes are applied in document order and re-linted afterwards, because one fix
 * can expose another (inserting a space can create a new CJK/Latin boundary, for
 * example). The loop is capped so a misbehaving rule can never spin forever.
 */

import { parseDocument } from './document.js';
import { RULES, RULE_IDS } from './rules.js';
import { isSuppressed, parseSuppressions } from './suppress.js';

const MAX_PASSES = 6;

/**
 * @param {string} text
 * @param {{file?: string, markdown?: boolean, rules?: string[]}} [options]
 * @returns {Array<{file: string, line: number, column: number, rule: string, message: string, fixable: boolean, fix: object|null}>}
 */
export function lintText(text, options = {}) {
  const { file = '<text>', markdown = true, rules = RULE_IDS } = options;
  const enabled = new Set(rules);
  const doc = parseDocument(text, { markdown });
  const issues = [];

  for (const rule of RULES) {
    if (!enabled.has(rule.id)) continue;

    if (rule.kind === 'document') {
      for (const raw of rule.check(doc, { file })) {
        issues.push({
          file,
          rule: rule.id,
          line: raw.line ?? 1,
          column: raw.column ?? 1,
          message: raw.message,
          fixable: rule.fixable,
          fix: raw.fix ?? null
        });
      }
      continue;
    }

    for (const block of doc.lines) {
      if (block.type !== 'text') continue;
      for (const raw of rule.check(block, { file })) {
        issues.push({
          file,
          rule: rule.id,
          line: block.lineNo,
          column: raw.column,
          message: raw.message,
          fixable: rule.fixable,
          fix: raw.fix ?? null
        });
      }
    }
  }

  issues.sort((a, b) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule));

  const suppressions = parseSuppressions(doc.lines.map((line) => line.text));
  if (suppressions.size === 0) return issues;

  return issues.filter((issue) => !isSuppressed(suppressions, issue.line, issue.rule));
}

/** Apply non-overlapping edits, all offsets referring to the original text. */
export function applyEdits(text, edits) {
  const ordered = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let out = '';
  let cursor = 0;
  let lastEnd = -1;

  for (const edit of ordered) {
    if (edit.start < lastEnd) continue; // overlapping edit, skip it
    out += text.slice(cursor, edit.start);
    out += edit.text;
    cursor = edit.end;
    lastEnd = Math.max(edit.end, edit.start);
  }

  return out + text.slice(cursor);
}

/**
 * @param {string} text
 * @param {{file?: string, markdown?: boolean, rules?: string[]}} [options]
 * @returns {{text: string, fixed: number, remaining: Array<object>}}
 */
export function fixText(text, options = {}) {
  let current = text;
  let fixed = 0;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const fixable = lintText(current, options).filter((issue) => issue.fix);
    if (fixable.length === 0) break;

    const edits = [];
    let lastEnd = -1;
    for (const issue of fixable) {
      const { fix } = issue;
      if (fix.start < lastEnd) continue;
      if (edits.some((edit) => edit.start === fix.start)) continue;
      edits.push(fix);
      lastEnd = Math.max(lastEnd, fix.end);
    }

    if (edits.length === 0) break;

    current = applyEdits(current, edits);
    fixed += edits.length;
  }

  return { text: current, fixed, remaining: lintText(current, options) };
}

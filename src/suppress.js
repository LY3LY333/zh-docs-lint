/**
 * Inline suppression directives, modelled on the familiar ESLint comments:
 *
 *   <!-- zdl-disable-line -->                     whole line
 *   <!-- zdl-disable-line repeated-word -->       one rule
 *   <!-- zdl-disable-next-line heading-jump -->
 *
 * They live inside HTML comments, so the linter itself never lints them and
 * rendered Markdown does not show them.
 */

const DIRECTIVE = /<!--\s*zdl-disable-(line|next-line)([^>]*?)-->/g;

/**
 * @param {string[]} rawLines raw document lines, 1-based numbering in the result
 * @returns {Map<number, Set<string>>} line number -> rule ids ('*' means all)
 */
export function parseSuppressions(rawLines) {
  const map = new Map();

  rawLines.forEach((line, index) => {
    const regex = new RegExp(DIRECTIVE.source, 'g');
    let match;
    while ((match = regex.exec(line)) !== null) {
      const scope = match[1];
      const target = scope === 'line' ? index + 1 : index + 2;
      const ids = match[2]
        .split(/[\s,]+/)
        .map((id) => id.trim())
        .filter(Boolean);

      const value = ids.length > 0 ? ids : ['*'];
      const set = map.get(target) ?? new Set();
      for (const id of value) set.add(id);
      map.set(target, set);
    }
  });

  return map;
}

export function isSuppressed(map, line, ruleId) {
  const set = map.get(line);
  if (!set) return false;
  return set.has('*') || set.has(ruleId);
}

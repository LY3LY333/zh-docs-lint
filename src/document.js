/**
 * Documents are split into lines first, and every line is either ordinary text
 * or code. Text lines additionally carry a `masked` copy where inline code,
 * URLs, e-mail addresses and HTML tags are replaced by NUL characters: rules can
 * then use plain index arithmetic without ever "fixing" something inside code.
 */

export const MASK = '\u0000';

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

const INLINE_PATTERNS = [
  /`+[^`\n]*?`+/g, // `code`
  /```[\s\S]*?```/g, // ```code``` on one line
  /<https?:\/\/[^>\s]+>/g, // <https://autolink>
  /https?:\/\/[^\s)>\]]+/g, // bare URL
  /www\.[^\s)>\]]+/g,
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // e-mail
  /<\/?[a-zA-Z][^>]*>/g // HTML tag
];

export function splitLines(text) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') {
      lines.push({ text: text.slice(start, i), start, end: i });
      start = i + 1;
    }
  }
  if (start <= text.length) {
    lines.push({ text: text.slice(start), start, end: text.length });
  }
  return lines;
}

/** Replace protected spans (inline code, URLs, tags) with NUL characters. */
export function maskLine(line) {
  if (!line) return '';
  // Split on UTF-16 units so indices line up with the offsets that the
  // regular expressions below report.
  const chars = line.split('');
  for (const pattern of INLINE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(line)) !== null) {
      for (let i = match.index; i < match.index + match[0].length; i += 1) chars[i] = MASK;
    }
  }
  return chars.join('');
}

/**
 * @param {string} text
 * @param {{markdown?: boolean}} [options]
 */
export function parseDocument(text, options = {}) {
  const { markdown = true } = options;
  const raw = splitLines(text);
  const lines = [];
  let fenceChar = null;
  let fenceStart = null;

  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i];
    const lineNo = i + 1;
    const fence = markdown ? FENCE.exec(line.text) : null;

    if (fence) {
      if (fenceChar === null) {
        fenceChar = fence[1][0];
        fenceStart = { lineNo, index: i, char: fenceChar };
        lines.push({ ...line, lineNo, type: 'fence' });
        continue;
      }
      if (fence[1][0] === fenceChar) {
        fenceChar = null;
        fenceStart = null;
        lines.push({ ...line, lineNo, type: 'fence' });
        continue;
      }
    }

    if (fenceChar !== null) {
      lines.push({ ...line, lineNo, type: 'code' });
      continue;
    }

    lines.push({ ...line, lineNo, type: 'text', masked: maskLine(line.text) });
  }

  return {
    text,
    lines,
    unclosedFence: fenceStart
  };
}

export function isCJK(char) {
  if (!char) return false;
  const code = char.codePointAt(0);
  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x3040 && code <= 0x30ff) || // kana, for mixed text
    (code >= 0xac00 && code <= 0xd7a3) // hangul
  );
}

export function isLatin(char) {
  return Boolean(char) && /[A-Za-z0-9]/.test(char);
}

export const FULLWIDTH_PUNCT = '，。！？；：、';

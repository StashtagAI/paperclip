/** Lowercased, accents/punctuation stripped, whitespace collapsed: the key used to spot repeated OCR lines. */
export function lineKey(line: string): string {
  return line
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Splits OCR output into lines and drops repeats, keeping first-seen order. Used for screen-recording frames, where the
 * same overlay ("1 cup rice") shows up in many consecutive frames, and for overlapping screenshots of one caption.
 * A line is a repeat if its key equals an earlier one, or is contained in an earlier, longer line (a frame that caught
 * the overlay half-scrolled).
 */
export function dedupeLines(chunks: readonly string[]): string[] {
  const kept: { line: string; key: string }[] = [];
  for (const raw of chunks.flatMap((c) => c.split(/\r?\n/))) {
    const line = raw.replace(/\s+/g, ' ').trim();
    const key = lineKey(line);
    if (!key) continue;
    const dup = kept.findIndex((k) => k.key === key || k.key.includes(key) || key.includes(k.key));
    if (dup === -1) kept.push({ line, key });
    // Prefer the more complete reading of the same line.
    else if (key.length > kept[dup].key.length) kept[dup] = { line, key };
  }
  return kept.map((k) => k.line);
}

/** Server limit per captured field (process-link clips at 8k chars). */
export const MAX_CAPTURED_CHARS = 8_000;

export function clip(text: string): string {
  return text.length > MAX_CAPTURED_CHARS ? text.slice(0, MAX_CAPTURED_CHARS) : text;
}

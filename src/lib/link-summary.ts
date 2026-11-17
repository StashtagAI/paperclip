// What a not-yet-filed link shows on Home (HAN-32): enough to recognise the post and say why it's waiting.

/** "instagram.com/reel/C1a2B3c4D5e": the URL without scheme, www, query or trailing slash. */
export function shortUrl(url: string): string {
  return url
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

/** The caption's first non-empty line, cut to `max` characters; null when there's no caption. */
export function captionSnippet(caption: string | null | undefined, max = 80): string | null {
  const line = caption
    ?.split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** process-link's link-first fetch reasons (raw_content.fetch.reason), short enough for a row subtitle. */
const REASONS: Record<string, string> = {
  not_available: 'Couldn’t open it, it may be private',
  empty_caption: 'No caption to read',
  no_items: 'The caption names no places or recipes',
  timeout: 'Reading it took too long',
};

export function needsTextReason(reason: string | null | undefined): string {
  return (reason && REASONS[reason]) || 'Couldn’t read it';
}

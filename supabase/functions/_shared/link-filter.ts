/**
 * Link filter: only Instagram posts/reels and TikTok videos get in.
 *
 * Security requirement (HAN-9): the host is compared *exactly* against an
 * allowlist after real URL parsing, never by substring, so
 * `instagram.com.evil.com` and `evil.com/?u=instagram.com` are rejected.
 *
 * One module for both sides (HAN-19): the app imports it via
 * `src/lib/link-filter.ts` for fast, clear feedback, and process-link
 * re-validates the stored URL with the same host *and* path rules. Keep it
 * free of imports so it runs unchanged under Metro, Jest, Node and Deno.
 */

export type Platform = 'instagram' | 'tiktok';

export const ALLOWED_HOSTS: Readonly<Record<string, Platform>> = {
  'instagram.com': 'instagram',
  'www.instagram.com': 'instagram',
  'tiktok.com': 'tiktok',
  'www.tiktok.com': 'tiktok',
  'm.tiktok.com': 'tiktok',
  'vm.tiktok.com': 'tiktok',
};

// Path shapes per platform. Anchored, so nothing can be smuggled before/after.
const ID = '[A-Za-z0-9_-]+';
const INSTAGRAM_PATHS = [
  new RegExp(`^/(?:p|reel|reels|tv)/${ID}/?$`), // /p/ABC, /reel/ABC
  new RegExp(`^/${'[A-Za-z0-9._]+'}/(?:p|reel)/${ID}/?$`), // /username/p/ABC
  new RegExp(`^/share/(?:p/|reel/)?${ID}/?$`), // iOS share-sheet links
];
const TIKTOK_PATHS = [
  new RegExp(`^/@[A-Za-z0-9._-]+/(?:video|photo)/\\d+/?$`), // /@user/video/123
  new RegExp(`^/(?:t|v)/${ID}(?:\\.html)?/?$`), // /t/ZTabc short links
];
const TIKTOK_SHORT_PATH = new RegExp(`^/${ID}/?$`); // vm.tiktok.com/ZMabc

export type LinkCheck =
  | { ok: true; url: string; platform: Platform }
  | { ok: false; reason: LinkRejection; message: string };

export type LinkRejection = 'empty' | 'invalid_url' | 'not_https' | 'host_not_allowed' | 'not_a_post';

const MESSAGES: Record<LinkRejection, string> = {
  empty: 'Paste an Instagram or TikTok link.',
  invalid_url: "That doesn't look like a link.",
  not_https: 'Only secure (https) Instagram or TikTok links are supported.',
  host_not_allowed: 'Only Instagram and TikTok links are supported.',
  not_a_post: 'That link isn’t a post, reel or video. Open the post and use Share › Copy link.',
};

const reject = (reason: LinkRejection): LinkCheck => ({ ok: false, reason, message: MESSAGES[reason] });

/**
 * Validate user input (a pasted URL, or share-sheet text containing one) and
 * return a normalised URL (https, lower-case host, no query/fragment).
 */
export function checkLink(input: string): LinkCheck {
  const text = input.trim();
  if (!text) return reject('empty');

  // Share sheets often send "Look at this! https://…"; take the first whole
  // whitespace-delimited URL token (never one embedded inside another URL).
  const token = text.match(/(?:^|\s)([a-z][a-z0-9+.-]*:\/\/\S+)/i)?.[1] ?? text.split(/\s+/)[0];
  return checkUrl(/^[a-z][a-z0-9+.-]*:/i.test(token) ? token : `https://${token}`);
}

/**
 * Validate one absolute URL string (no share-text extraction, no scheme
 * guessing). process-link uses this on the stored `links.url`.
 */
export function checkUrl(candidate: string): LinkCheck {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return reject('invalid_url');
  }

  if (url.protocol !== 'https:') return reject('not_https');
  if (url.username || url.password || url.port) return reject('host_not_allowed');

  const host = url.hostname.toLowerCase();
  const platform = Object.prototype.hasOwnProperty.call(ALLOWED_HOSTS, host) ? ALLOWED_HOSTS[host] : undefined;
  if (!platform) return reject('host_not_allowed');

  const path = url.pathname;
  const pathOk =
    platform === 'instagram'
      ? INSTAGRAM_PATHS.some((re) => re.test(path))
      : host === 'vm.tiktok.com'
        ? TIKTOK_SHORT_PATH.test(path)
        : TIKTOK_PATHS.some((re) => re.test(path));
  if (!pathOk) return reject('not_a_post');

  // Drop tracking query (igsh, _r, …) and fragments so the same post dedupes.
  return { ok: true, url: `https://${host}${path}`, platform };
}

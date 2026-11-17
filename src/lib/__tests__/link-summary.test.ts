import { captionSnippet, needsTextReason, shortUrl } from '../link-summary';

describe('shortUrl', () => {
  it.each([
    ['https://www.instagram.com/reel/C1a2B3c4D5e/', 'instagram.com/reel/C1a2B3c4D5e'],
    ['https://instagram.com/p/ABC123?igsh=xyz', 'instagram.com/p/ABC123'],
    ['https://www.tiktok.com/@denverfoodie/video/7300000000000000000', 'tiktok.com/@denverfoodie/video/7300000000000000000'],
    ['https://vm.tiktok.com/ZMabc123/', 'vm.tiktok.com/ZMabc123'],
  ])('%s', (url, expected) => {
    expect(shortUrl(url)).toBe(expected);
  });
});

describe('captionSnippet', () => {
  it('returns null without a caption', () => {
    expect(captionSnippet(null)).toBeNull();
    expect(captionSnippet(undefined)).toBeNull();
    expect(captionSnippet('  \n \n')).toBeNull();
  });

  it('takes the first non-empty line', () => {
    expect(captionSnippet('\n  Best tacos in Denver 🌮  \nmore text')).toBe('Best tacos in Denver 🌮');
  });

  it('cuts long lines with an ellipsis', () => {
    const out = captionSnippet('a'.repeat(200), 20)!;
    expect(out).toHaveLength(20);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('needsTextReason', () => {
  it('maps known reasons and falls back for the rest', () => {
    expect(needsTextReason('not_available')).toMatch(/private/);
    expect(needsTextReason('apify_500')).toBe('Couldn’t read it');
    expect(needsTextReason(null)).toBe('Couldn’t read it');
  });
});

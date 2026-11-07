import { checkLink } from '../link-filter';

describe('checkLink: accepts Instagram and TikTok posts', () => {
  it.each([
    ['https://www.instagram.com/p/C1a2B3c4D5e/', 'instagram', 'https://www.instagram.com/p/C1a2B3c4D5e/'],
    ['https://instagram.com/reel/C1a2B3c4D5e', 'instagram', 'https://instagram.com/reel/C1a2B3c4D5e'],
    ['https://www.instagram.com/reels/C1a2B3c4D5e/', 'instagram', 'https://www.instagram.com/reels/C1a2B3c4D5e/'],
    ['https://www.instagram.com/tv/C1a2B3c4D5e/', 'instagram', 'https://www.instagram.com/tv/C1a2B3c4D5e/'],
    ['https://www.instagram.com/denver.eats/p/C1a2B3c4D5e/', 'instagram', 'https://www.instagram.com/denver.eats/p/C1a2B3c4D5e/'],
    ['https://www.instagram.com/share/reel/BAxyz123', 'instagram', 'https://www.instagram.com/share/reel/BAxyz123'],
    ['https://www.tiktok.com/@denverfoodie/video/7300000000000000000', 'tiktok', 'https://www.tiktok.com/@denverfoodie/video/7300000000000000000'],
    ['https://www.tiktok.com/@user.name/photo/7300000000000000000', 'tiktok', 'https://www.tiktok.com/@user.name/photo/7300000000000000000'],
    ['https://m.tiktok.com/v/7300000000000000000.html', 'tiktok', 'https://m.tiktok.com/v/7300000000000000000.html'],
    ['https://tiktok.com/t/ZTRabc123/', 'tiktok', 'https://tiktok.com/t/ZTRabc123/'],
    ['https://vm.tiktok.com/ZMabc123/', 'tiktok', 'https://vm.tiktok.com/ZMabc123/'],
  ])('%s', (input, platform, url) => {
    expect(checkLink(input)).toEqual({ ok: true, platform, url });
  });

  it('adds https:// when the scheme is missing', () => {
    expect(checkLink('instagram.com/p/ABC123')).toMatchObject({ ok: true, url: 'https://instagram.com/p/ABC123' });
    expect(checkLink('vm.tiktok.com/ZMabc123')).toMatchObject({ ok: true, platform: 'tiktok' });
  });

  it('normalises host case and strips tracking query and fragment', () => {
    expect(checkLink('  HTTPS://WWW.Instagram.COM/reel/ABC123/?igsh=xyz&utm_source=ig#top  ')).toEqual({
      ok: true,
      platform: 'instagram',
      url: 'https://www.instagram.com/reel/ABC123/',
    });
    expect(checkLink('https://vm.tiktok.com/ZMabc123/?_r=1')).toMatchObject({ url: 'https://vm.tiktok.com/ZMabc123/' });
  });

  it('pulls the link out of share-sheet text', () => {
    expect(checkLink('Check out this reel! https://www.instagram.com/reel/ABC123/?igsh=1 so good')).toMatchObject({
      ok: true,
      url: 'https://www.instagram.com/reel/ABC123/',
    });
  });
});

describe('checkLink: rejects everything else', () => {
  const rejects = (input: string, reason: string) => expect(checkLink(input)).toMatchObject({ ok: false, reason });

  it('rejects empty input', () => {
    rejects('', 'empty');
    rejects('   ', 'empty');
  });

  it('rejects lookalike and embedding hosts (no substring matching)', () => {
    rejects('https://instagram.com.evil.com/p/ABC123', 'host_not_allowed');
    rejects('instagram.com.evil.com/p/ABC123', 'host_not_allowed');
    rejects('https://evil.com/?u=instagram.com', 'host_not_allowed');
    rejects('evil.com/?u=instagram.com', 'host_not_allowed');
    rejects('https://evil.com/?u=https://www.instagram.com/p/ABC123', 'host_not_allowed');
    rejects('https://evil.com/https://www.instagram.com/p/ABC123', 'host_not_allowed');
    rejects('https://evilinstagram.com/p/ABC123', 'host_not_allowed');
    rejects('https://notinstagram.com/p/ABC123', 'host_not_allowed');
    rejects('https://instagram.co/p/ABC123', 'host_not_allowed');
    rejects('https://www.tiktok.com.attacker.net/@a/video/1', 'host_not_allowed');
    rejects('https://evil.com#https://www.tiktok.com/@a/video/1', 'host_not_allowed');
    rejects('https://instagram.com./p/ABC123', 'host_not_allowed');
    rejects('https://xn--nstagram-6za.com/p/ABC123', 'host_not_allowed');
  });

  it('rejects other subdomains of allowed sites', () => {
    rejects('https://api.instagram.com/p/ABC123', 'host_not_allowed');
    rejects('https://l.instagram.com/?u=https%3A%2F%2Fevil.com', 'host_not_allowed');
    rejects('https://vt.tiktok.com/ZSabc/', 'host_not_allowed');
    rejects('https://evil.vm.tiktok.com/ZMabc123/', 'host_not_allowed');
  });

  it('rejects credentials and ports that hide the real host', () => {
    rejects('https://instagram.com@evil.com/p/ABC123', 'host_not_allowed');
    rejects('https://user:pass@www.instagram.com/p/ABC123', 'host_not_allowed');
    rejects('https://www.instagram.com:8443/p/ABC123', 'host_not_allowed');
  });

  it('rejects non-https schemes', () => {
    rejects('http://www.instagram.com/p/ABC123', 'not_https');
    rejects('javascript:alert(1)//www.instagram.com/p/ABC123', 'not_https');
    rejects('file:///etc/passwd', 'not_https');
    rejects('ftp://www.instagram.com/p/ABC123', 'not_https');
  });

  it('rejects allowed hosts that are not a post', () => {
    rejects('https://www.instagram.com/', 'not_a_post');
    rejects('https://www.instagram.com/denver.eats/', 'not_a_post');
    rejects('https://www.instagram.com/accounts/login/?next=/p/ABC123/', 'not_a_post');
    rejects('https://www.instagram.com/p/ABC123/../../accounts', 'not_a_post');
    rejects('https://www.tiktok.com/@denverfoodie', 'not_a_post');
    rejects('https://www.tiktok.com/foryou', 'not_a_post');
    rejects('https://vm.tiktok.com/', 'not_a_post');
  });

  it('rejects unrelated sites and junk', () => {
    rejects('https://www.youtube.com/watch?v=abc', 'host_not_allowed');
    rejects('https://maps.google.com/?q=instagram.com/p/ABC', 'host_not_allowed');
    rejects('not a url at all', 'host_not_allowed');
    rejects('https://', 'invalid_url');
  });

  it('gives a human message on rejection', () => {
    const r = checkLink('https://instagram.com.evil.com/p/ABC123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Only Instagram and TikTok links are supported.');
  });
});

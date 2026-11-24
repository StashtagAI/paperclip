import {
  allowanceLine,
  annualSavingsPercent,
  clockLength,
  premiumUntil,
  resetDate,
  spokenLength,
  stashesLeft,
  videoTooLong,
  type Plan,
} from '@/lib/plan';

// plan.ts also talks to the server; these tests cover only its pure helpers (jest hoists this mock).
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const free: Plan = {
  plan: 'free',
  source: null,
  expires_at: null,
  stashes_used: 4,
  stash_limit: 15,
  free_stash_limit: 15,
  resets_at: '2026-12-01T00:00:00Z',
  shared_lists: 1,
  shared_list_limit: 5,
  free_shared_list_limit: 5,
  custom_organization: false,
};
const premium: Plan = { ...free, plan: 'premium', source: 'revenuecat', expires_at: '2027-11-24T12:00:00Z', stash_limit: 300 };

describe('annualSavingsPercent', () => {
  it('compares a year with twelve months', () => {
    expect(annualSavingsPercent(4.99, 34.99)).toBe(41);
    expect(annualSavingsPercent(5, 60)).toBe(0);
    expect(annualSavingsPercent(5, 70)).toBe(0);
    expect(annualSavingsPercent(0, 34.99)).toBe(0);
  });
});

describe('resetDate', () => {
  it('shows the UTC date, so it reads as the 1st everywhere', () => {
    expect(resetDate('2026-12-01T00:00:00Z')).toMatch(/Dec\s+1/);
  });
});

describe('allowanceLine', () => {
  it('counts free stashes', () => {
    expect(allowanceLine(free)).toMatch(/^4 of 15 free AI stashes used this month\. Resets Dec\s+1\.$/);
    expect(stashesLeft(free)).toBe(11);
  });

  it('says when they are all used', () => {
    expect(allowanceLine({ ...free, stashes_used: 16 })).toMatch(/^You’ve used all 15 free AI stashes this month\./);
    expect(stashesLeft({ ...free, stashes_used: 16 })).toBe(0);
  });

  it('only mentions the fair-use ceiling near it', () => {
    expect(allowanceLine(premium)).toBe('Unlimited AI stashes.');
    expect(allowanceLine({ ...premium, stashes_used: 250 })).toMatch(/^250 of 300 AI stashes this month \(fair use\)/);
  });
});

describe('premiumUntil', () => {
  it('describes the paid period', () => {
    expect(premiumUntil(free)).toBeNull();
    expect(premiumUntil(premium)).toMatch(/^Paid through .*2027\.$/);
    expect(premiumUntil({ ...premium, source: 'manual', expires_at: null })).toBe('Premium is on for this account.');
  });
});

describe('video length (HAN-126)', () => {
  it('formats lengths for the eye and for VoiceOver', () => {
    expect(clockLength(150)).toBe('2:30');
    expect(clockLength(115.4)).toBe('1:55');
    expect(clockLength(65)).toBe('1:05');
    expect(spokenLength(150)).toBe('2 minutes 30 seconds');
    expect(spokenLength(90)).toBe('1 minute 30 seconds');
    expect(spokenLength(120)).toBe('2 minutes');
    expect(spokenLength(45)).toBe('45 seconds');
  });

  it('only speaks up when the video was skipped for length', () => {
    expect(videoTooLong(undefined)).toBeNull();
    expect(videoTooLong({ video_skip: 'no_key', video_max_sec: 90 })).toBeNull();
  });

  it('free plan, a 1:55 reel: record the screen, and Premium would read it', () => {
    const r = videoTooLong({ video_skip: 'too_long', video_sec: 115, video_max_sec: 90, video_premium_max_sec: 150 })!;
    expect(r.premiumWouldRead).toBe(true);
    expect(r.text).toBe(
      'This video (1:55) is longer than the 1:30 we can read automatically. Record your screen while it plays, then add the recording below. We’ll read it on this phone. Premium reads videos up to 2:30.',
    );
    expect(r.spoken).toContain('(1 minute 55 seconds) is longer than the 1 minute 30 seconds');
  });

  it('no Premium pitch when Premium could not read it either, or the user has Premium', () => {
    expect(videoTooLong({ video_skip: 'too_long', video_sec: 200, video_max_sec: 90, video_premium_max_sec: 150 })!.premiumWouldRead).toBe(false);
    const p = videoTooLong({ video_skip: 'too_long', video_sec: 200, video_max_sec: 150 })!;
    expect(p.premiumWouldRead).toBe(false);
    expect(p.text).not.toContain('Premium');
  });
});

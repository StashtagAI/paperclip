import { allowanceLine, annualSavingsPercent, premiumUntil, resetDate, stashesLeft, type Plan } from '@/lib/plan';

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

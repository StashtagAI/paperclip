import {
  failureLabel,
  formatCompact,
  formatCount,
  formatDay,
  formatSeconds,
  formatShare,
  formatUsd,
  formatUsdPer,
  isNotAdmin,
  NOT_ADMIN,
} from '@/lib/admin';

// Only the pure formatting is under test; the RPCs are covered by supabase/tests/database/admin_portal.test.sql.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('admin formatting (HAN-128)', () => {
  it('shows zero as 0 and missing data as Unavailable, never a guess', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1234)).toBe('1,234');
    expect(formatCount('7')).toBe('7');
    expect(formatCount(undefined)).toBe('Unavailable');
    expect(formatCount(null)).toBe('Unavailable');
    expect(formatUsd(undefined)).toBe('Unavailable');
  });

  it('formats dollars, keeping small amounts visible', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.0042)).toBe('$0.004');
    expect(formatUsd('0.25')).toBe('$0.250');
    expect(formatUsd(12.5)).toBe('$12.50');
    expect(formatUsd(1234.567)).toBe('$1,234.57');
  });

  it('divides safely', () => {
    expect(formatShare(1, 4)).toBe('25%');
    expect(formatShare(0, 0)).toBe('None yet');
    expect(formatUsdPer(1.5, 3)).toBe('$0.500');
    expect(formatUsdPer(0, 0)).toBe('None yet');
  });

  it('formats durations, token counts and days', () => {
    expect(formatSeconds(null)).toBe('None yet');
    expect(formatSeconds(42)).toBe('42 s');
    expect(formatSeconds(125)).toBe('2 min 5 s');
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(34_200)).toBe('34K');
    expect(formatCompact(1_250_000)).toBe('1.3M');
    expect(formatDay('2026-11-23')).toBe('Mon 23 Nov');
    expect(formatDay('nonsense')).toBe('nonsense');
  });

  it('shows failure codes raw, except a missing one', () => {
    expect(failureLabel('no_captured_text')).toBe('no_captured_text');
    expect(failureLabel('unknown')).toBe('No reason recorded');
  });

  it('recognises the not-an-admin error', () => {
    expect(isNotAdmin(Object.assign(new Error('admins only'), { code: NOT_ADMIN }))).toBe(true);
    expect(isNotAdmin(new Error('offline'))).toBe(false);
    expect(isNotAdmin(undefined)).toBe(false);
  });
});

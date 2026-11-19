import { LOCK_AFTER_MS, shouldLockOnReturn } from '@/lib/app-lock';

// Hoisted above the import by jest; only the pure timing rule is under test.
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ session: null, loading: false }) }));

describe('shouldLockOnReturn', () => {
  it('locks after the app was in the background for the grace period or longer', () => {
    expect(shouldLockOnReturn(1_000, 1_000 + LOCK_AFTER_MS)).toBe(true);
    expect(shouldLockOnReturn(1_000, 1_000 + LOCK_AFTER_MS * 10)).toBe(true);
  });

  it('stays unlocked after a quick trip away, e.g. to copy a link from Instagram', () => {
    expect(shouldLockOnReturn(1_000, 1_000 + LOCK_AFTER_MS - 1)).toBe(false);
  });

  it('stays unlocked when the app never went to the background (iOS "inactive" for the Face ID sheet)', () => {
    expect(shouldLockOnReturn(null, Date.now())).toBe(false);
  });
});

import type { SharedWithMe } from '../data';
import {
  markSeen,
  newSharePrompt,
  refreshSharedWithMe,
  resetSharedWithMe,
  sharedWithMeSnapshot,
  unseen,
} from '../shared-with-me';

const mockFetch = jest.fn();
const mockMark = jest.fn();
jest.mock('../data', () => ({
  fetchSharedWithMe: () => mockFetch(),
  markSharesSeen: (tokens: string[]) => mockMark(tokens),
}));

const row = (token: string, seen_at: string | null = null, shared_by: string | null = 'Matt'): SharedWithMe => ({
  token,
  list_id: `list-${token}`,
  kind: 'eats',
  category: 'Restaurants',
  list: 'Denver',
  shared_by,
  item_count: 3,
  shared_at: '2026-11-17T20:00:00Z',
  seen_at,
});

beforeEach(() => {
  resetSharedWithMe();
  mockFetch.mockReset();
  mockMark.mockReset();
});

describe('newSharePrompt', () => {
  it('is null with nothing new', () => {
    expect(newSharePrompt([])).toBeNull();
  });

  it('names the sharer and the list for one share, and opens it', () => {
    expect(newSharePrompt([row('a')])).toEqual({ message: 'Matt shared Restaurants › Denver with you', token: 'a' });
  });

  it('says "A friend" when the owner has no name', () => {
    expect(newSharePrompt([row('a', null, null)])?.message).toBe('A friend shared Restaurants › Denver with you');
  });

  it('counts several shares and opens the Shared with me screen', () => {
    expect(newSharePrompt([row('a'), row('b'), row('c')])).toEqual({ message: '3 lists were shared with you', token: null });
  });
});

describe('store', () => {
  it('marks shares seen in the database and locally', async () => {
    mockFetch.mockResolvedValue([row('a'), row('b'), row('c', '2026-11-16T00:00:00Z')]);
    const rows = await refreshSharedWithMe();
    expect(unseen(rows).map((s) => s.token)).toEqual(['a', 'b']);

    mockMark.mockResolvedValue(undefined);
    await markSeen(['a']);
    expect(mockMark).toHaveBeenCalledWith(['a']);
    // The local copy changed without a refetch.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(unseen(sharedWithMeSnapshot().data).map((s) => s.token)).toEqual(['b']);
  });

  it('keeps shares new when marking fails', async () => {
    mockFetch.mockResolvedValue([row('a')]);
    await refreshSharedWithMe();
    mockMark.mockRejectedValue(new Error('offline'));
    await expect(markSeen(['a'])).rejects.toThrow('offline');
    expect(unseen(sharedWithMeSnapshot().data)).toHaveLength(1);
  });

  it('drops a fetch that finishes after sign-out', async () => {
    let resolve!: (rows: SharedWithMe[]) => void;
    mockFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    const pending = refreshSharedWithMe();
    resetSharedWithMe();
    resolve([row('a')]);
    expect(await pending).toBeUndefined();
  });
});

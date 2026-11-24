import { moveSummary } from '@/lib/move-summary';

describe('moveSummary', () => {
  it('names where the items went', () => {
    expect(moveSummary('Restaurants › Denver', { moved: 1, merged: 0, skipped: 0 })).toBe('Moved to Restaurants › Denver.');
  });

  it('says what was combined or left behind', () => {
    expect(moveSummary('Restaurants › Denver', { moved: 3, merged: 1, skipped: 2 })).toBe(
      'Moved to Restaurants › Denver. 1 was already there, so the two copies were combined. ' +
        '2 have photos on both copies, so they stayed where they were.',
    );
    expect(moveSummary('Beauty › Fragrances', { moved: 0, merged: 2, skipped: 1 })).toBe(
      'Moved to Beauty › Fragrances. 2 were already there, so the copies were combined. ' +
        '1 has photos on both copies, so it stayed where it was.',
    );
  });
});

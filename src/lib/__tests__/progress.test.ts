import { doneAnnouncement, progressText } from '@/lib/progress';

describe('progressText', () => {
  it('counts with the kind verb', () => {
    expect(progressText('eats', 3, 8)).toBe('3 of 8 tried');
    expect(progressText('trips', 1, 2)).toBe('1 of 2 visited');
    expect(progressText('recipes', 2, 5)).toBe('2 of 5 cooked');
    expect(progressText('do', 4, 9)).toBe('4 of 9 done');
  });

  it('says none and all in words', () => {
    expect(progressText('eats', 0, 8)).toBe('None tried yet');
    expect(progressText('recipes', 8, 8)).toBe('All 8 cooked');
    expect(progressText('trips', 1, 1)).toBe('All visited');
  });
});

describe('doneAnnouncement', () => {
  it('names the item and the new progress', () => {
    expect(doneAnnouncement('eats', 'Odd Fellows', true, 3, 8)).toBe('Marked Odd Fellows tried. 3 of 8 tried.');
    expect(doneAnnouncement('recipes', 'Dal', false, 0, 4)).toBe('Dal no longer marked cooked. None cooked yet.');
  });
});

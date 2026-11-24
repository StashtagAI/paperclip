import { seenKey, shouldAutoShow, stepLabel, TUTORIAL_STEPS } from '../tutorial';

jest.mock('@react-native-async-storage/async-storage', () => ({}));

describe('shouldAutoShow', () => {
  it('opens for a new account with an empty stash', () => {
    expect(shouldAutoShow({ seen: false, stashEmpty: true })).toBe(true);
  });

  it('stays closed once seen, or when there are stashes already', () => {
    expect(shouldAutoShow({ seen: true, stashEmpty: true })).toBe(false);
    expect(shouldAutoShow({ seen: false, stashEmpty: false })).toBe(false);
  });
});

describe('tutorial steps', () => {
  it('spells out progress for screen readers', () => {
    expect(stepLabel(0)).toBe(`Step 1 of ${TUTORIAL_STEPS.length}`);
  });

  it('names every kind the app sorts into', () => {
    expect(TUTORIAL_STEPS[2].body).toContain('Eats, Travel, Recipes, Do, Shop or Watch & read');
  });

  it('keys "seen" per account', () => {
    expect(seenKey('a')).not.toBe(seenKey('b'));
  });
});

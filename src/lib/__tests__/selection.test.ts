import { actionTargets, clickSelect, toggleOne } from '@/lib/selection';

const order = ['a', 'b', 'c', 'd', 'e'];
const plain = { toggle: false, range: false };

describe('clickSelect', () => {
  it('replaces the selection on a plain click', () => {
    expect([...clickSelect(new Set(['a', 'b']), order, 'a', 'c', plain)]).toEqual(['c']);
  });

  it('toggles one row with Cmd/Ctrl', () => {
    const mod = { toggle: true, range: false };
    expect([...clickSelect(new Set(['a']), order, 'a', 'c', mod)].sort()).toEqual(['a', 'c']);
    expect([...clickSelect(new Set(['a', 'c']), order, 'a', 'c', mod)]).toEqual(['a']);
  });

  it('adds a range from the anchor with Shift, in either direction', () => {
    const mod = { toggle: false, range: true };
    expect([...clickSelect(new Set(['b']), order, 'b', 'd', mod)].sort()).toEqual(['b', 'c', 'd']);
    expect([...clickSelect(new Set(), order, 'd', 'b', mod)].sort()).toEqual(['b', 'c', 'd']);
    expect([...clickSelect(new Set(['e']), order, 'a', 'b', mod)].sort()).toEqual(['a', 'b', 'e']);
  });

  it('falls back to a plain click when the anchor is gone', () => {
    expect([...clickSelect(new Set(), order, 'z', 'b', { toggle: false, range: true })]).toEqual(['b']);
    expect([...clickSelect(new Set(), order, null, 'b', { toggle: false, range: true })]).toEqual(['b']);
  });
});

describe('toggleOne', () => {
  it('does not mutate its input', () => {
    const selected = new Set(['a']);
    toggleOne(selected, 'b');
    expect([...selected]).toEqual(['a']);
  });
});

describe('actionTargets', () => {
  it('uses the selection when the row is part of it', () => {
    expect(actionTargets(new Set(['a', 'b']), 'b').sort()).toEqual(['a', 'b']);
  });

  it('uses just the row when it is outside the selection', () => {
    expect(actionTargets(new Set(['a', 'b']), 'c')).toEqual(['c']);
  });

  it('uses the selection when there is no row', () => {
    expect(actionTargets(new Set(['a']), null)).toEqual(['a']);
    expect(actionTargets(new Set(), null)).toEqual([]);
  });
});

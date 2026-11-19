import { kindChoice } from '@/lib/kind-choice';

describe('kindChoice', () => {
  it('offers the filed kind and the runner-up', () => {
    expect(kindChoice({ alt_kind: 'shop' }, 'travel')).toEqual({ current: 'travel', alt: 'shop' });
  });

  it('asks nothing without a runner-up, after it was answered, or without items', () => {
    expect(kindChoice({}, 'travel')).toBeNull();
    expect(kindChoice(null, 'travel')).toBeNull();
    expect(kindChoice({ alt_kind: 'shop' }, undefined)).toBeNull();
  });

  it('ignores a runner-up equal to the filed kind or unknown to this app', () => {
    expect(kindChoice({ alt_kind: 'travel' }, 'travel')).toBeNull();
    expect(kindChoice({ alt_kind: 'trips' }, 'eats')).toBeNull();
  });
});

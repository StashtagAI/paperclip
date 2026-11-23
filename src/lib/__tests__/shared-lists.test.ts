import type { KindCategory, SharedWithMe } from '../data';
import { withSharedLists } from '../shared-lists';

const share = (list: string, category: string, extra: Partial<SharedWithMe> = {}): SharedWithMe => ({
  token: `t-${list}`,
  list_id: `l-${list}`,
  kind: 'recipes',
  category,
  list,
  shared_by: 'Sam',
  item_count: 2,
  shared_at: '2026-11-23T10:00:00Z',
  seen_at: null,
  ...extra,
});

const own: KindCategory[] = [
  {
    id: 'c-dinners',
    kind: 'recipes',
    name: 'Dinners',
    lists: [{ id: 'mine', category_id: 'c-dinners', name: 'Pasta night', tags: [], itemCount: 3, doneCount: 1 }],
  },
];

describe('withSharedLists', () => {
  it('returns the categories unchanged when nothing of this kind is shared', () => {
    expect(withSharedLists(own, [share('Tacos', 'Restaurants', { kind: 'eats' })], 'recipes')).toBe(own);
  });

  it('files a shared list under the user’s category of the same name, any case, A–Z', () => {
    const [dinners] = withSharedLists(own, [share('Easy weeknight', 'dinners')], 'recipes');
    expect(dinners.id).toBe('c-dinners');
    expect(dinners.sharedOnly).toBeUndefined();
    expect(dinners.lists.map((l) => [l.name, l.sharedBy])).toEqual([
      ['Easy weeknight', 'Sam'],
      ['Pasta night', undefined],
    ]);
    expect(dinners.lists[0]).toMatchObject({ id: 'l-Easy weeknight', category_id: 'c-dinners', itemCount: 2 });
    // The input isn't changed.
    expect(own[0].lists).toHaveLength(1);
  });

  it('makes a shared-only category when the user has none of that name', () => {
    const result = withSharedLists(own, [share('Cakes', 'Baking', { shared_by: null }), share('Pies', 'baking')], 'recipes');
    expect(result.map((c) => [c.name, c.sharedOnly ?? false])).toEqual([
      ['Baking', true],
      ['Dinners', false],
    ]);
    expect(result[0].lists.map((l) => [l.name, l.sharedBy])).toEqual([
      ['Cakes', 'A friend'],
      ['Pies', 'Sam'],
    ]);
  });
});

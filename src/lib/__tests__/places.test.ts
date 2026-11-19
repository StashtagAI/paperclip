import type { KindCategory } from '@/lib/data';
import { groupByPlace, placeName } from '@/lib/places';

const list = (id: string, name: string, itemCount = 1) => ({
  id,
  category_id: 'c',
  name,
  doneCount: 0,
  tags: [],
  itemCount,
});

describe('placeName', () => {
  it('drops a trailing US state, abbreviated or spelled out', () => {
    expect(placeName('Winter Park, CO')).toBe('Winter Park');
    expect(placeName('Winter Park, Colorado')).toBe('Winter Park');
    expect(placeName('Washington, D.C.')).toBe('Washington');
    expect(placeName('Austin, TX, USA')).toBe('Austin');
  });

  it('keeps names that are not city, state', () => {
    expect(placeName('Scottsdale')).toBe('Scottsdale');
    expect(placeName('Paris, France')).toBe('Paris, France');
    expect(placeName('  Date  night ')).toBe('Date night');
    expect(placeName('Colorado')).toBe('Colorado');
  });
});

describe('groupByPlace', () => {
  it('pivots categories > lists into places > lists, merging state spellings', () => {
    const categories = [
      {
        id: '1',
        kind: 'eats',
        name: 'Coffee shops',
        lists: [list('a', 'Winter Park, CO')],
      },
      {
        id: '2',
        kind: 'eats',
        name: 'Bakeries',
        lists: [list('b', 'Winter Park, Colorado')],
      },
      {
        id: '3',
        kind: 'eats',
        name: 'Bars',
        lists: [list('c', 'Scottsdale'), list('d', 'winter park')],
      },
    ] as KindCategory[];
    const groups = groupByPlace(categories);
    expect(groups.map((g) => g.name)).toEqual(['Scottsdale', 'Winter Park']);
    expect(groups[1].lists.map((l) => [l.categoryName, l.id])).toEqual([
      ['Bakeries', 'b'],
      ['Bars', 'd'],
      ['Coffee shops', 'a'],
    ]);
  });

  it('returns nothing for no categories', () => {
    expect(groupByPlace([])).toEqual([]);
  });
});

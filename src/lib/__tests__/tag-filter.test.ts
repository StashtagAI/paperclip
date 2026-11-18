import { filterByTag, itemTags, normalizeTag, tagCounts } from '@/lib/tag-filter';

const sushi = { id: 'a', tags: [], link: { tags: ['sushi', 'omakase'] } };
const ramen = { id: 'b', tags: ['#Ramen'], link: { tags: ['noodles'] } };
const bare = { id: 'c', tags: [], link: null };

describe('normalizeTag', () => {
  it('drops the # and lower-cases', () => {
    expect(normalizeTag(' ##Sushi ')).toBe('sushi');
  });
});

describe('itemTags', () => {
  it('combines the item’s own tags with its source post’s', () => {
    expect([...itemTags(ramen)].sort()).toEqual(['noodles', 'ramen']);
    expect(itemTags(bare).size).toBe(0);
  });
});

describe('filterByTag', () => {
  const items = [sushi, ramen, bare];

  it('returns everything when no tag is picked', () => {
    expect(filterByTag(items, null)).toBe(items);
  });

  it('keeps items whose post or own tags match, ignoring # and case', () => {
    expect(filterByTag(items, '#SUSHI').map((i) => i.id)).toEqual(['a']);
    expect(filterByTag(items, 'ramen').map((i) => i.id)).toEqual(['b']);
    expect(filterByTag(items, 'tacos')).toEqual([]);
  });
});

describe('tagCounts', () => {
  it('counts matches, drops tags nothing carries, collapses duplicates and puts the most-shared first', () => {
    expect(tagCounts(['noodles', 'omakase', '#tacos', 'sushi', 'Sushi'], [sushi, ramen, bare, sushi])).toEqual([
      { tag: 'omakase', count: 2 },
      { tag: 'sushi', count: 2 },
      { tag: 'noodles', count: 1 },
    ]);
  });
});

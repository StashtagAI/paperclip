import { addableSections, addedMessage, itemNoun } from '../add-items';
import type { AddCandidate } from '../data';

const item = (id: string, name: string, list: string, category = 'Dinners', description = ''): AddCandidate => ({
  id,
  name,
  description,
  list: { id: `l-${list}`, name: list, category: { name: category } },
});

const candidates = [
  item('1', 'Tacos', 'Mine'),
  item('2', 'pasta', 'Mine'),
  item('3', 'Curry', 'Mine', 'Dinners', 'Coconut and lime'),
  item('4', 'Banana bread', 'Cakes', 'Baking'),
];

describe('addableSections', () => {
  it('groups by category › list, A–Z, and leaves out names the list has in any case', () => {
    expect(addableSections(candidates, ['Pasta'], '').map((s) => [s.title, s.items.map((i) => i.name)])).toEqual([
      ['Baking › Cakes', ['Banana bread']],
      ['Dinners › Mine', ['Curry', 'Tacos']],
    ]);
  });

  it('filters by name or description', () => {
    expect(addableSections(candidates, [], ' LIME ').flatMap((s) => s.items.map((i) => i.id))).toEqual(['3']);
    expect(addableSections(candidates, [], 'zzz')).toEqual([]);
  });
});

describe('addedMessage', () => {
  it('says what was added and what was already there', () => {
    expect(addedMessage({ added: 2, skipped: 0 }, 'Weeknight', 'recipes')).toBe('Added 2 recipes to Weeknight.');
    expect(addedMessage({ added: 1, skipped: 1 }, 'Denver', 'eats')).toBe('Added 1 place to Denver. 1 was already in it.');
    expect(addedMessage({ added: 0, skipped: 2 }, 'Weeknight', 'do')).toBe(
      'Nothing new was added to Weeknight. 2 were already in it.',
    );
  });
});

describe('itemNoun', () => {
  it('names what a kind holds', () => {
    expect([itemNoun('travel', 1), itemNoun('recipes', 2), itemNoun('do', 2)]).toEqual(['place', 'recipes', 'items']);
  });
});

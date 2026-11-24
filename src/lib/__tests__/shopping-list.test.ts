import { buildShoppingList, formatAmount, ingredientKey, parseIngredient, shoppingListText } from '@/lib/shopping-list';

describe('parseIngredient', () => {
  it.each([
    ['1 lb (454 g) lean ground beef', { amount: 1, unit: 'lb', name: 'lean ground beef' }],
    ['¼ cup chopped onion', { amount: 0.25, unit: 'cup', name: 'chopped onion' }],
    ['1½ cups flour, sifted', { amount: 1.5, unit: 'cup', name: 'flour' }],
    ['1 1/2 tablespoons olive oil', { amount: 1.5, unit: 'tbsp', name: 'olive oil' }],
    ['2 garlic cloves, minced', { amount: 2, unit: 'clove', name: 'garlic' }],
    ['3 cloves of garlic', { amount: 3, unit: 'clove', name: 'garlic' }],
    ['¾ teaspoon kosher salt', { amount: 0.75, unit: 'tsp', name: 'kosher salt' }],
    ['1 large egg', { amount: 1, unit: '', name: 'large egg' }],
    ['2-3 limes', { amount: 2, unit: '', name: 'limes' }],
    ['Shredded mozzarella cheese', { amount: null, unit: '', name: 'Shredded mozzarella cheese' }],
    ['Grated parmesan (for topping)', { amount: null, unit: '', name: 'Grated parmesan' }],
  ])('%s', (line, expected) => {
    expect(parseIngredient(line)).toEqual(expected);
  });

  it('does not read a word starting with a unit letter as the unit', () => {
    expect(parseIngredient('2 green onions')).toEqual({ amount: 2, unit: '', name: 'green onions' });
    expect(parseIngredient('1 lemon')).toEqual({ amount: 1, unit: '', name: 'lemon' });
  });
});

describe('ingredientKey', () => {
  it('ignores case, punctuation and a plural last word', () => {
    expect(ingredientKey('Garlic Cloves')).toBe(ingredientKey('garlic clove'));
    expect(ingredientKey('cherries')).toBe('cherry');
    expect(ingredientKey('tomatoes')).toBe('tomato');
    expect(ingredientKey('grass')).toBe('grass');
    expect(ingredientKey('Grated Parmesan')).toBe('parmesan');
  });

  it('ignores how it is prepared and its size', () => {
    expect(ingredientKey('melted butter')).toBe('butter');
    expect(ingredientKey('Chopped fresh parsley')).toBe(ingredientKey('chopped parsley'));
    expect(ingredientKey('large egg')).toBe('egg');
    expect(ingredientKey('ground beef')).toBe('ground beef');
    expect(ingredientKey('Chopped')).toBe('chopped');
  });
});

describe('formatAmount', () => {
  it.each([
    [1, '1'],
    [1.5, '1½'],
    [1 / 3, '⅓'],
    [2.75, '2¾'],
    [2.4, '2.4'],
  ])('%d', (n, text) => expect(formatAmount(n)).toBe(text));
});

describe('buildShoppingList', () => {
  // Lines copied from two recipes in the beta stash.
  const bombs = {
    name: 'Cheeseburger Bombs',
    ingredients: ['1 lb (454 g) lean ground beef', '2 garlic cloves, minced', '½ tsp salt', '¼ cup grated Parmesan (for butter)', '2 garlic cloves, minced (for butter)'],
  };
  const subs = {
    name: 'Meatball Sub Bites',
    ingredients: ['1 lb 80/20 ground beef', '2 garlic cloves (grated)', '½ teaspoon black pepper', 'Grated parmesan (for topping)', '2 tablespoons melted butter'],
  };

  it('adds up the same ingredient across recipes and says which recipes need it', () => {
    const list = buildShoppingList([bombs, subs]);
    const garlic = list.find((l) => l.key === 'garlic');
    expect(garlic).toEqual({
      key: 'garlic',
      text: '6 cloves garlic',
      recipes: ['Cheeseburger Bombs', 'Meatball Sub Bites'],
      name: 'garlic',
      amount: { quantity: 6, unit: 'clove' },
    });
  });

  it('keeps an unquantified mention as "more"', () => {
    const list = buildShoppingList([bombs, subs]);
    expect(list.find((l) => l.key === 'parmesan')?.text).toBe('¼ cup + more grated Parmesan');
  });

  it('lists different units side by side instead of converting', () => {
    const list = buildShoppingList([
      { name: 'A', ingredients: ['½ cup butter'] },
      { name: 'B', ingredients: ['2 tbsp butter', '1 cup butter'] },
    ]);
    // Two units can't be one Instacart amount, so the line goes without one.
    expect(list).toEqual([{ key: 'butter', text: '1½ cups + 2 tbsp butter', recipes: ['A', 'B'], name: 'butter' }]);
  });

  it('names it plainly when one recipe says how to prepare it', () => {
    const list = buildShoppingList([{ name: 'A', ingredients: ['¼ cup butter, melted'] }, { name: 'B', ingredients: ['2 tablespoons melted butter'] }]);
    expect(list.map((l) => l.text)).toEqual(['¼ cup + 2 tbsp butter']);
  });

  it('uses the wording with the biggest amount and keeps first-seen order', () => {
    const list = buildShoppingList([{ name: 'A', ingredients: ['1 egg', 'Salt'] }, { name: 'B', ingredients: ['2 eggs'] }]);
    expect(list.map((l) => l.text)).toEqual(['3 eggs', 'Salt']);
    expect(list.map((l) => [l.name, l.amount])).toEqual([['eggs', { quantity: 3, unit: '' }], ['Salt', undefined]]);
  });

  it('returns nothing for recipes without ingredients', () => {
    expect(buildShoppingList([{ name: 'A', ingredients: [] }, { name: 'B', ingredients: ['  '] }])).toEqual([]);
  });

  it('formats a plain-text copy', () => {
    const list = buildShoppingList([{ name: 'A', ingredients: ['1 egg'] }, { name: 'B', ingredients: ['1 lemon'] }]);
    expect(shoppingListText(list, ['A', 'B'])).toBe('Shopping list for A, B\n\n- 1 egg\n- 1 lemon');
  });
});

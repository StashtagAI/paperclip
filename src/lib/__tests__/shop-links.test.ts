import { instacartErrorMessage, instacartLines, recipeRequest, shoppingListRequest } from '@/lib/shop-links';
import { buildShoppingList } from '@/lib/shopping-list';

describe('Send to Instacart requests', () => {
  it('sends one amount per line, or none when it is a mix of units', () => {
    const lines = buildShoppingList([
      { name: 'A', ingredients: ['2 eggs', '½ cup butter', 'Salt'] },
      { name: 'B', ingredients: ['1 egg', '2 tbsp butter', '3 garlic cloves'] },
    ]);
    expect(instacartLines(lines)).toEqual([
      { name: 'eggs', display_text: '3 eggs', quantity: 3, unit: '' },
      { name: 'butter', display_text: '½ cup + 2 tbsp butter' },
      { name: 'Salt', display_text: 'Salt' },
      { name: 'garlic', display_text: '3 cloves garlic', quantity: 3, unit: 'clove' },
    ]);
  });

  it('makes a recipe page with its steps', () => {
    const r = recipeRequest({ name: 'Shakshuka', ingredients: ['4 eggs', '1 can tomatoes', '2 eggs'], steps: ['Simmer.', 'Crack eggs in.'] });
    expect(r).toEqual({
      title: 'Shakshuka',
      kind: 'recipe',
      lines: [
        { name: 'eggs', display_text: '6 eggs', quantity: 6, unit: '' },
        { name: 'tomatoes', display_text: '1 can tomatoes', quantity: 1, unit: 'can' },
      ],
      instructions: ['Simmer.', 'Crack eggs in.'],
    });
  });

  it('titles a shopping list by its recipes, within the server limit', () => {
    const lines = buildShoppingList([{ name: 'A', ingredients: ['1 lemon'] }]);
    expect(shoppingListRequest(lines, ['Tacos', 'Soup']).title).toBe('Shopping list for Tacos, Soup');
    expect(shoppingListRequest(lines, ['x'.repeat(300)]).title).toHaveLength(200);
    expect(shoppingListRequest(lines, ['A']).kind).toBe('shopping_list');
  });

  it('explains a list that could not be made', () => {
    expect(instacartErrorMessage(503)).toMatch(/isn’t switched on/);
    expect(instacartErrorMessage(502)).toMatch(/didn’t answer/);
    expect(instacartErrorMessage(undefined)).toMatch(/Try again/);
  });
});

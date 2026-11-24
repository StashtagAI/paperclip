import { instacartErrorMessage, recipeRequest, shoppingListRequest } from '@/lib/shop-links';

describe('Send to Instacart requests', () => {
  // The function reads the recipes itself (HAN-134); the app sends only which ones, never the text for the page.
  it('asks for a recipe page by id', () => {
    expect(recipeRequest({ id: 'r1' })).toEqual({ item_id: 'r1' });
  });

  it('asks for a shopping list by recipe ids, less the lines ticked off', () => {
    expect(shoppingListRequest(['r2', 'r1'], ['egg'])).toEqual({ item_ids: ['r2', 'r1'], skip: ['egg'] });
  });

  it('explains a list that could not be made', () => {
    expect(instacartErrorMessage(503)).toMatch(/isn’t switched on/);
    expect(instacartErrorMessage(502)).toMatch(/didn’t answer/);
    expect(instacartErrorMessage(429)).toMatch(/Try again later/);
    expect(instacartErrorMessage(undefined)).toMatch(/Try again/);
  });
});

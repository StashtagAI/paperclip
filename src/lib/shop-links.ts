/**
 * Buy buttons and Send to Instacart (HAN-131). The links themselves are built by the shop-links edge function, which
 * holds the affiliate IDs; this file shapes what the app sends it and the words shown around the buttons.
 */
export type BuyLink = { merchant: string; label: string; url: string; affiliate: boolean };

/**
 * What the app asks the shop-links function for. It reads the recipes itself, with the caller's own rows, and builds
 * the same list as `buildShoppingList` (HAN-134); the app never sends the text that goes on the Instacart page.
 */
export type InstacartRequest =
  | { item_id: string }
  /** `skip`: keys of the lines ticked off, which are already in the basket or the cupboard. */
  | { item_ids: string[]; skip: string[] };

/** One recipe as an Instacart recipe page: its ingredients (repeats combined) and steps. */
export function recipeRequest(recipe: { id: string }): InstacartRequest {
  return { item_id: recipe.id };
}

/** The shopping list for these recipes, in this order, less the lines ticked off. */
export function shoppingListRequest(recipeIds: string[], checkedKeys: string[]): InstacartRequest {
  return { item_ids: recipeIds, skip: checkedKeys };
}

/** FTC and Amazon Associates disclosure, shown next to every Buy button. */
export const BUY_DISCLOSURE =
  'As an Amazon Associate, StashtagAI earns from qualifying purchases. We may also earn a commission from other stores. You pay the same price.';

export const INSTACART_DISCLOSURE = 'StashtagAI may earn a commission on Instacart orders. You pay the same price.';

/** What to tell the user when the function says no, by its status code. */
export function instacartErrorMessage(status: number | undefined): string {
  if (status === 503) return 'Send to Instacart isn’t switched on yet. Share the list instead.';
  if (status === 502) return 'Instacart didn’t answer. Try again in a minute.';
  if (status === 429) return 'That’s a lot of Instacart lists for one hour. Try again later, or share the list instead.';
  return 'Couldn’t make the Instacart list. Try again.';
}

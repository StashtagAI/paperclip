/**
 * Buy buttons and Send to Instacart (HAN-131). The links themselves are built by the shop-links edge function, which
 * holds the affiliate IDs; this file shapes what the app sends it and the words shown around the buttons.
 */
import { buildShoppingList, type ShoppingLine } from '@/lib/shopping-list';

export type BuyLink = { merchant: string; label: string; url: string; affiliate: boolean };

/** A line as the shop-links function takes it (supabase/functions/shop-links/links.ts `LineIn`). */
export type InstacartLine = { name: string; display_text?: string; quantity?: number; unit?: string };

export type InstacartRequest = {
  title: string;
  kind: 'shopping_list' | 'recipe';
  lines: InstacartLine[];
  instructions?: string[];
};

export function instacartLines(lines: ShoppingLine[]): InstacartLine[] {
  return lines.map((l) => ({
    name: l.name,
    display_text: l.text,
    ...(l.amount ? { quantity: l.amount.quantity, unit: l.amount.unit } : {}),
  }));
}

/** One recipe as an Instacart recipe page: its ingredients (repeats combined) and steps. */
export function recipeRequest(recipe: { name: string; ingredients: string[]; steps: string[] }): InstacartRequest {
  return {
    title: recipe.name,
    kind: 'recipe',
    lines: instacartLines(buildShoppingList([recipe])),
    instructions: recipe.steps,
  };
}

export function shoppingListRequest(lines: ShoppingLine[], recipeNames: string[]): InstacartRequest {
  return { title: `Shopping list for ${recipeNames.join(', ')}`.slice(0, 200), kind: 'shopping_list', lines: instacartLines(lines) };
}

/** FTC and Amazon Associates disclosure, shown next to every Buy button. */
export const BUY_DISCLOSURE =
  'As an Amazon Associate, StashtagAI earns from qualifying purchases. We may also earn a commission from other stores. You pay the same price.';

export const INSTACART_DISCLOSURE = 'StashtagAI may earn a commission on Instacart orders. You pay the same price.';

/** What to tell the user when the function says no, by its status code. */
export function instacartErrorMessage(status: number | undefined): string {
  if (status === 503) return 'Send to Instacart isn’t switched on yet. Share the list instead.';
  if (status === 502) return 'Instacart didn’t answer. Try again in a minute.';
  return 'Couldn’t make the Instacart list. Try again.';
}

// HAN-124: Recipes are filed as Recipes › <meal>, one fixed set of groups, so a kind screen shows a handful of lists
// with several recipes each instead of one list per post. The same keyword table is in SQL as public.recipe_group
// (migration 20261123200000_recipe_groups.sql); keep the two in step.
import type { Extraction } from "./schema.ts";

export const RECIPES_CATEGORY = "Recipes";
export const RECIPE_GROUPS = ["Breakfast", "Lunch", "Dinner", "Snacks", "Desserts", "Drinks"] as const;
export type RecipeGroup = (typeof RECIPE_GROUPS)[number];

// Checked in this order within each text, so "Appetizers & easy dinners" is Snacks and "Breakfast cookies" is Breakfast.
const KEYWORDS: [RecipeGroup, RegExp][] = [
  ["Breakfast", /\b(breakfast|brunch|oats|oatmeal|porridge|pancakes?|waffles?|granola|french toast|omelet(te)?s?)\b/],
  ["Drinks", /\b(drinks?|cocktails?|mocktails?|smoothies?|lattes?|lemonade|juices?|chai|matcha|spritz|eggnog|hot chocolate)\b/],
  ["Desserts", /\b(desserts?|cookies?|cakes?|cupcakes?|cheesecakes?|brownies?|fudge|candy|puddings?|mousse|ice cream|bark|truffles?|sweets?|treats?|chocolate)\b/],
  ["Snacks", /\b(snacks?|appeti[sz]ers?|starters?|dips?|bites|finger food|game day)\b/],
  ["Lunch", /\b(lunch(es)?|salads?|sandwich(es)?|wraps?)\b/],
  ["Dinner", /\b(dinners?|suppers?|mains?|ramen|soups?|stews?|noodles?|pasta|curry|curries|rice)\b/],
];

/** The meal group the first text that mentions one points to; `fallback` when none does. Earlier texts win. */
export function recipeGroup(texts: readonly (string | null | undefined)[], fallback: RecipeGroup = "Dinner"): RecipeGroup {
  for (const text of texts) {
    const t = (text ?? "").toLowerCase();
    if (!t) continue;
    for (const [group, re] of KEYWORDS) if (re.test(t)) return group;
  }
  return fallback;
}

/** Recipes go to Recipes › <meal>, read from the model's scope, then its category, the item names and the tags. */
export function groupRecipes(ex: Extraction): Extraction {
  if (ex.kind !== "recipes") return ex;
  const group = recipeGroup([ex.list_scope, ex.category, ...ex.items.map((i) => i.name), ...ex.tags]);
  return { ...ex, category: RECIPES_CATEGORY, list_scope: group };
}

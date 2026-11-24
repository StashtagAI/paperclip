/**
 * Shopping list from saved recipes (HAN-74): merges the ingredient lines process-link extracted (docs/extraction.md,
 * `recipe_details`) into one list. Lines naming the same thing are combined, and their amounts added up when the units
 * match ("2 garlic cloves, minced" + "2 cloves garlic" → "4 cloves garlic"). Nothing is converted between units, and
 * a line that can't be read is kept as written.
 */

export type RecipeIngredients = { name: string; ingredients: string[] };

export type ShoppingLine = {
  /** Stable for the same ingredient name; used to remember what's been ticked off. */
  key: string;
  /** e.g. "1½ cups + 2 tbsp butter". */
  text: string;
  /** The recipes that need it, in selection order. */
  recipes: string[];
  /** What to search a store for, e.g. "butter" (Send to Instacart, HAN-131). */
  name: string;
  /** The amount when it's one number in one unit ("" for a count); left out for "1 cup + 2 tbsp" or "2 + more". */
  amount?: { quantity: number; unit: string };
};

const FRACTIONS: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

/** Spelled-out units → the short form shown on the list. */
const UNITS: [RegExp, string][] = [
  [/^(teaspoons?|tsps?)\b\.?/i, 'tsp'],
  [/^(tablespoons?|tbsps?|tbs)\b\.?/i, 'tbsp'],
  [/^(fluid ounces?|fl\.? oz)\b\.?/i, 'fl oz'],
  [/^cups?\b/i, 'cup'],
  [/^(ounces?|oz)\b\.?/i, 'oz'],
  [/^(pounds?|lbs?)\b\.?/i, 'lb'],
  [/^(kilograms?|kg)\b/i, 'kg'],
  [/^(grams?|g)\b/i, 'g'],
  [/^(millilit(?:er|re)s?|ml)\b/i, 'ml'],
  [/^(lit(?:er|re)s?|l)\b/i, 'l'],
  [/^cloves?\b/i, 'clove'],
  [/^cans?\b/i, 'can'],
  [/^pinch(?:es)?\b/i, 'pinch'],
  [/^slices?\b/i, 'slice'],
  [/^sticks?\b/i, 'stick'],
];

/** Units that read as words, so they take a plural ("2 cups", but "2 tbsp"). */
const PLURALS: Record<string, string> = {
  cup: 'cups', clove: 'cloves', can: 'cans', pinch: 'pinches', slice: 'slices', stick: 'sticks',
};

// Mixed numbers and fractions first, so "1/2" isn't read as "1".
const NUMBER = String.raw`\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?`;
const QUANTITY = new RegExp(`^(${NUMBER})(?:\\s*(?:-|–|to)\\s*(?:${NUMBER}))?\\s*`);

function toNumber(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .reduce((sum, part) => {
      const [a, b] = part.split('/');
      return sum + (b ? Number(a) / Number(b) : Number(a));
    }, 0);
}

/** 1.5 → "1½", 0.333 → "⅓", 2.4 → "2.4". */
export function formatAmount(n: number): string {
  const whole = Math.floor(n + 0.01);
  const rest = n - whole;
  if (rest < 0.01) return String(whole);
  const glyph = Object.entries(FRACTIONS).find(([, f]) => Math.abs(toNumber(f) - rest) < 0.01)?.[0];
  if (glyph) return whole ? `${whole}${glyph}` : glyph;
  return String(Math.round(n * 100) / 100);
}

type Parsed = { amount: number | null; unit: string; name: string };

/** Reads "1½ cups (340 g) flour, sifted" as 1.5 cup "flour". Ranges ("2-3 eggs") count as their low end. */
export function parseIngredient(line: string): Parsed {
  let text = line.replace(/(\d)([½⅓⅔¼¾⅕⅛⅜⅝⅞])/g, '$1 $2').replace(/[½⅓⅔¼¾⅕⅛⅜⅝⅞]/g, (g) => FRACTIONS[g]).trim();
  let amount: number | null = null;
  let unit = '';
  const q = QUANTITY.exec(text);
  if (q) {
    amount = toNumber(q[1]);
    text = text.slice(q[0].length);
    const u = UNITS.find(([re]) => re.test(text));
    if (u) {
      unit = u[1];
      text = text.replace(u[0], '').trim();
    }
  }
  let name = text
    .replace(/\([^)]*\)/g, ' ')
    .split(',')[0]
    .replace(/^of\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  // "2 garlic cloves" is the same thing as "2 cloves garlic".
  const cloves = /^(.+?)\s+cloves?$/i.exec(name);
  if (cloves && amount != null && !unit) {
    unit = 'clove';
    name = cloves[1];
  }
  return { amount, unit, name: name || line.trim() };
}

/** How it's prepared or its size, which doesn't change what to buy: "melted butter" is butter. */
const PREP = new Set([
  'chopped', 'minced', 'melted', 'grated', 'shredded', 'sliced', 'diced', 'fresh', 'freshly', 'finely', 'roughly',
  'softened', 'large', 'medium', 'small',
]);

/** "Garlic Cloves" and "garlic clove" share a key; only the last word is made singular. */
export function ingredientKey(name: string): string {
  const all = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const kept = all.filter((w) => !PREP.has(w));
  const words = kept.length ? kept : all;
  const last = words.pop() ?? '';
  const singular = last.endsWith('ies')
    ? `${last.slice(0, -3)}y`
    : last.endsWith('oes')
      ? last.slice(0, -2)
      : last.endsWith('s') && !last.endsWith('ss') && last.length > 3
        ? last.slice(0, -1)
        : last;
  return [...words, singular].join(' ');
}

type Group = { key: string; names: { name: string; amount: number }[]; units: Map<string, number>; loose: boolean; recipes: string[] };

/** One list for the given recipes, in the order each ingredient first appears. */
export function buildShoppingList(recipes: RecipeIngredients[]): ShoppingLine[] {
  const groups = new Map<string, Group>();
  for (const recipe of recipes) {
    for (const line of recipe.ingredients) {
      if (!line.trim()) continue;
      const p = parseIngredient(line);
      const key = ingredientKey(p.name);
      if (!key) continue;
      let g = groups.get(key);
      if (!g) {
        g = { key, names: [], units: new Map(), loose: false, recipes: [] };
        groups.set(key, g);
      }
      g.names.push({ name: p.name, amount: p.amount ?? 0 });
      if (p.amount == null) g.loose = true;
      else g.units.set(p.unit, (g.units.get(p.unit) ?? 0) + p.amount);
      if (!g.recipes.includes(recipe.name)) g.recipes.push(recipe.name);
    }
  }
  return [...groups.values()].map((g) => {
    // The plainest wording ("butter" over "melted butter"), then the one with the most of it, so "1 egg" + "2 eggs"
    // reads "3 eggs".
    const prep = (n: string) => n.toLowerCase().split(/\s+/).filter((w) => PREP.has(w)).length;
    const name = g.names.reduce((a, b) => {
      const d = prep(b.name) - prep(a.name);
      return d < 0 || (d === 0 && b.amount > a.amount) ? b : a;
    }).name;
    const amounts = [...g.units].map(([unit, n]) => {
      const u = unit && n > 1 ? (PLURALS[unit] ?? unit) : unit;
      return [formatAmount(n), u].filter(Boolean).join(' ');
    });
    if (amounts.length && g.loose) amounts.push('more');
    // "Chopped parsley" starts a line in the recipe but not after an amount; other capitals may be names.
    const mid = PREP.has(name.split(' ')[0].toLowerCase()) ? name.charAt(0).toLowerCase() + name.slice(1) : name;
    const text = amounts.length ? `${amounts.join(' + ')} ${mid}` : name;
    const single = g.units.size === 1 && !g.loose ? [...g.units][0] : null;
    return {
      key: g.key,
      text: text.charAt(0).toUpperCase() + text.slice(1),
      recipes: g.recipes,
      name: mid,
      ...(single ? { amount: { quantity: single[1], unit: single[0] } } : {}),
    };
  });
}

/** Plain text for the share sheet, or for pasting into Notes or Reminders. */
export function shoppingListText(lines: ShoppingLine[], recipeNames: string[]): string {
  return [`Shopping list for ${recipeNames.join(', ')}`, '', ...lines.map((l) => `- ${l.text}`)].join('\n');
}

export const recipesLabel = (n: number) => `${n} recipe${n === 1 ? '' : 's'}`;

// HAN-124: Shop is filed as Shop › <category> › <group> from one fixed table (Beauty › Fragrances, Home › Kitchen…), so
// "Men's fragrances" and "Men’s fragrances" or a Saved posts list of perfume posts all land in Beauty › Fragrances.
// The same table is in SQL as public.shop_group (migration 20261124010000_shop_groups.sql); keep the two in step.
import type { Extraction } from "./schema.ts";

export const SHOP_CATEGORIES = ["Beauty", "Clothing", "Home", "Tech", "Travel", "Fitness", "Kids", "Pets", "Food & drink", "Other"] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];
export interface ShopGroup { category: ShopCategory; list: string }

/** Where a product goes when nothing names its type. */
export const SHOP_FALLBACK: ShopGroup = { category: "Other", list: "Saved posts" };

// Product types, checked in this order within each text, so the product wins over where it is used ("travel makeup
// bag" is Makeup, "duffel bag" is Luggage, "dog toys" is Pets).
const KEYWORDS: [ShopCategory, string, RegExp][] = [
  ["Beauty", "Fragrances", /\b(fragrances?|perfumes?|colognes?|scents?|parfums?|eau de|edp|edt)\b/],
  ["Beauty", "Skincare", /\b(skin ?care|serums?|moisturi[sz]ers?|cleansers?|sunscreens?|spf|retinol|toners?|face masks?|eye creams?|lip balms?)\b/],
  ["Beauty", "Makeup", /\b(make ?up|lipsticks?|lip gloss(es)?|mascaras?|foundations?|concealers?|blush(es)?|eyeshadows?|eyeliners?|bronzers?|highlighters?|primers?)\b/],
  ["Beauty", "Hair care", /\b(hair ?care|shampoos?|conditioners?|hair (oils?|masks?|dryers?|tools?|products?)|curling irons?|straighteners?)\b/],
  ["Beauty", "Nails", /\b(nails?|nail polish(es)?|manicures?)\b/],
  ["Beauty", "Bath & body", /\b(body (wash|lotion|oil|scrub|butter)s?|bath (bombs?|salts?|oils?)|bubble bath|shower gels?|deodorants?|soaps?|razors?|shaving)\b/],
  ["Tech", "Audio", /\b(headphones?|earbuds?|airpods|speakers?|soundbars?)\b/],
  ["Tech", "Phones & accessories", /\b(phones?|iphones?|chargers?|charging|cables?|power banks?|magsafe)\b/],
  ["Tech", "Computers", /\b(laptops?|computers?|macbooks?|ipads?|tablets?|keyboards?|monitors?)\b/],
  ["Tech", "Smart home", /\b(smart (home|plugs?|lights?|bulbs?)|alexa|robot vacuums?|video doorbells?)\b/],
  ["Tech", "Gaming", /\b(gaming|consoles?|playstation|ps5|xbox|nintendo)\b/],
  ["Tech", "Cameras", /\b(cameras?|gopros?|drones?)\b/],
  ["Tech", "Gadgets", /\b(gadgets?|smart ?watch(es)?|apple watch(es)?|kindles?|e-?readers?)\b/],
  ["Travel", "Luggage", /\b(suitcases?|luggage|carry[- ]?ons?|duffels?|packing cubes?|garment bags?)\b/],
  ["Home", "Kitchen", /\b(kitchen|cookware|pans?|knives|knife|air ?fryers?|blenders?|coffee (makers?|machines?)|espresso|utensils|appliances?)\b/],
  ["Home", "Furniture", /\b(furniture|sofas?|couch(es)?|chairs?|tables?|desks?|dressers?|shel(f|ves)|bookcases?)\b/],
  ["Home", "Bedding & bath", /\b(bedding|sheets|duvets?|comforters?|towels?|mattress(es)?)\b/],
  ["Home", "Decor", /\b(decor|décor|rugs?|lamps?|lighting|candles?|vases?|wall art|mirrors?|throw pillows?|curtains?)\b/],
  ["Home", "Cleaning & storage", /\b(cleaning|cleaners?|vacuums?|mops?|laundry|organi[sz](ation|ers?)|storage)\b/],
  ["Home", "Tools & DIY", /\b(tools?|drills?|diy|hardware)\b/],
  ["Home", "Garden & outdoor", /\b(garden(ing)?|plants?|planters?|patio|grills?|bbq)\b/],
  ["Clothing", "Shoes", /\b(shoes?|sneakers?|trainers?|boots?|sandals?|heels|loafers?)\b/],
  ["Clothing", "Bags", /\b(bags?|handbags?|purses?|backpacks?|totes?|wallets?)\b/],
  ["Clothing", "Jewelry & watches", /\b(jewell?ery|necklaces?|rings?|earrings?|bracelets?|watch(es)?)\b/],
  ["Clothing", "Accessories", /\b(sunglasses|hats?|caps?|belts?|scarf|scarves|gloves)\b/],
  ["Clothing", "Clothes", /\b(clothes|clothing|outfits?|dress(es)?|jeans|shirts?|t-shirts?|tops?|jackets?|coats?|sweaters?|hoodies?|pants|trousers|leggings|activewear|loungewear|swimwear)\b/],
  ["Travel", "Travel accessories", /\b(passport|neck pillows?|travel (pillows?|adapters?|accessor(y|ies)|bottles?))\b/],
  ["Fitness", "Workout gear", /\b(gym|workouts?|fitness|yoga|weights|dumbbells?|kettlebells?|resistance bands?|treadmills?|exercise)\b/],
  ["Pets", "Pet supplies", /\b(pets?|dogs?|puppy|puppies|cats?|kittens?)\b/],
  ["Kids", "Toys", /\b(toys?|lego)\b/],
  ["Kids", "Baby", /\b(baby|babies|strollers?|nursery|diapers?|toddlers?)\b/],
  ["Food & drink", "Groceries", /\b(snacks?|sauces?|spices?|seasonings?|coffee|tea|wine|pantry|grocer(y|ies)|chocolate)\b/],
];

// Broad words (mostly the category names the model is asked for), tried only when no text names a product type.
const BROAD: [ShopCategory, string, RegExp][] = [
  ["Beauty", "Other beauty", /\b(beauty|cosmetics|self ?care)\b/],
  ["Clothing", "Clothes", /\b(fashion|style|wardrobe)\b/],
  ["Tech", "Gadgets", /\b(tech|electronics)\b/],
  ["Travel", "Travel accessories", /\b(travel|trips?)\b/],
  ["Kids", "Other kids", /\b(kids?|children)\b/],
  ["Food & drink", "Groceries", /\b(food|drinks?)\b/],
  ["Home", "Other home", /\b(home|house|apartment)\b/],
];

/**
 * The group the first text that names a product type points to, else the first that names a broad one; `fallback` when
 * none does. Earlier texts win.
 */
export function shopGroup(texts: readonly (string | null | undefined)[], fallback: ShopGroup = SHOP_FALLBACK): ShopGroup {
  for (const table of [KEYWORDS, BROAD]) {
    for (const text of texts) {
      const t = (text ?? "").toLowerCase();
      if (!t) continue;
      for (const [category, list, re] of table) if (re.test(t)) return { category, list };
    }
  }
  return fallback;
}

/** Shop goes to Shop › <category> › <group>, read from the model's scope, then its category, the item names and tags. */
export function groupShop(ex: Extraction): Extraction {
  if (ex.kind !== "shop") return ex;
  const { category, list } = shopGroup([ex.list_scope, ex.category, ...ex.items.map((i) => i.name), ...ex.tags]);
  return { ...ex, category, list_scope: list };
}

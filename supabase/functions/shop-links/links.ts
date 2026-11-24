// Affiliate link building for Buy buttons and Send to Instacart (HAN-131). Pure functions: no network, no env reads,
// so they're unit-tested in test.ts. The IDs come from the function's secrets (see config()).

export type Env = (k: string) => string | undefined;

export type Config = {
  /** Amazon Associates tracking ID, e.g. "stashtag-20". Unset: plain Amazon search links, no tag. */
  amazonTag: string | null;
  /** Sovrn Commerce (VigLink) or Skimlinks wrapper for every non-Amazon store. Unset: plain store links. */
  wrapper: { kind: "sovrn"; key: string } | { kind: "skimlinks"; id: string } | null;
  instacartKey: string | null;
  instacartBase: string;
};

/** Empty or "placeholder" secrets count as unset, so the placeholder config in README ships no fake IDs in links. */
const secret = (env: Env, k: string) => {
  const v = env(k)?.trim();
  return v && !/^placeholder/i.test(v) ? v : null;
};

export function config(env: Env): Config {
  const kind = secret(env, "AFFILIATE_WRAPPER")?.toLowerCase();
  const id = secret(env, "AFFILIATE_WRAPPER_ID");
  return {
    amazonTag: secret(env, "AMAZON_ASSOCIATE_TAG"),
    wrapper: id && kind === "sovrn" ? { kind, key: id } : id && kind === "skimlinks" ? { kind, id } : null,
    instacartKey: secret(env, "INSTACART_API_KEY"),
    // The dev host (https://connect.dev.instacart.tools) takes development keys only.
    instacartBase: (secret(env, "INSTACART_API_BASE") ?? "https://connect.instacart.com").replace(/\/+$/, ""),
  };
}

export type Merchant = "amazon" | "walmart" | "target" | "sephora" | "macys";

const STORES: Record<Merchant, { label: string; search: (q: string) => string }> = {
  amazon: { label: "Amazon", search: (q) => `https://www.amazon.com/s?k=${q}` },
  walmart: { label: "Walmart", search: (q) => `https://www.walmart.com/search?q=${q}` },
  target: { label: "Target", search: (q) => `https://www.target.com/s?searchTerm=${q}` },
  sephora: { label: "Sephora", search: (q) => `https://www.sephora.com/search?keyword=${q}` },
  macys: { label: "Macy's", search: (q) => `https://www.macys.com/shop/search?keyword=${q}` },
};

/** Fragrance and beauty pay the best commissions (HAN-127 §3), and these stores carry them. */
const BEAUTY = /\b(fragrances?|perfumes?|cologne|eau de|parfum|scents?|beauty|makeup|make-up|skin ?care|serum|moisturi[sz]er|lipstick|mascara|foundation|concealer|blush|sunscreen|spf|hair ?care|shampoo|conditioner|nail polish)\b/i;

export type ProductInfo = { name: string; description?: string | null; list?: string | null; category?: string | null; tags?: string[] };

/** Amazon first, then two stores that fit what it is. */
export function merchantsFor(p: ProductInfo): Merchant[] {
  const text = [p.name, p.description, p.list, p.category, ...(p.tags ?? [])].filter(Boolean).join(" ");
  return BEAUTY.test(text) ? ["amazon", "sephora", "macys"] : ["amazon", "walmart", "target"];
}

export type BuyLink = { merchant: Merchant; label: string; url: string; affiliate: boolean };

export const MAX_QUERY = 100;

/** A store search for the item's name, tagged or wrapped for commission when the IDs are set. */
export function buyLinks(p: ProductInfo, cfg: Config): BuyLink[] {
  const query = p.name.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
  if (!query) return [];
  const q = encodeURIComponent(query);
  return merchantsFor(p).map((merchant) => {
    const { label, search } = STORES[merchant];
    const plain = search(q);
    if (merchant === "amazon") {
      return cfg.amazonTag
        ? { merchant, label, url: `${plain}&tag=${encodeURIComponent(cfg.amazonTag)}`, affiliate: true }
        : { merchant, label, url: plain, affiliate: false };
    }
    const w = cfg.wrapper;
    if (!w) return { merchant, label, url: plain, affiliate: false };
    const u = encodeURIComponent(plain);
    const url = w.kind === "sovrn"
      ? `https://redirect.viglink.com?key=${encodeURIComponent(w.key)}&u=${u}`
      : `https://go.skimresources.com?id=${encodeURIComponent(w.id)}&xs=1&url=${u}`;
    return { merchant, label, url, affiliate: true };
  });
}

/** The app's short units (src/lib/shopping-list.ts) → Instacart's. Others (clove, pinch, slice, stick, fl oz) have no
 * Instacart unit, so the line goes without an amount and the shopper picks one; a wrong unit would break matching. */
const UNITS: Record<string, string> = {
  "": "each", tsp: "teaspoon", tbsp: "tablespoon", cup: "cup", oz: "ounce", lb: "pound", g: "gram", kg: "kilogram",
  ml: "milliliter", l: "liter", can: "can",
};

export type LineIn = { name: string; display_text?: string; quantity?: number; unit?: string };
export type InstacartRequest = { title: string; kind: "shopping_list" | "recipe"; lines: LineIn[]; instructions?: string[] };

export const LIMITS = { title: 200, lines: 100, text: 200, instructions: 50, instruction: 1000 };

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Checks and trims what the app sent. Returns null if there's nothing to send. */
export function parseInstacart(body: Record<string, unknown>): InstacartRequest | null {
  const title = clean(body.title, LIMITS.title);
  const kind = body.kind === "recipe" ? "recipe" : "shopping_list";
  const rawLines = Array.isArray(body.lines) ? body.lines.slice(0, LIMITS.lines) : [];
  const lines: LineIn[] = [];
  for (const l of rawLines) {
    if (!l || typeof l !== "object") continue;
    const o = l as Record<string, unknown>;
    const name = clean(o.name, LIMITS.text);
    if (!name) continue;
    const line: LineIn = { name };
    const display = clean(o.display_text, LIMITS.text);
    if (display && display !== name) line.display_text = display;
    if (typeof o.quantity === "number" && Number.isFinite(o.quantity) && o.quantity > 0 && o.quantity < 1e4) {
      line.quantity = o.quantity;
      line.unit = typeof o.unit === "string" ? o.unit : "";
    }
    lines.push(line);
  }
  if (!title || !lines.length) return null;
  const instructions = Array.isArray(body.instructions)
    ? body.instructions.slice(0, LIMITS.instructions).map((s) => clean(s, LIMITS.instruction)).filter(Boolean)
    : [];
  return { title, kind, lines, ...(kind === "recipe" && instructions.length ? { instructions } : {}) };
}

/** Body for POST /idp/v1/products/products_link (Instacart Developer Platform: "Create shopping list page"). */
export function instacartBody(r: InstacartRequest) {
  return {
    title: r.title,
    link_type: r.kind,
    ...(r.instructions ? { instructions: r.instructions } : {}),
    line_items: r.lines.map((l) => {
      const unit = l.quantity != null ? UNITS[l.unit ?? ""] : undefined;
      return {
        name: l.name,
        ...(l.display_text ? { display_text: l.display_text } : {}),
        ...(unit ? { line_item_measurements: [{ quantity: Math.round(l.quantity! * 1000) / 1000, unit }] } : {}),
      };
    }),
    ...(r.kind === "recipe" ? { landing_page_configuration: { enable_pantry_items: true } } : {}),
  };
}

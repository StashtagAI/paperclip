// Run: node --experimental-strip-types supabase/functions/shop-links/test.ts
import assert from "node:assert/strict";
import { handle } from "./handler.ts";
import { buyLinks, config, instacartBody, merchantsFor, parseInstacart, type Env } from "./links.ts";

const envOf = (vars: Record<string, string>): Env => (k) => vars[k];
const none = config(envOf({}));

// --- config: placeholders and blanks count as unset
assert.deepEqual(none, { amazonTag: null, wrapper: null, instacartKey: null, instacartBase: "https://connect.instacart.com" });
assert.equal(config(envOf({ AMAZON_ASSOCIATE_TAG: "placeholder-20" })).amazonTag, null);
assert.equal(config(envOf({ AMAZON_ASSOCIATE_TAG: "  " })).amazonTag, null);
assert.deepEqual(config(envOf({ AFFILIATE_WRAPPER: "Sovrn", AFFILIATE_WRAPPER_ID: "k1" })).wrapper, { kind: "sovrn", key: "k1" });
assert.deepEqual(config(envOf({ AFFILIATE_WRAPPER: "skimlinks", AFFILIATE_WRAPPER_ID: "123X456" })).wrapper, { kind: "skimlinks", id: "123X456" });
assert.equal(config(envOf({ AFFILIATE_WRAPPER: "rakuten", AFFILIATE_WRAPPER_ID: "k" })).wrapper, null, "unknown network");
assert.equal(config(envOf({ AFFILIATE_WRAPPER: "sovrn" })).wrapper, null, "no id");
assert.equal(config(envOf({ INSTACART_API_BASE: "https://connect.dev.instacart.tools/" })).instacartBase, "https://connect.dev.instacart.tools");

// --- merchants: beauty and fragrance go to beauty stores
assert.deepEqual(merchantsFor({ name: "Dior Sauvage", list: "Fragrance" }), ["amazon", "sephora", "macys"]);
assert.deepEqual(merchantsFor({ name: "Le Labo Santal 33", description: "Eau de parfum" }), ["amazon", "sephora", "macys"]);
assert.deepEqual(merchantsFor({ name: "CeraVe", tags: ["skincare"] }), ["amazon", "sephora", "macys"]);
assert.deepEqual(merchantsFor({ name: "Packing cubes", list: "Travel gear" }), ["amazon", "walmart", "target"]);
assert.deepEqual(merchantsFor({ name: "Scentsy warmer" }), ["amazon", "walmart", "target"], "word match, not substring");

// --- buy links
{
  const plain = buyLinks({ name: "Dior  Sauvage 100ml", list: "Fragrance" }, none);
  assert.deepEqual(plain.map((l) => l.label), ["Amazon", "Sephora", "Macy's"]);
  assert.equal(plain[0].url, "https://www.amazon.com/s?k=Dior%20Sauvage%20100ml");
  assert.ok(plain.every((l) => !l.affiliate), "no IDs: plain links, not marked as affiliate");

  const cfg = config(envOf({ AMAZON_ASSOCIATE_TAG: "stashtag-20", AFFILIATE_WRAPPER: "sovrn", AFFILIATE_WRAPPER_ID: "abc" }));
  const tagged = buyLinks({ name: "Dior Sauvage", list: "Fragrance" }, cfg);
  assert.equal(tagged[0].url, "https://www.amazon.com/s?k=Dior%20Sauvage&tag=stashtag-20");
  assert.equal(tagged[1].url,
    `https://redirect.viglink.com?key=abc&u=${encodeURIComponent("https://www.sephora.com/search?keyword=Dior%20Sauvage")}`);
  assert.ok(tagged.every((l) => l.affiliate));
  const back = new URL(tagged[2].url).searchParams.get("u");
  assert.equal(back, "https://www.macys.com/shop/search?keyword=Dior%20Sauvage", "the wrapped URL round-trips");

  const skim = buyLinks({ name: "Tent" }, config(envOf({ AFFILIATE_WRAPPER: "skimlinks", AFFILIATE_WRAPPER_ID: "1X2" })));
  assert.equal(new URL(skim[1].url).origin, "https://go.skimresources.com");
  assert.equal(new URL(skim[1].url).searchParams.get("url"), "https://www.walmart.com/search?q=Tent");
  assert.equal(skim[0].affiliate, false, "a wrapper alone doesn't tag Amazon");

  // Names can't break out of the query string.
  const odd = buyLinks({ name: "Tom & Jerry ?x=1#y" }, cfg)[0];
  assert.equal(new URL(odd.url).searchParams.get("k"), "Tom & Jerry ?x=1#y");
  assert.equal(new URL(odd.url).searchParams.get("tag"), "stashtag-20");
  assert.deepEqual(buyLinks({ name: "   " }, cfg), []);
  assert.equal(new URL(buyLinks({ name: "x".repeat(500) }, none)[0].url).searchParams.get("k")?.length, 100);
}

// --- Instacart request parsing and body
{
  assert.equal(parseInstacart({ title: "", lines: [{ name: "eggs" }] }), null, "needs a title");
  assert.equal(parseInstacart({ title: "List", lines: [] }), null, "needs a line");
  assert.equal(parseInstacart({ title: "List", lines: "eggs" }), null);
  const r = parseInstacart({
    title: "Shopping list for Shakshuka",
    lines: [
      { name: "eggs", display_text: "6 eggs", quantity: 6, unit: "" },
      { name: "butter", display_text: "1½ cups + 2 tbsp butter" },
      { name: "garlic", display_text: "4 cloves garlic", quantity: 4, unit: "clove" },
      { name: "flour", quantity: 1.3333333, unit: "cup" },
      { name: "salt", quantity: -1, unit: "tsp" },
      { name: "  ", display_text: "dropped" },
      null,
      { name: "x".repeat(300) },
    ],
    instructions: ["ignored for a shopping list"],
  })!;
  assert.equal(r.kind, "shopping_list");
  assert.equal(r.instructions, undefined);
  assert.equal(r.lines.length, 6);
  assert.equal(r.lines[4].quantity, undefined, "non-positive quantity dropped");
  assert.equal(r.lines[5].name.length, 200);
  const b = instacartBody(r);
  assert.equal(b.link_type, "shopping_list");
  assert.equal("landing_page_configuration" in b, false);
  assert.deepEqual(b.line_items[0], { name: "eggs", display_text: "6 eggs", line_item_measurements: [{ quantity: 6, unit: "each" }] });
  assert.deepEqual(b.line_items[1], { name: "butter", display_text: "1½ cups + 2 tbsp butter" }, "no amount: shopper picks");
  assert.deepEqual(b.line_items[2], { name: "garlic", display_text: "4 cloves garlic" }, "no Instacart unit for cloves");
  assert.deepEqual(b.line_items[3].line_item_measurements, [{ quantity: 1.333, unit: "cup" }]);

  const recipe = parseInstacart({ title: "Shakshuka", kind: "recipe", lines: [{ name: "eggs" }], instructions: ["Fry.", "", 7] })!;
  const rb = instacartBody(recipe);
  assert.equal(rb.link_type, "recipe");
  assert.deepEqual(rb.instructions, ["Fry."]);
  assert.deepEqual(rb.landing_page_configuration, { enable_pantry_items: true });
  assert.equal(parseInstacart({ title: "t", lines: Array.from({ length: 150 }, (_, i) => ({ name: `i${i}` })) })!.lines.length, 100);
}

// --- handler, against a small in-memory stand-in for the Supabase client
type Row = Record<string, unknown>;
const ITEMS: Record<string, Row> = {
  shop: { name: "Dior Sauvage", description: "", tags: [], list: { name: "Fragrance", category: { kind: "shop", name: "Beauty" } } },
  eats: { name: "Sushi Den", description: "", tags: [], list: { name: "Denver", category: { kind: "eats", name: "Restaurants" } } },
};
const db = {
  auth: { getUser: async (t: string) => ({ data: { user: t === "good" ? { id: "u1" } : null } }) },
  from() {
    const f: Record<string, unknown> = {};
    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => { f[k] = v; return b; },
      maybeSingle: async () => ({ data: f.user_id === "u1" ? ITEMS[f.id as string] ?? null : null }),
    };
    return b;
  },
};
type Call = { url: string; init: RequestInit };
const fakeFetch = (reply: () => { status?: number; body?: unknown } | Error, calls: Call[] = []) =>
  (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = reply();
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
const post = (body: unknown, token = "good") =>
  new Request("http://x/shop-links", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const call = async (body: unknown, opts: { token?: string; env?: Record<string, string>; fetchFn?: typeof fetch } = {}) => {
  const res = await handle(post(body, opts.token), { db, env: envOf(opts.env ?? {}), fetchFn: opts.fetchFn ?? fakeFetch(() => new Error("no network")) });
  return { status: res.status, body: await res.json() };
};

assert.equal((await handle(new Request("http://x", { method: "OPTIONS" }), { db, env: envOf({}) })).status, 200);
assert.equal((await handle(new Request("http://x", { method: "GET" }), { db, env: envOf({}) })).status, 405);
assert.equal((await call({ action: "buy", item_id: "shop" }, { token: "bad" })).status, 401);
assert.equal((await call({ action: "nope" })).status, 400);
assert.equal((await call({ action: "buy" })).status, 400);
assert.equal((await call({ action: "buy", item_id: "missing" })).status, 404, "someone else's or no item");
{
  const r = await call({ action: "buy", item_id: "shop" }, { env: { AMAZON_ASSOCIATE_TAG: "stashtag-20" } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.links.map((l: { label: string }) => l.label), ["Amazon", "Sephora", "Macy's"], "uses list and category");
  assert.match(r.body.links[0].url, /tag=stashtag-20$/);
}
assert.deepEqual((await call({ action: "buy", item_id: "eats" })).body, { links: [] }, "only Shop items get Buy links");

const LIST = { action: "instacart", title: "Shopping list", lines: [{ name: "eggs", quantity: 2, unit: "" }] };
assert.equal((await call({ ...LIST, lines: [] }, { env: { INSTACART_API_KEY: "k" } })).status, 400);
assert.deepEqual(await call(LIST), { status: 503, body: { error: "not_configured" } }, "no key yet");
{
  const calls: Call[] = [];
  const r = await call(LIST, {
    env: { INSTACART_API_KEY: "secret-key", INSTACART_API_BASE: "https://connect.dev.instacart.tools" },
    fetchFn: fakeFetch(() => ({ body: { products_link_url: "https://customers.dev.instacart.tools/store/shopping_lists/1" } }), calls),
  });
  assert.deepEqual(r, { status: 200, body: { url: "https://customers.dev.instacart.tools/store/shopping_lists/1" } });
  assert.equal(calls[0].url, "https://connect.dev.instacart.tools/idp/v1/products/products_link");
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, "Bearer secret-key");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)).line_items, [{ name: "eggs", line_item_measurements: [{ quantity: 2, unit: "each" }] }]);
  assert.ok(!JSON.stringify(r.body).includes("secret-key"));
}
const withKey = { INSTACART_API_KEY: "k" };
assert.equal((await call(LIST, { env: withKey, fetchFn: fakeFetch(() => ({ status: 400, body: { errors: [{ code: 1001 }] } })) })).status, 502);
assert.equal((await call(LIST, { env: withKey, fetchFn: fakeFetch(() => new Error("timeout")) })).status, 502);
assert.equal((await call(LIST, { env: withKey, fetchFn: fakeFetch(() => ({ body: { products_link_url: "javascript:alert(1)" } })) })).status, 502,
  "only https links go back to the app");

console.log("shop-links: ok");

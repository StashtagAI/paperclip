// Run: node --experimental-strip-types supabase/functions/shop-links/test.ts
import assert from "node:assert/strict";
import { handle } from "./handler.ts";
import {
  buyLinks, config, instacartBody, instacartUrlOk, merchantsFor, parseInstacart, recipeRequest, shoppingListRequest, type Env,
} from "./links.ts";

const envOf = (vars: Record<string, string>): Env => (k) => vars[k];
const none = config(envOf({}));

// --- config: placeholders and blanks count as unset
assert.deepEqual(none, {
  amazonTag: null, wrapper: null, instacartKey: null, instacartBase: "https://connect.instacart.com", instacartPerHour: 20,
});
assert.equal(config(envOf({ INSTACART_PER_HOUR: "5" })).instacartPerHour, 5);
assert.equal(config(envOf({ INSTACART_PER_HOUR: "0" })).instacartPerHour, 0, "0 switches it off");
assert.equal(config(envOf({ INSTACART_PER_HOUR: "lots" })).instacartPerHour, 20, "garbage: the default");
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

// --- requests built from saved recipes (HAN-134)
{
  const shak = { name: "Shakshuka", ingredients: ["6 eggs", "2 garlic cloves, minced", "1 cup tomatoes"], steps: ["Fry.", "Eat."] };
  const toast = { name: "Toast", ingredients: ["2 eggs", "1 slice bread"], steps: [] };
  const r = recipeRequest(shak)!;
  assert.equal(r.kind, "recipe");
  assert.equal(r.title, "Shakshuka");
  assert.deepEqual(r.instructions, ["Fry.", "Eat."]);
  assert.deepEqual(r.lines[0], { name: "eggs", display_text: "6 eggs", quantity: 6, unit: "" });
  assert.deepEqual(r.lines[1], { name: "garlic", display_text: "2 cloves garlic", quantity: 2, unit: "clove" });
  assert.equal(recipeRequest({ name: "Empty", ingredients: [], steps: ["x"] }), null, "nothing to buy");

  const list = shoppingListRequest([shak, toast])!;
  assert.equal(list.kind, "shopping_list");
  assert.equal(list.title, "Shopping list for Shakshuka, Toast");
  assert.equal(list.instructions, undefined);
  assert.deepEqual(list.lines[0], { name: "eggs", display_text: "8 eggs", quantity: 8, unit: "" }, "the app's merging");
  assert.deepEqual(shoppingListRequest([shak, toast], ["egg", "garlic"])!.lines.map((l) => l.name), ["tomatoes", "bread"],
    "ticked-off keys left out");
  assert.equal(shoppingListRequest([shak], ["egg", "garlic", "tomato"]), null, "all ticked off");
  assert.equal(shoppingListRequest([{ name: "x".repeat(300), ingredients: ["salt"], steps: [] }])!.title.length, 200);
}

// --- only Instacart's own pages go back to the app (HAN-134)
{
  const prod = "https://connect.instacart.com";
  const dev = "https://connect.dev.instacart.tools";
  for (const ok of ["https://www.instacart.com/store/shopping_lists/1", "https://instacart.com/x", "https://customers.INSTACART.com/x"]) {
    assert.ok(instacartUrlOk(ok, prod), ok);
  }
  for (const bad of [
    "javascript:alert(1)", "http://www.instacart.com/x", "https://instacart.com.evil.com/x", "https://evilinstacart.com/x",
    "https://evil.com/?u=https://instacart.com", "https://user:pw@www.instacart.com/x", "https://www.instacart.com:8443/x",
    "https://customers.dev.instacart.tools/x", "not a url", "", 42, null,
  ]) {
    assert.equal(instacartUrlOk(bad, prod), false, String(bad));
  }
  assert.ok(instacartUrlOk("https://customers.dev.instacart.tools/store/shopping_lists/1", dev), "dev base: dev site");
  assert.ok(instacartUrlOk("https://www.instacart.com/x", dev));
  assert.equal(instacartUrlOk("https://instacart.tools.evil.com/x", dev), false);
}

// --- handler, against a small in-memory stand-in for the Supabase client
type Row = Record<string, unknown>;
const ITEMS: Record<string, Row> = {
  shop: { name: "Dior Sauvage", description: "", tags: [], list: { name: "Fragrance", category: { kind: "shop", name: "Beauty" } } },
  eats: { name: "Sushi Den", description: "", tags: [], list: { name: "Denver", category: { kind: "eats", name: "Restaurants" } } },
};
const SHAK = "00000000-0000-4000-8000-000000000001";
const TOAST = "00000000-0000-4000-8000-000000000002";
const BARE = "00000000-0000-4000-8000-000000000003";
const THEIRS = "00000000-0000-4000-8000-000000000004";
const details = (name: string, ingredients: string[], steps: string[] = []) =>
  ({ recipe_details: { [name]: { ingredients, steps }, "Other dish": { ingredients: ["caviar"], steps: [] } } });
const RECIPES: Row[] = [
  { id: SHAK, user_id: "u1", name: "Shakshuka", link: details("Shakshuka", ["6 eggs", "1 cup tomatoes"], ["Fry."]) },
  { id: TOAST, user_id: "u1", name: "Toast", link: details("Toast", ["2 eggs", "1 slice bread"]) },
  { id: BARE, user_id: "u1", name: "Mystery", link: null },
  { id: THEIRS, user_id: "u2", name: "Their soup", link: details("Their soup", ["spam spam spam"]) },
];
let quota: { allowed: boolean; hour_calls: number } | null = { allowed: true, hour_calls: 0 };
const rpcs: { fn: string; args: Row }[] = [];
const db = {
  auth: { getUser: async (t: string) => ({ data: { user: t === "good" ? { id: "u1" } : null } }) },
  rpc: async (fn: string, args: Row) => {
    rpcs.push({ fn, args });
    return quota ? { data: quota, error: null } : { data: null, error: { code: "XX000" } };
  },
  from() {
    const f: Record<string, unknown> = {};
    let inIds: string[] | null = null;
    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => { f[k] = v; return b; },
      in: (_k: string, v: string[]) => { inIds = v; return b; },
      maybeSingle: async () => ({ data: f.user_id === "u1" ? ITEMS[f.id as string] ?? null : null }),
      then: (ok: (r: unknown) => unknown) =>
        ok({ data: RECIPES.filter((r) => inIds!.includes(r.id as string) && r.user_id === f.user_id), error: null }),
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

// Instacart: the page comes from the caller's own recipes, never from text in the request (HAN-134).
const KEY = { INSTACART_API_KEY: "secret-key", INSTACART_API_BASE: "https://connect.dev.instacart.tools" };
const page = (url = "https://customers.dev.instacart.tools/store/shopping_lists/1") => fakeFetch(() => ({ body: { products_link_url: url } }));
const sent = (calls: Call[]) => JSON.parse(String(calls[0].init.body));
{
  // Free text in the old request shape is ignored; without ids there's nothing to send.
  const calls: Call[] = [];
  const spam = { action: "instacart", title: "Buy at evil.example", kind: "recipe", lines: [{ name: "spam" }], instructions: ["Visit evil"] };
  assert.equal((await call(spam, { env: KEY, fetchFn: fakeFetch(() => ({}), calls) })).status, 400);
  assert.equal(calls.length, 0);
  for (const bad of [{ item_id: "not-a-uuid" }, { item_ids: [] }, { item_ids: "x" }, { item_ids: [1] }, { item_ids: [SHAK], skip: "egg" },
    { item_ids: Array.from({ length: 51 }, () => SHAK) }]) {
    assert.equal((await call({ action: "instacart", ...bad }, { env: KEY })).status, 400, JSON.stringify(bad).slice(0, 80));
  }
}
assert.deepEqual(await call({ action: "instacart", item_id: SHAK }), { status: 503, body: { error: "not_configured" } }, "no key yet");
assert.equal((await call({ action: "instacart", item_id: THEIRS }, { env: KEY })).status, 404, "someone else's recipe");
assert.equal((await call({ action: "instacart", item_ids: [THEIRS] }, { env: KEY })).status, 404, "someone else's recipes");
assert.equal((await call({ action: "instacart", item_id: BARE }, { env: KEY })).status, 400, "no ingredients");
{
  rpcs.length = 0;
  const calls: Call[] = [];
  const r = await call({ action: "instacart", item_id: SHAK, title: "ignored", lines: [{ name: "spam" }] },
    { env: KEY, fetchFn: fakeFetch(() => ({ body: { products_link_url: "https://customers.dev.instacart.tools/store/recipes/1" } }), calls) });
  assert.deepEqual(r, { status: 200, body: { url: "https://customers.dev.instacart.tools/store/recipes/1" } });
  assert.equal(calls[0].url, "https://connect.dev.instacart.tools/idp/v1/products/products_link");
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, "Bearer secret-key");
  const b = sent(calls);
  assert.equal(b.title, "Shakshuka");
  assert.equal(b.link_type, "recipe");
  assert.deepEqual(b.instructions, ["Fry."]);
  assert.deepEqual(b.line_items.map((l: { name: string }) => l.name), ["eggs", "tomatoes"], "the item's own recipe, not the post's others");
  assert.ok(!JSON.stringify(r.body).includes("secret-key"));
  assert.deepEqual(rpcs, [{ fn: "claim_instacart_quota", args: { p_user: "u1", p_per_hour: 20 } }]);
}
{
  const calls: Call[] = [];
  const r = await call({ action: "instacart", item_ids: [TOAST, SHAK, THEIRS], skip: ["bread"] },
    { env: { ...KEY, INSTACART_PER_HOUR: "3" }, fetchFn: fakeFetch(() => ({ body: { products_link_url: "https://customers.dev.instacart.tools/x" } }), calls) });
  assert.equal(r.status, 200);
  const b = sent(calls);
  assert.equal(b.title, "Shopping list for Toast, Shakshuka", "the caller's recipes, in the order asked; others' dropped");
  assert.equal(b.link_type, "shopping_list");
  assert.deepEqual(b.line_items, [
    { name: "eggs", display_text: "8 eggs", line_item_measurements: [{ quantity: 8, unit: "each" }] },
    { name: "tomatoes", display_text: "1 cup tomatoes", line_item_measurements: [{ quantity: 1, unit: "cup" }] },
  ]);
  assert.equal(rpcs.at(-1)!.args.p_per_hour, 3);
}
assert.equal((await call({ action: "instacart", item_ids: [SHAK], skip: ["egg", "tomato"] }, { env: KEY })).status, 400, "all ticked off");

// Rate limit: over the hourly cap, or the check itself failing, makes no page.
{
  const calls: Call[] = [];
  quota = { allowed: false, hour_calls: 20 };
  assert.deepEqual(await call({ action: "instacart", item_id: SHAK }, { env: KEY, fetchFn: fakeFetch(() => ({}), calls) }),
    { status: 429, body: { error: "rate_limited" } });
  quota = null;
  assert.equal((await call({ action: "instacart", item_id: SHAK }, { env: KEY, fetchFn: fakeFetch(() => ({}), calls) })).status, 500, "fails closed");
  assert.equal(calls.length, 0, "Instacart never called");
  quota = { allowed: true, hour_calls: 0 };
}

const withKey = { INSTACART_API_KEY: "k" };
const ONE = { action: "instacart", item_id: SHAK };
assert.equal((await call(ONE, { env: withKey, fetchFn: fakeFetch(() => ({ status: 400, body: { errors: [{ code: 1001 }] } })) })).status, 502);
assert.equal((await call(ONE, { env: withKey, fetchFn: fakeFetch(() => new Error("timeout")) })).status, 502);
for (const url of ["javascript:alert(1)", "https://evil.example/store", "https://www.instacart.com.evil.example/x"]) {
  assert.equal((await call(ONE, { env: withKey, fetchFn: page(url) })).status, 502, `only Instacart links go back: ${url}`);
}
assert.equal((await call(ONE, { env: withKey, fetchFn: page("https://customers.dev.instacart.tools/x") })).status, 502,
  "the production base doesn't accept dev-site links");
assert.equal((await call(ONE, { env: withKey, fetchFn: page("https://www.instacart.com/store/recipes/9") })).status, 200);

console.log("shop-links: ok");

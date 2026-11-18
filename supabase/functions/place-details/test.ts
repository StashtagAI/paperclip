// Run: node --experimental-strip-types supabase/functions/place-details/test.ts
import assert from "node:assert/strict";
import { fetchDetails, parsePlace, PRICES } from "./details.ts";
import { handle, MAX_ITEMS } from "./handler.ts";

const PLACE = {
  id: "ChIJabc",
  displayName: { text: "Sushi Den" },
  rating: 4.6,
  userRatingCount: 2310,
  utcOffsetMinutes: -420,
  regularOpeningHours: {
    periods: [
      { open: { day: 1, hour: 11, minute: 30 }, close: { day: 1, hour: 22, minute: 0 } },
      { open: { day: 9, hour: 1 } }, // bad day: dropped
      { close: { day: 2, hour: 1 } }, // no open: dropped
    ],
    weekdayDescriptions: ["Monday: 11:30 AM – 10:00 PM", 7, "Tuesday: Closed"],
  },
};

// parsePlace keeps well-formed fields only
const d = parsePlace(PLACE)!;
assert.equal(d.placeId, "ChIJabc");
assert.equal(d.rating, 4.6);
assert.equal(d.ratingCount, 2310);
assert.deepEqual(d.hours?.periods, [{ open: { day: 1, hour: 11, minute: 30 }, close: { day: 1, hour: 22, minute: 0 } }]);
assert.deepEqual(d.hours?.weekday, ["Monday: 11:30 AM – 10:00 PM", "Tuesday: Closed"]);
assert.equal(d.hours?.utc_offset_minutes, -420);
assert.equal(parsePlace({ displayName: { text: "x" } }), null, "no id");
const bare = parsePlace({ id: "x", rating: 9, userRatingCount: 4 })!;
assert.equal(bare.rating, null, "out-of-range rating dropped");
assert.equal(bare.ratingCount, null, "no count without a rating");
assert.equal(bare.hours, null);
// Open 24 hours: Google sends one period with no close.
assert.deepEqual(parsePlace({ id: "x", regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] } })!.hours?.periods,
  [{ open: { day: 0, hour: 0, minute: 0 } }]);

type Call = { url: string; init: RequestInit };
const fakeFetch = (reply: (c: Call) => { status?: number; body?: unknown }, calls: Call[] = []) =>
  (async (url: string, init: RequestInit) => {
    const c = { url: String(url), init };
    calls.push(c);
    const r = reply(c);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;

const q = { name: "Sushi Den", address: null, hint: "Denver", lat: 39.7, lng: -104.98, placeId: null };
{
  const calls: Call[] = [];
  const r = await fetchDetails(q, "KEY", fakeFetch(() => ({ body: { places: [PLACE] } }), calls));
  assert.equal(r.details?.rating, 4.6);
  assert.equal(r.usd, PRICES.search);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /places:searchText$/);
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.textQuery, "Sushi Den Denver", "list name stands in for a missing address");
  assert.equal(body.locationBias.circle.center.latitude, 39.7);
  const headers = calls[0].init.headers as Record<string, string>;
  assert.match(headers["X-Goog-FieldMask"], /places\.regularOpeningHours/);
  assert.match(headers["X-Goog-FieldMask"], /places\.rating/);
}
{
  // A different place on top is not attached.
  const r = await fetchDetails(q, "KEY", fakeFetch(() => ({ body: { places: [{ ...PLACE, displayName: { text: "Uchi" } }] } })));
  assert.equal(r.details, null);
}
{
  // Known place id: Place Details, no search.
  const calls: Call[] = [];
  const r = await fetchDetails({ ...q, placeId: "ChIJabc" }, "KEY", fakeFetch(() => ({ body: PLACE }), calls));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/places\/ChIJabc$/);
  assert.equal(r.usd, PRICES.details);
  assert.equal(r.details?.ratingCount, 2310);
}
{
  // A place id Google dropped: search again by name.
  const calls: Call[] = [];
  const r = await fetchDetails({ ...q, placeId: "gone" }, "KEY",
    fakeFetch((c) => (c.url.includes("searchText") ? { body: { places: [PLACE] } } : { status: 404 }), calls));
  assert.equal(calls.length, 2);
  assert.equal(r.details?.placeId, "ChIJabc");
}
await assert.rejects(fetchDetails(q, "KEY", fakeFetch(() => ({ status: 500 }))), /places 500/, "errors are not recorded as misses");

// --- handler, against a small in-memory stand-in for the Supabase client
type Row = Record<string, unknown>;
function world(opts: { kind?: string; owner?: string; items?: Row[]; costs?: Row[] } = {}) {
  const items: Row[] = opts.items ?? [{ id: "i1", name: "Sushi Den", address: "1487 S Pearl St", lat: null, lng: null, google_place_id: null, google_checked_at: null }];
  const events: Row[] = [...(opts.costs ?? [])];
  const updates: { id: unknown; patch: Row }[] = [];
  const db = {
    auth: { getUser: async (t: string) => ({ data: { user: t === "good" ? { id: "u1" } : null } }) },
    from(table: string) {
      const f: Record<string, unknown> = {};
      let patch: Row | null = null;
      const b = {
        select: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b,
        eq: (k: string, v: unknown) => { f[k] = v; if (patch && k === "id") updates.push({ id: v, patch }); return b; },
        update: (p: Row) => { patch = p; return b; },
        insert: async (r: Row) => { events.push(r); return { error: null }; },
        maybeSingle: async () => ({
          data: table === "lists" && f.id === "L1" && f.user_id === (opts.owner ?? "u1")
            ? { id: "L1", name: "Denver", category: { kind: opts.kind ?? "eats" } } : null,
        }),
        then: (res: (v: unknown) => void) => {
          if (table === "items" && !patch) return res({ data: items.slice(0, MAX_ITEMS), count: items.length, error: null });
          if (table === "process_events") return res({ data: events, error: null });
          return res({ error: null });
        },
      };
      return b;
    },
  };
  return { db, events, updates };
}
const post = (body: unknown, token = "good") =>
  new Request("http://x/place-details", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const env = (k: string) => (k === "GOOGLE_PLACES_API_KEY" ? "KEY" : undefined);
const placesFetch = fakeFetch(() => ({ body: { places: [PLACE] } }));

{
  const w = world();
  const res = await handle(post({ list_id: "L1" }), { db: w.db, env, fetchFn: placesFetch });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { updated: 1, remaining: 0 });
  assert.equal(w.updates.length, 1);
  assert.equal(w.updates[0].patch.google_rating, 4.6);
  assert.equal(w.updates[0].patch.google_place_id, "ChIJabc");
  assert.ok(w.updates[0].patch.google_checked_at);
  assert.equal((w.events[0].detail as Row).usd, PRICES.search, "spend recorded for the daily caps");
}
{
  // Another user's list, a non-Eats list, no session.
  assert.equal((await handle(post({ list_id: "L1" }), { db: world({ owner: "u2" }).db, env, fetchFn: placesFetch })).status, 404);
  const w = world({ kind: "recipes" });
  assert.deepEqual(await (await handle(post({ list_id: "L1" }), { db: w.db, env, fetchFn: placesFetch })).json(), { updated: 0, remaining: 0 });
  assert.equal(w.updates.length, 0);
  assert.equal((await handle(post({ list_id: "L1" }, "bad"), { db: world().db, env, fetchFn: placesFetch })).status, 401);
  assert.equal((await handle(post({}), { db: world().db, env, fetchFn: placesFetch })).status, 400);
}
{
  // Over the user's daily cap: nothing is looked up.
  const calls: Call[] = [];
  const w = world({ costs: [{ user_id: "u1", detail: { usd: 5 } }] });
  const body = await (await handle(post({ list_id: "L1" }), { db: w.db, env, fetchFn: fakeFetch(() => ({}), calls) })).json();
  assert.equal(body.skipped, "daily_limit");
  assert.equal(calls.length, 0);
}
{
  // Google down: the item is left unchecked so a later visit tries again.
  const w = world();
  const body = await (await handle(post({ list_id: "L1" }), { db: w.db, env, fetchFn: fakeFetch(() => ({ status: 503 })) })).json();
  assert.deepEqual(body, { updated: 0, remaining: 1 });
  assert.equal(w.updates.length, 0);
}
{
  // No key configured: a no-op, never an error.
  const body = await (await handle(post({ list_id: "L1" }), { db: world().db, env: () => undefined })).json();
  assert.equal(body.skipped, "no_key");
}
console.log("place-details: ok");

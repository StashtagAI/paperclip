// HAN-46 security regression tests for the process-link handler: other users' link_id, and prompt injection.
// Run: node --experimental-strip-types security.test.ts  (in-memory DB and mocked fetch; no network, no Supabase)
import assert from "node:assert/strict";
import { handle } from "./handler.ts";
import { FIXTURES, VICTIM } from "./injection-fixtures.ts";

type Row = Record<string, unknown>;
type Filter = [op: "eq" | "neq", col: string, val: unknown];

/** Just enough of supabase-js's query builder for handler.ts, with the service role's view (no RLS). */
class FakeDb {
  writes: { table: string; op: string; rows: Row[] }[] = [];
  tables: Record<string, Row[]>;
  private tokens: Record<string, string>;
  constructor(tables: Record<string, Row[]>, tokens: Record<string, string>) { this.tables = tables; this.tokens = tokens; }
  auth = { getUser: async (t: string) => ({ data: { user: this.tokens[t] ? { id: this.tokens[t] } : null } }) };
  from(table: string) { return new Query(this, table); }
  /** claim_process_quota (HAN-37): always allows, and records the call like a write. */
  rpc(fn: string, args: Row) {
    this.writes.push({ table: `rpc:${fn}`, op: "rpc", rows: [args] });
    return Promise.resolve({ data: { allowed: true, alert: null }, error: null });
  }
}

class Query {
  private op = "select";
  private payload: Row[] = [];
  private filters: Filter[] = [];
  private mode: "many" | "single" | "maybe" = "many";
  private conflict: string[] = [];
  private ignoreDuplicates = false;
  private db: FakeDb;
  private table: string;
  constructor(db: FakeDb, table: string) { this.db = db; this.table = table; }
  select() { return this; }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = [p].flat(); return this; }
  update(p: Row) { this.op = "update"; this.payload = [p]; return this; }
  upsert(p: Row | Row[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert"; this.payload = [p].flat();
    this.conflict = o.onConflict?.split(",") ?? [this.table.endsWith("_lookups") ? "query_key" : "id"];
    this.ignoreDuplicates = !!o.ignoreDuplicates;
    return this;
  }
  eq(c: string, v: unknown) { this.filters.push(["eq", c, v]); return this; }
  neq(c: string, v: unknown) { this.filters.push(["neq", c, v]); return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  then<T>(ok: (r: { data: any; error: any }) => T, bad?: (e: unknown) => T) { return Promise.resolve(this.run()).then(ok, bad); }

  private run() {
    const rows = (this.db.tables[this.table] ??= []);
    const match = (r: Row) => this.filters.every(([op, c, v]) => (op === "eq" ? r[c] === v : r[c] !== v));
    let data: Row[];
    if (this.op === "select") data = rows.filter(match);
    else if (this.op === "update") data = rows.filter(match).map((r) => Object.assign(r, this.payload[0]));
    else {
      data = [];
      for (const p of this.payload) {
        const found = this.op === "upsert" ? rows.find((r) => this.conflict.every((c) => r[c] === p[c])) : undefined;
        if (found) { if (!this.ignoreDuplicates) data.push(Object.assign(found, p)); continue; }
        const r = { id: crypto.randomUUID(), ...p };
        rows.push(r);
        data.push(r);
      }
    }
    if (this.op !== "select") this.db.writes.push({ table: this.table, op: this.op, rows: structuredClone(data) });
    if (this.mode === "many") return { data, error: null };
    if (this.mode === "maybe") return { data: data[0] ?? null, error: null };
    return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: "not found" } };
  }
}

const A = "00000000-0000-4000-8000-00000000000a";
const LA = "00000000-0000-4000-8000-0000000001a0";
const LA2 = "00000000-0000-4000-8000-0000000001a2";
const MISSING = "00000000-0000-4000-8000-0000000001ff";
const TOKENS = { "token-a": A, "token-b": VICTIM.user_id };

/** A and B each have a pending link; B already has a category, list and item. */
function world() {
  return new FakeDb({
    links: [
      { id: LA, user_id: A, url: "https://www.instagram.com/p/AAA/", status: "pending", raw_content: null, error: null },
      { id: LA2, user_id: A, url: "https://www.instagram.com/p/AA2/", status: "pending", raw_content: null, error: null },
      { id: VICTIM.link_id, user_id: VICTIM.user_id, url: "https://www.instagram.com/p/BBB/", status: "pending", raw_content: { caption: "B secret" }, error: null },
    ],
    categories: [{ id: VICTIM.category_id, user_id: VICTIM.user_id, kind: "eats", name: "Restaurants" }],
    lists: [{ id: VICTIM.list_id, user_id: VICTIM.user_id, category_id: VICTIM.category_id, name: "Austin", tags: [] }],
    items: [{ id: "b-item", user_id: VICTIM.user_id, list_id: VICTIM.list_id, link_id: VICTIM.link_id, name: "Taco Uno" }],
  }, TOKENS);
}

/** fetch that answers the model call and the given pages, and records every URL asked for. */
function mockFetch(model: unknown, pages: Record<string, string> = {}) {
  const urls: string[] = [];
  const prompts: { system: string; user: string }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    if (url === "https://api.anthropic.com/v1/messages") {
      const b = JSON.parse(String(init?.body));
      prompts.push({ system: b.system, user: b.messages[0].content });
      const text = typeof model === "string" ? model : JSON.stringify(model);
      return new Response(JSON.stringify({ content: [{ type: "text", text }] }));
    }
    if (pages[url]) return new Response(pages[url], { headers: { "content-type": "text/html" } });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fn, urls, prompts };
}

const ENV: Record<string, string> = { ANTHROPIC_API_KEY: "k", WEB_SEARCH_ENABLED: "false", LINK_FETCH_ENABLED: "false" };
const env = (k: string) => ENV[k];
const call = (db: FakeDb, body: unknown, token?: string, fetchFn = mockFetch({ kind: "do", category: "x", tags: [], items: [] }).fn) =>
  handle(new Request("http://local/process-link", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), { db: db as never, env, fetchFn });

const captured = { caption: "Taco Uno in Austin" };

// ---------- link_id ownership ----------
{
  // Malformed link_id never reaches a query.
  for (const body of [{}, { link_id: "" }, { link_id: "abc" }, { link_id: { neq: "x" } }, { link_id: [LA] }, { link_id: `${LA},id.neq.0` }, "not json"]) {
    const db = world();
    const r = await call(db, body, "token-a");
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(db.writes.length, 0);
  }

  // Another user's link_id looks exactly like a missing one, and nothing runs: no claim, no writes, no fetch, no model.
  const missing = await call(world(), { link_id: MISSING, captured }, "token-a");
  for (const [token, label] of [["token-a", "other user"], [undefined, "no session"], ["anon-key", "anon key"], ["", "empty bearer"]] as const) {
    const db = world();
    const f = mockFetch({});
    const r = await call(db, { link_id: VICTIM.link_id, captured }, token, f.fn);
    assert.equal(r.status, 404, label);
    assert.deepEqual(await r.json(), await missing.clone().json(), label);
    assert.equal(db.writes.length, 0, `${label}: no writes`);
    assert.equal(f.urls.length, 0, `${label}: no outbound calls`);
    assert.deepEqual(db.tables.links.find((l) => l.id === VICTIM.link_id), world().tables.links[2], `${label}: victim link untouched`);
  }

  // A link that is mid-run answers 404 to a stranger, not 409: the status of other users' links does not leak.
  {
    const db = world();
    db.tables.links[2].status = "processing";
    assert.equal((await call(db, { link_id: VICTIM.link_id, captured }, "token-a")).status, 404);
  }

  // Sanity: the owner's own call goes through, and the items land in the owner's rows.
  {
    const db = world();
    const f = mockFetch({ kind: "eats", category: "Restaurants", list_scope: "Austin", tags: [], items: [{ name: "Taco Uno", description: "" }] });
    const r = await call(db, { link_id: VICTIM.link_id, captured }, "token-b", f.fn);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).status, "done");
  }
}

// ---------- prompt injection: what a fooled model returns stays inside the caller's own link ----------
const KNOWN_ERRORS = /^(bad_output|no_json|no_captured_text|url_not_allowed|anthropic_\d{3})$/;
for (const fx of FIXTURES) {
  const db = world();
  const before = structuredClone(db.tables);
  const f = mockFetch(fx.model, fx.pages);
  const r = await call(db, { link_id: LA, captured: fx.captured }, "token-a", f.fn);
  const body = await r.json();
  const link = db.tables.links.find((l) => l.id === LA)!;
  const msg = (s: string) => `${fx.name}: ${s}`;

  assert.equal(link.status, fx.status, msg(`status (${JSON.stringify(body)})`));

  // Only the model and the post's own public pages were contacted.
  for (const u of f.urls) assert.ok(u === "https://api.anthropic.com/v1/messages" || fx.pages?.[u], msg(`unexpected fetch ${u}`));

  // The untrusted text cannot close its wrapper: exactly one </post>, one </linked_site> per page read.
  for (const p of f.prompts) {
    assert.match(p.system, /UNTRUSTED DATA/, msg("system prompt marks the data as untrusted"));
    assert.equal(p.user.match(/<\s*\/\s*post\s*>/gi)?.length, 1, msg("one </post>"));
    assert.equal(p.user.match(/<\s*\/\s*linked_site\s*>/gi)?.length ?? 0, p.user.match(/<linked_site /g)?.length ?? 0, msg("one </linked_site> per site"));
    assert.ok(p.user.trimStart().startsWith("<post>"), msg("prompt starts with <post>"));
  }

  // Every row written belongs to A and cites A's link; B's rows are exactly as they were.
  for (const w of db.writes) {
    for (const row of w.rows) {
      if ("user_id" in row) assert.equal(row.user_id, A, msg(`${w.table} ${w.op} user_id`));
      if (w.op === "rpc") assert.deepEqual([row.p_user, row.p_link], [A, LA], msg("quota charged to A's link"));
      if (w.table === "items") assert.equal(row.link_id, LA, msg("item link_id"));
      if (w.table === "links" || w.table === "process_events") assert.equal(row.link_id ?? row.id, LA, msg(`${w.table} row`));
    }
  }
  for (const t of ["categories", "lists", "items"]) {
    assert.deepEqual(db.tables[t].filter((r) => r.user_id === VICTIM.user_id), before[t].filter((r) => r.user_id === VICTIM.user_id), msg(`B's ${t} untouched`));
  }
  assert.deepEqual(db.tables.links.filter((l) => l.id !== LA), before.links.filter((l) => l.id !== LA), msg("other links untouched"));
  const aLists = db.tables.lists.filter((l) => l.user_id === A).map((l) => l.id);
  const saved = db.tables.items.filter((i) => i.user_id === A);
  for (const i of saved) assert.ok(aLists.includes(i.list_id), msg("item is in one of A's lists"));

  // Only names the post really contains are saved; model coordinates and invented details are not.
  assert.deepEqual(saved.map((i) => i.name).sort(), [...fx.kept].sort(), msg("saved items"));
  for (const i of saved) {
    assert.equal(i.lat ?? null, null, msg("no model coordinates"));
    assert.ok(i.address == null || JSON.stringify(fx.captured).includes(String(i.address)), msg("address only from the text"));
  }
  assert.ok(((link.tags as string[] | undefined) ?? []).length <= 8, msg("tags capped"));

  // The model's words never become an error message the app shows.
  if (fx.status === "failed") {
    assert.match(String(link.error), KNOWN_ERRORS, msg(`error is a fixed code, got ${link.error}`));
    assert.match(String(body.error), KNOWN_ERRORS, msg("response error is a fixed code"));
    assert.equal(db.writes.filter((w) => ["categories", "lists", "items"].includes(w.table)).length, 0, msg("nothing filed"));
  }
  assert.ok(!JSON.stringify(body).includes("evil.example.com"), msg("response carries no injected text"));
}

console.log(`security ok (${FIXTURES.length} injection fixtures)`);

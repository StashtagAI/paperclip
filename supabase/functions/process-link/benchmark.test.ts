// Offline: proves the scorer catches wrong answers. Uses no network and makes no accuracy claim about the model.
// Run: node --experimental-strip-types benchmark.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gate, type Post, scorePost, summarize } from "./benchmark.ts";
import type { Extraction } from "./schema.ts";

const dir = new URL("../../../fixtures/benchmark/", import.meta.url);
const posts: Post[] = JSON.parse(readFileSync(new URL("posts.json", dir), "utf8")).posts;
const th = JSON.parse(readFileSync(new URL("thresholds.json", dir), "utf8"));
const han6: { url: string; captured: unknown }[] = JSON.parse(readFileSync(new URL("../han6-batch1.json", dir), "utf8"));
const by = (id: string) => posts.find((p) => p.id === id)!;

// fixtures are verbatim copies of real captured text, and patterns compile
for (const p of posts) {
  const src = han6.find((h) => h.url === p.url);
  assert.ok(src, `${p.id}: url not in han6-batch1.json`);
  assert.deepEqual(src.captured, p.captured, `${p.id}: captured text drifted from the real post`);
  const e = p.expect;
  for (const pat of [...(e.category_any ?? []), ...(e.list_scope_any ?? []), ...(e.items ?? []).flatMap((i) => [...i.name_any, ...(i.reason_any ?? [])])]) new RegExp(pat, "iu");
  assert.ok(e.empty || e.items?.length, `${p.id}: needs items or empty`);
}

const ex = (items: Extraction["items"], o: Partial<Extraction> = {}): Extraction => ({ kind: "trips", category: "Itineraries", list_scope: "St. Moritz", tags: [], items, ...o });
const it = (name: string, description = "") => ({ name, description });

// empty expected
assert.equal(scorePost(by("steamboat-news"), { unsorted: true }).emptyCorrect, true);
assert.equal(scorePost(by("steamboat-news"), ex([it("Steamboat Springs")])).emptyCorrect, false);

// St. Moritz: partial recall is penalised, forbidden itinerary lines are caught
const sm = by("st-moritz-itinerary");
const full = ex([it("@badruttspalace", "Breakfast, tea and spa"), it("Da Vittorio", "Dinner"), it("@langosteria", "Ski into lunch"), it("La Coupole – Matsuhisa", "Dinner"), it("@paradisostmoritz", "Ski into lunch"), it("Le Grand Hall", "Dinner"), it("The Renaissance Bar", "Drinks")]);
const sFull = scorePost(sm, full);
assert.equal(sFull.recall, 1);
assert.deepEqual(sFull.failures, []);
const sPart = scorePost(sm, ex([it("@badruttspalace", "stay"), it("Private helicopter transfer", "Day 1")]));
assert.ok(sPart.recall! < 0.2 && sPart.forbidden.length === 1 && sPart.failures.length > 0);
assert.equal(scorePost(sm, ex(full.items, { list_scope: "Switzerland" })).scopeOk, false);
assert.equal(scorePost(sm, ex(full.items, { kind: "eats" })).kindOk, false);

// invented address: capture-sourced address must be in the text; stated one passes
const tea = by("sereni-tea-giveaway");
const ok = scorePost(tea, ex([{ name: "@sereniteaspaco", description: "Chinese tea and spa", address: "9447 Park Meadows Ave, Lone Tree, CO", sources: { address: "capture" } }], { kind: "eats", category: "Tea houses", list_scope: "Lone Tree" }));
assert.deepEqual(ok.failures, []);
const bad = scorePost(tea, ex([{ name: "@sereniteaspaco", description: "tea", address: "1 Made Up Rd", sources: { address: "capture" } }], { kind: "eats", category: "Tea", list_scope: "Colorado" }));
assert.equal(bad.invented.length, 1);
assert.ok(bad.failures.length >= 2); // invented + missing the stated address

// recipe needs its ingredients
const tr = by("pumpkin-truffles");
assert.ok(scorePost(tr, ex([{ ...it("Pumpkin truffles"), ingredients: ["dates"] }], { kind: "recipes", category: "Recipes" })).failures.some((f) => f.includes("ingredients")));

// summary + gate
const good = summarize([sFull, scorePost(by("steamboat-news"), { unsorted: true })]);
assert.deepEqual(gate(good, th), []);
const worse = summarize([sPart, scorePost(by("steamboat-news"), ex([it("X")]))]);
assert.ok(gate(worse, th).length >= 3);
console.log("benchmark scorer tests passed");

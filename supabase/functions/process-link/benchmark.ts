import type { Extraction } from "./schema.ts";

/** Expected result for one real post. Written by hand from the post's own text; patterns are lowercase regex sources. */
export interface Expect {
  empty?: boolean;
  kind?: string;
  category_any?: string[];
  list_scope_any?: string[];
  items?: { name_any: string[]; reason_any?: string[]; address_contains?: string; min_ingredients?: number }[];
  forbid_names?: string[];
  min_recall?: number;
}
export interface Post { id: string; url: string; captured: Record<string, string>; expect: Expect }

export interface PostScore {
  id: string;
  expectedEmpty: boolean;
  emptyCorrect: boolean | null;
  recall: number | null;
  /** items returned that match no expected item */
  extras: string[];
  forbidden: string[];
  /** capture-sourced addresses that do not appear in the captured text */
  invented: string[];
  kindOk: boolean | null;
  categoryOk: boolean | null;
  scopeOk: boolean | null;
  /** of matched items that have a reason expectation: how many carry it (null if none to check) */
  reasonOk: number | null;
  reasonTotal: number;
  failures: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const any = (pats: string[] | undefined, s: string) => !pats?.length || pats.some((p) => new RegExp(p, "iu").test(s));

export function scorePost(p: Post, ex: Extraction | { unsorted: true }): PostScore {
  const e = p.expect;
  const items = "items" in ex ? ex.items : [];
  const capture = norm(Object.values(p.captured).join(" "));
  const s: PostScore = {
    id: p.id, expectedEmpty: !!e.empty, emptyCorrect: null, recall: null, extras: [], forbidden: [], invented: [],
    kindOk: null, categoryOk: null, scopeOk: null, reasonOk: null, reasonTotal: 0, failures: [],
  };
  for (const it of items) {
    if (it.address && it.sources?.address === "capture" && !capture.includes(norm(it.address))) s.invented.push(`${it.name}: ${it.address}`);
    if (e.forbid_names?.some((f) => norm(it.name).includes(norm(f)))) s.forbidden.push(it.name);
  }
  if (s.invented.length) s.failures.push(`address not in captured text: ${s.invented.join("; ")}`);
  if (s.forbidden.length) s.failures.push(`forbidden item: ${s.forbidden.join(", ")}`);
  if (e.empty) {
    s.emptyCorrect = items.length === 0;
    s.extras = items.map((i) => i.name);
    if (!s.emptyCorrect) s.failures.push(`expected no items, got ${items.length}: ${s.extras.join(", ")}`);
    return s;
  }
  if (!("items" in ex)) {
    s.recall = 0;
    s.failures.push("no items returned");
    return s;
  }
  const want = e.items ?? [];
  const used = new Set<number>();
  let hit = 0, reasonOk = 0;
  for (const w of want) {
    const idx = items.findIndex((it, i) => !used.has(i) && any(w.name_any, it.name));
    if (idx < 0) { s.failures.push(`missing item ~ ${w.name_any.join("|")}`); continue; }
    used.add(idx);
    hit++;
    const it = items[idx];
    if (w.reason_any?.length) {
      s.reasonTotal++;
      if (any(w.reason_any, it.description)) reasonOk++;
      else s.failures.push(`reason for "${it.name}" lacks ${w.reason_any.join("|")}: "${it.description}"`);
    }
    if (w.address_contains && !norm(it.address ?? "").includes(norm(w.address_contains))) s.failures.push(`address of "${it.name}" lacks "${w.address_contains}"`);
    if (w.min_ingredients && (it.ingredients?.length ?? 0) < w.min_ingredients) s.failures.push(`"${it.name}" has ${it.ingredients?.length ?? 0} ingredients, wanted ${w.min_ingredients}`);
  }
  s.recall = want.length ? hit / want.length : 1;
  s.reasonOk = s.reasonTotal ? reasonOk : null;
  s.extras = items.filter((_, i) => !used.has(i)).map((i) => i.name);
  if (e.min_recall != null && s.recall < e.min_recall) s.failures.push(`recall ${s.recall.toFixed(2)} < ${e.min_recall}`);
  const x = ex as Extraction;
  if (e.kind) { s.kindOk = x.kind === e.kind; if (!s.kindOk) s.failures.push(`kind ${x.kind}, wanted ${e.kind}`); }
  if (e.category_any) { s.categoryOk = any(e.category_any, x.category); if (!s.categoryOk) s.failures.push(`category "${x.category}" matches none of ${e.category_any.join("|")}`); }
  if (e.list_scope_any) { s.scopeOk = any(e.list_scope_any, x.list_scope ?? ""); if (!s.scopeOk) s.failures.push(`list_scope "${x.list_scope}" matches none of ${e.list_scope_any.join("|")}`); }
  return s;
}

export interface Summary {
  posts: number;
  item_recall: number;
  empty_correct: number;
  forbidden_items: number;
  invented_addresses: number;
  category_pass: number;
  scope_pass: number;
  reason_pass: number;
}
const frac = (xs: (boolean | null)[]) => { const v = xs.filter((x) => x !== null); return v.length ? v.filter(Boolean).length / v.length : 1; };

export function summarize(scores: PostScore[]): Summary {
  const rec = scores.filter((s) => s.recall !== null);
  const reasonTotal = scores.reduce((a, s) => a + s.reasonTotal, 0);
  return {
    posts: scores.length,
    item_recall: rec.length ? rec.reduce((a, s) => a + s.recall!, 0) / rec.length : 1,
    empty_correct: frac(scores.map((s) => s.emptyCorrect)),
    forbidden_items: scores.reduce((a, s) => a + s.forbidden.length, 0),
    invented_addresses: scores.reduce((a, s) => a + s.invented.length, 0),
    category_pass: frac(scores.map((s) => s.categoryOk)),
    scope_pass: frac(scores.map((s) => s.scopeOk)),
    reason_pass: reasonTotal ? scores.reduce((a, s) => a + (s.reasonOk ?? 0), 0) / reasonTotal : 1,
  };
}

/** Lower-is-better metrics are the two counts; everything else must be >= its threshold. */
export function gate(sum: Summary, th: Record<string, number | string>): string[] {
  const out: string[] = [];
  for (const k of ["forbidden_items", "invented_addresses"] as const) if (sum[k] > Number(th[k])) out.push(`${k} ${sum[k]} > ${th[k]}`);
  for (const k of ["item_recall", "empty_correct", "category_pass", "scope_pass", "reason_pass"] as const) if (sum[k] < Number(th[k])) out.push(`${k} ${sum[k].toFixed(2)} < ${th[k]}`);
  return out;
}

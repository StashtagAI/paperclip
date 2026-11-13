// Live benchmark: real captured text -> real Claude call through the production extract()+ground() path.
// Run: ANTHROPIC_API_KEY=... node --experimental-strip-types benchmark-run.ts [--runs N] [--out file.json] [--no-gate]
// Lookup and web search are stubbed, so this measures extraction (items, category, scope, reason, grounding), not geocoding.
import { readFileSync, writeFileSync } from "node:fs";
import { processCaptured } from "./pipeline.ts";
import { MODEL } from "./extract.ts";
import { gate, type Post, scorePost, summarize } from "./benchmark.ts";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("ANTHROPIC_API_KEY is not set; the live benchmark cannot run."); process.exit(2); }
const runs = Number(arg("--runs") ?? 1);
const dir = new URL("../../../fixtures/benchmark/", import.meta.url);
const posts: Post[] = JSON.parse(readFileSync(new URL("posts.json", dir), "utf8")).posts;
const th = JSON.parse(readFileSync(new URL("thresholds.json", dir), "utf8"));

let inTok = 0, outTok = 0, calls = 0;
const counting: typeof fetch = async (u, init) => {
  const res = await fetch(u, init);
  if (String(u).startsWith("https://api.anthropic.com/")) {
    calls++;
    const j = await res.clone().json().catch(() => null);
    inTok += j?.usage?.input_tokens ?? 0;
    outTok += j?.usage?.output_tokens ?? 0;
  }
  return res;
};

const all = [];
for (let r = 0; r < runs; r++) {
  const scores = [];
  for (const p of posts) {
    const res = await processCaptured(p.url, p.captured, { apiKey, fetchFn: counting }).catch((e) => ({ ok: false as const, error: String(e.message ?? e) }));
    if (!res.ok) { scores.push({ ...scorePost(p, { unsorted: true }), failures: [`pipeline error: ${res.error}`], recall: p.expect.empty ? null : 0, emptyCorrect: p.expect.empty ? false : null }); continue; }
    scores.push(scorePost(p, "extraction" in res ? res.extraction : { unsorted: true }));
  }
  all.push(scores);
  const sum = summarize(scores);
  console.log(`\n== run ${r + 1}/${runs} (${MODEL}) ==`);
  for (const s of scores) console.log(`${s.failures.length ? "FAIL" : "ok  "} ${s.id}${s.failures.map((f) => `\n       - ${f}`).join("")}${s.extras.length && !s.expectedEmpty ? `\n       extras: ${s.extras.join(", ")}` : ""}`);
  console.log(JSON.stringify(sum));
}
const sums = all.map(summarize);
const worst = (k: keyof typeof sums[0]) => Math[k === "forbidden_items" || k === "invented_addresses" ? "max" : "min"](...sums.map((s) => Number(s[k])));
const worstSum = Object.fromEntries(Object.keys(sums[0]).map((k) => [k, worst(k as never)])) as unknown as ReturnType<typeof summarize>;
// pricing is not hard-coded: pass per-million-token prices to get a dollar figure
const pin = Number(process.env.PRICE_IN_PER_MTOK), pout = Number(process.env.PRICE_OUT_PER_MTOK);
const cost = pin && pout ? (inTok * pin + outTok * pout) / 1e6 : null;
const report = { model: MODEL, runs, posts: posts.length, calls, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, worst_of_runs: worstSum, per_run: sums, details: all };
if (arg("--out")) writeFileSync(arg("--out")!, JSON.stringify(report, null, 1));
console.log(`\nworst of ${runs} run(s): ${JSON.stringify(worstSum)}\ncalls=${calls} tokens in=${inTok} out=${outTok}${cost != null ? ` cost=$${cost.toFixed(4)}` : " (set PRICE_IN_PER_MTOK/PRICE_OUT_PER_MTOK for $)"}`);
const failed = gate(worstSum, th);
if (failed.length) { console.log(`GATE FAILED:\n - ${failed.join("\n - ")}`); if (!process.argv.includes("--no-gate")) process.exit(1); } else console.log("gate passed");

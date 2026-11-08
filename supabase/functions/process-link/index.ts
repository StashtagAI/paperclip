// Supabase Edge Function. POST {link_id, captured:{caption?,transcript?,ocr?}} (text captured on the phone).
// The server never fetches the Instagram/TikTok post (HAN-11).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processCaptured } from "./pipeline.ts";
import { parseAllowedUrl } from "./url.ts";
import { lookupFromEnv } from "./lookup.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  const { link_id, captured } = await req.json().catch(() => ({}));
  if (!link_id) return json({ error: "link_id required" }, 400);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: link, error: le } = await db.from("links").select("id,url,user_id").eq("id", link_id).single();
  if (le || !link) return json({ error: "link not found" }, 404);

  const fail = async (code: string) => {
    await db.from("links").update({ status: "failed", error: code }).eq("id", link_id);
    return json({ status: "failed", error: code });
  };

  // Server-side re-validation: never trust the client check.
  if (!parseAllowedUrl(link.url)) return await fail("url_not_allowed");
  await db.from("links").update({ status: "processing", error: null }).eq("id", link_id);

  try {
    const r = await processCaptured(link.url, captured, { apiKey: Deno.env.get("ANTHROPIC_API_KEY")!, lookup: lookupFromEnv((k) => Deno.env.get(k)) });
    if (!r.ok) return await fail(r.error);
    const ex = r.extraction;

    const { data: cat, error: ce } = await db.from("categories")
      .upsert({ user_id: link.user_id, kind: ex.kind, name: ex.category }, { onConflict: "user_id,kind,name" })
      .select("id").single();
    if (ce) throw ce;
    const { data: list, error: lie } = await db.from("lists")
      .upsert({ user_id: link.user_id, category_id: cat.id, name: ex.list_scope ?? ex.category, tags: ex.tags },
        { onConflict: "user_id,category_id,name" })
      .select("id").single();
    if (lie) throw lie;
    const { error: ie } = await db.from("items").upsert(
      ex.items.map(({ name, description, address, lat, lng }) => ({ name, description, address, lat, lng, list_id: list.id, link_id, user_id: link.user_id })),
      { onConflict: "list_id,name" },
    );
    if (ie) throw ie;
    await db.from("links").update({
      status: "done",
      error: null,
      tags: ex.tags,
      raw_content: r.raw_content,
      processed_at: new Date().toISOString(),
    }).eq("id", link_id);
    return json({ status: "done", items: ex.items.length });
  } catch (e) {
    return await fail(String((e as Error).message ?? e).slice(0, 200));
  }
});

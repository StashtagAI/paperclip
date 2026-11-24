// Supabase Edge Function. POST with the user's session (HAN-131).
//   {action: "buy", item_id}  → {links: [{merchant, label, url, affiliate}]}: store searches for one of the caller's Shop
//                                items, with the Amazon tag or the Sovrn/Skimlinks wrapper when those secrets are set.
//   {action: "instacart", title, kind: "shopping_list"|"recipe", lines: [{name, display_text?, quantity?, unit?}],
//    instructions?}            → {url}: an Instacart Developer Platform shoppable page. 503 until INSTACART_API_KEY is set.
// Affiliate IDs live only in the function's secrets, so they can change without an app release.
import { createClient } from "@supabase/supabase-js";
import { handle } from "./handler.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

Deno.serve((req) =>
  handle(req, {
    db: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    env: (k) => Deno.env.get(k),
  }));

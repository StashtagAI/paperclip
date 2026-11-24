// Supabase Edge Function (HAN-128). See handler.ts. Secrets: CLOUDFLARE_ANALYTICS_TOKEN, CLOUDFLARE_ACCOUNT_ID.
// Deploy: supabase functions deploy admin-web-traffic
import { createClient } from "@supabase/supabase-js";
import { handle } from "./handler.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

// is_admin() reads auth.uid(), so it has to run as the caller, not the service role.
async function isAdmin(token: string): Promise<boolean> {
  const asUser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await asUser.rpc("is_admin");
  if (error) throw new Error(error.message);
  return data === true;
}

Deno.serve((req) => handle(req, { env: (k) => Deno.env.get(k), isAdmin }));

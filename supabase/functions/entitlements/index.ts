// Supabase Edge Function (HAN-132). See handler.ts. Secrets: REVENUECAT_SECRET_KEY, REVENUECAT_WEBHOOK_SECRET,
// optional REVENUECAT_ALLOW_SANDBOX. Deploy: supabase functions deploy entitlements --no-verify-jwt
import { createClient } from "@supabase/supabase-js";
import { handle } from "./handler.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) => handle(req, { db, env: (k) => Deno.env.get(k) }));

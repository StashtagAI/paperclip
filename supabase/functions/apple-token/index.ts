// Supabase Edge Function (HAN-112). See handler.ts. Secrets: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY,
// APPLE_BUNDLE_ID, APPLE_SERVICES_ID (the same ones delete-account uses to revoke).
import { createClient } from "@supabase/supabase-js";
import { handle } from "./handler.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) => handle(req, { db, env: (k) => Deno.env.get(k) }));

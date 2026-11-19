// Supabase Edge Function. POST from the landing page's waitlist form, with no session (HAN-100).
// The only way into public.waitlist_signups: validates and lowercases the email, drops honeypot submissions, and
// calls waitlist_signup() with the service role, which rate-limits per IP and ignores repeat addresses.
// A plain HTML form can't send an Authorization header, so deploy with JWT verification off:
//   supabase functions deploy waitlist --no-verify-jwt
import { createClient } from "@supabase/supabase-js";
import { handle } from "./handler.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) => handle(req, { db, env: (k) => Deno.env.get(k) }));

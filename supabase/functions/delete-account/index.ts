// Supabase Edge Function. POST {confirm: "DELETE"} with the user's session (HAN-34).
// Permanently deletes the caller's account, as described in legal/data-deletion.md: every row they own, their storage
// objects, then the auth user. Uses the service role, which never leaves the server. Safe to retry: each step only
// deletes what is left.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

// The web app calls this cross-origin.
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

// Children before parents, so nothing is left behind if a foreign key's cascade ever changes.
const TABLES = ["feedback", "link_feedback", "process_events", "items", "lists", "categories", "links"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const { confirm } = await req.json().catch(() => ({}));
  // The app asks twice and makes the user type DELETE; this stops a stray call from deleting anything.
  if (confirm !== "DELETE") return json({ error: "confirmation required" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // verify_jwt also accepts the anon key, so resolve the actual user from the token.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  const userId = auth?.user?.id;
  if (!userId) return json({ error: "not signed in" }, 401);

  const fail = (step: string, message: string) => {
    console.error("[delete-account]", step, message);
    return json({ error: `Couldn’t finish deleting your ${step}. Please try again.` }, 500);
  };

  for (const table of TABLES) {
    const { error } = await db.from(table).delete().eq("user_id", userId);
    if (error) return fail("data", `${table}: ${error.message}`);
  }

  const { data: objects, error: se } = await db.rpc("user_storage_objects", { p_user_id: userId });
  if (se) return fail("files", se.message);
  const byBucket = new Map<string, string[]>();
  for (const o of (objects ?? []) as { bucket_id: string; name: string }[]) {
    byBucket.set(o.bucket_id, [...(byBucket.get(o.bucket_id) ?? []), o.name]);
  }
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += 100) {
      const { error } = await db.storage.from(bucket).remove(names.slice(i, i + 100));
      if (error) return fail("files", `${bucket}: ${error.message}`);
    }
  }

  // Hard delete (shouldSoftDelete = false): the email and identities go too.
  const { error: ae } = await db.auth.admin.deleteUser(userId, false);
  if (ae) return fail("account", ae.message);

  return json({ deleted: true });
});

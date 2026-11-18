// Supabase Edge Function. POST {list_id} with the user's session (HAN-83).
// Fills in the Google rating and opening hours for the restaurants on one of the caller's Eats lists: items never
// looked up, or last looked up over a week ago. The app calls it when the list opens and reloads if anything changed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handle } from "./handler.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

Deno.serve((req) =>
  handle(req, {
    db: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    env: (k) => Deno.env.get(k),
  }));

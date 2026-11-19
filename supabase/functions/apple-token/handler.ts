// HAN-112: stores the caller's Sign in with Apple refresh token so delete-account can revoke it with Apple.
// POST with the user's session and one of:
//   {authorizationCode} from native iOS sign-in (issued to the App ID), exchanged here for a refresh token, or
//   {refreshToken} from the web/Android OAuth flow (issued to the Services ID), checked with Apple before it's kept.
// Either way Apple must say the token belongs to the Apple account linked to the caller, so nobody can file a token
// under someone else's account. The token is never sent back.
import { appleConfig, appleRefreshToken } from "../_shared/apple.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
export type Deps = { db: Db; env: (k: string) => string | undefined; fetchFn?: typeof fetch };

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

type Identity = { provider: string; id?: string; identity_data?: { sub?: string } };

export async function handle(req: Request, { db, env, fetchFn = fetch }: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const code = typeof body?.authorizationCode === "string" ? body.authorizationCode : null;
  const refresh = typeof body?.refreshToken === "string" ? body.refreshToken : null;
  if (!code === !refresh || (code ?? refresh)!.length > 2048) return json({ error: "authorizationCode or refreshToken required" }, 400);

  const config = appleConfig(env);
  // Until the board adds the Apple key to the function secrets, sign-in still works; there is just nothing to revoke.
  if (!config) return json({ error: "not configured" }, 503);

  // verify_jwt also accepts the anon key, so resolve the actual user from the token.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  const user = auth?.user;
  if (!user?.id) return json({ error: "not signed in" }, 401);
  const apple = ((user.identities ?? []) as Identity[]).find((i) => i.provider === "apple");
  const appleSub = apple?.identity_data?.sub ?? apple?.id;
  if (!appleSub) return json({ error: "no Apple sign-in on this account" }, 409);

  const clientId = code ? config.clients.bundleId : config.clients.servicesId;
  const result = await appleRefreshToken(config.key, clientId, code ? { code } : { refreshToken: refresh! }, fetchFn);
  if ("error" in result) {
    console.error("[apple-token]", clientId, result.error);
    return json({ error: "Apple didn’t accept the token" }, 400);
  }
  if (result.sub !== appleSub) return json({ error: "token is for another Apple account" }, 403);

  const { error } = await db.from("apple_tokens").upsert(
    { user_id: user.id, client_id: clientId, refresh_token: result.refreshToken, updated_at: new Date().toISOString() },
    { onConflict: "user_id,client_id" },
  );
  if (error) {
    console.error("[apple-token] save", error.message);
    return json({ error: "couldn’t save" }, 500);
  }
  return json({ saved: true });
}

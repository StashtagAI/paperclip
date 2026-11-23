// Sign in with Apple REST API (HAN-112): exchange an authorization code or check a refresh token, and revoke tokens
// when an account is deleted (App Store Review 5.1.1(v)). Used by the apple-token and delete-account functions.
// Plain WebCrypto + fetch, so it runs in Deno and in the Node tests.

const APPLE = "https://appleid.apple.com";

/** From the Apple Developer account. The key is the Sign in with Apple .p8 file's contents (PKCS#8 PEM). */
export type AppleKey = { teamId: string; keyId: string; privateKey: string };

/** The client IDs Apple issues tokens to: the App ID (native iOS sign-in) and the Services ID (web/Android OAuth). */
export type AppleClients = { bundleId: string; servicesId: string };

export function appleConfig(env: (k: string) => string | undefined): { key: AppleKey; clients: AppleClients } | null {
  const teamId = env("APPLE_TEAM_ID");
  const keyId = env("APPLE_KEY_ID");
  // Secrets set from a shell often arrive with literal "\n" instead of line breaks.
  const privateKey = env("APPLE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  const bundleId = env("APPLE_BUNDLE_ID");
  const servicesId = env("APPLE_SERVICES_ID");
  if (!teamId || !keyId || !privateKey || !bundleId || !servicesId) return null;
  return { key: { teamId, keyId, privateKey }, clients: { bundleId, servicesId } };
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

/** Apple's limit on a client secret's lifetime: 6 months. */
export const MAX_SECRET_SECONDS = 15_777_000;

/**
 * The client_secret Apple wants on /auth/token and /auth/revoke: an ES256 JWT signed with our key, valid 5 minutes by
 * default. scripts/apple-client-secret.ts makes the 6-month one Supabase's Apple provider needs for the web flow.
 */
export async function clientSecret(key: AppleKey, clientId: string, now = Date.now(), ttlSeconds = 300): Promise<string> {
  const iat = Math.floor(now / 1000);
  const header = b64urlJson({ alg: "ES256", kid: key.keyId, typ: "JWT" });
  const payload = b64urlJson({ iss: key.teamId, iat, exp: iat + Math.min(ttlSeconds, MAX_SECRET_SECONDS), aud: APPLE, sub: clientId });
  const signingKey = await crypto.subtle.importKey(
    "pkcs8", pemToDer(key.privateKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  // WebCrypto's ECDSA signature is already the raw r||s form JWS needs.
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

/** The claims of a JWT, unverified. Only for tokens we just received from Apple over TLS. */
export function jwtClaims(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part), (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

type TokenReply = { refresh_token?: string; id_token?: string; error?: string };

async function post(fetchFn: typeof fetch, path: string, form: Record<string, string>): Promise<{ ok: boolean; status: number; body: TokenReply }> {
  const res = await fetchFn(`${APPLE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as TokenReply;
  return { ok: res.ok, status: res.status, body };
}

/**
 * Turns a native sign-in's authorization code (single use, 5 minutes) into a refresh token, or checks a refresh token
 * from the OAuth flow. Returns the refresh token and the Apple user ID (`sub`) it belongs to.
 */
export async function appleRefreshToken(
  key: AppleKey,
  clientId: string,
  grant: { code: string } | { refreshToken: string },
  fetchFn: typeof fetch = fetch,
): Promise<{ refreshToken: string; sub: string } | { error: string }> {
  const form: Record<string, string> = { client_id: clientId, client_secret: await clientSecret(key, clientId) };
  if ("code" in grant) Object.assign(form, { grant_type: "authorization_code", code: grant.code });
  else Object.assign(form, { grant_type: "refresh_token", refresh_token: grant.refreshToken });
  const { ok, body } = await post(fetchFn, "/auth/token", form);
  if (!ok) return { error: body.error ?? "apple_token_failed" };
  const refreshToken = "code" in grant ? body.refresh_token : grant.refreshToken;
  const sub = body.id_token ? jwtClaims(body.id_token)?.sub : undefined;
  if (!refreshToken || typeof sub !== "string") return { error: "apple_token_incomplete" };
  return { refreshToken, sub };
}

/** Revokes a refresh token, which also removes the app from the user's "Sign in with Apple" list. */
export async function revokeAppleToken(key: AppleKey, clientId: string, refreshToken: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const { ok } = await post(fetchFn, "/auth/revoke", {
    client_id: clientId,
    client_secret: await clientSecret(key, clientId),
    token: refreshToken,
    token_type_hint: "refresh_token",
  });
  return ok;
}

/**
 * delete-account: revokes every Apple refresh token stored for this account (apple_tokens). Best effort: a failure is
 * logged and deletion carries on, because the user asked for their data to go. Returns how many were revoked.
 */
export async function revokeStoredAppleTokens(
  // deno-lint-ignore no-explicit-any
  db: any,
  env: (k: string) => string | undefined,
  userId: string,
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  const { data, error } = await db.from("apple_tokens").select("client_id, refresh_token").eq("user_id", userId);
  // A missing table (migration not applied yet) means nothing was stored.
  if (error || !data?.length) return 0;
  const config = appleConfig(env);
  if (!config) {
    console.error("[apple] tokens stored but APPLE_* secrets missing; can't revoke");
    return 0;
  }
  let revoked = 0;
  for (const row of data as { client_id: string; refresh_token: string }[]) {
    try {
      if (await revokeAppleToken(config.key, row.client_id, row.refresh_token, fetchFn)) revoked++;
      else console.error("[apple] revoke refused for", row.client_id);
    } catch (e) {
      console.error("[apple] revoke failed for", row.client_id, (e as Error).message);
    }
  }
  return revoked;
}

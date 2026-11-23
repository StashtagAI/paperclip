// HAN-112: prints the client secret for Supabase › Authentication › Providers › Apple › Secret Key (for OAuth).
// Apple caps it at 6 months, so web and Android Sign in with Apple stop working when it expires: rerun this and paste
// the new value before then. The .p8 key never leaves this machine.
// Usage: node --experimental-strip-types scripts/apple-client-secret.ts <TEAM_ID> <KEY_ID> <path/to/AuthKey_XXXX.p8> [services id]
import { readFileSync } from "node:fs";
import { clientSecret, MAX_SECRET_SECONDS } from "../supabase/functions/_shared/apple.ts";

const [teamId, keyId, p8, servicesId = "ai.stashtag.web"] = process.argv.slice(2);
if (!teamId || !keyId || !p8) {
  console.error("Usage: node --experimental-strip-types scripts/apple-client-secret.ts <TEAM_ID> <KEY_ID> <AuthKey.p8> [services id]");
  process.exit(1);
}
const now = Date.now();
const secret = await clientSecret({ teamId, keyId, privateKey: readFileSync(p8, "utf8") }, servicesId, now, MAX_SECRET_SECONDS);
console.log(secret);
console.error(`Expires ${new Date(now + MAX_SECRET_SECONDS * 1000).toISOString().slice(0, 10)}. Renew it before then.`);

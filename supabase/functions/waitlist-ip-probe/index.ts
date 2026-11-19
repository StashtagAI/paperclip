// HAN-106, TEMPORARY: shows which client-IP headers the hosted Supabase gateway hands to an edge function, and whether
// a value the client sends survives. Deploy, curl with and without spoofed headers, then delete the function and this
// folder. It only echoes the caller's own request headers (never auth/apikey/cookie values) and touches nothing else.
//   supabase functions deploy waitlist-ip-probe --no-verify-jwt
//   supabase functions delete waitlist-ip-probe
declare const Deno: { serve(h: (r: Request) => Response): void };

const IP_HEADERS = [
  "x-forwarded-for", "x-real-ip", "cf-connecting-ip", "true-client-ip", "x-client-ip", "forwarded",
  "x-envoy-external-address", "x-original-forwarded-for", "fly-client-ip", "cf-connecting-ipv6",
];
const SECRET = /^(authorization|apikey|cookie|x-client-info)$/i;

Deno.serve((req) => {
  const ip: Record<string, string | null> = {};
  for (const h of IP_HEADERS) ip[h] = req.headers.get(h);
  const names = [...req.headers.keys()].filter((h) => !SECRET.test(h)).sort();
  return new Response(JSON.stringify({ ip, names }, null, 2), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
});

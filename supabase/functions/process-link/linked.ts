// Linked-site reader: follows URLs found in captured text and reads schema.org Recipe/Restaurant/Place data.
// Instagram/TikTok hosts are never fetched here. Fetching arbitrary public sites is SSRF-sensitive, so:
// https only, no IP literals / internal names / odd ports, manual redirects re-checked per hop, size and time caps.
export interface LinkedData {
  url: string;
  type: string;
  name?: string;
  description?: string;
  address?: string;
  lat?: number;
  lng?: number;
  ingredients?: string[];
  steps?: string[];
}

const SOCIAL = /(^|\.)(instagram|tiktok|facebook|fb)\.(com|me|watch)$/i;
const TYPES = new Set(["Recipe", "Restaurant", "CafeOrCoffeeShop", "BarOrPub", "Bakery", "FoodEstablishment", "Place", "LocalBusiness", "TouristAttraction", "Park", "Museum"]);
const MAX_BYTES = 1_000_000, MAX_HOPS = 3, MAX_URLS = 3, TIMEOUT_MS = 5000;

export function safePublicUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  if (!h.includes(".") || h.startsWith("[") || /^[\d.]+$/.test(h)) return null; // IP literals, bare names
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(h)) return null;
  if (SOCIAL.test(h)) return null;
  return u;
}

/** True for loopback, private, link-local (incl. cloud metadata), CGNAT, multicast, reserved and unique-local addresses. */
export function isPrivateIp(ip: string): boolean {
  const v = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const v4 = v.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && Number(v4[3]) === 0))) || (a === 198 && (b === 18 || b === 19));
  }
  if (!v.includes(":")) return true; // not an address we can classify: refuse
  // IPv4-mapped in hex form (::ffff:7f00:1) and anything else we cannot parse falls through to the prefix checks below.
  const mapped = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    const hi = parseInt(mapped[1], 16), lo = parseInt(mapped[2], 16);
    return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (v === "::" || v === "::1") return true;
  const first = parseInt(v.split(":")[0] || "0", 16);
  return (first & 0xfe00) === 0xfc00 || // fc00::/7 unique-local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xffc0) === 0xfec0 || // fec0::/10 site-local (deprecated)
    (first & 0xff00) === 0xff00 || // multicast
    first === 0x2001 && /^2001:(0)?:/.test(v) || // Teredo
    first === 0x2002 || // 6to4 can embed private v4 addresses
    first === 0x64 && v.startsWith("64:ff9b:"); // NAT64
}

export type ResolveFn = (host: string) => Promise<string[]>;

/** A, then AAAA. Fails closed: no Deno resolver or a lookup error means the host is not fetched. */
const defaultResolve: ResolveFn = async (host) => {
  const d = (globalThis as { Deno?: { resolveDns(h: string, t: "A" | "AAAA"): Promise<string[]> } }).Deno;
  if (!d?.resolveDns) throw new Error("no_resolver");
  const [a, aaaa] = await Promise.allSettled([d.resolveDns(host, "A"), d.resolveDns(host, "AAAA")]);
  const ips = [...(a.status === "fulfilled" ? a.value : []), ...(aaaa.status === "fulfilled" ? aaaa.value : [])];
  if (!ips.length) throw new Error("no_address");
  return ips;
};

/** safePublicUrl plus DNS: every address the name resolves to must be public. Re-run on every redirect hop. */
export async function resolvesPublic(u: URL, resolve: ResolveFn = defaultResolve): Promise<boolean> {
  try {
    const ips = await resolve(u.hostname);
    return ips.length > 0 && ips.every((ip) => !isPrivateIp(ip));
  } catch { return false; }
}

export function findUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  const out: string[] = [];
  for (const f of found) {
    const u = safePublicUrl(f.replace(/[.,;!?]+$/, ""));
    if (u && !out.includes(u.toString())) out.push(u.toString());
  }
  return out.slice(0, MAX_URLS);
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const dec = new TextDecoder();
  let s = "", n = 0;
  while (n < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    s += dec.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return s;
}

const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const txt = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : undefined);

function walk(node: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, out));
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if (asArr(o["@type"]).some((t) => typeof t === "string" && TYPES.has(t))) out.push(o);
  walk(o["@graph"], out);
}

function steps(v: unknown): string[] {
  return asArr(v).flatMap((s) =>
    typeof s === "string" ? [s] : s && typeof s === "object"
      ? (txt((s as Record<string, unknown>).text) ? [(s as Record<string, string>).text] : steps((s as Record<string, unknown>).itemListElement))
      : []
  ).map((s) => s.trim().slice(0, 500)).filter(Boolean).slice(0, 60);
}

export function parseJsonLd(html: string, url: string): LinkedData[] {
  const out: LinkedData[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(m[1]); } catch { continue; }
    const nodes: Record<string, unknown>[] = [];
    walk(data, nodes);
    for (const n of nodes) {
      const type = asArr(n["@type"]).find((t) => typeof t === "string" && TYPES.has(t)) as string;
      const d: LinkedData = { url, type, name: txt(n.name), description: txt(n.description) };
      const a = n.address;
      if (typeof a === "string") d.address = txt(a);
      else if (a && typeof a === "object") {
        const p = a as Record<string, unknown>;
        const s = [p.streetAddress, p.addressLocality, p.addressRegion, p.postalCode].map(txt).filter(Boolean).join(", ");
        if (s) d.address = s;
      }
      const g = n.geo as Record<string, unknown> | undefined;
      const lat = Number(g?.latitude), lng = Number(g?.longitude);
      if (g && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) { d.lat = lat; d.lng = lng; }
      if (type === "Recipe") {
        d.ingredients = asArr(n.recipeIngredient).map(txt).filter((x): x is string => !!x).slice(0, 60);
        d.steps = steps(n.recipeInstructions);
      }
      if (d.name) out.push(d);
    }
  }
  return out;
}

export async function readLinkedSite(raw: string, fetchFn: typeof fetch = fetch, resolve?: ResolveFn): Promise<LinkedData[]> {
  let cur = safePublicUrl(raw);
  for (let i = 0; cur && i <= MAX_HOPS; i++) {
    // fetch() resolves the name again itself, so a DNS-rebinding host could still answer differently; this check
    // stops names that plainly point inward, which is what a caption author can set up.
    if (!await resolvesPublic(cur, resolve)) return [];
    const res = await fetchFn(cur.toString(), {
      redirect: "manual",
      headers: { accept: "text/html" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      const loc = res.headers.get("location");
      cur = loc ? safePublicUrl(new URL(loc, cur).toString()) : null;
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) { await res.body?.cancel(); return []; }
    return parseJsonLd(await readCapped(res), cur.toString());
  }
  return [];
}

/** Read every linked site in the text; failures are skipped, never fatal. */
export async function readLinkedSites(text: string, fetchFn: typeof fetch = fetch, resolve?: ResolveFn): Promise<LinkedData[]> {
  const out: LinkedData[] = [];
  for (const u of findUrls(text)) {
    try { out.push(...await readLinkedSite(u, fetchFn, resolve)); } catch { /* skip */ }
  }
  return out;
}

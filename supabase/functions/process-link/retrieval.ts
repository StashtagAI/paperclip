import { platformOf, resolveAllowed } from "./url.ts";

export interface Content {
  platform: "instagram" | "tiktok";
  url: string;
  caption: string;
  author?: string;
  transcript?: string;
  ocr?: string;
  source: string; // which provider produced it
}

/** Pluggable provider. Real implementations (paid scraper + transcription) are a board decision; see docs/extraction.md. */
export interface RetrievalProvider {
  name: string;
  fetchContent(url: URL): Promise<Content | null>;
}

/** Free baseline: TikTok oEmbed (title+author only). Instagram oEmbed requires a Meta app token. */
export const oembedProvider: RetrievalProvider = {
  name: "oembed",
  async fetchContent(url) {
    const platform = platformOf(url);
    if (platform !== "tiktok") return null;
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url.toString())}`);
    if (!res.ok) return null;
    const j = await res.json();
    if (!j.title) return null;
    return { platform, url: url.toString(), caption: String(j.title), author: j.author_name, source: "oembed" };
  },
};

export async function retrieve(
  rawUrl: string,
  providers: RetrievalProvider[],
): Promise<Content | null> {
  const url = await resolveAllowed(rawUrl);
  if (!url) throw new Error("url_not_allowed");
  for (const p of providers) {
    try {
      const c = await p.fetchContent(url);
      if (c && (c.caption || c.transcript || c.ocr)) return c;
    } catch (_) { /* try next provider */ }
  }
  return null;
}

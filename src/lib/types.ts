// Row shapes for supabase/migrations/20261106000000_init_schema.sql.
// Replace with `supabase gen types typescript` once the project is linked.
import type { Platform } from '@/lib/link-filter';

export const KINDS = ['eats', 'trips', 'recipes', 'do'] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABELS: Record<Kind, string> = {
  eats: 'Eats',
  trips: 'Trips',
  recipes: 'Recipes',
  do: 'Do',
};

/** Tile subtitles on Home (design brief, "Home screen.pdf"). */
export const KIND_SUBTITLES: Record<Kind, string> = {
  eats: 'Cafés and restaurants',
  trips: 'Places to go',
  recipes: 'To cook next',
  do: 'Things to try',
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

export type LinkStatus = 'pending' | 'processing' | 'done' | 'failed';

export type LinkRow = {
  id: string;
  url: string;
  platform: Platform;
  status: LinkStatus;
  error: string | null;
  tags: string[];
  created_at: string;
};

export type CategoryRow = { id: string; kind: Kind; name: string };

export type ListRow = { id: string; category_id: string; name: string; tags: string[] };

export type ItemRow = {
  id: string;
  list_id: string;
  link_id: string | null;
  name: string;
  description: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  tags: string[];
  /** Set when the user changed the item, so it no longer reads as the post's own words. */
  edited_at: string | null;
};

/** Text captured on the phone, the process-link request body's `captured` field (docs/extraction.md). */
export type Captured = { caption?: string; transcript?: string; ocr?: string };

/** Where an extracted field came from (process-link `item_sources`). */
export type FieldSource = 'capture' | 'linked_site' | 'places_lookup' | 'search';

/** What process-link stores in links.raw_content; every field is optional because older rows predate some of them. */
export type RawContent = {
  /** process-link is reading the post's caption (link-first capture, HAN-18). */
  reading?: boolean;
  caption?: string | null;
  /** "fetched" when the caption was read from the link server-side rather than captured on the phone. */
  caption_source?: 'fetched' | null;
  /** Link-first fetch: how, how long, estimated cost, and why it fell back to capture. */
  fetch?: { via?: string; ms?: number; cost_usd?: number; reason?: string };
  transcript?: string | null;
  ocr?: string | null;
  linked_sites?: string[];
  unsorted?: boolean;
  list_id?: string;
  already_listed?: string[];
  item_sources?: Record<string, Partial<Record<string, FieldSource>>>;
  item_source_urls?: Record<string, Partial<Record<string, string>>>;
  recipe_details?: Record<string, { ingredients: string[]; steps: string[] }>;
};

export type LinkDetail = LinkRow & { raw_content: RawContent | null };

export type LinkItem = ItemRow & { list: Pick<ListRow, 'id' | 'name'> & { category: Pick<CategoryRow, 'kind' | 'name'> } };

export type FeedbackReason = 'wrong_category' | 'wrong_items' | 'missed_items';

/** Why a user reported an item (item_reports.reason). */
export const REPORT_REASONS = ['not_in_post', 'wrong_place', 'wrong_category', 'wrong_details', 'duplicate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  not_in_post: 'The post doesn’t mention this',
  wrong_place: 'Wrong address or map pin',
  wrong_category: 'Filed in the wrong list',
  wrong_details: 'Name or description is wrong',
  duplicate: 'Duplicate of another item',
  other: 'Something else',
};

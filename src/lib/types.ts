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

export type LinkStatus = 'pending' | 'processing' | 'done' | 'failed';

export type LinkRow = {
  id: string;
  url: string;
  platform: Platform;
  status: LinkStatus;
  error: string | null;
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
};

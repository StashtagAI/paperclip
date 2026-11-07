import type { LinkCheck } from '@/lib/link-filter';
import { itemSearchFilter } from '@/lib/search';
import { supabase } from '@/lib/supabase';
import type { CategoryRow, ItemRow, Kind, LinkRow, ListRow } from '@/lib/types';

export type KindList = ListRow & { itemCount: number };
export type KindCategory = CategoryRow & { lists: KindList[] };
export type ListDetail = ListRow & { category: CategoryRow; items: ItemRow[] };

/** An item as shown in "Recently stashed" and search results. */
export type StashItem = Pick<ItemRow, 'id' | 'name' | 'tags'> & {
  created_at: string;
  list: Pick<ListRow, 'id' | 'name' | 'tags'> & { category: Pick<CategoryRow, 'kind' | 'name'> };
  link: Pick<LinkRow, 'platform' | 'tags'> | null;
};

/** The #tag shown on a row: the item's own, else its list's, else the source post's (HAN-6 stores tags on links). */
export function primaryTag(item: StashItem): string | null {
  const tag = item.tags[0] ?? item.list.tags[0] ?? item.link?.tags[0];
  return tag ? tag.replace(/^#+/, '') : null;
}

const STASH_ITEM_COLUMNS =
  'id, name, tags, created_at, list:lists!inner(id, name, tags, category:categories!inner(kind, name)), link:links(platform, tags)';

/** Newest extracted items across every kind. */
export async function fetchRecentItems(limit = 20): Promise<StashItem[]> {
  const { data, error } = await supabase
    .from('items')
    .select(STASH_ITEM_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<StashItem[]>();
  if (error) throw error;
  return data;
}

export async function searchItems(query: string, limit = 30): Promise<StashItem[]> {
  const filter = itemSearchFilter(query);
  if (!filter) return [];
  const { data, error } = await supabase
    .from('items')
    .select(STASH_ITEM_COLUMNS)
    .or(filter)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<StashItem[]>();
  if (error) throw error;
  return data;
}

/** Links that haven't been sorted into items yet, so a fresh stash shows up on Home straight away. */
export async function fetchInFlightLinks(): Promise<LinkRow[]> {
  const { data, error } = await supabase
    .from('links')
    .select('id, url, platform, status, error, tags, created_at')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(5)
    .returns<LinkRow[]>();
  if (error) throw error;
  return data;
}

type CategoryQueryRow = CategoryRow & { lists: (ListRow & { items: { count: number }[] })[] };

/** Categories > lists (with item counts) under one kind, e.g. Eats > Restaurants > Denver. */
export async function fetchKind(kind: Kind): Promise<KindCategory[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, kind, name, lists(id, category_id, name, tags, items(count))')
    .eq('kind', kind)
    .order('name')
    .order('name', { referencedTable: 'lists' })
    .returns<CategoryQueryRow[]>();
  if (error) throw error;
  return data.map(({ lists, ...category }) => ({
    ...category,
    lists: lists.map(({ items, ...list }) => ({ ...list, itemCount: items[0]?.count ?? 0 })),
  }));
}

export async function fetchList(listId: string): Promise<ListDetail> {
  const { data, error } = await supabase
    .from('lists')
    .select('id, category_id, name, tags, category:categories(id, kind, name), items(*)')
    .eq('id', listId)
    .order('name', { referencedTable: 'items' })
    .single<ListDetail>();
  if (error) throw error;
  return data;
}

export async function fetchRecentLinks(): Promise<LinkRow[]> {
  const { data, error } = await supabase
    .from('links')
    .select('id, url, platform, status, error, tags, created_at')
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<LinkRow[]>();
  if (error) throw error;
  return data;
}

/** Insert a link that already passed checkLink. Re-submitting the same post is a no-op. */
export async function submitLink(link: Extract<LinkCheck, { ok: true }>): Promise<'created' | 'duplicate'> {
  const { error } = await supabase.from('links').insert({ url: link.url, platform: link.platform, status: 'pending' });
  if (error?.code === '23505') return 'duplicate';
  if (error) throw error;
  return 'created';
}

import type { LinkCheck } from '@/lib/link-filter';
import { itemSearchFilter } from '@/lib/search';
import { supabase } from '@/lib/supabase';
import type {
  Captured,
  CategoryRow,
  FeedbackReason,
  ItemRow,
  Kind,
  LinkDetail,
  LinkItem,
  LinkRow,
  ListRow,
} from '@/lib/types';

export type KindList = ListRow & { itemCount: number; doneCount: number };
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

/** A link on Home that isn't filed yet, with what process-link managed to read so the row can say which post it is. */
export type InFlightLink = LinkRow & { caption: string | null; fetch_reason: string | null };

/** Links that haven't been sorted into items yet, so a fresh stash shows up on Home straight away. */
export async function fetchInFlightLinks(): Promise<InFlightLink[]> {
  const { data, error } = await supabase
    .from('links')
    .select('id, url, platform, status, error, tags, created_at, caption:raw_content->>caption, fetch_reason:raw_content->fetch->>reason')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(5)
    .returns<InFlightLink[]>();
  if (error) throw error;
  return data;
}

type CategoryQueryRow = CategoryRow & { lists: (ListRow & { items: { done_at: string | null }[] })[] };

/** Categories > lists (with item and done counts) under one kind, e.g. Eats > Restaurants > Denver. */
export async function fetchKind(kind: Kind): Promise<KindCategory[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, kind, name, lists(id, category_id, name, tags, items(done_at))')
    .eq('kind', kind)
    .order('name')
    .order('name', { referencedTable: 'lists' })
    .returns<CategoryQueryRow[]>();
  if (error) throw error;
  return data.map(({ lists, ...category }) => ({
    ...category,
    lists: lists.map(({ items, ...list }) => ({
      ...list,
      itemCount: items.length,
      doneCount: items.filter((i) => i.done_at).length,
    })),
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

/** Insert a link that already passed checkLink. Re-submitting the same post returns the existing row's id. */
export async function submitLink(
  link: Extract<LinkCheck, { ok: true }>,
): Promise<{ id: string; outcome: 'created' | 'duplicate' }> {
  const { data, error } = await supabase
    .from('links')
    .insert({ url: link.url, platform: link.platform, status: 'pending' })
    .select('id')
    .single<{ id: string }>();
  if (!error) return { id: data.id, outcome: 'created' };
  if (error.code !== '23505') throw error;
  const existing = await supabase.from('links').select('id').eq('url', link.url).single<{ id: string }>();
  if (existing.error) throw existing.error;
  return { id: existing.data.id, outcome: 'duplicate' };
}

export async function fetchLink(linkId: string): Promise<LinkDetail> {
  const { data, error } = await supabase
    .from('links')
    .select('id, url, platform, status, error, tags, created_at, raw_content')
    .eq('id', linkId)
    .single<LinkDetail>();
  if (error) throw error;
  return data;
}

/** Calls the row's change callback whenever process-link moves the link along (Realtime, RLS-scoped to the user). */
export function subscribeToLink(linkId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`link-${linkId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'links', filter: `id=eq.${linkId}` }, onChange)
    // Updates made before the channel joined are never delivered (process-link can answer in ~2 s), so re-read once
    // it's live.
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onChange();
    });
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Calls process-link with the user's session (see docs/capture.md). With `captured`, it sends the text captured on the
 * phone (screenshots and recordings never leave the device). Without, the server reads the post's caption itself
 * (HAN-18) and either files the card or sets the link back to pending with error "needs_capture".
 */
export async function buildCard(linkId: string, captured?: Captured): Promise<void> {
  const { error } = await supabase.functions.invoke('process-link', { body: { link_id: linkId, captured } });
  if (!error) return;
  // A non-2xx reply; the function also records failures on the link row, which the review screen shows.
  const status = (error as { context?: Response }).context?.status;
  if (status === 409) return; // already processing: the live status will pick it up
  throw error;
}

/** Items this post added, with their list and category. */
export async function fetchLinkItems(linkId: string): Promise<LinkItem[]> {
  const { data, error } = await supabase
    .from('items')
    .select('*, list:lists!inner(id, name, category:categories!inner(kind, name))')
    .eq('link_id', linkId)
    .order('created_at')
    .returns<LinkItem[]>();
  if (error) throw error;
  return data;
}

/** Marks an item Visited/Tried/Cooked/Done, or clears the mark (HAN-41). Returns the stored `done_at`. */
export async function setItemDone(itemId: string, done: boolean): Promise<string | null> {
  const { data, error } = await supabase
    .from('items')
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq('id', itemId)
    .select('done_at')
    .single<{ done_at: string | null }>();
  if (error) throw error;
  return data.done_at;
}

export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('items').delete().eq('id', itemId);
  if (error) throw error;
}

/** Deletes a stashed link, the items it added, and any list or category that leaves empty (HAN-20). */
export async function deleteLink(linkId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_link', { p_link_id: linkId });
  if (error) throw error;
}

/** Name limits from the schema's check constraints. */
export const NAME_LIMITS = { category: 80, list: 120 } as const;

/**
 * Throws a user-facing error if `name` can't be used. process-link matches names case-insensitively, so two siblings
 * that differ only in case would be ambiguous: treat that as taken too.
 */
function checkName(name: string, max: number, siblings: { name: string }[], what: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error(`The ${what} needs a name.`);
  if (trimmed.length > max) throw new Error(`Keep the name to ${max} characters or fewer.`);
  if (siblings.some((s) => s.name.toLowerCase() === trimmed.toLowerCase()))
    throw new Error(`You already have a ${what} called “${trimmed}”.`);
  return trimmed;
}

export async function renameCategory(category: Pick<CategoryRow, 'id' | 'kind'>, name: string): Promise<void> {
  const siblings = await supabase.from('categories').select('name').eq('kind', category.kind).neq('id', category.id);
  if (siblings.error) throw siblings.error;
  const trimmed = checkName(name, NAME_LIMITS.category, siblings.data, 'category');
  const { error } = await supabase.from('categories').update({ name: trimmed }).eq('id', category.id);
  if (error) throw error.code === '23505' ? new Error(`You already have a category called “${trimmed}”.`) : error;
}

export async function renameList(list: Pick<ListRow, 'id' | 'category_id'>, name: string): Promise<void> {
  const siblings = await supabase.from('lists').select('name').eq('category_id', list.category_id).neq('id', list.id);
  if (siblings.error) throw siblings.error;
  const trimmed = checkName(name, NAME_LIMITS.list, siblings.data, 'list');
  const { error } = await supabase.from('lists').update({ name: trimmed }).eq('id', list.id);
  if (error) throw error.code === '23505' ? new Error(`You already have a list called “${trimmed}” here.`) : error;
}

export async function rateLink(linkId: string, rating: 'up' | 'down', reason?: FeedbackReason): Promise<void> {
  const { error } = await supabase
    .from('link_feedback')
    .upsert({ link_id: linkId, rating, reason: rating === 'down' ? (reason ?? null) : null }, { onConflict: 'link_id,user_id' });
  if (error) throw error;
}

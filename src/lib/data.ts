import { cleanDisplayName } from '@/lib/display-name';
import { hasCoords } from '@/lib/geo';
import type { LinkCheck } from '@/lib/link-filter';
import type { DigestStats, NudgePlace } from '@/lib/nudges';
import { photoBytes } from '@/lib/photo-bytes';
import type { PickItem } from '@/lib/picks';
import { itemSearchFilter, likePattern } from '@/lib/search';
import { supabase } from '@/lib/supabase';
import {
  KINDS,
  type Captured,
  type CategoryRow,
  type FeedbackReason,
  type ItemPhotoRow,
  type ItemRow,
  type Kind,
  type LinkDetail,
  type LinkItem,
  type LinkRow,
  type ListRow,
  type SharedList,
} from '@/lib/types';

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

// `link` names the items.link_id foreign key: item_posts (HAN-44) also joins items to links, and an unnamed embed is
// then ambiguous (PGRST201), which broke Home (HAN-60).
const STASH_ITEM_COLUMNS =
  'id, name, tags, created_at, list:lists!inner(id, name, tags, category:categories!inner(kind, name)), link:links!items_link_id_fkey(platform, tags)';

/**
 * Newest extracted items across every kind, with coordinates. Home shows the first few as "Recently stashed" and
 * chooses its Tonight / Near you / Try this week picks from the rest (HAN-48); a single user's stash fits in one page.
 */
export async function fetchHomeItems(limit = 300): Promise<PickItem[]> {
  const { data, error } = await supabase
    .from('items')
    .select(`${STASH_ITEM_COLUMNS}, lat, lng, address`)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<PickItem[]>();
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

/** A list as shown in search results: Eats › Restaurants › Scottsdale, with its item count. */
export type ListMatch = KindList & { category: CategoryRow };

type ListMatchRow = ListRow & { category: CategoryRow; items: { count: number }[] };
const LIST_MATCH_COLUMNS = 'id, category_id, name, tags, category:categories!inner(id, kind, name), items(count)';

/** Lists whose name or #tag matches (e.g. "Scottsdale"), plus every list in a category whose name matches (HAN-62). */
export async function searchLists(query: string, limit = 30): Promise<ListMatch[]> {
  const filter = itemSearchFilter(query);
  const like = likePattern(query);
  if (!filter || !like) return [];
  const [byList, byCategory] = await Promise.all([
    supabase.from('lists').select(LIST_MATCH_COLUMNS).or(filter).limit(limit).returns<ListMatchRow[]>(),
    supabase.from('lists').select(LIST_MATCH_COLUMNS).ilike('category.name', like).limit(limit).returns<ListMatchRow[]>(),
  ]);
  if (byList.error) throw byList.error;
  if (byCategory.error) throw byCategory.error;
  const unique = new Map([...byList.data, ...byCategory.data].map((l) => [l.id, l]));
  return [...unique.values()]
    .map(({ items, ...list }) => ({ ...list, itemCount: items[0]?.count ?? 0 }))
    .sort(
      (a, b) =>
        KINDS.indexOf(a.category.kind) - KINDS.indexOf(b.category.kind) ||
        a.category.name.localeCompare(b.category.name) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
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
  if (status === 429) return; // over a usage limit (HAN-37): the link is marked failed with the reason
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

/** Limits from the HAN-45 migration's check constraints. */
export const ITEM_LIMITS = { note: 4000, alt: 300, photoBytes: 10 * 1024 * 1024 } as const;

const PHOTO_BUCKET = 'item-photos';

/** A photo with a short-lived signed URL (the bucket is private); `url` is null if signing failed. */
export type ItemPhoto = ItemPhotoRow & { url: string | null };
export type ItemDetail = LinkItem & { photos: ItemPhoto[] };

/** One item with its list, category, and the user's note, rating and photos. */
export async function fetchItem(itemId: string): Promise<ItemDetail> {
  const { data, error } = await supabase
    .from('items')
    .select(
      '*, list:lists!inner(id, name, category:categories!inner(kind, name)), photos:item_photos(id, item_id, path, alt, width, height, created_at)',
    )
    .eq('id', itemId)
    .single<LinkItem & { photos: ItemPhotoRow[] }>();
  if (error) throw error;
  const rows = [...data.photos].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let urls = new Map<string, string>();
  if (rows.length) {
    const signed = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(rows.map((p) => p.path), 60 * 60);
    if (signed.error) throw signed.error;
    urls = new Map(signed.data.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));
  }
  return { ...data, photos: rows.map((p) => ({ ...p, url: urls.get(p.path) ?? null })) };
}

export async function saveItemNote(itemId: string, note: string): Promise<void> {
  const trimmed = note.trim();
  if (trimmed.length > ITEM_LIMITS.note) throw new Error(`Keep the note to ${ITEM_LIMITS.note} characters or fewer.`);
  const { error } = await supabase.from('items').update({ note: trimmed }).eq('id', itemId);
  if (error) throw error;
}

/** 1–5 stars, or null to clear. */
export async function rateItem(itemId: string, rating: number | null): Promise<void> {
  const { error } = await supabase.from('items').update({ rating }).eq('id', itemId);
  if (error) throw error;
}

function checkAlt(alt: string): string {
  const trimmed = alt.trim();
  if (!trimmed) throw new Error('Describe the photo so it can be read out by VoiceOver and TalkBack.');
  if (trimmed.length > ITEM_LIMITS.alt) throw new Error(`Keep the description to ${ITEM_LIMITS.alt} characters or fewer.`);
  return trimmed;
}

const PHOTO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export type PickedPhoto = { uri: string; mimeType?: string | null; width?: number; height?: number };

/** Uploads a picked photo to {user}/{item}/ in the private bucket, then records it with its description. */
export async function addItemPhoto(itemId: string, photo: PickedPhoto, alt: string): Promise<void> {
  const description = checkAlt(alt);
  const contentType = photo.mimeType ?? 'image/jpeg';
  const ext = PHOTO_EXTENSIONS[contentType];
  if (!ext) throw new Error('That file type isn’t supported. Pick a JPEG, PNG, WebP or HEIC photo.');
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) throw new Error('You’re signed out. Sign in again to add photos.');

  const bytes = await photoBytes(photo.uri);
  if (bytes.byteLength > ITEM_LIMITS.photoBytes) throw new Error('That photo is over 10 MB. Pick a smaller one.');
  const path = `${userId}/${itemId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const upload = await supabase.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType });
  if (upload.error) throw upload.error;

  const { error } = await supabase.from('item_photos').insert({
    item_id: itemId,
    path,
    alt: description,
    width: photo.width || null,
    height: photo.height || null,
  });
  if (error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw error;
  }
}

export async function updatePhotoAlt(photoId: string, alt: string): Promise<void> {
  const { error } = await supabase.from('item_photos').update({ alt: checkAlt(alt) }).eq('id', photoId);
  if (error) throw error;
}

/** Deletes the row, then the file. A file left behind by a failed removal is cleared with the account (HAN-34). */
export async function deleteItemPhoto(photo: Pick<ItemPhotoRow, 'id' | 'path'>): Promise<void> {
  const { error } = await supabase.from('item_photos').delete().eq('id', photo.id);
  if (error) throw error;
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.path]);
}

/**
 * Photo rows go with their item (on delete cascade) but the files don't, so these remove them afterwards. Best effort:
 * anything left behind is cleared with the account (HAN-34).
 */
async function photoPaths(column: 'item_id' | 'items.link_id' | 'items.list_id' | 'items.list.category_id', id: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('item_photos')
    .select('path, items!inner(link_id, list_id, list:lists!inner(category_id))')
    .eq(column, id);
  if (error) throw error;
  return data.map((p) => p.path as string);
}
async function removePhotoFiles(paths: string[]) {
  if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);
}

export async function deleteItem(itemId: string): Promise<void> {
  const paths = await photoPaths('item_id', itemId);
  const { error } = await supabase.from('items').delete().eq('id', itemId);
  if (error) throw error;
  await removePhotoFiles(paths);
}

/** Deletes a stashed link, the items it added, and any list or category that leaves empty (HAN-20). */
export async function deleteLink(linkId: string): Promise<void> {
  const paths = await photoPaths('items.link_id', linkId);
  const { error } = await supabase.rpc('delete_link', { p_link_id: linkId });
  if (error) throw error;
  await removePhotoFiles(paths);
}

/** Deletes a list and its items (they cascade), and its category too if that leaves it empty (HAN-62). */
export async function deleteList(list: Pick<ListRow, 'id' | 'category_id'>): Promise<void> {
  const paths = await photoPaths('items.list_id', list.id);
  const { error } = await supabase.from('lists').delete().eq('id', list.id);
  if (error) throw error;
  await removePhotoFiles(paths);
  const rest = await supabase.from('lists').select('id', { count: 'exact', head: true }).eq('category_id', list.category_id);
  if (!rest.error && rest.count === 0) await supabase.from('categories').delete().eq('id', list.category_id);
}

/** Deletes a category with every list and item in it (they cascade). */
export async function deleteCategory(categoryId: string): Promise<void> {
  const paths = await photoPaths('items.list.category_id', categoryId);
  const { error } = await supabase.from('categories').delete().eq('id', categoryId);
  if (error) throw error;
  await removePhotoFiles(paths);
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

/** The share token for one of the user's lists, or null if it isn't shared (HAN-50). */
export async function fetchListShare(listId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('list_shares')
    .select('token')
    .eq('list_id', listId)
    .maybeSingle<{ token: string }>();
  if (error) throw error;
  return data?.token ?? null;
}

/** Shares a list, or returns its existing token. */
export async function shareList(listId: string): Promise<string> {
  const { data, error } = await supabase.from('list_shares').insert({ list_id: listId }).select('token').single<{ token: string }>();
  if (!error) return data.token;
  if (error.code !== '23505') throw error;
  const existing = await fetchListShare(listId);
  if (!existing) throw error;
  return existing;
}

/** Stops sharing: the old link stops working. */
export async function stopSharingList(listId: string): Promise<void> {
  const { error } = await supabase.from('list_shares').delete().eq('list_id', listId);
  if (error) throw error;
}

/** The emails a share is for (HAN-68), oldest first. Only the owner can read them all. */
export async function fetchShareRecipients(token: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('list_share_recipients')
    .select('email')
    .eq('token', token)
    .order('created_at')
    .returns<{ email: string }[]>();
  if (error) throw error;
  return data.map((r) => r.email);
}

/**
 * Lets the Stashtag account with this email open the shared list. Throws a readable error when no account uses it;
 * the database limits how many addresses an owner can try per hour.
 */
export async function addShareRecipient(token: string, email: string): Promise<string> {
  const { data, error } = await supabase.rpc('add_share_recipient', { p_token: token, p_email: email });
  if (error) throw error.code === 'P0002' ? new Error('This list is no longer shared.') : error;
  const result = data as { email: string } | { error: 'no_account' | 'self' };
  if ('email' in result) return result.email;
  throw new Error(
    result.error === 'self'
      ? 'That’s your own email. Add the email your friend uses for Stashtag.'
      : `No Stashtag account uses ${email.trim()}. Ask your friend which email they sign in with.`,
  );
}

/** Stops the list opening for this person. */
export async function removeShareRecipient(token: string, email: string): Promise<void> {
  const { error } = await supabase.from('list_share_recipients').delete().eq('token', token).eq('email', email);
  if (error) throw error;
}

/**
 * A shared list by its token; null when the link was never valid, sharing was stopped, or it wasn't shared with the
 * signed-in account (the database answers the same for all three). Signed in only.
 */
export async function fetchSharedList(token: string): Promise<SharedList | null> {
  const { data, error } = await supabase.rpc('get_shared_list', { p_token: token });
  if (error) throw error;
  return (data as SharedList | null) ?? null;
}

/** Copies a shared list into the user's stash; `own` when it's their own list. */
export async function addSharedList(token: string): Promise<{ list_id: string; added: number; own: boolean }> {
  const { data, error } = await supabase.rpc('add_shared_list', { p_token: token });
  if (error) throw error.code === 'P0002' ? new Error('This list is no longer shared.') : error;
  return data as { list_id: string; added: number; own: boolean };
}

/** A list someone shared with the signed-in user (HAN-71). `seen_at` is null until the new-share popup has shown it. */
export type SharedWithMe = {
  token: string;
  kind: Kind;
  category: string;
  list: string;
  /** The owner's display name, or null if they haven't set one. */
  shared_by: string | null;
  item_count: number;
  shared_at: string;
  seen_at: string | null;
};

/** Lists shared with the signed-in user, newest first. */
export async function fetchSharedWithMe(): Promise<SharedWithMe[]> {
  const { data, error } = await supabase.rpc('get_shared_with_me');
  if (error) throw error;
  return (data as SharedWithMe[] | null) ?? [];
}

/** The signed-in user's display name, or null if they haven't set one. */
export async function fetchDisplayName(): Promise<string | null> {
  const { data, error } = await supabase.from('profiles').select('display_name').maybeSingle<{ display_name: string }>();
  if (error) throw error;
  return data?.display_name ?? null;
}

/** Saves the name friends see on lists you share with them. Returns it as saved. */
export async function saveDisplayName(name: string): Promise<string> {
  const display_name = cleanDisplayName(name);
  if (!display_name) throw new Error('Enter your name.');
  const { data } = await supabase.auth.getSession();
  const user_id = data.session?.user.id;
  if (!user_id) throw new Error('Sign in first.');
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id, display_name, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
  return display_name;
}

/** Marks these shares as seen so the new-share popup doesn't show them again. */
export async function markSharesSeen(tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  const { error } = await supabase.rpc('mark_shares_seen', { p_tokens: tokens });
  if (error) throw error;
}

export async function rateLink(linkId: string, rating: 'up' | 'down', reason?: FeedbackReason): Promise<void> {
  const { error } = await supabase
    .from('link_feedback')
    .upsert({ link_id: linkId, rating, reason: rating === 'down' ? (reason ?? null) : null }, { onConflict: 'link_id,user_id' });
  if (error) throw error;
}

type NudgeItemRow = Pick<ItemRow, 'id' | 'name' | 'lat' | 'lng'> & {
  created_at: string;
  list: Pick<ListRow, 'id' | 'name'> & { category: Pick<CategoryRow, 'kind'> };
};

/** Saved places with coordinates, for nearby nudges (HAN-43). Past the cap, the newest saves win. */
export async function fetchNudgePlaces(): Promise<NudgePlace[]> {
  const { data, error } = await supabase
    .from('items')
    .select('id, name, lat, lng, created_at, list:lists!inner(id, name, category:categories!inner(kind))')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000)
    .returns<NudgeItemRow[]>();
  if (error) throw error;
  return data.flatMap((i) =>
    hasCoords(i)
      ? [{ id: i.id, name: i.name, lat: i.lat, lng: i.lng, listId: i.list.id, listName: i.list.name, kind: i.list.category.kind }]
      : [],
  );
}

/** Item count and the newest saves, for the weekly digest (HAN-43). */
export async function fetchDigestStats(): Promise<DigestStats> {
  const { data, error, count } = await supabase
    .from('items')
    .select('id, name, created_at, list:lists!inner(id, name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(200)
    .returns<(Pick<NudgeItemRow, 'id' | 'name' | 'created_at'> & { list: Pick<ListRow, 'id' | 'name'> })[]>();
  if (error) throw error;
  return {
    total: count ?? data.length,
    picks: data.map((i) => ({ id: i.id, name: i.name, listId: i.list.id, listName: i.list.name, createdAt: i.created_at })),
  };
}

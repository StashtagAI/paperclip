import type { LinkCheck } from '@/lib/link-filter';
import { SAMPLE_LIBRARY } from '@/lib/sample-data';
import { supabase } from '@/lib/supabase';
import type { CategoryRow, ItemRow, LinkRow, ListRow } from '@/lib/types';

export type LibraryList = ListRow & { itemCount: number };
export type LibraryCategory = CategoryRow & { lists: LibraryList[] };
export type Library = { categories: LibraryCategory[]; sample: boolean };
export type ListDetail = ListRow & { category: CategoryRow; items: ItemRow[] };

type CategoryQueryRow = CategoryRow & { lists: (ListRow & { items: { count: number }[] })[] };

/** All categories > lists with item counts. Falls back to sample data while the user has none. */
export async function fetchLibrary(): Promise<Library> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, kind, name, lists(id, category_id, name, tags, items(count))')
    .order('name')
    .returns<CategoryQueryRow[]>();
  if (error) throw error;
  if (!data.length) return { categories: SAMPLE_LIBRARY.map(toLibraryCategory), sample: true };
  return {
    sample: false,
    categories: data.map(({ lists, ...category }) => ({
      ...category,
      lists: lists.map(({ items, ...list }) => ({ ...list, itemCount: items[0]?.count ?? 0 })),
    })),
  };
}

export async function fetchList(listId: string): Promise<ListDetail> {
  const sample = SAMPLE_LIBRARY.flatMap((c) => c.lists.map((l) => ({ ...l, category: c }))).find((l) => l.id === listId);
  if (sample) {
    const { lists: _, ...category } = sample.category;
    return { ...sample, category };
  }
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
    .select('id, url, platform, status, error, created_at')
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

function toLibraryCategory(c: (typeof SAMPLE_LIBRARY)[number]): LibraryCategory {
  return { ...c, lists: c.lists.map(({ items, ...l }) => ({ ...l, itemCount: items.length })) };
}

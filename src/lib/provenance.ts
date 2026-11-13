import type { FieldSource, ItemRow } from '@/lib/types';

/** Where each field of an item came from: process-link's `item_sources[name]` for the item's post. */
export type ItemSources = Partial<Record<string, FieldSource>>;

export type Provenance = {
  /** Short badge text, readable on its own. */
  badge: string;
  /** One sentence for the screen reader and the detail line. */
  detail: string;
};

const SOURCE_BADGE: Record<FieldSource, string> = {
  capture: 'From the post',
  linked_site: 'From a linked site',
  places_lookup: 'From Google Places',
  search: 'From web search',
};

/**
 * What to tell the user about where an item came from. The name decides the badge: only an item whose name was read
 * from the post's own text gets "From the post". Anything not recorded is "Source not recorded" rather than a guess.
 * A place pin or address from somewhere other than the post is called out, since that's where wrong places come from.
 */
export function provenanceOf(item: Pick<ItemRow, 'edited_at' | 'address' | 'lat'>, sources: ItemSources | undefined): Provenance {
  if (item.edited_at) return { badge: 'Edited by you', detail: 'You edited this item, so it may differ from the post.' };
  const name = sources?.name;
  if (!name) return { badge: 'Source not recorded', detail: 'We didn’t record where this item came from. Check it against the post.' };
  const extras: string[] = [];
  const address = sources.address;
  if (item.address && address && address !== name) extras.push(`the address is ${SOURCE_BADGE[address].toLowerCase()}`);
  else if (item.lat != null && sources.lat && sources.lat !== name) extras.push(`the map pin is ${SOURCE_BADGE[sources.lat].toLowerCase()}`);
  const lead = name === 'capture' ? 'The name comes from the post’s text' : `The name is ${SOURCE_BADGE[name].toLowerCase()}`;
  return { badge: SOURCE_BADGE[name], detail: `${lead}${extras.length ? `; ${extras.join('; ')}` : ''}.` };
}

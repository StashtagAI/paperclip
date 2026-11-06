// Stub library shown until the signed-in user has processed links (HAN-6).
import type { CategoryRow, ItemRow, ListRow } from '@/lib/types';

type SampleCategory = CategoryRow & { lists: (ListRow & { items: ItemRow[] })[] };

const item = (list_id: string, n: number, name: string, description: string, address: string | null = null): ItemRow => ({
  id: `${list_id}-${n}`,
  list_id,
  link_id: null,
  name,
  description,
  address,
  lat: null,
  lng: null,
  tags: [],
});

export const SAMPLE_LIBRARY: SampleCategory[] = [
  {
    id: 'sample-restaurants',
    kind: 'eats',
    name: 'Restaurants',
    lists: [
      {
        id: 'sample-denver',
        category_id: 'sample-restaurants',
        name: 'Denver',
        tags: ['denver', 'dinner'],
        items: [
          item('sample-denver', 1, 'Tavernetta', 'Italian next to Union Station.', '1889 16th St, Denver, CO'),
          item('sample-denver', 2, 'Sushi Den', 'Long-running sushi spot on South Pearl.', '1487 S Pearl St, Denver, CO'),
          item('sample-denver', 3, 'Hop Alley', 'Chinese small plates in RiNo.', '3500 Larimer St, Denver, CO'),
          item('sample-denver', 4, 'Safta', 'Israeli food at The Source hotel.', '3330 Brighton Blvd, Denver, CO'),
          item('sample-denver', 5, 'Tacos Tequila Whiskey', 'Street tacos on Colfax.', '1514 York St, Denver, CO'),
        ],
      },
    ],
  },
  {
    id: 'sample-lisbon',
    kind: 'trips',
    name: 'Portugal',
    lists: [
      {
        id: 'sample-lisbon-list',
        category_id: 'sample-lisbon',
        name: 'Lisbon',
        tags: ['lisbon', 'europe'],
        items: [
          item('sample-lisbon-list', 1, 'Miradouro da Senhora do Monte', 'Best sunset viewpoint in the city.'),
          item('sample-lisbon-list', 2, 'LX Factory', 'Old factory turned shops and cafés.'),
        ],
      },
    ],
  },
  {
    id: 'sample-pasta',
    kind: 'recipes',
    name: 'Pasta',
    lists: [
      {
        id: 'sample-pasta-list',
        category_id: 'sample-pasta',
        name: 'Weeknight',
        tags: ['quick'],
        items: [item('sample-pasta-list', 1, 'Cacio e pepe', 'Pecorino, black pepper, pasta water.')],
      },
    ],
  },
];

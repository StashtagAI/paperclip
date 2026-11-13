import { shareMessage, shareUrl } from '../share';
import type { SharedList } from '../types';

jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('expo-clipboard', () => ({}));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `stashtag://${path}` }));

const TOKEN = '0123456789abcdef0123456789abcdef';

describe('shareUrl', () => {
  it('uses the web app when configured', () => {
    expect(shareUrl(TOKEN, 'https://app.stashtag.ai/')).toBe(`https://app.stashtag.ai/s/${TOKEN}`);
  });

  it('falls back to the app scheme', () => {
    expect(shareUrl(TOKEN, '')).toBe(`stashtag://s/${TOKEN}`);
  });
});

describe('shareMessage', () => {
  const list: SharedList = {
    kind: 'eats',
    category: 'Restaurants',
    list: 'Denver',
    tags: [],
    items: [
      {
        name: 'Hop Alley',
        description: 'Chinese',
        address: '3500 Larimer St, Denver',
        lat: 39.7,
        lng: -104.9,
        tags: [],
        source_url: 'https://www.instagram.com/p/abc123/',
        platform: 'instagram',
      },
      { name: 'Sunday Vinyl', description: '', address: null, lat: null, lng: null, tags: [], source_url: null, platform: null },
    ],
  };

  it('lists every item with its address and source post, then the link', () => {
    expect(shareMessage(list, 'https://app.stashtag.ai/s/x')).toBe(
      [
        'Restaurants › Denver (Eats), from my Stashtag:',
        '',
        '• Hop Alley, 3500 Larimer St, Denver',
        '  https://www.instagram.com/p/abc123/',
        '• Sunday Vinyl',
        '',
        'See or add the list: https://app.stashtag.ai/s/x',
      ].join('\n'),
    );
  });

  it('says when the list is empty', () => {
    expect(shareMessage({ ...list, items: [] }, 'u')).toContain('(No items yet.)');
  });
});

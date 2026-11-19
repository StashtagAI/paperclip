import { shareMessage, shareUrl } from '../share';

jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('expo-clipboard', () => ({}));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `stashtag://${path}` }));

const TOKEN = '0123456789abcdef0123456789abcdef';

describe('shareUrl', () => {
  it('uses the app scheme', () => {
    expect(shareUrl(TOKEN)).toBe(`stashtag://s/${TOKEN}`);
  });
});

describe('shareMessage', () => {
  it('sends only the list name and the link, never the items', () => {
    expect(shareMessage('Restaurants', 'Denver', 'stashtag://s/x')).toBe(
      'Restaurants › Denver on Stashtag: stashtag://s/x',
    );
  });
});

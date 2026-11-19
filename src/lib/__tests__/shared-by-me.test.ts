import type { SharedByMe } from '../data';
import { itemCount, recipientsText, sharedByMeSummary } from '../shared-by-me';

const row = (token: string, recipients: string[]): SharedByMe => ({
  token,
  list_id: `list-${token}`,
  kind: 'eats',
  category: 'Restaurants',
  list: 'Denver',
  item_count: 3,
  shared_at: '2026-11-17T20:00:00Z',
  recipients,
});

describe('sharedByMeSummary', () => {
  it('counts lists and people', () => {
    expect(sharedByMeSummary([row('a', ['alex@example.com', 'sam@example.com']), row('b', ['jo@example.com'])])).toBe(
      '2 lists · 3 people',
    );
  });

  it('counts someone on several lists once', () => {
    expect(sharedByMeSummary([row('a', ['alex@example.com']), row('b', ['alex@example.com'])])).toBe(
      '2 lists · 1 person',
    );
  });

  it('says 0 people when nobody has been added yet', () => {
    expect(sharedByMeSummary([row('a', [])])).toBe('1 list · 0 people');
  });
});

describe('recipientsText', () => {
  it('lists everyone, in order', () => {
    expect(recipientsText(['alex@example.com', 'sam@example.com'])).toBe('With alex@example.com, sam@example.com');
  });

  it('says when nobody has been added', () => {
    expect(recipientsText([])).toBe('Not shared with anyone yet');
  });
});

describe('itemCount', () => {
  it('pluralises', () => {
    expect(itemCount(1)).toBe('1 item');
    expect(itemCount(0)).toBe('0 items');
  });
});

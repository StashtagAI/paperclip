import { escapeXml, exportable, exportedMessage, exportFileName, listToKml, placeDescription, type ExportItem } from '@/lib/map-export';

const item = (over: Partial<ExportItem> = {}): ExportItem => ({
  name: 'Sushi Den',
  description: 'Best omakase in town',
  address: '1487 S Pearl St, Denver, CO',
  lat: 39.69,
  lng: -104.98,
  note: '',
  rating: null,
  done_at: null,
  favorited_at: null,
  ...over,
});

describe('escapeXml', () => {
  it('escapes markup and drops characters XML forbids', () => {
    expect(escapeXml(`Tom & Jerry's <"diner">\u0007`)).toBe('Tom &amp; Jerry&apos;s &lt;&quot;diner&quot;&gt;');
  });
});

describe('placeDescription', () => {
  it('joins the post’s words, the address and the user’s own notes', () => {
    const text = placeDescription(item({ done_at: '2026-11-01', favorited_at: '2026-11-02', rating: 4, note: ' Get the uni ' }), 'eats');
    expect(text).toBe('Best omakase in town\n1487 S Pearl St, Denver, CO\nTried · Favorite · Your rating: 4/5\nNote: Get the uni');
  });

  it('leaves out empty parts', () => {
    expect(placeDescription(item({ description: '', address: null }), 'travel')).toBe('');
  });
});

describe('exportable', () => {
  it('counts items without a location as skipped', () => {
    const { placed, skipped } = exportable([item(), item({ lat: null }), item({ lng: 500 })]);
    expect(placed).toHaveLength(1);
    expect(skipped).toBe(2);
  });
});

describe('listToKml', () => {
  it('writes one placemark per located item, longitude first', () => {
    const kml = listToKml('Restaurants › Denver', 'eats', [item(), item({ name: 'No pin', lat: null, lng: null })]);
    expect(kml).toContain('<name>Restaurants › Denver</name>');
    expect(kml.match(/<Placemark>/g)).toHaveLength(1);
    expect(kml).toContain('<coordinates>-104.98,39.69</coordinates>');
    expect(kml).not.toContain('No pin');
    expect(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">')).toBe(true);
  });

  it('escapes names so a stray & does not break the file', () => {
    expect(listToKml('A & B', 'eats', [item({ name: 'Fish & Chips' })])).toContain('<name>Fish &amp; Chips</name>');
  });
});

describe('exportFileName', () => {
  it('removes characters file systems reject', () => {
    expect(exportFileName('Restaurants', 'Denver / Boulder: "best"')).toBe('Stashtag - Restaurants - Denver Boulder best.kml');
  });
});

describe('exportedMessage', () => {
  it('says how many places went and how many were left out', () => {
    expect(exportedMessage(1, 0, 'shared')).toBe('Exported 1 place for Google My Maps.');
    expect(exportedMessage(5, 2, 'downloaded')).toBe('Downloaded 5 places for Google My Maps. 2 without a location were left out.');
    expect(exportedMessage(3, 1, 'saved')).toBe('Saved 3 places for Google My Maps. 1 without a location was left out.');
  });
});

import { hasCoords } from '@/lib/geo';
import { DONE_LABELS, type ItemRow, type Kind } from '@/lib/types';

/**
 * Export an Eats/Travel list as a KML file for Google My Maps (HAN-141, Premium). Neither Google Maps saved lists nor
 * Apple Maps Guides can be written by an app; My Maps imports KML (on a computer) and the map then shows up in the
 * Google Maps app under Saved → Maps.
 */

export type ExportItem = Pick<ItemRow, 'name' | 'description' | 'address' | 'lat' | 'lng' | 'note' | 'rating' | 'done_at' | 'favorited_at'>;

export const MY_MAPS_URL = 'https://www.google.com/mymaps';

/** The steps shown after exporting, one per line. */
export const MY_MAPS_STEPS = [
  'On a computer, open google.com/mymaps and sign in.',
  'Choose Create a new map, then Import, and pick the file.',
  'The map then appears in the Google Maps app under Saved → Maps.',
] as const;

// XML 1.0 only allows tab, newline and carriage return below 0x20; anything else makes the file unreadable.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** What My Maps shows when a pin is tapped: the post's words, the address, and the user's own notes. */
export function placeDescription(item: ExportItem, kind: Kind): string {
  const lines = [item.description.trim(), item.address?.trim() ?? ''];
  const yours = [
    item.done_at ? DONE_LABELS[kind] : '',
    item.favorited_at ? 'Favorite' : '',
    item.rating ? `Your rating: ${item.rating}/5` : '',
  ].filter(Boolean);
  if (yours.length) lines.push(yours.join(' · '));
  if (item.note.trim()) lines.push(`Note: ${item.note.trim()}`);
  return lines.filter(Boolean).join('\n');
}

/** Only items with a location can be pinned; the rest are counted so the user knows what was left out. */
export function exportable<T extends ExportItem>(items: T[]): { placed: (T & { lat: number; lng: number })[]; skipped: number } {
  const placed = items.filter((i): i is T & { lat: number; lng: number } => hasCoords(i));
  return { placed, skipped: items.length - placed.length };
}

/** A KML document with one placemark per located item, named after the list ("Restaurants › Denver"). */
export function listToKml(title: string, kind: Kind, items: ExportItem[]): string {
  const placemarks = exportable(items).placed.map((i) =>
    [
      '    <Placemark>',
      `      <name>${escapeXml(i.name)}</name>`,
      `      <description>${escapeXml(placeDescription(i, kind))}</description>`,
      // KML is longitude first.
      `      <Point><coordinates>${i.lng},${i.lat}</coordinates></Point>`,
      '    </Placemark>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    `    <name>${escapeXml(title)}</name>`,
    ...placemarks,
    '  </Document>',
    '</kml>',
    '',
  ].join('\n');
}

/** "Stashtag - Restaurants - Denver.kml": safe on every file system, and recognisable in Downloads or Mail. */
export function exportFileName(category: string, list: string): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = ['Stashtag', clean(category), clean(list)].filter(Boolean).join(' - ').slice(0, 120).trim();
  return `${base}.kml`;
}

export const KML_MIME = 'application/vnd.google-earth.kml+xml';

/** How the file reached the user: share sheet (iOS), folder picker (Android) or a browser download (web). */
export type SaveOutcome = 'shared' | 'saved' | 'downloaded' | 'dismissed';

/** The status line after a successful export. */
export function exportedMessage(placed: number, skipped: number, how: Exclude<SaveOutcome, 'dismissed'>): string {
  const places = `${placed} ${placed === 1 ? 'place' : 'places'}`;
  const verb = how === 'downloaded' ? 'Downloaded' : how === 'saved' ? 'Saved' : 'Exported';
  const left = skipped ? ` ${skipped} without a location ${skipped === 1 ? 'was' : 'were'} left out.` : '';
  return `${verb} ${places} for Google My Maps.${left}`;
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { hashStrokeWidth, PIN_LAYOUT, pinSvg } from '@/constants/brand';

// Compare markup only: drop the accessibility attributes the board's export adds.
function normalise(svg: string) {
  return svg
    .replace(/\s(role|aria-label)="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim();
}

const original = (name: string) => normalise(readFileSync(join(__dirname, '../../../assets/brand', name), 'utf8'));

describe('pin mark matches the board assets', () => {
  it.each([
    ['pin-icon-primary.svg', { tile: '#1F6FEB', pin: '#FFFFFF', hash: '#1F6FEB' }],
    ['pin-icon-dark.svg', { tile: '#0A1420', pin: '#4C9BFF', hash: '#0A1420' }],
    ['pin-icon-mono.svg', { tile: '#0B1B2B', pin: '#FFFFFF', hash: '#0B1B2B' }],
    [
      'pin-favicon-24.svg',
      { tile: '#1F6FEB', pin: '#FFFFFF', hash: '#1F6FEB', layout: PIN_LAYOUT.favicon, glyph: 'favicon' as const, strokeWidth: 12 },
    ],
  ])('%s', (file, options) => {
    expect(normalise(pinSvg(options))).toBe(original(file));
  });

  it('thickens the # as the icon shrinks', () => {
    expect([1024, 120, 60, 40, 24].map(hashStrokeWidth)).toEqual([8, 8, 9, 10, 12]);
  });
});

/**
 * The Stashtag mark: concept B "Pin" (a map pin with a # inside), chosen by the board on HAN-9.
 *
 * This is the single source for the logo. The in-app <PinMark>, the iOS/Android app icons, the
 * splash image and the favicon are all drawn from `pinSvg()`; `npm run icons` regenerates the PNGs.
 * Keep this file free of app imports so `node scripts/build-icons.ts` can load it directly.
 */

/** Teardrop pin in a 100×100 box: head centred at (50, 39), r = 31, tip at (50, 95). */
export const PIN_PATH =
  'M50 95 C47.5 95 46 93.3 44.4 91.2 C33 76.5 19 59 19 39 A31 31 0 0 1 81 39 C81 59 67 76.5 55.6 91.2 C54 93.3 52.5 95 50 95 Z';

/** The # inside the pin head, drawn as four round-capped strokes. */
export const HASH_PATH = 'M45.6 26.5 L43.2 51.5 M57.2 26.5 L54.8 51.5 M37 34.8 L64 34.8 M36 43.6 L63 43.6';
export const HASH_STROKE = 5.8;

export type PinSvgOptions = {
  /** Pin body colour. */
  pin: string;
  /** Colour of the #, or 'transparent' to cut it out of the pin (monochrome icons, map pins). */
  hash: string;
  /** Optional full-bleed square background (app icons). */
  tile?: string;
  /** Pin height as a fraction of the canvas, 0–1. Defaults to filling the canvas. */
  scale?: number;
};

/** The mark as a standalone SVG document with a 100×100 viewBox. */
export function pinSvg({ pin, hash, tile, scale = 1 }: PinSvgOptions): string {
  // The pin occupies y 8–95 (87 units) and x 19–81; centre that box on the canvas.
  const s = (scale * 100) / 87;
  const tx = 50 - 50 * s;
  const ty = 50 - 51.5 * s;
  const stroke = `fill="none" stroke-width="${HASH_STROKE}" stroke-linecap="round"`;
  const cutout = hash === 'transparent';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    cutout ? `<mask id="hash"><rect width="100" height="100" fill="#fff"/><path d="${HASH_PATH}" ${stroke} stroke="#000"/></mask>` : '',
    tile ? `<rect width="100" height="100" fill="${tile}"/>` : '',
    `<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${s.toFixed(4)})">`,
    `<path d="${PIN_PATH}" fill="${pin}"${cutout ? ' mask="url(#hash)"' : ''}/>`,
    cutout ? '' : `<path d="${HASH_PATH}" ${stroke} stroke="${hash}"/>`,
    '</g>',
    '</svg>',
  ].join('');
}

/**
 * The Stashtag mark: concept B "Pin" (a map pin with a # inside), chosen by the board on HAN-9.
 *
 * Geometry and colours are copied from the board's finished assets (HAN-10 attachments, kept
 * verbatim in assets/brand/ and checked by brand.test.ts). This is the single source for the
 * logo: the in-app <PinMark>, the iOS/Android app icons, the splash image and the favicon are all
 * drawn from `pinSvg()`; `npm run icons` regenerates the PNGs.
 * Keep this file free of app imports so `node scripts/build-icons.mjs` can load it directly.
 */

/** Teardrop pin in the board's 120×120 artboard: x 18–102, y 8–114 (tip at 60, 114). */
export const PIN_PATH = 'M60 8C36 8 18 26 18 49c0 29 42 65 42 65s42-36 42-65C102 26 84 8 60 8Z';

type Line = readonly [x1: number, y1: number, x2: number, y2: number];

/** The # inside the pin head as four round-capped lines. The favicon spreads them slightly. */
export const HASH_LINES = {
  icon: [
    [55, 29, 51, 67],
    [71, 29, 67, 67],
    [42, 41, 80, 41],
    [41, 56, 79, 56],
  ],
  favicon: [
    [56, 29, 52, 67],
    [70, 29, 66, 67],
    [42, 43, 80, 43],
    [41, 57, 79, 57],
  ],
} as const satisfies Record<string, readonly Line[]>;

/** Corner radius of the board's tile, in artboard units. */
export const TILE_RADIUS = 28;

/** The # gets heavier as the icon shrinks (board spec): 8 at 120px+, 9 at 60, 10 at 40, 12 at 24. */
export function hashStrokeWidth(px: number): number {
  if (px >= 120) return 8;
  if (px >= 60) return 9;
  if (px >= 40) return 10;
  return 12;
}

export type PinLayout = { translate: readonly [number, number]; scale: number };

/** Pin placement inside the 120 artboard. `icon` and `favicon` are the board's tile layouts. */
export const PIN_LAYOUT = {
  icon: { translate: [14.4, 13.6], scale: 0.76 },
  favicon: { translate: [10.8, 10.4], scale: 0.82 },
  /** The bare mark filling the canvas (splash, in-app logo, map pins). */
  bare: { translate: [0, -1], scale: 1 },
} as const satisfies Record<string, PinLayout>;

/** A layout that centres the pin at `scale` of the bare size, e.g. inside an Android safe zone. */
export function centredLayout(scale: number): PinLayout {
  return { translate: [round(60 - 60 * scale), round(60 - 61 * scale)], scale };
}

export type PinSvgOptions = {
  /** Pin body colour. */
  pin: string;
  /** Colour of the #, or 'transparent' to cut it out of the pin (monochrome icons, map pins). */
  hash: string;
  /** Optional background tile (app icons). */
  tile?: string;
  /** Tile corner radius; 0 for full-bleed squares that the OS masks itself (iOS). */
  tileRadius?: number;
  layout?: PinLayout;
  glyph?: keyof typeof HASH_LINES;
  /** # stroke width in artboard units; defaults to the 120px+ weight. */
  strokeWidth?: number;
  /** Output width/height attributes; the viewBox is always 120×120. */
  size?: number;
};

/** The mark as a standalone SVG document with the board's 120×120 viewBox. */
export function pinSvg({
  pin,
  hash,
  tile,
  tileRadius = TILE_RADIUS,
  layout = tile ? PIN_LAYOUT.icon : PIN_LAYOUT.bare,
  glyph = 'icon',
  strokeWidth = hashStrokeWidth(120),
  size = 1024,
}: PinSvgOptions): string {
  const cutout = hash === 'transparent';
  const lines = (color: string) =>
    [
      `<g stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" fill="none">`,
      ...HASH_LINES[glyph].map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`),
      '</g>',
    ].join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120">`,
    tile ? `<rect width="120" height="120"${tileRadius ? ` rx="${tileRadius}"` : ''} fill="${tile}"></rect>` : '',
    `<g transform="translate(${layout.translate[0]} ${layout.translate[1]}) scale(${layout.scale})">`,
    cutout ? `<mask id="hash"><rect width="120" height="120" fill="#FFFFFF"></rect>\n${lines('#000000')}\n</mask>` : '',
    `<path d="${PIN_PATH}" fill="${pin}"${cutout ? ' mask="url(#hash)"' : ''}></path>`,
    cutout ? '' : lines(hash),
    '</g>',
    '</svg>',
  ]
    .filter(Boolean)
    .join('\n');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

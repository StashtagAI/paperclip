// Regenerates every app icon, splash and favicon PNG from the pin mark in src/constants/brand.ts.
// Run after changing the mark or palette: `npm run icons`, then commit assets/images.
import sharp from 'sharp';

import { centredLayout, hashStrokeWidth, PIN_LAYOUT, pinSvg } from '../src/constants/brand.ts';
import { Palette } from '../src/constants/palette.ts';

const L = Palette.light;
const D = Palette.dark;
const out = (name) => new URL(`../assets/images/${name}`, import.meta.url).pathname;

// iOS masks the 1024 tile itself, so the App Store icon is a full-bleed square (no rx) with the
// pin placed exactly as in assets/brand/pin-icon-primary.svg.
const IOS = { tileRadius: 0 };
// Android adaptive icons are cropped to the inner ~66% (safe zone) of the 108dp layer.
const ADAPTIVE = { layout: centredLayout(0.6) };

const targets = [
  // iOS (also the default icon for web/Expo Go). App Store icons must be opaque.
  { file: 'icon.png', size: 1024, opaque: true, svg: { ...IOS, tile: L.cobalt, pin: L.white, hash: L.cobalt } },
  // Dark: assets/brand/pin-icon-dark.svg.
  { file: 'icon-dark.png', size: 1024, opaque: true, svg: { ...IOS, tile: D.night, pin: D.cobalt, hash: D.night } },
  // Tinted icons are greyscale; iOS applies the user's tint. Same layout as the dark icon.
  { file: 'icon-tinted.png', size: 1024, opaque: true, svg: { ...IOS, tile: '#000000', pin: '#FFFFFF', hash: '#000000' } },

  // Splash: the bare mark on Mist (light) or Night (dark), see app.json. Colours follow the light
  // and dark icon variants.
  { file: 'splash-icon.png', size: 600, svg: { pin: L.cobalt, hash: L.white } },
  { file: 'splash-icon-dark.png', size: 600, svg: { pin: D.cobalt, hash: D.night } },

  // Android adaptive icon layers.
  { file: 'android-icon-foreground.png', size: 512, svg: { ...ADAPTIVE, pin: L.white, hash: L.cobalt } },
  { file: 'android-icon-background.png', size: 512, opaque: true, svg: { tile: L.cobalt, tileRadius: 0, pin: L.cobalt, hash: L.cobalt } },
  { file: 'android-icon-monochrome.png', size: 432, svg: { ...ADAPTIVE, pin: '#FFFFFF', hash: 'transparent' } },

  // Web favicon: assets/brand/pin-favicon-24.svg (heavier # for tiny sizes).
  {
    file: 'favicon.png',
    size: 48,
    svg: { tile: L.cobalt, pin: L.white, hash: L.cobalt, layout: PIN_LAYOUT.favicon, glyph: 'favicon', strokeWidth: hashStrokeWidth(24) },
  },
];

for (const { file, size, opaque, svg } of targets) {
  // Rasterise at a high density so curves stay crisp, then downsample.
  let img = sharp(Buffer.from(pinSvg({ ...svg, size })), { density: 144 }).resize(size, size);
  if (opaque) img = img.flatten({ background: svg.tile }).removeAlpha();
  await img.png({ compressionLevel: 9 }).toFile(out(file));
  console.log(`wrote assets/images/${file} (${size}×${size})`);
}

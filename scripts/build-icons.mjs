// Regenerates every app icon, splash and favicon PNG from the pin mark in src/constants/brand.ts.
// Run after changing the mark or palette: `npm run icons`, then commit assets/images.
import sharp from 'sharp';

import { pinSvg } from '../src/constants/brand.ts';
import { Palette } from '../src/constants/palette.ts';

const L = Palette.light;
const D = Palette.dark;
const out = (name) => new URL(`../assets/images/${name}`, import.meta.url).pathname;

// Pin height relative to the canvas. iOS masks the 1024 tile to a rounded square, so ~60% keeps
// the mark at the same visual weight as the App icon.pdf tile.
const ICON_SCALE = 0.6;
// Android adaptive icons are cropped to the inner 66% (safe zone) of the 108dp layer.
const ADAPTIVE_SCALE = 0.4;

const targets = [
  // iOS (also the default icon for web/Expo Go). App Store icons must be opaque.
  { file: 'icon.png', size: 1024, opaque: true, svg: { tile: L.cobalt, pin: L.white, hash: L.cobalt, scale: ICON_SCALE } },
  { file: 'icon-dark.png', size: 1024, opaque: true, svg: { tile: D.night, pin: D.cobalt, hash: D.night, scale: ICON_SCALE } },
  // Tinted icons are greyscale; iOS applies the user's tint.
  { file: 'icon-tinted.png', size: 1024, opaque: true, svg: { tile: '#000000', pin: '#FFFFFF', hash: '#000000', scale: ICON_SCALE } },

  // Splash: the bare mark on Mist (light) or Night (dark), see app.json.
  { file: 'splash-icon.png', size: 600, svg: { pin: L.cobalt, hash: L.white } },
  { file: 'splash-icon-dark.png', size: 600, svg: { pin: D.cobalt, hash: D.night } },

  // Android adaptive icon layers.
  { file: 'android-icon-foreground.png', size: 512, svg: { pin: L.white, hash: L.cobalt, scale: ADAPTIVE_SCALE } },
  { file: 'android-icon-background.png', size: 512, opaque: true, svg: { tile: L.cobalt, pin: L.cobalt, hash: L.cobalt, scale: 0 } },
  { file: 'android-icon-monochrome.png', size: 432, svg: { pin: '#FFFFFF', hash: 'transparent', scale: ADAPTIVE_SCALE } },

  { file: 'favicon.png', size: 48, svg: { pin: L.cobalt, hash: L.white } },
];

for (const { file, size, opaque, svg } of targets) {
  // Rasterise at a high density so curves stay crisp, then downsample.
  let img = sharp(Buffer.from(pinSvg(svg)), { density: Math.max(72, (size / 100) * 72 * 2) }).resize(size, size);
  if (opaque) img = img.flatten({ background: svg.tile }).removeAlpha();
  await img.png({ compressionLevel: 9 }).toFile(out(file));
  console.log(`wrote assets/images/${file} (${size}×${size})`);
}

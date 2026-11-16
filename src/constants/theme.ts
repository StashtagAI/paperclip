/**
 * Design tokens from the Stashtag design brief (HAN-9, "Color theme.pdf"). Every screen reads
 * colours through `useTheme()` / `useKindColors()` / ThemedText / ThemedView, which follow the
 * system appearance. Contrast is enforced by src/constants/__tests__/theme.test.ts.
 */

import { Platform } from 'react-native';

import { Palette } from '@/constants/palette';
import type { Kind } from '@/lib/types';

export { Palette };

const L = Palette.light;
const D = Palette.dark;

export const Colors = {
  light: {
    text: L.ink,
    textSecondary: L.slate,
    background: L.mist,
    /** Cards, rows and inputs. */
    backgroundElement: L.white,
    backgroundSelected: '#E4EEFB',
    border: '#D5E3F5',
    tint: L.cobalt,
    /** Tint-coloured text (links, rating stars): Cobalt is only 4.4:1 on Mist and 3.9:1 on the selected card. */
    link: '#1A64D6',
    onTint: L.white,
    danger: '#C9252B',
    success: '#0A7A55',
  },
  dark: {
    text: D.cloud,
    // The brief has no dark muted text; this keeps ≥ 4.5:1 on both Night and Surface.
    textSecondary: '#93A6BF',
    background: D.night,
    backgroundElement: D.surface,
    backgroundSelected: '#1B3048',
    border: '#1F3550',
    tint: D.cobalt,
    link: D.cobalt,
    // White on dark Cobalt is only 2.8:1, so primary buttons use Night text in dark mode.
    onTint: D.night,
    danger: '#FF6B6B',
    success: D.mint,
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export type KindColor = {
  /** Tile and thumbnail fill. */
  color: string;
  /** Text and icons drawn on `color`. */
  onColor: string;
  /** #tag chip fill and its text. */
  chip: string;
  onChip: string;
};

/**
 * One colour per kind of save, with the text colour that is allowed on it.
 * Contrast rule from the brief: Ink on Mint and Aqua, never white (white on Mint is 2.25:1);
 * white is allowed on Cobalt (4.6:1) and Indigo (5.0:1). In dark mode the kind colours are
 * lighter and white fails on all four, so everything uses Night.
 */
export const KindColors: Record<ColorScheme, Record<Kind, KindColor>> = {
  light: {
    eats: { color: L.mint, onColor: L.ink, chip: '#D1F3E8', onChip: '#0A6E4F' },
    trips: { color: L.cobalt, onColor: L.white, chip: '#D2E2FB', onChip: '#1A4FB5' },
    recipes: { color: L.aqua, onColor: L.ink, chip: '#D8F7F7', onChip: '#0B6563' },
    do: { color: L.indigo, onColor: L.white, chip: '#DEDEFC', onChip: '#3E3FC2' },
  },
  dark: {
    eats: { color: D.mint, onColor: D.night, chip: '#194045', onChip: D.mint },
    trips: { color: D.cobalt, onColor: D.night, chip: '#1B3554', onChip: '#7DB7FF' },
    recipes: { color: D.aqua, onColor: D.night, chip: '#1E4250', onChip: D.aqua },
    do: { color: D.indigo, onColor: D.night, chip: '#263354', onChip: '#ABACFF' },
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  chip: 999,
  row: 18,
  tile: 22,
} as const;

export const MaxContentWidth = 800;

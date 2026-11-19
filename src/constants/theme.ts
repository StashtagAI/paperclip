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
    /** Text on a `danger` fill, e.g. the Delete account button. */
    onDanger: L.white,
    success: '#0A7A55',
    /** Check mark drawn on a `success` fill (HAN-41). */
    onSuccess: L.white,
    /** Done progress track (HAN-41): stays light under Increase Contrast, where `border` darkens, so the fill keeps ≥ 3:1. */
    progressTrack: '#D5E3F5',
    /** Text field outlines: the field's only edge against the page, so ≥ 3:1 (WCAG 1.4.11), unlike `border`. */
    inputBorder: '#69788F',
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
    // White on the light red is 2.8:1, so dark mode uses Night, like onTint.
    onDanger: D.night,
    success: D.mint,
    onSuccess: D.night,
    progressTrack: '#1F3550',
    inputBorder: '#6A84A3',
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type ThemeColors = Record<ThemeColor, string>;

/**
 * Overrides for Increase Contrast (iOS), High contrast text (Android) and `prefers-contrast: more` (web)
 * (HAN-78): muted text, links and status colours reach 7:1 (AAA), and card and input outlines reach 3:1.
 */
export const HighContrastColors: Record<ColorScheme, Partial<ThemeColors>> = {
  light: {
    textSecondary: '#3A4A60',
    border: '#69788F',
    tint: '#0F4FB0',
    link: '#0F4FB0',
    danger: '#9E1C22',
    success: '#065C40',
    inputBorder: '#69788F',
  },
  dark: {
    textSecondary: '#C2D0E2',
    border: '#6A84A3',
    tint: '#A6CDFF',
    link: '#A6CDFF',
    danger: '#FFA3A3',
    inputBorder: '#6A84A3',
  },
};

export function themeColors(scheme: ColorScheme, highContrast: boolean): ThemeColors {
  return highContrast ? { ...Colors[scheme], ...HighContrastColors[scheme] } : Colors[scheme];
}

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
 * white is allowed on Cobalt (4.6:1) and Indigo (5.0:1). Shop and Watch & read (HAN-84) follow the
 * same rule: Ink on Coral (white is 2.3:1), white on Berry (5.1:1). In dark mode the kind colours are
 * lighter and white fails on all of them, so everything uses Night.
 */
export const KindColors: Record<ColorScheme, Record<Kind, KindColor>> = {
  light: {
    eats: { color: L.mint, onColor: L.ink, chip: '#D1F3E8', onChip: '#0A6E4F' },
    travel: { color: L.cobalt, onColor: L.white, chip: '#D2E2FB', onChip: '#1A4FB5' },
    recipes: { color: L.aqua, onColor: L.ink, chip: '#D8F7F7', onChip: '#0B6563' },
    do: { color: L.indigo, onColor: L.white, chip: '#DEDEFC', onChip: '#3E3FC2' },
    shop: { color: L.coral, onColor: L.ink, chip: '#FFE3D6', onChip: '#A83F12' },
    watch: { color: L.berry, onColor: L.white, chip: '#FADBEA', onChip: '#9C2160' },
  },
  dark: {
    eats: { color: D.mint, onColor: D.night, chip: '#194045', onChip: D.mint },
    travel: { color: D.cobalt, onColor: D.night, chip: '#1B3554', onChip: '#7DB7FF' },
    recipes: { color: D.aqua, onColor: D.night, chip: '#1E4250', onChip: D.aqua },
    do: { color: D.indigo, onColor: D.night, chip: '#263354', onChip: '#ABACFF' },
    shop: { color: D.coral, onColor: D.night, chip: '#3D2A26', onChip: D.coral },
    watch: { color: D.berry, onColor: D.night, chip: '#3A2238', onChip: D.berry },
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

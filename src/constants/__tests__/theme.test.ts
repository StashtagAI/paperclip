import { Colors, KindColors, Palette } from '@/constants/theme';
import { KINDS } from '@/lib/types';

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;
const schemes = ['light', 'dark'] as const;

describe('brief values', () => {
  it('matches Color theme.pdf', () => {
    expect(Palette.light).toMatchObject({
      cobalt: '#1F6FEB', mint: '#19C48D', aqua: '#3DD9D6', indigo: '#5A5CF0',
      ink: '#0B1B2B', slate: '#52627A', mist: '#F4F9FF',
    });
    expect(Palette.dark).toMatchObject({
      night: '#0A1420', surface: '#122233', cobalt: '#4C9BFF', mint: '#3DE0A6',
      aqua: '#5CEBEA', indigo: '#8C8DFF', cloud: '#EAF3FF',
    });
    expect(KindColors.light.eats.color).toBe(Palette.light.mint);
    expect(KindColors.light.trips.color).toBe(Palette.light.cobalt);
    expect(KindColors.light.recipes.color).toBe(Palette.light.aqua);
    expect(KindColors.light.do.color).toBe(Palette.light.indigo);
  });

  it('never puts white text on Mint or Aqua', () => {
    for (const scheme of schemes) {
      for (const kind of ['eats', 'recipes'] as const) {
        expect(KindColors[scheme][kind].onColor).not.toBe('#FFFFFF');
      }
    }
    expect(KindColors.light.eats.onColor).toBe(Palette.light.ink);
    expect(KindColors.light.recipes.onColor).toBe(Palette.light.ink);
  });
});

describe.each(schemes)('%s contrast (AA, 4.5:1)', (scheme) => {
  const c = Colors[scheme];

  it.each(KINDS)('%s: onColor on tile and onChip on chip', (kind) => {
    const k = KindColors[scheme][kind];
    expect(contrast(k.onColor, k.color)).toBeGreaterThanOrEqual(AA);
    expect(contrast(k.onChip, k.chip)).toBeGreaterThanOrEqual(AA);
  });

  it('text and muted text on background and cards', () => {
    for (const bg of [c.background, c.backgroundElement]) {
      expect(contrast(c.text, bg)).toBeGreaterThanOrEqual(AA);
      expect(contrast(c.textSecondary, bg)).toBeGreaterThanOrEqual(AA);
      expect(contrast(c.danger, bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('primary button label on tint', () => {
    expect(contrast(c.onTint, c.tint)).toBeGreaterThanOrEqual(AA);
  });
});

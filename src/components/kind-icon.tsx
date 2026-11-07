import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import type { Kind } from '@/lib/types';

/** SF Symbols on iOS, Material Symbols on Android and web. */
const KIND_SYMBOLS: Record<Kind, SymbolViewProps['name']> = {
  eats: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  trips: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  recipes: { ios: 'frying.pan', android: 'soup_kitchen', web: 'soup_kitchen' },
  do: { ios: 'sparkle', android: 'auto_awesome', web: 'auto_awesome' },
};

export function KindIcon({ kind, color, size = 26 }: { kind: Kind; color: string; size?: number }) {
  return <SymbolView name={KIND_SYMBOLS[kind]} tintColor={color} size={size} weight="medium" />;
}

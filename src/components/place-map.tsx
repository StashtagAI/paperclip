import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { PinMark } from '@/components/pin-mark';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fitViewport, TILE_SIZE, tileUrl, type Pin } from '@/lib/geo';

const HEIGHT = 220;
const PIN = 32;
const PIN_SELECTED = 44;
/** The pin tip sits at y 114 of the 120 artboard (constants/brand.ts). */
const TIP = 114 / 120;
// OpenStreetMap's tile policy asks apps to identify themselves; browsers send a Referer instead.
const TILE_HEADERS = { 'User-Agent': 'StashtagAI/1.0 (ai.stashtag.app)' };

type Props = {
  pins: (Pin & { name: string })[];
  selectedId: string | null;
  onPinPress: (id: string) => void;
};

/**
 * A static map fitted to every pin: OpenStreetMap tiles with Stashtag pins on top. Pure JS, so it
 * renders the same on iOS, Android and web without a native maps module or API key (HAN-24).
 */
export function PlaceMap({ pins, selectedId, onPinPress }: Props) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const view = fitViewport(pins, width, HEIGHT, PIN_SELECTED);
  // Draw the selected pin last so it sits on top of its neighbours.
  const ordered = view ? [...view.pins].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId)) : [];

  return (
    <View
      style={[styles.map, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      accessibilityLabel={`Map with ${pins.length} ${pins.length === 1 ? 'place' : 'places'}`}>
      {view?.tiles.map((t) => (
        <Image
          key={t.key}
          source={{ uri: tileUrl(t), headers: TILE_HEADERS }}
          style={[styles.tile, { left: t.left, top: t.top }]}
          cachePolicy="disk"
          transition={150}
          accessible={false}
          accessibilityIgnoresInvertColors
        />
      ))}
      {ordered.map((p) => {
        const selected = p.id === selectedId;
        const size = selected ? PIN_SELECTED : PIN;
        const name = pins.find((x) => x.id === p.id)?.name ?? '';
        return (
          <Pressable
            key={p.id}
            onPress={() => onPinPress(p.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={name}
            style={[styles.pin, { left: p.left - size / 2, top: p.top - size * TIP, width: size, height: size }]}>
            <PinMark size={size} pin={selected ? theme.danger : undefined} />
          </Pressable>
        );
      })}
      <Pressable
        style={[styles.attribution, { backgroundColor: theme.backgroundElement }]}
        onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}
        accessibilityRole="link">
        <ThemedText style={styles.attributionText} themeColor="textSecondary">
          © OpenStreetMap
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    height: HEIGHT,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  tile: { position: 'absolute', width: TILE_SIZE, height: TILE_SIZE },
  pin: { position: 'absolute' },
  attribution: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.one,
    borderTopLeftRadius: Spacing.one,
    opacity: 0.85,
  },
  attributionText: { fontSize: 10, lineHeight: 14 },
});

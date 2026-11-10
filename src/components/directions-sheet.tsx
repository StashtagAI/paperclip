import { Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { appleMapsUrl, googleMapsUrl } from '@/lib/geo';
import type { ItemRow } from '@/lib/types';

type Props = {
  item: ItemRow | null;
  /** The list name (usually a city), used when the item has neither coordinates nor an address. */
  city?: string | null;
  onClose: () => void;
};

// Apple Maps only opens natively on Apple devices, so Android gets Google Maps alone.
const SHOW_APPLE = Platform.OS !== 'android';

function open(url: string) {
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer');
  else Linking.openURL(url);
}

/** Bottom sheet offering directions to a place in Apple Maps or Google Maps (HAN-24). */
export function DirectionsSheet({ item, city, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const go = (url: string) => {
    onClose();
    open(url);
  };

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      {item ? (
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.backgroundElement, paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two },
          ]}>
          <View style={styles.header}>
            <ThemedText type="defaultBold">{item.name}</ThemedText>
            {item.address ? (
              <ThemedText type="small" themeColor="textSecondary">
                {item.address}
              </ThemedText>
            ) : null}
          </View>
          {SHOW_APPLE ? <Button title="Directions in Apple Maps" onPress={() => go(appleMapsUrl(item, city))} /> : null}
          <Button title="Directions in Google Maps" onPress={() => go(googleMapsUrl(item, city))} />
          <Button title="Cancel" variant="secondary" onPress={onClose} />
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    borderTopLeftRadius: Radius.tile,
    borderTopRightRadius: Radius.tile,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  header: { gap: Spacing.one, marginBottom: Spacing.two },
});

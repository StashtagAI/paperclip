import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SIZE = 36;

/**
 * The favorite star on an item (HAN-123): an outlined pill with a hollow star, or a filled pill with a solid star, so
 * the state never rests on colour alone. The spoken name says what a tap will do, e.g. "Add Pizzeria Locale to
 * favorites". 36pt pill; hitSlop takes the tap area to 48pt.
 */
export function FavoriteStar({ favorite, name, onToggle }: { favorite: boolean; name: string; onToggle: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={favorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
      hitSlop={6}
      style={({ pressed }) => [
        styles.star,
        favorite
          ? { backgroundColor: theme.tint, borderColor: theme.tint }
          : { backgroundColor: 'transparent', borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SymbolView
          name={
            favorite
              ? { ios: 'star.fill', android: 'star', web: 'star' }
              : { ios: 'star', android: 'star_border', web: 'star_border' }
          }
          tintColor={favorite ? theme.onTint : theme.link}
          size={18}
          weight="semibold"
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  star: {
    width: SIZE,
    height: SIZE,
    borderRadius: Radius.chip,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  pressed: { opacity: 0.7 },
});

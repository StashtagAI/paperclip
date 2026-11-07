import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { KindIcon } from '@/components/kind-icon';
import { Radius, Spacing } from '@/constants/theme';
import { useKindColors } from '@/hooks/use-theme';
import { KIND_LABELS, KIND_SUBTITLES, type Kind } from '@/lib/types';

/** One of the four fixed top-level kinds on Home; opens that kind's categories and lists. */
export function KindTile({ kind }: { kind: Kind }) {
  const { color, onColor } = useKindColors()[kind];
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/kind/[kind]', params: { kind } })}
      accessibilityRole="button"
      accessibilityLabel={`${KIND_LABELS[kind]}, ${KIND_SUBTITLES[kind]}`}
      style={({ pressed }) => [styles.tile, { backgroundColor: color, opacity: pressed ? 0.85 : 1 }]}>
      <KindIcon kind={kind} color={onColor} size={30} />
      <Text style={[styles.title, { color: onColor }]}>{KIND_LABELS[kind]}</Text>
      <Text style={[styles.subtitle, { color: onColor }]} numberOfLines={1}>
        {KIND_SUBTITLES[kind]}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 132,
    borderRadius: Radius.tile,
    padding: Spacing.three,
    justifyContent: 'space-between',
  },
  title: { fontSize: 20, lineHeight: 24, fontWeight: 700, marginTop: Spacing.four },
  subtitle: { fontSize: 13.5, lineHeight: 18, fontWeight: 500 },
});

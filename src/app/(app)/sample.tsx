import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { KindIcon } from '@/components/kind-icon';
import { ProgressSteps } from '@/components/progress-steps';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useKindColors, useTheme } from '@/hooks/use-theme';
import { KIND_LABELS } from '@/lib/types';

// Made up for the example: not a real account, post or places.
const POST = {
  author: '@weekend.eats (example)',
  caption:
    'Three brunch spots in Lisbon you can’t miss. 1) Café Aurora for the custard-tart French toast. ' +
    '2) Padaria Lume, sourdough and soft eggs. 3) Jardim 31, a garden terrace, go early. #lisbon #brunch',
};
const PATH = { kind: 'eats', category: 'Brunch', list: 'Lisbon' } as const;
const ITEMS = [
  { name: 'Café Aurora', description: 'Custard-tart French toast', address: 'Rua da Aurora 14, Lisboa' },
  { name: 'Padaria Lume', description: 'Sourdough and soft eggs', address: 'Travessa do Lume 3, Lisboa' },
  { name: 'Jardim 31', description: 'Garden terrace; go early', address: 'Rua do Jardim 31, Lisboa' },
];

/**
 * First run (HAN-42): what stashing a post gives you, before you've stashed one. Static and saves nothing. Laid out
 * like the card screen so the real thing looks familiar.
 */
export default function SampleScreen() {
  const theme = useTheme();
  const kind = useKindColors()[PATH.kind];
  const box = [styles.box, { backgroundColor: theme.backgroundElement, borderColor: theme.border }];
  return (
    <Screen
      edges="none"
      footer={<Button title="Stash your first link" size="large" onPress={() => router.replace('/stash')} />}>
      <ThemedText themeColor="textSecondary">
        A made-up post and the card StashtagAI builds from it. Nothing here is saved.
      </ThemedText>

      <ThemedText type="sectionTitle" accessibilityRole="header">
        The post
      </ThemedText>
      <View style={box}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {POST.author}
        </ThemedText>
        <ThemedText type="small">{POST.caption}</ThemedText>
      </View>

      <ThemedText type="sectionTitle" accessibilityRole="header">
        What happens
      </ThemedText>
      <View style={box}>
        <ProgressSteps current="done" />
      </View>

      <ThemedText type="sectionTitle" accessibilityRole="header">
        Your card
      </ThemedText>
      <View style={styles.path}>
        <View
          style={[styles.tile, { backgroundColor: kind.color }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <KindIcon kind={PATH.kind} color={kind.onColor} size={22} />
        </View>
        <ThemedText type="defaultBold" style={styles.flex}>
          {KIND_LABELS[PATH.kind]} › {PATH.category} › {PATH.list}
        </ThemedText>
      </View>
      {ITEMS.map((item) => (
        <View key={item.name} style={box}>
          <Field label="Name" value={item.name} bold />
          <Field label="Description · from the post" value={item.description} />
          <Field label="Address · from Google Places" value={item.address} />
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        Every field says where it came from. Only what the post names is kept, and you can remove anything that’s wrong.
      </ThemedText>
    </Screen>
  );
}

function Field({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type={bold ? 'defaultBold' : 'small'}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.two },
  path: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tile: { width: 40, height: 40, borderRadius: Radius.row / 2, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 2 },
  flex: { flex: 1 },
});

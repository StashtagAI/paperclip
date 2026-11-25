import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { exportable, exportedMessage, exportFileName, listToKml, MY_MAPS_STEPS, MY_MAPS_URL, type ExportItem } from '@/lib/map-export';
import { saveKml } from '@/lib/map-export-file';
import { fetchPlan } from '@/lib/plan';
import type { Kind } from '@/lib/types';

type Props = { category: string; list: string; kind: Kind; items: ExportItem[] };

/**
 * "Export to Google My Maps" under an Eats/Travel list's map (HAN-141). Premium; on Free the button opens the paywall.
 * Exports the whole list, not just a #tag filter, and says how many items had no location to pin.
 */
export function MapExport({ category, list, kind, items }: Props) {
  const theme = useTheme();
  const plan = useAsync(fetchPlan, []);
  const premium = plan.data?.plan === 'premium';
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean; done?: boolean } | null>(null);

  const say = (text: string, opts: { error?: boolean; done?: boolean } = {}) => {
    setStatus({ text, ...opts });
    announce(opts.done ? `${text} ${MY_MAPS_STEPS.join(' ')}` : text);
  };

  async function exportList() {
    setBusy(true);
    setStatus(null);
    try {
      const current = plan.data ?? (await fetchPlan());
      if (current.plan !== 'premium') {
        router.push('/premium');
        return;
      }
      const { placed, skipped } = exportable(items);
      if (!placed.length) {
        say('None of these places has a location yet, so there’s nothing to put on a map.', { error: true });
        return;
      }
      const outcome = await saveKml(exportFileName(category, list), listToKml(`${category} › ${list}`, kind, items));
      if (outcome === 'dismissed') say('Export cancelled.');
      else say(exportedMessage(placed.length, skipped, outcome), { done: true });
    } catch (e) {
      say(`Couldn’t export: ${(e as Error).message}`, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const title = premium || plan.loading ? 'Export to Google My Maps' : 'Export to Google My Maps · Premium';
  return (
    <View style={styles.wrap}>
      <Button
        title={title}
        variant="secondary"
        loading={busy}
        onPress={exportList}
        accessibilityHint={
          premium || plan.loading
            ? Platform.OS === 'web'
              ? 'Downloads a file of this list to import into Google My Maps'
              : 'Saves a file of this list to import into Google My Maps'
            : 'A Premium feature. Opens Premium.'
        }
        icon={(color) => (
          <SymbolView name={{ ios: 'map', android: 'map', web: 'map' }} tintColor={color} size={20} weight="semibold" />
        )}
      />
      {/* Spoken on iOS by announce(); Android and web read the live region. */}
      <View accessibilityLiveRegion="polite">
        {status ? (
          <ThemedText
            type="small"
            themeColor={status.error ? 'danger' : 'textSecondary'}
            accessibilityRole={status.error ? 'alert' : undefined}>
            {status.text}
          </ThemedText>
        ) : null}
      </View>
      {status?.done ? (
        <View style={[styles.steps, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold" accessibilityRole="header">
            Next: import it into My Maps
          </ThemedText>
          {MY_MAPS_STEPS.map((step, i) => (
            <ThemedText key={step} type="small">
              {i + 1}. {step}
            </ThemedText>
          ))}
          {Platform.OS === 'web' ? (
            <Button title="Open Google My Maps" variant="secondary" accessibilityRole="link" onPress={() => Linking.openURL(MY_MAPS_URL)} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  steps: { gap: Spacing.one, padding: Spacing.three, borderRadius: Radius.row },
});

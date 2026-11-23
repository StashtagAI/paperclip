import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CheckRow } from '@/components/check-row';
import { Screen } from '@/components/screen';
import { InstacartButton } from '@/components/shop-buttons';
import { ThemedText } from '@/components/themed-text';
import { Features } from '@/constants/features';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { confirmDestructive } from '@/lib/confirm';
import { fetchRecipes } from '@/lib/data';
import { shoppingListRequest } from '@/lib/shop-links';
import { buildShoppingList, recipesLabel, shoppingListText } from '@/lib/shopping-list';
import {
  clearShoppingList,
  dropRecipes,
  toggleChecked,
  toggleRecipe,
  useShoppingSelection,
} from '@/lib/shopping-selection';
import { openShareSheet } from '@/lib/share';

/** The shopping list for the recipes picked on recipe cards (HAN-74), with lines to tick off in the shop. */
export default function ShoppingListScreen() {
  const theme = useTheme();
  const { ids, checked } = useShoppingSelection();
  const recipes = useAsync(async () => ({ asked: ids, found: await fetchRecipes(ids) }), [ids.join(',')]);
  const data = recipes.data?.found;
  const lines = useMemo(() => (data ? buildShoppingList(data) : []), [data]);
  const done = lines.filter((l) => checked.includes(l.key)).length;
  const toBuy = lines.filter((l) => !checked.includes(l.key));
  const missing = data?.filter((r) => !r.ingredients.length) ?? [];
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [sharing, setSharing] = useState(false);

  // Forget recipes deleted since they were picked.
  const result = recipes.data;
  useEffect(() => {
    if (result) dropRecipes(result.asked.filter((id) => !result.found.some((r) => r.id === id)));
  }, [result]);

  const note = (text: string, error = false) => {
    setStatus({ text, error });
    announce(text);
  };

  async function share() {
    if (!data) return;
    setSharing(true);
    try {
      const outcome = await openShareSheet(shoppingListText(lines, data.map((r) => r.name)), 'Shopping list');
      if (outcome === 'copied') note('Shopping list copied. Paste it into Notes or a message.');
      else if (outcome === 'shared') note('Shopping list sent.');
    } catch (e) {
      note(`Couldn’t share: ${(e as Error).message}`, true);
    } finally {
      setSharing(false);
    }
  }

  async function clear() {
    if (!(await confirmDestructive('Clear the shopping list?', 'This unpicks every recipe. The recipes stay saved.', 'Clear'))) return;
    clearShoppingList();
    note('Shopping list cleared.');
  }

  const loading = recipes.loading && !data;

  return (
    <Screen
      edges="none"
      footer={
        lines.length ? (
          <Button
            title="Share list"
            size="large"
            loading={sharing}
            onPress={share}
            accessibilityHint="Send it to Notes, Reminders or a message"
            icon={(color) => (
              <SymbolView
                name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
                tintColor={color}
                size={20}
                weight="semibold"
              />
            )}
          />
        ) : null
      }>
      {status ? (
        <ThemedText
          type="small"
          themeColor={status.error ? 'danger' : 'textSecondary'}
          accessibilityLiveRegion="polite"
          accessibilityRole={status.error ? 'alert' : undefined}>
          {status.text}
        </ThemedText>
      ) : null}
      {recipes.error ? (
        <ThemedText themeColor="danger" accessibilityRole="alert">
          {recipes.error.message}
        </ThemedText>
      ) : null}
      {loading ? <ActivityIndicator accessibilityLabel="Loading shopping list" /> : null}
      {!ids.length ? (
        <View style={styles.section}>
          <ThemedText themeColor="textSecondary">
            No recipes picked yet. Tick “Shopping list” on any recipe card, in one list or several, and the
            ingredients show up here.
          </ThemedText>
          <Button title="Browse recipes" onPress={() => router.push({ pathname: '/kind/[kind]', params: { kind: 'recipes' } })} />
        </View>
      ) : null}
      {data?.length ? (
        <>
          <View style={styles.section}>
            <ThemedText type="defaultBold" accessibilityRole="header">
              For {recipesLabel(data.length)}
            </ThemedText>
            {data.map((r) => (
              <CheckRow
                key={r.id}
                checked
                onPress={() => {
                  toggleRecipe(r.id);
                  note(`Removed ${r.name} from the shopping list.`);
                }}
                accessibilityLabel={`Add ${r.name} to shopping list`}
                accessibilityHint="Untick to take it off the list">
                <ThemedText>{r.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {r.list.name}
                </ThemedText>
              </CheckRow>
            ))}
            {missing.length ? (
              <ThemedText type="small" themeColor="textSecondary">
                No ingredients were found for {missing.map((r) => r.name).join(', ')}. Check the source post.
              </ThemedText>
            ) : null}
          </View>
          {lines.length ? (
            <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={styles.header}>
                <ThemedText type="defaultBold" accessibilityRole="header" style={styles.flex}>
                  To buy
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {done} of {lines.length} ticked off
                </ThemedText>
              </View>
              {lines.map((line) => {
                const got = checked.includes(line.key);
                const forWhich = data.length > 1 ? `For ${line.recipes.join(', ')}` : null;
                return (
                  <CheckRow
                    key={line.key}
                    checked={got}
                    onPress={() => toggleChecked(line.key)}
                    accessibilityLabel={forWhich ? `${line.text}. ${forWhich}` : line.text}>
                    <ThemedText
                      themeColor={got ? 'textSecondary' : 'text'}
                      style={got ? styles.got : undefined}>
                      {line.text}
                    </ThemedText>
                    {forWhich ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {forWhich}
                      </ThemedText>
                    ) : null}
                  </CheckRow>
                );
              })}
            </View>
          ) : null}
          {Features.shopLinks && lines.length ? (
            // What's still to buy: ticked-off lines are already in the basket or the cupboard.
            <InstacartButton
              request={toBuy.length ? shoppingListRequest(toBuy, data.map((r) => r.name)) : null}
              variant="primary"
            />
          ) : null}
          <Button title="Clear list" variant="secondary" onPress={clear} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  card: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.one },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: Spacing.two, paddingBottom: Spacing.one },
  flex: { flexGrow: 1 },
  got: { textDecorationLine: 'line-through' },
});

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CheckRow } from '@/components/check-row';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { announce } from '@/lib/announce';
import { addableSections, addedMessage, itemNoun as noun } from '@/lib/add-items';
import { addItemsToList, fetchAddCandidates, fetchAddTarget } from '@/lib/data';
import { refreshSharedWithMe } from '@/lib/shared-with-me';

/**
 * Adds some of the user's own items to a list (HAN-125): a list friends shared with them, or one of their own that they
 * share. Only items of the list's kind, from their other lists, and not ones whose name is already in it. Each is
 * copied; the original stays where it is.
 */
export default function AddItemsScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const load = useAsync(async () => {
    const target = await fetchAddTarget(listId);
    return target ? { target, candidates: await fetchAddCandidates(target.kind, target.id) } : null;
  }, [listId]);
  const data = load.data;
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sections = useMemo(
    () => (data ? addableSections(data.candidates, data.target.names, query) : []),
    [data, query],
  );

  const toggle = (id: string, name: string) => {
    const on = !picked.includes(id);
    setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
    announce(`${name} ${on ? 'picked' : 'not picked'}. ${picked.length + (on ? 1 : -1)} picked.`);
  };

  async function add() {
    if (!data || !picked.length) return;
    setSaving(true);
    setError(null);
    try {
      const result = await addItemsToList(data.target.id, picked);
      announce(addedMessage(result, data.target.list, data.target.kind));
      refreshSharedWithMe();
      router.back();
    } catch (e) {
      const message = `Couldn’t add: ${(e as Error).message}`;
      setError(message);
      announce(message);
      setSaving(false);
    }
  }

  const kind = data?.target.kind;
  const footer =
    data && kind ? (
      <Button
        title={picked.length ? `Add ${picked.length} ${noun(kind, picked.length)}` : `Pick ${noun(kind, 2)} to add`}
        size="large"
        loading={saving}
        disabled={!picked.length}
        onPress={add}
      />
    ) : null;

  return (
    <Screen edges="none" footer={footer}>
      <Stack.Screen options={{ title: data ? `Add to ${data.target.list}` : '' }} />
      {load.loading && load.data === undefined ? <ActivityIndicator accessibilityLabel="Loading your stash" /> : null}
      {load.error ? (
        <View style={styles.gap}>
          <ThemedText themeColor="danger" accessibilityRole="alert">
            Couldn’t load your stash: {load.error.message}
          </ThemedText>
          <Button title="Try again" variant="secondary" onPress={load.refresh} />
        </View>
      ) : null}
      {data === null ? (
        <ThemedText themeColor="textSecondary">This list isn’t shared with you anymore.</ThemedText>
      ) : null}
      {data && kind ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Pick {noun(kind, 2)} from your stash to add to {data.target.category} › {data.target.list}. They’re copied;
            yours stay where they are.{data.target.own ? '' : ' Your notes, ratings and photos aren’t shared.'}
          </ThemedText>
          {data.candidates.length ? (
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder={`Search your ${noun(kind, 2)}`}
              accessibilityLabel={`Search your ${noun(kind, 2)}`}
              autoCorrect={false}
              returnKeyType="search"
            />
          ) : null}
          {error ? (
            <ThemedText type="small" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </ThemedText>
          ) : null}
          {sections.length === 0 ? (
            <ThemedText themeColor="textSecondary" accessibilityLiveRegion="polite">
              {query.trim()
                ? `None of your ${noun(kind, 2)} match “${query.trim()}”.`
                : `You have no other ${noun(kind, 2)} to add. ${noun(kind, 2).replace(/^./, (c) => c.toUpperCase())} you stash show up here.`}
            </ThemedText>
          ) : null}
          {sections.map((section) => (
            <View key={section.key} style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
                {section.title.toUpperCase()}
              </ThemedText>
              {section.items.map((item) => (
                <CheckRow
                  key={item.id}
                  checked={picked.includes(item.id)}
                  onPress={() => toggle(item.id, item.name)}
                  accessibilityLabel={`${item.name}, from ${section.title}`}>
                  <View style={styles.text}>
                    <ThemedText type="defaultBold">{item.name}</ThemedText>
                    {item.description ? (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                        {item.description}
                      </ThemedText>
                    ) : null}
                  </View>
                </CheckRow>
              ))}
            </View>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.three },
  section: { gap: Spacing.one },
  text: { flex: 1, gap: Spacing.half },
});

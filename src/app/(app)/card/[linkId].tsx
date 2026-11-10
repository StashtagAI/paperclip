import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { deleteItem, fetchLink, fetchLinkItems, rateLink, subscribeToLink } from '@/lib/data';
import type { FieldSource, LinkDetail, LinkItem, LinkStatus, RawContent } from '@/lib/types';
import { KIND_LABELS } from '@/lib/types';

const STATUS_COPY: Record<LinkStatus, string> = {
  pending: 'Waiting for what the post says',
  processing: 'Reading the text and building your card…',
  done: 'Filed',
  failed: 'Couldn’t build this card',
};

/** Fields the model took from the text: a fetched caption (HAN-18) or text captured on the phone. */
const sourceCopy = (source: FieldSource, raw: RawContent | null) =>
  source === 'capture' && raw?.caption_source === 'fetched' ? 'from the caption (fetched)' : SOURCE_COPY[source];

const SOURCE_COPY: Record<FieldSource, string> = {
  capture: 'from the post',
  linked_site: 'from a linked site',
  places_lookup: 'from Google Places',
  search: 'from web search',
};

const ERROR_COPY: Record<string, string> = {
  no_captured_text: 'No text reached the server. Add a screenshot or paste the caption.',
  no_items_found: 'No places, recipes or things to do were named in the text.',
  timeout: 'This took too long and was stopped.',
  url_not_allowed: 'Only Instagram and TikTok links are supported.',
};

/**
 * Review (HAN-11 step 4): live status while process-link runs, then the card with each field's source so wrong items
 * can be removed. Status updates arrive over Supabase Realtime.
 */
export default function CardScreen() {
  // `sent` = we just came from Build card ("1") or Stash it ("read"), so a still-"pending" row means the request is on
  // its way.
  const { linkId, sent } = useLocalSearchParams<{ linkId: string; sent?: string }>();
  const load = useAsync(() => Promise.all([fetchLink(linkId), fetchLinkItems(linkId)]), [linkId]);
  const { refresh } = load;
  useEffect(() => subscribeToLink(linkId, refresh), [linkId, refresh]);

  const [link, items] = load.data ?? [];
  const raw = link?.raw_content ?? null;
  const first = items?.[0];
  // After Stash it, "needs_capture" is the reply; after Build card it's the row's old state until the claim lands.
  const needsCapture = sent === 'read' && link?.status === 'pending' && link.error === 'needs_capture';
  const sending = !!sent && link?.status === 'pending' && !needsCapture;
  const reading = (sent === 'read' && sending) || (link?.status === 'processing' && !!raw?.reading);

  // Safety net if a Realtime update is missed: re-read every 5 s while the card is still being built.
  const waiting = sending || link?.status === 'processing';
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [waiting, refresh]);

  // The caption couldn't be read (private post, no caption, kill switch) or named nothing: ask for what the post says.
  useEffect(() => {
    if (needsCapture) router.replace({ pathname: '/capture/[linkId]', params: { linkId } });
  }, [needsCapture, linkId]);

  return (
    <Screen
      edges="none"
      footer={
        link?.status === 'done' ? (
          <Button
            title={first ? `Open ${first.list.category.name} › ${first.list.name}` : 'Done'}
            size="large"
            onPress={() =>
              first
                ? router.replace({ pathname: '/list/[listId]', params: { listId: first.list.id } })
                : router.dismissTo('/')
            }
          />
        ) : link?.status === 'failed' || (link?.status === 'pending' && !sending) ? (
          <Button
            title={link.status === 'failed' ? 'Try again' : 'Add what the post says'}
            size="large"
            onPress={() => router.replace({ pathname: '/capture/[linkId]', params: { linkId } })}
          />
        ) : null
      }>
      <Stack.Screen options={{ title: 'Your card' }} />
      {load.error ? <ThemedText themeColor="danger">{load.error.message}</ThemedText> : null}
      {!link ? <ActivityIndicator /> : <StatusBanner link={link} sending={sending} reading={reading} />}

      {first ? (
        <ThemedText type="sectionTitle">
          {KIND_LABELS[first.list.category.kind]} › {first.list.category.name} › {first.list.name}
        </ThemedText>
      ) : null}
      {link?.status === 'done' && items?.length === 0 && !raw?.already_listed?.length ? (
        <ThemedText themeColor="textSecondary">
          {raw?.unsorted
            ? 'Nothing in the text could be sorted into a list. The text is kept with the link.'
            : 'No items were added.'}
        </ThemedText>
      ) : null}
      {items?.map((item) => (
        <ReviewItem key={item.id} item={item} raw={raw} onRemoved={refresh} />
      ))}
      {raw?.already_listed?.length ? (
        <ThemedText type="small" themeColor="textSecondary">
          Already in this list, so not added again: {raw.already_listed.join(', ')}
        </ThemedText>
      ) : null}
      {link?.status === 'done' ? <Feedback linkId={linkId} /> : null}
    </Screen>
  );
}

function StatusBanner({ link, sending, reading }: { link: LinkDetail; sending: boolean; reading: boolean }) {
  const theme = useTheme();
  const color = link.status === 'failed' ? theme.danger : link.status === 'done' ? theme.success : theme.textSecondary;
  return (
    <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {link.status === 'processing' || sending ? <ActivityIndicator /> : null}
      <View style={styles.flex}>
        <ThemedText type="defaultBold" style={{ color }} accessibilityLiveRegion="polite">
          {reading ? 'Reading the post…' : sending ? 'Sending the text…' : STATUS_COPY[link.status]}
        </ThemedText>
        {link.status === 'failed' && link.error ? (
          <ThemedText type="small" themeColor="textSecondary">
            {ERROR_COPY[link.error] ?? link.error}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  address: 'Address',
  lat: 'Map pin',
  ingredients: 'Ingredients',
  steps: 'Steps',
};

/** One extracted item with a source line per field (process-link `item_sources`). */
function ReviewItem({ item, raw, onRemoved }: { item: LinkItem; raw: RawContent | null; onRemoved: () => void }) {
  const theme = useTheme();
  const [removing, setRemoving] = useState(false);
  const sources = raw?.item_sources?.[item.name] ?? {};
  const urls = raw?.item_source_urls?.[item.name] ?? {};
  const recipe = raw?.recipe_details?.[item.name];
  const values: Record<string, string | null> = {
    name: item.name,
    description: item.description || null,
    address: item.address,
    lat: item.lat != null ? `${item.lat.toFixed(5)}, ${item.lng?.toFixed(5)}` : null,
    ingredients: recipe?.ingredients.length ? recipe.ingredients.join('\n') : null,
    steps: recipe?.steps.length ? recipe.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') : null,
  };

  async function remove() {
    setRemoving(true);
    try {
      await deleteItem(item.id);
      onRemoved();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {Object.entries(values).map(([field, value]) =>
        value ? (
          <View key={field} style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              {FIELD_LABELS[field]}
              {sources[field] ? ` · ${sourceCopy(sources[field]!, raw)}` : ''}
              {urls[field] ? ` (${hostOf(urls[field]!)})` : ''}
            </ThemedText>
            <ThemedText type={field === 'name' ? 'defaultBold' : 'small'} selectable>
              {value}
            </ThemedText>
          </View>
        ) : null,
      )}
      <Button title="Remove from list" variant="secondary" onPress={remove} loading={removing} />
    </View>
  );
}

function Feedback({ linkId }: { linkId: string }) {
  const [sent, setSent] = useState<'up' | 'down' | null>(null);
  const send = (rating: 'up' | 'down') =>
    rateLink(linkId, rating, rating === 'down' ? 'wrong_items' : undefined).then(() => setSent(rating));
  if (sent) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Thanks, noted.
      </ThemedText>
    );
  }
  return (
    <View style={styles.feedback}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
        Did we get this right?
      </ThemedText>
      <Button title="Yes" variant="secondary" onPress={() => send('up')} />
      <Button title="No" variant="secondary" onPress={() => send('down')} />
    </View>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  card: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.two },
  field: { gap: 2 },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
});

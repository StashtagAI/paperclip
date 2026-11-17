import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ProgressSteps } from '@/components/progress-steps';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { buildCard, deleteItem, deleteLink, fetchLink, fetchLinkItems, rateLink, subscribeToLink } from '@/lib/data';
import { FAILED_TITLE, failureReason, NOT_STARTED, retryAction, START_TIMEOUT_MS } from '@/lib/link-outcome';
import type { FieldSource, LinkDetail, LinkItem, LinkStatus, RawContent } from '@/lib/types';
import { KIND_LABELS } from '@/lib/types';
import { confirmDestructive } from '@/lib/confirm';
import { currentStep, stepAnnouncement, type StepKey } from '@/lib/progress';

const STATUS_COPY: Record<LinkStatus, string> = {
  pending: 'Waiting for what the post says',
  processing: 'Building your card…',
  done: 'Filed',
  failed: FAILED_TITLE,
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

/**
 * Review (HAN-11 step 4): live status while process-link runs, then the card with each field's source so wrong items
 * can be removed. Status updates arrive over Supabase Realtime.
 */
export default function CardScreen() {
  // `sent` = we just came from Build card ("1") or Stash it ("read"), so a still-"pending" row means the request is on
  // its way. `retry` = Try again on Home: send it again as soon as the card opens.
  const { linkId, sent, retry: retryParam } = useLocalSearchParams<{ linkId: string; sent?: string; retry?: string }>();
  const load = useAsync(() => Promise.all([fetchLink(linkId), fetchLinkItems(linkId)]), [linkId]);
  const { refresh } = load;
  useEffect(() => subscribeToLink(linkId, refresh), [linkId, refresh]);

  const [link, items] = load.data ?? [];
  const raw = link?.raw_content ?? null;
  const first = items?.[0];
  // After Stash it, "needs_capture" is the reply; after Build card it's the row's old state until the claim lands.
  const needsCapture = sent === 'read' && link?.status === 'pending' && link.error === 'needs_capture';
  // A run this screen started with Try again (HAN-77); the row reads "failed" until process-link claims it.
  const [retrying, setRetrying] = useState(false);
  // NOT_STARTED once the request is given up on (the row never left "pending", or Try again couldn't reach the server).
  const [localError, setLocalError] = useState<string | null>(null);
  const sending = retrying || (!!sent && link?.status === 'pending' && !needsCapture && !localError);
  const step =
    link && retrying && (link.status === 'pending' || link.status === 'failed')
      ? 'reading'
      : link
        ? currentStep(link, sending, sent)
        : null;
  const failure = localError ?? (link?.status === 'failed' && !retrying ? (link.error ?? '') : null);
  const outcome = link ? outcomeCopy(link, items ?? [], failure) : null;
  const tryAgain = link && failure != null ? retryAction(link.status, failure, sent) : null;

  // Pending rows are never swept on the server, so a request that never arrived would show "Reading the post" forever.
  // Same for Try again: until process-link claims the row it still reads "failed" (or "pending").
  const awaitingClaim =
    !localError &&
    (retrying
      ? link?.status === 'pending' || link?.status === 'failed'
      : !!sent && link?.status === 'pending' && !needsCapture);
  useEffect(() => {
    if (!awaitingClaim) return;
    const timer = setTimeout(() => {
      setRetrying(false);
      setLocalError(NOT_STARTED);
    }, START_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [awaitingClaim]);
  // The request got through after all.
  const status = link?.status;
  const [seenStatus, setSeenStatus] = useState(status);
  if (status !== seenStatus) {
    setSeenStatus(status);
    if (status === 'processing' || status === 'done') setLocalError(null);
  }

  async function retry() {
    if (tryAgain === 'capture') return router.replace({ pathname: '/capture/[linkId]', params: { linkId } });
    setLocalError(null);
    setRetrying(true);
    // "read": if the caption can't be read this time either, the needs_capture reply moves on to the capture screen.
    router.setParams({ sent: 'read', retry: undefined });
    try {
      await buildCard(linkId);
      // The server answered (maybe after the timeout above), so the row now says how it went.
      setLocalError(null);
    } catch (e) {
      console.warn('[process-link]', (e as Error).message);
      setLocalError(NOT_STARTED);
    } finally {
      setRetrying(false);
      refresh();
    }
  }

  const autoRetried = useRef(false);
  useEffect(() => {
    if (retryParam && tryAgain && !autoRetried.current) {
      autoRetried.current = true;
      retry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryParam, tryAgain]);

  // Read out each step, then how it ended, but only for a card built while the screen was open (HAN-42).
  const [justFinished, setJustFinished] = useState(false);
  const watched = useRef(false);
  useEffect(() => {
    if (step) {
      watched.current = true;
      announce(stepAnnouncement(step));
    } else if (outcome && watched.current) {
      watched.current = false;
      setJustFinished(true);
      announce(outcome);
    }
  }, [step, outcome]);

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
          <View style={styles.footer}>
            <Button
              title={first ? `Open ${first.list.category.name} › ${first.list.name}` : 'Done'}
              size="large"
              onPress={() =>
                first
                  ? router.replace({ pathname: '/list/[listId]', params: { listId: first.list.id } })
                  : router.dismissTo('/')
              }
            />
            {/* Several posts in a row (HAN-64). Back to Stash if we came from its Recent links, else open it here. */}
            <Button
              title="Stash another link"
              variant="secondary"
              size="large"
              onPress={() => router.dismissTo('/stash')}
            />
          </View>
        ) : tryAgain ? (
          <Button
            title={tryAgain === 'rerun' ? 'Try again' : 'Add what the post says'}
            accessibilityHint={tryAgain === 'rerun' ? 'Reads the post again and builds the card' : undefined}
            size="large"
            onPress={retry}
          />
        ) : link?.status === 'pending' && !sending && failure == null ? (
          <Button
            title="Add what the post says"
            size="large"
            onPress={() => router.replace({ pathname: '/capture/[linkId]', params: { linkId } })}
          />
        ) : null
      }>
      <Stack.Screen options={{ title: 'Your card' }} />
      {load.error ? <ThemedText themeColor="danger">{load.error.message}</ThemedText> : null}
      {!link ? (
        <ActivityIndicator />
      ) : (
        <StatusBanner
          link={link}
          step={step}
          outcome={outcome}
          failure={failure}
          celebrate={justFinished && link.status === 'done'}
        />
      )}

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
      {link ? <DeleteStash linkId={linkId} itemCount={items?.length ?? 0} /> : null}
    </Screen>
  );
}

/**
 * "Filed 3 items in Brunch › Lisbon": the banner headline once a card is done or failed, also read out. `failure` is the
 * error code when the card is shown as failed (by the server, or because the request never got there), else null.
 */
function outcomeCopy(link: LinkDetail, items: LinkItem[], failure: string | null): string | null {
  if (failure != null) return `${STATUS_COPY.failed}. ${failureReason(failure)}`;
  if (link.status !== 'done') return null;
  const first = items[0];
  if (!first) return link.raw_content?.unsorted ? 'Filed, but nothing could be sorted into a list' : STATUS_COPY.done;
  const n = items.length === 1 ? '1 item' : `${items.length} items`;
  return `Filed ${n} in ${first.list.category.name} › ${first.list.name}`;
}

/**
 * While the card is being built: "Step 2 of 4: …" and the steps. Afterwards: how it ended. The headline and reason sit
 * in one polite live region that stays mounted from the first step to the outcome, so TalkBack and web screen readers
 * hear each change; VoiceOver gets the same words from `announce`.
 */
function StatusBanner({
  link,
  step,
  outcome,
  failure,
  celebrate,
}: {
  link: LinkDetail;
  step: StepKey | null;
  outcome: string | null;
  failure: string | null;
  celebrate: boolean;
}) {
  const theme = useTheme();
  const failed = failure != null;
  const color = failed ? theme.danger : link.status === 'done' ? theme.success : theme.textSecondary;
  const headline = step
    ? stepAnnouncement(step)
    : failed
      ? STATUS_COPY.failed
      : (outcome ?? STATUS_COPY[link.status]);
  return (
    <View
      style={[
        styles.banner,
        step && styles.steps,
        { backgroundColor: theme.backgroundElement, borderColor: failed ? theme.danger : theme.border },
      ]}>
      {!step && link.status === 'done' ? <DoneMark color={theme.success} pop={celebrate} /> : null}
      {!step && failed ? <FailedMark color={theme.danger} /> : null}
      <View style={step ? undefined : styles.flex} accessibilityLiveRegion="polite">
        <ThemedText type={step ? 'smallBold' : 'defaultBold'} style={{ color }}>
          {headline}
        </ThemedText>
        {!step && failed ? (
          <ThemedText type="small" themeColor="textSecondary">
            {failureReason(failure)}
          </ThemedText>
        ) : null}
      </View>
      {step ? <ProgressSteps current={step} /> : null}
    </View>
  );
}

/** The failed mark next to the headline. Decorative: the headline already says it failed, so colour isn't the signal. */
function FailedMark({ color }: { color: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SymbolView
        name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
        tintColor={color}
        size={28}
        weight="semibold"
      />
    </View>
  );
}

/** The done check. Springs in when the card finished while you watched, unless Reduce Motion is on. Decorative. */
function DoneMark({ color, pop }: { color: string; pop: boolean }) {
  const reduceMotion = useReduceMotion();
  const scale = useState(() => new Animated.Value(pop && !reduceMotion ? 0.4 : 1))[0];
  useEffect(() => {
    if (!pop || reduceMotion) return scale.setValue(1);
    const anim = Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: Platform.OS !== 'web' });
    anim.start();
    return () => anim.stop();
  }, [pop, reduceMotion, scale]);
  return (
    <Animated.View
      style={{ transform: [{ scale }] }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <SymbolView
        name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
        tintColor={color}
        size={28}
        weight="semibold"
      />
    </Animated.View>
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

/** Deletes the link and everything it added (HAN-20); empty lists and categories go with it. */
function DeleteStash({ linkId, itemCount }: { linkId: string; itemCount: number }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const what = itemCount === 1 ? 'the 1 item it added' : itemCount ? `the ${itemCount} items it added` : 'the link';
    if (!(await confirmDestructive('Delete this stash?', `This removes ${what}. It can’t be undone.`, 'Delete'))) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteLink(linkId);
      router.dismissTo('/');
    } catch (e) {
      setError(`Couldn’t delete: ${(e as Error).message}`);
      setDeleting(false);
    }
  }

  return (
    <View style={styles.delete}>
      <Button title="Delete this stash" variant="secondary" onPress={remove} loading={deleting} />
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
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
  steps: { flexDirection: 'column', alignItems: 'stretch' },
  card: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.two },
  field: { gap: 2 },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  footer: { gap: Spacing.two },
  delete: { marginTop: Spacing.four, gap: Spacing.two },
});

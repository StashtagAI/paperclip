import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { KindIcon } from '@/components/kind-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Here } from '@/hooks/use-here';
import { useKindColors, useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { NEAR_KM, nearPicks, tonightPicks, usesMiles, weekPicks, type PickItem, type StashPick, type Picks } from '@/lib/picks';
import { KIND_LABELS } from '@/lib/types';

/** Above this text size the cards stack instead of scrolling sideways, so long names and big text still fit. */
const STACK_FONT_SCALE = 1.3;
const IMPERIAL = usesMiles(Intl.DateTimeFormat().resolvedOptions().locale);
const NEAR_LABEL = IMPERIAL ? `${Math.round(NEAR_KM / 1.609344)} mi` : `${NEAR_KM} km`;

// Gentle fades; Reanimated skips them when Reduce Motion is on.
const sectionIn = FadeInDown.duration(320).reduceMotion(ReduceMotion.System);
const cardIn = FadeIn.duration(240).reduceMotion(ReduceMotion.System);

type Props = {
  items: PickItem[];
  now: Date;
  here: Here;
  onUseLocation: () => Promise<Here>;
};

function announce(message: string) {
  // After the re-render, so VoiceOver doesn't talk over the button it's still focused on.
  setTimeout(() => AccessibilityInfo.announceForAccessibility(message), 150);
}

const names = (picks: Picks) => picks.picks.map((p) => p.item.name).join(', ');

/** Home's "living" picks from the user's own stash: Tonight, Near you, Try this week (HAN-48). */
export function HomePicks({ items, now, here, onUseLocation }: Props) {
  const [rounds, setRounds] = useState({ tonight: 0, near: 0, week: 0 });
  const at = here.status === 'ready' ? here.at : null;
  const compute = (r: typeof rounds) => {
    const tonight = tonightPicks(items, now, r.tonight);
    const near = at ? nearPicks(items, at, IMPERIAL, r.near) : null;
    // Tonight is eats and recipes, so only Near you can repeat a Try this week place.
    const shown = new Set(near?.picks.map((p) => p.item.id));
    return { tonight, near, week: weekPicks(items, now, shown, r.week) };
  };
  const { tonight, near, week } = compute(rounds);

  function next(key: keyof typeof rounds, title: string) {
    const r = { ...rounds, [key]: rounds[key] + 1 };
    setRounds(r);
    haptic.refresh();
    const picks = compute(r)[key];
    if (picks) announce(`${title}: ${names(picks)}`);
  }

  async function findNearby() {
    const result = await onUseLocation();
    if (result.status === 'ready') {
      haptic.refresh();
      const found = nearPicks(items, result.at, IMPERIAL);
      announce(found.picks.length ? `Near you: ${names(found)}` : `Nothing you’ve saved is within ${NEAR_LABEL}.`);
    } else if (result.status === 'denied') {
      announce('Location wasn’t allowed.');
    } else if (result.status === 'error') {
      announce('Couldn’t find where you are.');
    }
  }

  return (
    <>
      {tonight.picks.length ? <Section title="Tonight" picks={tonight} onOthers={() => next('tonight', 'Tonight')} /> : null}
      {near ? (
        <Section
          title="Near you"
          picks={near}
          onOthers={() => next('near', 'Near you')}
          empty={`Nothing you’ve saved is within ${NEAR_LABEL}.`}
        />
      ) : here.status === 'off' || here.status === 'ready' ? null : (
        <NearPrompt here={here} onUseLocation={findNearby} />
      )}
      {week.picks.length ? <Section title="Try this week" picks={week} onOthers={() => next('week', 'Try this week')} /> : null}
    </>
  );
}

function Section({ title, picks, onOthers, empty }: { title: string; picks: Picks; onOthers: () => void; empty?: string }) {
  const theme = useTheme();
  const stacked = useWindowDimensions().fontScale >= STACK_FONT_SCALE;

  const cards = picks.picks.map((pick) => <PickCard key={pick.item.id} pick={pick} stacked={stacked} />);
  return (
    <Animated.View entering={sectionIn} style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText type="sectionTitle" accessibilityRole="header" style={styles.flex}>
          {title}
        </ThemedText>
        {picks.more ? (
          <Pressable
            onPress={onOthers}
            accessibilityRole="button"
            accessibilityLabel={`Show other picks for ${title}`}
            hitSlop={8}
            style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
            <SymbolView
              name={{ ios: 'arrow.triangle.2.circlepath', android: 'refresh', web: 'refresh' }}
              tintColor={theme.text}
              size={20}
              weight="semibold"
            />
          </Pressable>
        ) : null}
      </View>
      {!picks.picks.length && empty ? (
        <ThemedText themeColor="textSecondary">{empty}</ThemedText>
      ) : stacked ? (
        <View style={styles.stack}>{cards}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel} contentContainerStyle={styles.carouselContent}>
          {cards}
        </ScrollView>
      )}
    </Animated.View>
  );
}

function PickCard({ pick: { item, reason }, stacked }: { pick: StashPick; stacked: boolean }) {
  const theme = useTheme();
  const kind = item.list.category.kind;
  const k = useKindColors()[kind];
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const pressTo = (to: number) => {
    if (!reduceMotion) scale.set(withSpring(to, { damping: 18, stiffness: 320 }));
  };

  return (
    <Animated.View entering={cardIn} style={[stacked ? styles.cardStacked : styles.card, pressStyle]}>
      <Pressable
        onPress={() => {
          haptic.select();
          router.push({ pathname: '/list/[listId]', params: { listId: item.list.id } });
        }}
        onPressIn={() => pressTo(0.97)}
        onPressOut={() => pressTo(1)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}. ${KIND_LABELS[kind]}. ${reason}`}
        accessibilityHint={`Opens ${item.list.name}`}
        style={({ pressed }) => [
          styles.cardInner,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          pressed && reduceMotion && styles.pressed,
        ]}>
        <View style={[styles.thumb, { backgroundColor: k.color }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <KindIcon kind={kind} color={k.onColor} size={22} />
        </View>
        <ThemedText type="defaultBold" numberOfLines={stacked ? undefined : 2}>
          {item.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={stacked ? undefined : 2}>
          {reason}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

/** "Near you" before there's a position: an opt-in button, progress, or how to turn location back on. */
function NearPrompt({ here, onUseLocation }: { here: Exclude<Here, { status: 'off' | 'ready' }>; onUseLocation: () => void }) {
  const theme = useTheme();
  const blocked = here.status === 'denied' && !here.canAskAgain;
  const message =
    here.status === 'locating'
      ? 'Finding places near you…'
      : here.status === 'error'
        ? `Couldn’t find where you are: ${here.message}`
        : blocked
          ? Platform.OS === 'web'
            ? 'Location is blocked for this site. Allow it in your browser’s site settings to see saved places near you.'
            : 'Location is off for Stashtag. Turn it on in Settings to see saved places near you.'
          : 'See places you’ve saved that are close by. Your location stays on your phone.';

  return (
    <Animated.View entering={sectionIn} style={styles.section}>
      <ThemedText type="sectionTitle" accessibilityRole="header">
        Near you
      </ThemedText>
      <View style={[styles.prompt, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {here.status === 'locating' ? <ActivityIndicator color={theme.tint} accessibilityElementsHidden /> : null}
        <ThemedText
          type="small"
          themeColor={here.status === 'error' ? 'danger' : 'textSecondary'}
          accessibilityRole={here.status === 'error' ? 'alert' : undefined}>
          {message}
        </ThemedText>
        {here.status === 'locating' ? null : blocked ? (
          Platform.OS === 'web' ? null : (
            <Button title="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
          )
        ) : (
          <Button
            title={here.status === 'error' ? 'Try again' : 'Use my location'}
            variant="secondary"
            onPress={onUseLocation}
            icon={(color) => (
              <SymbolView name={{ ios: 'location', android: 'near_me', web: 'near_me' }} tintColor={color} size={18} />
            )}
          />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  flex: { flex: 1 },
  iconButton: { width: 44, height: 44, borderRadius: Radius.chip, alignItems: 'center', justifyContent: 'center' },
  // Bleed to the screen edge so cards scroll under the page padding.
  carousel: { marginHorizontal: -Spacing.four },
  carouselContent: { paddingHorizontal: Spacing.four, gap: Spacing.two + 2 },
  stack: { gap: Spacing.two + 2 },
  card: { width: 200 },
  cardStacked: { width: '100%' },
  cardInner: {
    flexGrow: 1,
    gap: Spacing.one,
    padding: Spacing.three - 2,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  thumb: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.one },
  prompt: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  pressed: { opacity: 0.7 },
});

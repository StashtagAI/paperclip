import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Linking, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import {
  disableDigest,
  disableNearby,
  enableDigest,
  enableNearby,
  getNudgeStatus,
  nudgesSupported,
  setDigestSlot,
  type EnableResult,
} from '@/lib/nudge-service';
import { formatDigestSlot, formatDigestTime, shiftDigestMinutes, WEEKDAYS, type DigestSlot } from '@/lib/nudges';

const DENIED: Record<Exclude<EnableResult, 'on'>, string> = {
  'notifications-denied': 'Stashtag isn’t allowed to send notifications. Turn them on in Settings, then try again.',
  'location-denied': 'Nearby nudges need your location. Allow it in Settings, then try again.',
  'background-denied':
    'Nearby nudges need location set to “Always” (iPhone) or “Allow all the time” (Android), so they work while the app is closed. Change it in Settings, then try again.',
};

/** Opt-in smart nudges (HAN-43): saved places near you and a weekly digest. */
export default function NudgesScreen() {
  const status = useAsync(getNudgeStatus, []);
  const [busy, setBusy] = useState<'nearby' | 'digest' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Permissions may have changed in Settings while we were away.
  const { refresh } = status;
  useFocusEffect(useCallback(() => void refresh(), [refresh]));

  const toggle = async (which: 'nearby' | 'digest', on: boolean) => {
    setBusy(which);
    setProblem(null);
    const label = which === 'nearby' ? 'Nearby nudges' : 'Weekly digest';
    try {
      if (on) {
        const result = await (which === 'nearby' ? enableNearby() : enableDigest());
        if (result === 'on') AccessibilityInfo.announceForAccessibility(`${label} on`);
        else {
          setProblem(DENIED[result]);
          AccessibilityInfo.announceForAccessibility(DENIED[result]);
        }
      } else {
        await (which === 'nearby' ? disableNearby() : disableDigest());
        AccessibilityInfo.announceForAccessibility(`${label} off`);
      }
    } catch (e) {
      const message = `Couldn’t change ${label.toLowerCase()}: ${e instanceof Error ? e.message : String(e)}`;
      setProblem(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  if (!nudgesSupported) {
    return (
      <Screen edges="none">
        <ThemedText themeColor="textSecondary">
          Nudges work in the Stashtag app for iPhone and Android. Open it there to turn them on.
        </ThemedText>
      </Screen>
    );
  }

  const s = status.data;
  const nearbyBlocked = !!s?.nearby && !(s.notificationsAllowed && s.backgroundLocationAllowed);
  const digestBlocked = !!s?.digest && !s.notificationsAllowed;

  return (
    <Screen edges="none">
      <ThemedText themeColor="textSecondary">
        Gentle reminders so the places and ideas you save don’t get forgotten. They’re off until you turn them on, and
        your location never leaves your phone.
      </ThemedText>

      {!s ? (
        status.error ? (
          <ThemedText themeColor="danger" accessibilityRole="alert">
            Couldn’t read your nudge settings: {status.error.message}
          </ThemedText>
        ) : (
          <ActivityIndicator accessibilityLabel="Loading" />
        )
      ) : (
        <>
          <ToggleRow
            title="Saved places near me"
            detail="When you’re near something you saved, like “You saved 3 places near here”. At most 2 a day, none between 9 pm and 8 am, and never the same spot twice in a week."
            value={s.nearby}
            busy={busy === 'nearby'}
            onChange={(on) => toggle('nearby', on)}
          />
          {nearbyBlocked ? (
            <Blocked message="Nearby nudges are paused: they need notifications and location set to “Always” (iPhone) or “Allow all the time” (Android)." />
          ) : null}

          <ToggleRow
            title="Weekly digest"
            detail={`${formatDigestSlot(s.digestSlot)}: how much you saved that week and one thing from your stash to try.`}
            value={s.digest}
            busy={busy === 'digest'}
            onChange={(on) => toggle('digest', on)}
          />
          {s.digest ? <DigestWhen saved={s.digestSlot} onSaved={refresh} onError={setProblem} /> : null}
          {digestBlocked ? <Blocked message="The weekly digest is paused: notifications are off for Stashtag." /> : null}
        </>
      )}

      {problem ? (
        <View style={styles.problem}>
          <ThemedText type="small" themeColor="danger">
            {problem}
          </ThemedText>
          <Button title="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
        </View>
      ) : null}
    </Screen>
  );
}

type ToggleRowProps = { title: string; detail: string; value: boolean; busy: boolean; onChange: (on: boolean) => void };

/** A whole-row switch: one VoiceOver/TalkBack element with name, state and the explanation as its hint. */
function ToggleRow({ title, detail, value, busy, onChange }: ToggleRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={detail}
      accessibilityState={{ checked: value, busy, disabled: busy }}
      disabled={busy}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <View style={styles.rowText}>
        <ThemedText type="defaultBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      {busy ? (
        <ActivityIndicator importantForAccessibility="no-hide-descendants" accessibilityElementsHidden />
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ true: theme.tint }}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        />
      )}
    </Pressable>
  );
}

type DigestWhenProps = { saved: DigestSlot; onSaved: () => void; onError: (message: string) => void };

/**
 * Day and time of the weekly digest. Changes show at once and are saved (and the digest rescheduled) after a short
 * pause, so stepping the time several times reschedules once.
 */
function DigestWhen({ saved, onSaved, onError }: DigestWhenProps) {
  const theme = useTheme();
  const [slot, setSlot] = useState(saved);
  const pending = useRef<{ slot: DigestSlot; timer: ReturnType<typeof setTimeout> } | null>(null);

  const save = useCallback(
    async (next: DigestSlot) => {
      pending.current = null;
      try {
        await setDigestSlot(next);
        AccessibilityInfo.announceForAccessibility(`Weekly digest set for ${formatDigestSlot(next)}`);
        onSaved();
      } catch (e) {
        const message = `Couldn’t change the digest time: ${e instanceof Error ? e.message : String(e)}`;
        onError(message);
        AccessibilityInfo.announceForAccessibility(message);
      }
    },
    [onSaved, onError],
  );

  // Leaving the screen mid-pause still saves.
  useEffect(
    () => () => {
      if (!pending.current) return;
      clearTimeout(pending.current.timer);
      setDigestSlot(pending.current.slot).catch(() => {});
    },
    [],
  );

  const change = (next: DigestSlot) => {
    setSlot(next);
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { slot: next, timer: setTimeout(() => save(next), 800) };
  };

  const time = formatDigestTime(slot.minutes);
  const earlier = shiftDigestMinutes(slot.minutes, -1);
  const later = shiftDigestMinutes(slot.minutes, 1);

  return (
    <View style={styles.when}>
      <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
        Digest day
      </ThemedText>
      <View accessibilityRole="radiogroup" accessibilityLabel="Digest day" style={styles.chips}>
        {WEEKDAYS.map((day, weekday) => {
          const selected = slot.weekday === weekday;
          return (
            <Pressable
              key={day}
              accessibilityRole="radio"
              aria-checked={selected}
              accessibilityLabel={day}
              onPress={() => change({ ...slot, weekday })}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                  borderColor: selected ? theme.tint : theme.border,
                  borderWidth: selected ? 2 : StyleSheet.hairlineWidth * 2,
                },
                pressed && styles.pressed,
              ]}>
              <ThemedText type={selected ? 'smallBold' : 'small'}>
                {selected ? '✓ ' : ''}
                {day.slice(0, 3)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
        Digest time
      </ThemedText>
      <View style={styles.stepper}>
        <Button
          title="Earlier"
          variant="secondary"
          accessibilityHint="Moves the digest 30 minutes earlier"
          disabled={earlier === slot.minutes}
          onPress={() => change({ ...slot, minutes: earlier })}
        />
        {/* Swipe up or down with VoiceOver/TalkBack to change the time without the buttons. */}
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Digest time"
          accessibilityValue={{ text: time }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={({ nativeEvent }) =>
            change({ ...slot, minutes: nativeEvent.actionName === 'increment' ? later : earlier })
          }
          style={styles.time}>
          <ThemedText type="defaultBold">{time}</ThemedText>
        </View>
        <Button
          title="Later"
          variant="secondary"
          accessibilityHint="Moves the digest 30 minutes later"
          disabled={later === slot.minutes}
          onPress={() => change({ ...slot, minutes: later })}
        />
      </View>
    </View>
  );
}

function Blocked({ message }: { message: string }) {
  return (
    <View style={styles.problem}>
      <ThemedText type="small" themeColor="danger">
        {message}
      </ThemedText>
      <Button title="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 48,
    padding: Spacing.three,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  rowText: { flex: 1, gap: Spacing.one },
  pressed: { opacity: 0.7 },
  problem: { gap: Spacing.two },
  when: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: 48,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.chip,
  },
  stepper: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three },
  time: { minHeight: 48, minWidth: 96, alignItems: 'center', justifyContent: 'center' },
});

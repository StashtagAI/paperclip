import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
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
  type EnableResult,
} from '@/lib/nudge-service';

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
            detail="Sunday at 10 am: how much you saved that week and one thing from your stash to try."
            value={s.digest}
            busy={busy === 'digest'}
            onChange={(on) => toggle('digest', on)}
          />
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
});

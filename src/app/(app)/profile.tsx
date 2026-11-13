import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useSchemePreference, type SchemePreference } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { SUPPORT_EMAIL, appVersion, signOutEverywhere, signOutHere, supportMailto } from '@/lib/account';
import { appLockSupported, authenticate, biometricName, useAppLock } from '@/lib/app-lock';
import { useAuth } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';

const SCHEMES: { value: SchemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/** Profile (HAN-34): appearance, security (HAN-49), feedback, support, billing (later) and account deletion. */
export default function ProfileScreen() {
  const { session } = useAuth();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);

  async function contactSupport() {
    const url = supportMailto();
    try {
      await Linking.openURL(url);
    } catch {
      showAlert('No email app found', `Email us at ${SUPPORT_EMAIL}.`);
    }
  }

  async function startSignOutEverywhere() {
    const ok = await confirmDestructive(
      'Sign out everywhere?',
      'This signs you out on every phone and browser, including this one. Other devices are signed out within an hour. You can sign in again with your email.',
      'Sign out everywhere',
    );
    if (!ok) return;
    setSigningOut(true);
    try {
      await signOutEverywhere();
      toast('Signed out on all your devices');
    } catch (e) {
      setSigningOut(false);
      showAlert('Couldn’t sign out everywhere', `${(e as Error).message}. Check your connection and try again.`);
    }
  }

  // Step 1 of 2: explain what goes. Step 2 is the delete-account sheet, where the user types DELETE.
  async function startDelete() {
    const ok = await confirmDestructive(
      'Delete your account?',
      'This permanently deletes your account and all your data: your stashes, categories, lists, items and feedback. It can’t be undone.',
      'Continue',
    );
    if (ok) router.push('/delete-account');
  }

  return (
    <Screen edges="none">
      <View style={styles.account}>
        <ThemedText type="small" themeColor="textSecondary">
          Signed in as
        </ThemedText>
        <ThemedText type="defaultBold" selectable>
          {session?.user.email ?? 'Unknown email'}
        </ThemedText>
      </View>

      <Section title="Appearance">
        <SchemePicker />
      </Section>

      <Section title="Security">
        {appLockSupported ? <AppLockRow /> : null}
        <Row
          title={signingOut ? 'Signing out…' : 'Sign out everywhere'}
          subtitle="Sign out on all your phones and browsers"
          hint="Asks you to confirm"
          disabled={signingOut}
          onPress={startSignOutEverywhere}
        />
      </Section>

      <Section title="Help">
        <Row title="Send feedback" subtitle="Report a bug or share an idea" onPress={() => router.push('/feedback')} />
        <Row
          title="Contact support"
          subtitle={SUPPORT_EMAIL}
          role="link"
          hint="Opens your email app"
          onPress={contactSupport}
        />
      </Section>

      <Section title="Billing">
        <Row title="Plans and billing" subtitle="Coming soon" disabled />
      </Section>

      <Section title="Account">
        <Row title="Sign out" subtitle="On this device" onPress={signOutHere} />
        <Row
          title="Delete account"
          subtitle="Permanently delete your account and data"
          tone="danger"
          hint="Asks you to confirm twice"
          onPress={startDelete}
        />
      </Section>

      <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
        Stashtag {appVersion}
      </ThemedText>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

/** System / Light / Dark as a radio group. The selected option has a check mark and a border, not just colour. */
function SchemePicker() {
  const theme = useTheme();
  const { preference, setPreference } = useSchemePreference();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={styles.segments}>
      {SCHEMES.map(({ value, label }) => {
        const selected = preference === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            aria-checked={selected}
            accessibilityLabel={value === 'system' ? 'System, follows your device' : label}
            onPress={() => setPreference(value)}
            style={({ pressed }) => [
              styles.segment,
              {
                backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                borderColor: selected ? theme.tint : theme.border,
                borderWidth: selected ? 2 : StyleSheet.hairlineWidth * 2,
              },
              pressed && styles.pressed,
            ]}>
            <ThemedText type={selected ? 'smallBold' : 'small'}>
              {selected ? '✓ ' : ''}
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Face ID lock on/off (HAN-49). Both directions ask for Face ID first: turning it on proves it works on this phone,
 * and turning it off can't be done by someone holding the unlocked phone without it.
 */
function AppLockRow() {
  const theme = useTheme();
  const toast = useToast();
  const { enabled, setEnabled } = useAppLock();
  const [name, setName] = useState('Face ID');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    biometricName().then(setName);
  }, []);

  async function toggle() {
    if (busy) return;
    const next = !enabled;
    setBusy(true);
    const result = await authenticate(next ? `Turn on ${name} lock` : `Turn off ${name} lock`);
    setBusy(false);
    if (result.ok) {
      setEnabled(next);
      toast(next ? `${name} lock is on` : `${name} lock is off`);
    } else if (result.message) {
      showAlert(`Couldn’t turn ${next ? 'on' : 'off'} ${name} lock`, result.message);
    }
  }

  // One control for VoiceOver/TalkBack: the row is the switch, and the visual Switch inside is hidden from them.
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="switch"
      accessibilityLabel={`${name} lock`}
      accessibilityHint={`Asks for ${name} when you open Stashtag`}
      accessibilityState={{ checked: enabled, busy }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <View style={styles.rowText}>
        <ThemedText type="defaultBold">{name} lock</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {enabled ? 'On. ' : 'Off. '}Ask for {name} when you open Stashtag
        </ThemedText>
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none">
        <Switch value={enabled} disabled={busy} trackColor={{ true: theme.tint }} />
      </View>
    </Pressable>
  );
}

type RowProps = {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  disabled?: boolean;
  tone?: ThemeColor;
  role?: 'button' | 'link';
  hint?: string;
};

function Row({ title, subtitle, onPress, disabled, tone, role = 'button', hint }: RowProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={hint}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <View style={styles.rowText}>
        <ThemedText type="defaultBold" themeColor={disabled ? 'textSecondary' : tone}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {disabled ? null : (
        <ThemedText themeColor="textSecondary" importantForAccessibility="no" accessibilityElementsHidden>
          ›
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  account: { gap: Spacing.half },
  section: { gap: Spacing.two },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  segment: {
    flexGrow: 1,
    flexBasis: 90,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.row,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    padding: Spacing.three,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: Spacing.two,
  },
  rowText: { flex: 1 },
  pressed: { opacity: 0.7 },
  version: { textAlign: 'center', marginTop: Spacing.two },
});

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useSchemePreference, type SchemePreference } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { SUPPORT_EMAIL, appVersion, supportMailto } from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';

const SCHEMES: { value: SchemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Profile (HAN-34): appearance, feedback, support, billing (later) and account deletion. */
export default function ProfileScreen() {
  const { session } = useAuth();

  async function contactSupport() {
    const url = supportMailto();
    try {
      await Linking.openURL(url);
    } catch {
      const message = `Email us at ${SUPPORT_EMAIL}.`;
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('No email app found', message);
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
        <Row title="Sign out" onPress={() => supabase.auth.signOut()} />
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

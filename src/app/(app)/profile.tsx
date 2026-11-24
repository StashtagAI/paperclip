import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { DisplayNameForm } from '@/components/display-name-form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useSchemePreference, type SchemePreference } from '@/hooks/use-color-scheme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { fetchIsAdmin } from '@/lib/admin';
import { SUPPORT_EMAIL, appVersion, signOutEverywhere, signOutHere, supportMailto } from '@/lib/account';
import { appLockSupported, authenticate, biometricName, useAppLock } from '@/lib/app-lock';
import { useAuth } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { fetchDisplayName } from '@/lib/data';
import { allowanceLine, fetchPlan, planTitle } from '@/lib/plan';
import { PROVIDER_NAMES, SOCIAL_PROVIDERS, isAppleRelayEmail, linkedProviders, socialErrorMessage, type SocialProvider } from '@/lib/sign-in-providers';
import { continueWith } from '@/lib/social-auth';
import { openTutorial } from '@/lib/tutorial';
import { supabase } from '@/lib/supabase';

const SCHEMES: { value: SchemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/**
 * Profile (HAN-34): your name (HAN-71), sign-in methods (HAN-112), appearance, security (HAN-49), feedback, support,
 * the tutorial (HAN-137), plan (HAN-132), the admin portal for admins (HAN-128) and account deletion.
 */
export default function ProfileScreen() {
  const { session } = useAuth();
  const displayName = useAsync(fetchDisplayName, []);
  // HAN-128: a convenience only; admin_stats() checks again on the server. A failed check just hides the row.
  const isAdmin = useAsync(fetchIsAdmin, []);
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
      'This signs you out on every phone and browser, including this one. Other devices are signed out within an hour. You can sign in again afterwards.',
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
        {isAppleRelayEmail(session?.user.email) ? (
          <ThemedText type="small" themeColor="textSecondary">
            Apple’s Hide My Email address. Friends who share lists with you need to use this address.
          </ThemedText>
        ) : null}
      </View>

      <Section title="Your name">
        <ThemedText type="small" themeColor="textSecondary">
          Friends see this name on lists you share with them, not your email.
        </ThemedText>
        {displayName.error ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            Couldn’t load your name: {displayName.error.message}
          </ThemedText>
        ) : displayName.loading && displayName.data === undefined ? null : (
          <DisplayNameForm name={displayName.data ?? null} onSaved={() => displayName.refresh()} />
        )}
      </Section>

      <Section title="Sign-in methods">
        <SignInMethods />
      </Section>

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
        <Row
          title="How StashtagAI works"
          subtitle="A quick tour of stashing and your lists"
          hint="Opens the tutorial"
          onPress={() => openTutorial(session?.user.id ?? null)}
        />
        <Row title="Send feedback" subtitle="Report a bug or share an idea" onPress={() => router.push('/feedback')} />
        <Row
          title="Contact support"
          subtitle={SUPPORT_EMAIL}
          role="link"
          hint="Opens your email app"
          onPress={contactSupport}
        />
      </Section>

      <Section title="Plan">
        <PlanRow />
      </Section>

      {isAdmin.data ? (
        <Section title="Admin">
          <Row title="Admin portal" subtitle="Usage, costs, users and stashes" onPress={() => router.push('/admin')} />
        </Section>
      ) : null}

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

/** Free or Premium and this month's AI stashes (HAN-132). Re-read when Profile comes back into view, e.g. after buying. */
function PlanRow() {
  const plan = useAsync(fetchPlan, []);
  const { poll } = plan;
  useFocusEffect(useCallback(() => void poll(), [poll]));
  if (plan.error && !plan.data) {
    return (
      <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
        Couldn’t load your plan: {plan.error.message}
      </ThemedText>
    );
  }
  if (!plan.data) return null;
  const premium = plan.data.plan === 'premium';
  return (
    <Row
      title={premium ? planTitle(plan.data) : 'Free plan: see Premium'}
      subtitle={allowanceLine(plan.data)}
      hint={premium ? 'Shows your Premium details' : 'Shows Premium prices'}
      onPress={() => router.push('/premium')}
    />
  );
}

/**
 * Google, Apple and Facebook on this account (HAN-112). Same-email accounts are joined automatically; connecting here
 * covers a different email, such as Apple's Hide My Email. On web, connecting leaves the page and comes back here.
 */
function SignInMethods() {
  const toast = useToast();
  const identities = useAsync(async () => {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) throw error;
    return linkedProviders(data.identities);
  }, []);
  const [busy, setBusy] = useState<SocialProvider | null>(null);

  async function connect(provider: SocialProvider) {
    setBusy(provider);
    try {
      const result = await continueWith(provider, 'link');
      if (result === 'redirecting') return;
      if (result === 'done') {
        toast(`${PROVIDER_NAMES[provider]} connected`);
        identities.refresh();
      }
    } catch (e) {
      showAlert(`Couldn’t connect ${PROVIDER_NAMES[provider]}`, socialErrorMessage(provider, e as Error, 'connect'));
    }
    setBusy(null);
  }

  if (identities.error) {
    return (
      <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
        Couldn’t load your sign-in methods: {identities.error.message}
      </ThemedText>
    );
  }
  if (!identities.data) return null;
  return (
    <>
      {SOCIAL_PROVIDERS.map((provider) =>
        identities.data!.has(provider) ? (
          <Row key={provider} title={PROVIDER_NAMES[provider]} subtitle="✓ Connected. You can sign in with it." status />
        ) : (
          <Row
            key={provider}
            title={busy === provider ? `Connecting ${PROVIDER_NAMES[provider]}…` : `Connect ${PROVIDER_NAMES[provider]}`}
            subtitle={`Sign in with ${PROVIDER_NAMES[provider]} too`}
            disabled={!!busy}
            onPress={() => connect(provider)}
          />
        ),
      )}
    </>
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
  /** Information, not a control: read as one line of text, with no chevron. */
  status?: boolean;
};

function Row({ title, subtitle, onPress, disabled, tone, role = 'button', hint, status }: RowProps) {
  const theme = useTheme();
  if (status) {
    return (
      <View
        accessible
        accessibilityRole="text"
        style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.rowText}>
          <ThemedText type="defaultBold">{title}</ThemedText>
          {subtitle ? (
            <ThemedText type="small" themeColor="textSecondary">
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      </View>
    );
  }
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

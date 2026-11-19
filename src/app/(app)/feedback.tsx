import { router } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { submitFeedback, type FeedbackCategory } from '@/lib/account';
import { feedbackErrorMessage } from '@/lib/rate-limit';

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'idea', label: 'Idea' },
  { value: 'other', label: 'Other' },
];
const MAX = 4000;

/**
 * "Send feedback" sheet from Profile (HAN-34). Saved to the `feedback` table with the app version and platform.
 * The server caps sends per account (HAN-38); hitting the cap keeps the draft and says to try later.
 */
export default function FeedbackScreen() {
  const theme = useTheme();
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const empty = !message.trim();

  async function send() {
    setSaving(true);
    setError(null);
    try {
      await submitFeedback(message, category);
      router.back();
      toast('Thanks! Your feedback was sent.');
    } catch (e) {
      const text = feedbackErrorMessage(e as Error);
      setError(text);
      // iOS has no live regions; Android/web use the one below.
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen edges="none">
      <ThemedText themeColor="textSecondary">
        Tell us what went wrong or what you’d like to see.
      </ThemedText>
      <TextField
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={MAX}
        textAlignVertical="top"
        placeholder="Your feedback"
        accessibilityLabel="Your feedback"
        style={styles.message}
      />

      <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
        Category (optional)
      </ThemedText>
      <View accessibilityRole="radiogroup" accessibilityLabel="Category, optional" style={styles.chips}>
        {CATEGORIES.map(({ value, label }) => {
          const selected = category === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              aria-checked={selected}
              accessibilityLabel={label}
              accessibilityHint={selected ? 'Tap again to clear' : undefined}
              onPress={() => setCategory(selected ? null : value)}
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
                {label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View accessibilityLiveRegion="polite" aria-live="polite">
        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {error}
          </ThemedText>
        ) : null}
      </View>

      <Button title="Send feedback" onPress={send} loading={saving} disabled={empty} />
      <Button title="Cancel" variant="secondary" onPress={() => router.back()} disabled={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  message: { minHeight: 160, paddingTop: Spacing.three, paddingBottom: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: 48,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.chip,
  },
  pressed: { opacity: 0.7 },
});

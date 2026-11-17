import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { announce } from '@/lib/announce';
import { saveDisplayName } from '@/lib/data';
import { cleanDisplayName, DISPLAY_NAME_MAX } from '@/lib/display-name';

type Props = {
  /** The saved name, or null if there isn't one yet. Read once, on mount. */
  name: string | null;
  onSaved: (name: string) => void;
};

/**
 * "Your name" (HAN-71): the name friends see on lists you share with them, instead of your email. On Profile, and in
 * the share panel until it's set.
 */
export function DisplayNameForm({ name, onSaved }: Props) {
  const [value, setValue] = useState(name ?? '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  const cleaned = cleanDisplayName(value);
  const unchanged = cleaned === (name ?? '');

  async function save() {
    if (!cleaned || unchanged) return;
    setSaving(true);
    setStatus(null);
    try {
      const saved = await saveDisplayName(cleaned);
      setValue(saved);
      const text = `Saved. Friends see “${saved}”.`;
      setStatus({ text });
      announce(text);
      onSaved(saved);
    } catch (e) {
      const text = `Couldn’t save your name: ${(e as Error).message}`;
      setStatus({ text, error: true });
      announce(text);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextField
        value={value}
        onChangeText={(text) => {
          setValue(text);
          setStatus(null);
        }}
        onSubmitEditing={save}
        placeholder="Your name"
        accessibilityLabel="Your name"
        accessibilityHint="Friends see this on lists you share with them"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="done"
        maxLength={DISPLAY_NAME_MAX}
        invalid={!!status?.error}
        editable={!saving}
      />
      {status ? (
        <ThemedText
          type="small"
          themeColor={status.error ? 'danger' : 'textSecondary'}
          accessibilityRole={status.error ? 'alert' : undefined}
          accessibilityLiveRegion="polite">
          {status.text}
        </ThemedText>
      ) : null}
      <Button title="Save name" variant="secondary" loading={saving} disabled={!cleaned || unchanged} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.two },
});

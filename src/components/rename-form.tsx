import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type RenameField = { key: string; label: string; value: string; maxLength: number };

/**
 * Inline rename (HAN-20): one text field per name, Save and Cancel. `onSave` gets only the fields that changed and
 * throws a user-facing error to keep the form open.
 */
export function RenameForm({
  fields,
  onSave,
  onCancel,
}: {
  fields: RenameField[];
  onSave: (changed: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = Object.fromEntries(
    fields.filter((f) => values[f.key].trim() !== f.value).map((f) => [f.key, values[f.key]]),
  );
  const empty = fields.some((f) => !values[f.key].trim());

  async function save() {
    if (!Object.keys(changed).length) return onCancel();
    setSaving(true);
    setError(null);
    try {
      await onSave(changed);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {fields.map((f, i) => (
        <View key={f.key} style={styles.field}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {f.label}
          </ThemedText>
          <TextField
            value={values[f.key]}
            onChangeText={(text) => {
              setValues((v) => ({ ...v, [f.key]: text }));
              setError(null);
            }}
            maxLength={f.maxLength}
            autoFocus={i === 0}
            autoCapitalize="words"
            returnKeyType={i === fields.length - 1 ? 'done' : 'next'}
            onSubmitEditing={i === fields.length - 1 ? save : undefined}
            accessibilityLabel={f.label}
            invalid={!!error}
          />
        </View>
      ))}
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={saving} style={styles.flex} />
        <Button title="Save" onPress={save} loading={saving} disabled={empty} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.three },
  field: { gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});

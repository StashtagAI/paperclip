import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { announce } from '@/lib/announce';
import { confirmDestructive } from '@/lib/confirm';

/**
 * A destructive button that asks first (HAN-62). `onDelete` does the work and navigates away; if it throws, the error
 * is shown and read out.
 */
export function DeleteButton({
  title,
  confirmTitle,
  confirmMessage,
  onDelete,
}: {
  title: string;
  confirmTitle: string;
  confirmMessage: string;
  onDelete: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!(await confirmDestructive(confirmTitle, confirmMessage, 'Delete'))) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      announce('Deleted');
    } catch (e) {
      const text = `Couldn’t delete: ${(e as Error).message}`;
      setError(text);
      announce(text);
      setDeleting(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Button title={title} variant="secondary" onPress={remove} loading={deleting} />
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
});

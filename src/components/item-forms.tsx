import { useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteItem, ITEM_NAME_MAX, reportItem, updateItem } from '@/lib/data';
import { REPORT_REASONS, REPORT_REASON_LABELS, type ItemRow, type ReportReason } from '@/lib/types';

const announce = (message: string) => AccessibilityInfo.announceForAccessibility(message);

/** Panel shared by the edit and report forms: a bordered block with an inline error that is announced. */
function Panel({ children, error }: { children: React.ReactNode; error: string | null }) {
  const theme = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {children}
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

/** Edit one item's name, description and address. Changing the address clears the map pin (updateItem). */
export function ItemEditForm({ item, onDone }: { item: ItemRow; onDone: (saved: boolean) => void }) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description);
  const [address, setAddress] = useState(item.address ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed =
    name.trim() !== item.name || description.trim() !== item.description || address.trim() !== (item.address ?? '');
  const pinWillGo = item.lat != null && address.trim() !== (item.address ?? '');

  async function save() {
    if (!changed) return onDone(false);
    setSaving(true);
    setError(null);
    try {
      await updateItem(item, { name, description, address });
      announce('Saved');
      onDone(true);
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      announce(`Couldn’t save. ${message}`);
      setSaving(false);
    }
  }

  return (
    <Panel error={error}>
      <Labelled label="Name">
        <TextField value={name} onChangeText={setName} maxLength={ITEM_NAME_MAX} autoFocus accessibilityLabel="Name" invalid={!!error} />
      </Labelled>
      <Labelled label="Description">
        <TextField
          value={description}
          onChangeText={setDescription}
          multiline
          style={styles.multiline}
          accessibilityLabel="Description"
        />
      </Labelled>
      <Labelled label="Address">
        <TextField value={address} onChangeText={setAddress} accessibilityLabel="Address" autoComplete="street-address" />
      </Labelled>
      {pinWillGo ? (
        <ThemedText type="small" themeColor="textSecondary">
          Changing the address removes this item’s map pin.
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        <Button title="Cancel" variant="secondary" onPress={() => onDone(false)} disabled={saving} style={styles.flex} />
        <Button title="Save" onPress={save} loading={saving} disabled={!name.trim()} style={styles.flex} />
      </View>
    </Panel>
  );
}

/** "Wrong?": pick why, optionally remove it, and send the report to extraction QA. */
export function ReportItemForm({ item, onDone }: { item: ItemRow; onDone: (result: 'sent' | 'removed' | 'cancelled') => void }) {
  const theme = useTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [remove, setRemove] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!reason) return;
    setSending(true);
    setError(null);
    try {
      await reportItem(item.id, reason, note, remove);
      // Report first: it snapshots the item, which the delete would otherwise take away.
      if (remove) await deleteItem(item.id);
      announce(remove ? 'Report sent. Item removed.' : 'Report sent. Thanks.');
      onDone(remove ? 'removed' : 'sent');
    } catch (e) {
      setError(`Couldn’t send the report: ${(e as Error).message}`);
      announce('Couldn’t send the report');
      setSending(false);
    }
  }

  return (
    <Panel error={error}>
      <ThemedText type="defaultBold" accessibilityRole="header">
        What’s wrong with “{item.name}”?
      </ThemedText>
      <View accessibilityRole="radiogroup" style={styles.field}>
        {REPORT_REASONS.map((r) => {
          const selected = reason === r;
          return (
            <Pressable
              key={r}
              onPress={() => setReason(r)}
              accessibilityRole="radio"
              accessibilityLabel={REPORT_REASON_LABELS[r]}
              accessibilityState={{ selected, checked: selected }}
              style={styles.option}>
              <View style={[styles.radio, { borderColor: selected ? theme.tint : theme.textSecondary }]}>
                {selected ? <View style={[styles.radioDot, { backgroundColor: theme.tint }]} /> : null}
              </View>
              <ThemedText type={selected ? 'defaultBold' : 'default'} style={styles.flex}>
                {REPORT_REASON_LABELS[r]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <Labelled label="Anything else? (optional)">
        <TextField value={note} onChangeText={setNote} maxLength={1000} multiline style={styles.multiline} accessibilityLabel="Anything else, optional" />
      </Labelled>
      <Pressable
        onPress={() => setRemove((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityLabel="Also remove it from my list"
        accessibilityState={{ checked: remove }}
        style={styles.option}>
        <View style={[styles.check, { borderColor: remove ? theme.tint : theme.textSecondary, backgroundColor: remove ? theme.tint : 'transparent' }]}>
          {remove ? <ThemedText type="smallBold" style={{ color: theme.onTint }}>✓</ThemedText> : null}
        </View>
        <ThemedText style={styles.flex}>Also remove it from my list</ThemedText>
      </Pressable>
      <View style={styles.actions}>
        <Button title="Cancel" variant="secondary" onPress={() => onDone('cancelled')} disabled={sending} style={styles.flex} />
        <Button title="Send report" onPress={send} loading={sending} disabled={!reason} style={styles.flex} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.three },
  field: { gap: Spacing.one },
  multiline: { minHeight: 88, paddingTop: Spacing.two, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});

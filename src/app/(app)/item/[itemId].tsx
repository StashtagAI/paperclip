import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ratingLabel, StarRating } from '@/components/star-rating';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { confirmDestructive } from '@/lib/confirm';
import {
  addItemPhoto,
  deleteItemPhoto,
  fetchItem,
  ITEM_LIMITS,
  rateItem,
  saveItemNote,
  updatePhotoAlt,
  type ItemPhoto,
  type PickedPhoto,
} from '@/lib/data';
import { KIND_LABELS } from '@/lib/types';

/** One item with the user's own rating, note and photos (HAN-45). Opened from a list's item card. */
export default function ItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const item = useAsync(() => fetchItem(itemId), [itemId]);
  const data = item.data;

  return (
    <Screen edges="none">
      <Stack.Screen options={{ title: data?.name ?? '' }} />
      {item.error ? (
        <ThemedText themeColor="danger" accessibilityRole="alert">
          {item.error.message}
        </ThemedText>
      ) : null}
      {item.loading && !data ? <ActivityIndicator accessibilityLabel="Loading" /> : null}
      {data ? (
        <>
          <View style={styles.head}>
            <ThemedText type="sectionTitle" accessibilityRole="header">
              {data.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {KIND_LABELS[data.list.category.kind]} › {data.list.category.name} › {data.list.name}
            </ThemedText>
            {data.description ? <ThemedText type="small">{data.description}</ThemedText> : null}
            {data.address ? (
              <ThemedText type="small" themeColor="textSecondary" selectable>
                {data.address}
              </ThemedText>
            ) : null}
          </View>
          <Rating itemId={data.id} initial={data.rating} />
          <Note itemId={data.id} initial={data.note} />
          <Photos itemId={data.id} photos={data.photos} onChanged={item.refresh} />
        </>
      ) : null}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="defaultBold" accessibilityRole="header">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

/** A visible status line that Android and web read out as a live region; iOS gets `announce`. */
function Status({ text, error }: { text: string | null; error?: boolean }) {
  if (!text) return null;
  return (
    <ThemedText
      type="small"
      themeColor={error ? 'danger' : 'textSecondary'}
      accessibilityLiveRegion={error ? 'assertive' : 'polite'}
      accessibilityRole={error ? 'alert' : undefined}>
      {text}
    </ThemedText>
  );
}

function Rating({ itemId, initial }: { itemId: string; initial: number | null }) {
  const [rating, setRating] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  async function change(next: number | null) {
    const previous = rating;
    setRating(next);
    setSaving(true);
    try {
      await rateItem(itemId, next);
      const text = next ? `Rated ${ratingLabel(next)}` : 'Rating cleared';
      setStatus({ text });
      announce(text);
    } catch (e) {
      setRating(previous);
      const text = `Couldn’t save the rating: ${(e as Error).message}`;
      setStatus({ text, error: true });
      announce(text);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Your rating">
      <StarRating rating={rating} onChange={change} disabled={saving} />
      <Status text={status?.text ?? null} error={status?.error} />
    </Section>
  );
}

function Note({ itemId, initial }: { itemId: string; initial: string }) {
  const [saved, setSaved] = useState(initial);
  const [note, setNote] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const dirty = note.trim() !== saved;

  async function save() {
    setSaving(true);
    try {
      await saveItemNote(itemId, note);
      setSaved(note.trim());
      setNote(note.trim());
      setStatus({ text: 'Note saved' });
      announce('Note saved');
    } catch (e) {
      const text = `Couldn’t save the note: ${(e as Error).message}`;
      setStatus({ text, error: true });
      announce(text);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Your note">
      <TextField
        value={note}
        onChangeText={(text) => {
          setNote(text);
          setStatus(null);
        }}
        multiline
        maxLength={ITEM_LIMITS.note}
        placeholder="What you thought, what to order, who to bring…"
        accessibilityLabel="Your note"
        textAlignVertical="top"
        style={styles.note}
      />
      <View style={styles.actions}>
        {dirty ? <Button title="Save note" onPress={save} loading={saving} style={styles.flex} /> : null}
        {dirty ? (
          <Button
            title="Undo changes"
            variant="secondary"
            onPress={() => setNote(saved)}
            disabled={saving}
            style={styles.flex}
          />
        ) : null}
      </View>
      <Status text={status?.text ?? null} error={status?.error} />
    </Section>
  );
}

function Photos({ itemId, photos, onChanged }: { itemId: string; photos: ItemPhoto[]; onChanged: () => Promise<void> }) {
  const theme = useTheme();
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  const report = (text: string, error?: boolean) => {
    setStatus({ text, error });
    announce(text);
  };

  async function pick() {
    setStatus(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (result.canceled) return;
    const { uri, mimeType, width, height } = result.assets[0];
    setPicked({ uri, mimeType, width, height });
  }

  return (
    <Section title="Your photos">
      {photos.length === 0 && !picked ? (
        <ThemedText type="small" themeColor="textSecondary">
          No photos yet.
        </ThemedText>
      ) : null}
      {photos.map((photo, i) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          position={`Photo ${i + 1} of ${photos.length}`}
          onChanged={onChanged}
          report={report}
        />
      ))}
      {picked ? (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <PhotoImage uri={picked.uri} width={picked.width} height={picked.height} label="The photo you picked, not saved yet" />
          <AltForm
            initial=""
            saveTitle="Save photo"
            onCancel={() => setPicked(null)}
            onSave={async (alt) => {
              await addItemPhoto(itemId, picked, alt);
              await onChanged();
              setPicked(null);
              report('Photo added');
            }}
          />
        </View>
      ) : (
        <Button title="Add a photo" variant="secondary" onPress={pick} />
      )}
      <Status text={status?.text ?? null} error={status?.error} />
    </Section>
  );
}

function PhotoCard({
  photo,
  position,
  onChanged,
  report,
}: {
  photo: ItemPhoto;
  position: string;
  onChanged: () => Promise<void>;
  report: (text: string, error?: boolean) => void;
}) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function remove() {
    if (!(await confirmDestructive('Remove this photo?', 'It’s deleted from your stash. This can’t be undone.', 'Remove'))) return;
    setRemoving(true);
    try {
      await deleteItemPhoto(photo);
      await onChanged();
      report('Photo removed');
    } catch (e) {
      report(`Couldn’t remove the photo: ${(e as Error).message}`, true);
      setRemoving(false);
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {photo.url ? (
        <PhotoImage uri={photo.url} width={photo.width} height={photo.height} label={`${position}: ${photo.alt}`} />
      ) : (
        <ThemedText type="small" themeColor="danger">
          {position} couldn’t be loaded.
        </ThemedText>
      )}
      {editing ? (
        <AltForm
          initial={photo.alt}
          saveTitle="Save description"
          onCancel={() => setEditing(false)}
          onSave={async (alt) => {
            await updatePhotoAlt(photo.id, alt);
            await onChanged();
            setEditing(false);
            report('Description saved');
          }}
        />
      ) : (
        <>
          {/* Shown so sighted users can check what screen readers hear; the image already speaks it, so hide this. */}
          <ThemedText type="small" themeColor="textSecondary" importantForAccessibility="no" accessibilityElementsHidden>
            {photo.alt}
          </ThemedText>
          <View style={styles.actions}>
            <Button
              title="Edit description"
              accessibilityLabel={`Edit description of ${position.toLowerCase()}`}
              variant="secondary"
              onPress={() => setEditing(true)}
              disabled={removing}
              style={styles.flex}
            />
            <Button
              title="Remove"
              accessibilityLabel={`Remove ${position.toLowerCase()}`}
              variant="secondary"
              onPress={remove}
              loading={removing}
              style={styles.flex}
            />
          </View>
        </>
      )}
    </View>
  );
}

function PhotoImage({ uri, width, height, label }: { uri: string; width?: number | null; height?: number | null; label: string }) {
  // Keep the photo's shape, but don't let a tall one take more than a screen's worth of scrolling.
  const aspectRatio = width && height ? Math.max(width / height, 0.6) : 4 / 3;
  return (
    <Image
      source={{ uri }}
      style={[styles.photo, { aspectRatio }]}
      contentFit="cover"
      transition={0}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    />
  );
}

/** The required description for a photo, read out by VoiceOver and TalkBack. `onSave` throws a user-facing error. */
function AltForm({
  initial,
  saveTitle,
  onSave,
  onCancel,
}: {
  initial: string;
  saveTitle: string;
  onSave: (alt: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [alt, setAlt] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (error) announce(error);
  }, [error]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(alt);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      <ThemedText type="smallBold" themeColor="textSecondary" importantForAccessibility="no" accessibilityElementsHidden>
        Describe this photo (required)
      </ThemedText>
      <TextField
        value={alt}
        onChangeText={(text) => {
          setAlt(text);
          setError(null);
        }}
        autoFocus
        multiline
        maxLength={ITEM_LIMITS.alt}
        placeholder="e.g. Pistachio croissant on a blue plate"
        accessibilityLabel="Describe this photo, required"
        accessibilityHint="Read out by VoiceOver and TalkBack"
        invalid={!!error}
        textAlignVertical="top"
      />
      <ThemedText type="small" themeColor="textSecondary">
        Say what’s in it, so it can be read out to you or anyone using a screen reader.
      </ThemedText>
      <Status text={error} error />
      <View style={styles.actions}>
        <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={saving} style={styles.flex} />
        <Button title={saveTitle} onPress={save} loading={saving} disabled={!alt.trim()} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { gap: Spacing.one },
  section: { gap: Spacing.two, marginTop: Spacing.two },
  note: { minHeight: 120, paddingTop: Spacing.three, paddingBottom: Spacing.three },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  flex: { flexGrow: 1, flexBasis: 140 },
  card: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.two },
  photo: { width: '100%', borderRadius: Radius.row - Spacing.two },
  form: { gap: Spacing.two },
});

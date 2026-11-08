import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { hasText, SOURCE_LABELS, toCaptured, type Segment } from '@/lib/capture/draft';
import { recognizeText } from '@/lib/capture/ocr';
import { recordingText, recordingTranscript } from '@/lib/capture/recording';
import { downloadModel, isModelDownloaded, MODEL_LABEL } from '@/lib/capture/transcribe';
import { buildCard, fetchLink } from '@/lib/data';
import { PLATFORM_LABELS } from '@/lib/types';

const native = Platform.OS !== 'web';
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * Capture (HAN-11, approach 1A): the share sheet only gives us the link, so the user adds what the post says.
 * Screenshots and recordings are read on the device (OCR, frame OCR, whisper.rn); only the resulting text is sent.
 */
export default function CaptureScreen() {
  const { linkId } = useLocalSearchParams<{ linkId: string }>();
  const link = useAsync(() => fetchLink(linkId), [linkId]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const nextId = useRef(0);

  const add = (segment: Omit<Segment, 'id'>) => {
    const id = String(nextId.current++);
    setSegments((s) => [...s, { ...segment, id }]);
    return id;
  };
  const update = (id: string, patch: Partial<Segment>) =>
    setSegments((s) => s.map((seg) => (seg.id === id ? { ...seg, ...patch } : seg)));
  const remove = (id: string) => setSegments((s) => s.filter((seg) => seg.id !== id));

  async function addScreenshots() {
    setError(null);
    // The system photo picker lists newest first; badges number the picks so the caption reads in order.
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 10,
      quality: 1,
    });
    if (picked.canceled) return;
    const total = picked.assets.length;
    await Promise.all(
      picked.assets.map(async (asset, i) => {
        const started = Date.now();
        const id = add({ source: 'screenshot', label: `Screenshot ${i + 1} of ${total}`, status: 'working', text: '' });
        try {
          const text = await recognizeText(asset.uri);
          update(id, { status: 'ready', text, note: `Read in ${seconds(Date.now() - started)}` });
        } catch (e) {
          update(id, { status: 'failed', note: (e as Error).message });
        }
      }),
    );
  }

  async function addRecording() {
    setError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', quality: 1 });
    if (picked.canceled) return;
    const { uri, duration } = picked.assets[0];

    const textId = add({ source: 'recording_text', label: 'Screen recording', status: 'working', text: '' });
    const audioId = add({ source: 'recording_audio', label: 'Screen recording', status: 'working', text: '' });
    await Promise.all([
      recordingText(uri, duration)
        .then(({ lines, frames, ms }) =>
          update(textId, {
            status: 'ready',
            text: lines.join('\n'),
            note: `${frames} frames read in ${seconds(ms)}, ${lines.length} unique lines`,
          }),
        )
        .catch((e: Error) => update(textId, { status: 'failed', note: e.message })),
      transcribe(audioId, uri),
    ]);
  }

  async function transcribe(id: string, uri: string) {
    try {
      if (!isModelDownloaded()) {
        setBusy(`Downloading ${MODEL_LABEL}…`);
        await downloadModel((f) => setBusy(`Downloading ${MODEL_LABEL}… ${Math.round(f * 100)}%`));
        setBusy(null);
      }
      update(id, { note: 'Transcribing on this phone…' });
      const out = await recordingTranscript(uri);
      if (!out) return update(id, { status: 'failed', note: 'This recording has no sound.' });
      update(id, {
        status: 'ready',
        text: out.text,
        note: `Audio extracted in ${seconds(out.extractMs)}, transcribed in ${seconds(out.transcribeMs)}`,
      });
    } catch (e) {
      setBusy(null);
      update(id, { status: 'failed', note: (e as Error).message });
    }
  }

  async function pasteCaption() {
    setError(null);
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) return setError('The clipboard is empty. In Instagram or TikTok, copy the caption first.');
    add({ source: 'caption', label: 'From the clipboard', status: 'ready', text });
  }

  const captured = toCaptured(segments);
  const working = segments.some((s) => s.status === 'working');

  function onBuild() {
    setBuilding(true);
    // Don't wait for the run (extraction + lookups can take a while): the review screen follows it live. If the call
    // fails before the function claims the link, the link stays "pending" and review offers to capture again.
    buildCard(linkId, captured).catch((e: Error) => console.warn('[process-link]', e.message));
    router.replace({ pathname: '/card/[linkId]', params: { linkId, sent: '1' } });
  }

  return (
    <Screen
      edges="none"
      footer={
        <Button
          title="Build card"
          size="large"
          onPress={onBuild}
          loading={building}
          disabled={working || !hasText(captured)}
        />
      }>
      <Stack.Screen options={{ title: 'Add what the post says' }} />
      {link.data ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {PLATFORM_LABELS[link.data.platform]} · {link.data.url.replace(/^https:\/\/(www\.)?/, '')}
        </ThemedText>
      ) : null}
      <ThemedText themeColor="textSecondary">
        {native
          ? 'Add screenshots of the expanded caption, a screen recording of the reel, or paste the caption. One is enough; more helps. Pictures and video stay on this phone, only the text is sent.'
          : 'Paste the caption or upload screenshots of it. Screenshots are read in your browser; only the text is sent.'}
      </ThemedText>

      <View style={styles.actions}>
        <Button title={native ? 'Add screenshots' : 'Upload screenshots'} variant="secondary" onPress={addScreenshots} />
        {native ? <Button title="Add screen recording" variant="secondary" onPress={addRecording} /> : null}
        <Button title="Paste caption" variant="secondary" onPress={pasteCaption} />
      </View>
      {busy ? (
        <ThemedText type="small" themeColor="textSecondary">
          {busy}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}

      {segments.map((segment) => (
        <SegmentCard
          key={segment.id}
          segment={segment}
          onChange={(text) => update(segment.id, { text })}
          onRemove={() => remove(segment.id)}
        />
      ))}
    </Screen>
  );
}

/** One captured source; the text is editable so OCR/transcription mistakes can be fixed before sending. */
function SegmentCard({ segment, onChange, onRemove }: { segment: Segment; onChange: (text: string) => void; onRemove: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold" style={styles.flex}>
          {SOURCE_LABELS[segment.source]} · {segment.label}
        </ThemedText>
        {segment.status === 'working' ? <ActivityIndicator /> : null}
        <ThemedText type="smallBold" themeColor="tint" onPress={onRemove} accessibilityRole="button">
          Remove
        </ThemedText>
      </View>
      {segment.note ? (
        <ThemedText type="small" themeColor={segment.status === 'failed' ? 'danger' : 'textSecondary'}>
          {segment.note}
        </ThemedText>
      ) : null}
      {segment.status === 'ready' ? (
        <TextField
          value={segment.text}
          onChangeText={onChange}
          multiline
          style={styles.text}
          accessibilityLabel={`${SOURCE_LABELS[segment.source]} text`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: Spacing.two },
  card: { padding: Spacing.three, borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  text: { minHeight: 96, maxHeight: 240, paddingVertical: Spacing.two, textAlignVertical: 'top' },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { buildCard, fetchLink, fetchRecentLinks, submitLink } from '@/lib/data';
import { checkLink } from '@/lib/link-filter';
import { supabase } from '@/lib/supabase';
import type { LinkRow, LinkStatus } from '@/lib/types';

type Feedback = { tone: 'danger' | 'success'; text: string } | null;

/**
 * "Stash a link": paste an Instagram/TikTok URL (or arrive here from the share sheet with `?url=`). The link is saved
 * and process-link reads the post's caption itself (HAN-18); the card screen follows it live and opens the capture
 * screen if the caption can't be read or names nothing.
 */
export default function StashScreen() {
  const { url: sharedUrl } = useLocalSearchParams<{ url?: string }>();
  const [input, setInput] = useState(sharedUrl ?? '');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const links = useAsync(fetchRecentLinks, []);

  async function save(value: string) {
    const result = checkLink(value);
    if (!result.ok) return setFeedback({ tone: 'danger', text: result.message });
    setSaving(true);
    try {
      const { id, outcome } = await submitLink(result);
      setInput('');
      setFeedback(null);
      // A post stashed before: show where it got to rather than paying to read it again.
      if (outcome === 'duplicate') {
        const prev = await fetchLink(id);
        if (prev.status === 'done' || prev.status === 'processing')
          return router.replace({ pathname: '/card/[linkId]', params: { linkId: id } });
        if (prev.error === 'needs_capture') return router.replace({ pathname: '/capture/[linkId]', params: { linkId: id } });
      }
      // Don't wait: reading the post can take ~30 s and the card screen shows it live.
      buildCard(id).catch((e: Error) => console.warn('[process-link]', e.message));
      router.replace({ pathname: '/card/[linkId]', params: { linkId: id, sent: 'read' } });
    } catch (e) {
      setFeedback({ tone: 'danger', text: `Couldn’t save the link: ${(e as Error).message}` });
    } finally {
      setSaving(false);
    }
  }
  const onSubmit = () => save(input);

  // A link from the share sheet is saved straight away, once.
  const autoSaved = useRef(false);
  useEffect(() => {
    if (sharedUrl && !autoSaved.current) {
      autoSaved.current = true;
      save(sharedUrl);
    }
  }, [sharedUrl]);

  return (
    <Screen
      edges="none"
      refreshControl={<RefreshControl refreshing={links.loading && !!links.data} onRefresh={links.refresh} />}>
      <ThemedText themeColor="textSecondary">Paste an Instagram post or reel, or a TikTok video link.</ThemedText>

      <TextField
        value={input}
        onChangeText={(text) => {
          setInput(text);
          if (feedback?.tone === 'danger') setFeedback(null);
        }}
        placeholder="https://www.instagram.com/reel/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        textContentType="URL"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        invalid={feedback?.tone === 'danger'}
        accessibilityLabel="Instagram or TikTok link"
      />
      <Button title="Stash it" onPress={onSubmit} loading={saving} disabled={!input.trim()} />
      {feedback ? (
        <ThemedText type="small" themeColor={feedback.tone} accessibilityRole="alert">
          {feedback.text}
        </ThemedText>
      ) : null}

      <ThemedText type="smallBold" style={styles.sectionTitle}>
        Recent links
      </ThemedText>
      {links.error ? (
        <ThemedText type="small" themeColor="danger">
          {links.error.message}
        </ThemedText>
      ) : links.data?.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Nothing saved yet.
        </ThemedText>
      ) : (
        links.data?.map((link) => <LinkRowView key={link.id} link={link} />)
      )}

      <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} style={styles.signOut} />
    </Screen>
  );
}

const STATUS_LABEL: Record<LinkStatus, string> = {
  pending: 'Needs text',
  processing: 'Processing',
  done: 'Filed',
  failed: 'Failed',
};

function LinkRowView({ link }: { link: LinkRow }) {
  const theme = useTheme();
  const color = link.status === 'failed' ? theme.danger : link.status === 'done' ? theme.success : theme.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/card/[linkId]', params: { linkId: link.id } })}
      style={[styles.linkRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.linkText}>
        <ThemedText type="small" numberOfLines={1}>
          {link.url.replace(/^https:\/\/(www\.)?/, '')}
        </ThemedText>
        {link.status === 'failed' && link.error ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {link.error}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="smallBold" style={{ color }}>
        {STATUS_LABEL[link.status]}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { marginTop: Spacing.three },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  linkText: { flex: 1 },
  signOut: { marginTop: Spacing.four },
});

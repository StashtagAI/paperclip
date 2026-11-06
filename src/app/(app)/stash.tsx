import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { fetchRecentLinks, submitLink } from '@/lib/data';
import { checkLink } from '@/lib/link-filter';
import { supabase } from '@/lib/supabase';
import type { LinkRow, LinkStatus } from '@/lib/types';

type Feedback = { tone: 'danger' | 'success'; text: string } | null;

/** "Stash a link": paste an Instagram/TikTok URL; process-link sorts it into a kind > category > list. */
export default function StashScreen() {
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const links = useAsync(fetchRecentLinks, []);

  async function onSubmit() {
    const result = checkLink(input);
    if (!result.ok) return setFeedback({ tone: 'danger', text: result.message });
    setSaving(true);
    try {
      const outcome = await submitLink(result);
      setInput('');
      setFeedback({
        tone: 'success',
        text: outcome === 'duplicate' ? 'You already saved that post.' : 'Saved. We’ll sort it into your lists shortly.',
      });
      links.refresh();
    } catch (e) {
      setFeedback({ tone: 'danger', text: `Couldn’t save the link: ${(e as Error).message}` });
    } finally {
      setSaving(false);
    }
  }

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
  pending: 'Queued',
  processing: 'Processing',
  done: 'Filed',
  failed: 'Failed',
};

function LinkRowView({ link }: { link: LinkRow }) {
  const theme = useTheme();
  const color = link.status === 'failed' ? theme.danger : link.status === 'done' ? theme.success : theme.textSecondary;
  return (
    <View style={[styles.linkRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.linkText}>
        <ThemedText type="small" numberOfLines={1}>
          {link.url.replace(/^https:\/\/(www\.)?/, '')}
        </ThemedText>
        {link.error ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {link.error}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="smallBold" style={{ color }}>
        {STATUS_LABEL[link.status]}
      </ThemedText>
    </View>
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

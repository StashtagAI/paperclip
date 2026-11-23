import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Linking, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import {
  failureLabel,
  fetchAdminStats,
  formatCompact,
  formatCount,
  formatDay,
  formatSeconds,
  formatShare,
  formatUsd,
  formatUsdPer,
  isNotAdmin,
  type AdminStats,
} from '@/lib/admin';
import { announce } from '@/lib/announce';

const APP_STORE_ANALYTICS = 'https://appstoreconnect.apple.com/analytics';

/**
 * Admin portal (HAN-128): usage, estimated API spend, users and stashes across every account. Only accounts in
 * admin_users can load it; admin_stats() refuses everyone else, so a deep link here shows nothing to them. Every number
 * is plain text (no charts), so it reads the same with VoiceOver, TalkBack and large text.
 */
export default function AdminScreen() {
  const stats = useAsync(fetchAdminStats, []);
  const s = stats.data;
  const status = stats.loading
    ? s
      ? 'Refreshing stats…'
      : 'Loading stats…'
    : stats.error
      ? isNotAdmin(stats.error)
        ? 'This page is only for Stashtag admins.'
        : `Couldn’t load stats: ${stats.error.message}`
      : 'Stats updated';

  // Say when a load or refresh finishes, or fails. Android and web read the live status line below.
  useEffect(() => {
    if (!stats.loading) announce(status);
  }, [stats.loading, status]);

  if (stats.error && isNotAdmin(stats.error)) {
    return (
      <Screen edges="none">
        <ThemedText accessibilityRole="alert">This page is only for Stashtag admins.</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen
      edges="none"
      refreshControl={<RefreshControl refreshing={stats.loading && !!s} onRefresh={stats.refresh} />}>
      <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
        {s && !stats.loading && !stats.error ? `Updated ${new Date(s.generated_at).toLocaleString()}` : status}
      </ThemedText>
      {stats.error ? (
        <View style={styles.gap}>
          <ThemedText themeColor="danger" accessibilityRole="alert">
            Couldn’t load stats: {stats.error.message}
          </ThemedText>
          <Button title="Try again" variant="secondary" onPress={stats.refresh} />
        </View>
      ) : null}
      {!s ? stats.error ? null : <ActivityIndicator accessibilityLabel="Loading stats" /> : <Stats s={s} />}
      {s ? (
        <Button
          title={stats.loading ? 'Refreshing…' : 'Refresh'}
          variant="secondary"
          loading={stats.loading}
          onPress={stats.refresh}
        />
      ) : null}
    </Screen>
  );
}

function Stats({ s }: { s: AdminStats }) {
  const st = s.stashes;
  const c = s.costs;
  const e = s.engagement;
  return (
    <>
      <Section title="Stashes imported">
        <Tiles>
          <Tile label="Last 24 hours" value={formatCount(st.d1)} />
          <Tile label="Last 7 days" value={formatCount(st.d7)} />
          <Tile label="Last 30 days" value={formatCount(st.d30)} />
          <Tile label="All time" value={formatCount(st.total)} />
        </Tiles>
        <Rows>
          <Stat label="Cards built, 30 days" value={`${formatCount(st.done_30d)} (${formatShare(st.done_30d, st.d30)})`} />
          <Stat label="Failed, 30 days" value={`${formatCount(st.failed_30d)} (${formatShare(st.failed_30d, st.d30)})`} />
          <Stat label="Built but not sorted, 30 days" value={formatCount(st.not_sorted_30d)} />
          <Stat label="Waiting or in progress now" value={formatCount(st.in_progress)} />
          <Stat label="Instagram, 30 days" value={formatCount(st.instagram_30d)} />
          <Stat label="TikTok, 30 days" value={formatCount(st.tiktok_30d)} />
          <Stat label="Median time to build a card" value={formatSeconds(st.median_seconds_30d)} />
        </Rows>
      </Section>

      <Section title="Failed imports by reason, 30 days">
        {s.failures_30d.length ? (
          <Rows>
            {s.failures_30d.map((f) => (
              <Stat key={f.error} label={failureLabel(f.error)} value={formatCount(f.count)} />
            ))}
          </Rows>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            No failed imports in the last 30 days.
          </ThemedText>
        )}
      </Section>

      <Section title="Users">
        <Tiles>
          <Tile label="Total" value={formatCount(s.users.total)} />
          <Tile label="New, 7 days" value={formatCount(s.users.new_7d)} />
          <Tile label="New, 30 days" value={formatCount(s.users.new_30d)} />
        </Tiles>
        <ThemedText type="small" themeColor="textSecondary">
          Active means they stashed a link or added an item themselves.
        </ThemedText>
        <Rows>
          <Stat label="Active, 24 hours" value={formatCount(s.active.d1)} />
          <Stat label="Active, 7 days" value={formatCount(s.active.d7)} />
          <Stat label="Active, 30 days" value={formatCount(s.active.d30)} />
          <Stat label="Signed in, 7 days" value={formatCount(s.users.signed_in_7d)} />
          <Stat label="Stashes per active user, 30 days" value={perUser(st.d30, s.active.d30)} />
        </Rows>
      </Section>

      <Section title="API costs (estimated)">
        <ThemedText type="small" themeColor="textSecondary">
          Estimated at list prices from each run’s usage, not taken from invoices. The daily caps reset at midnight UTC.
        </ThemedText>
        <Tiles>
          <Tile label="Today (UTC)" value={formatUsd(c.today)} />
          <Tile label="Last 7 days" value={formatUsd(c.d7)} />
          <Tile label="Last 30 days" value={formatUsd(c.d30)} />
          <Tile label="All time" value={formatUsd(c.total)} />
        </Tiles>
        <Rows>
          <Stat label="Last 24 hours" value={formatUsd(c.d1)} />
          <Stat label="Average per card run, 30 days" value={formatUsdPer(c.process_link_30d, c.process_link_runs_30d)} />
          <Stat label="Building cards, 30 days" value={formatUsd(c.process_link_30d)} />
          <Stat label="Google ratings and hours, 30 days" value={formatUsd(c.place_details_30d)} />
          <Stat label="Post fetching (Apify), 30 days" value={formatUsd(c.apify_30d)} />
          <Stat label="Video transcription and vision, 30 days" value={formatUsd(c.video_30d)} />
          <Stat label="Claude calls, 30 days" value={formatCount(c.claude_calls_30d)} />
          <Stat
            label="Claude tokens in / out, 30 days"
            value={`${formatCompact(c.input_tokens_30d)} / ${formatCompact(c.output_tokens_30d)}`}
            spoken={`${formatCompact(c.input_tokens_30d)} in, ${formatCompact(c.output_tokens_30d)} out`}
          />
          <Stat label="Web searches, 30 days" value={formatCount(c.web_searches_30d)} />
          <Stat label="Google Places lookups, 30 days" value={formatCount(c.places_calls_30d)} />
          <Stat label="Geocoding lookups, 30 days" value={formatCount(c.geocode_calls_30d)} />
          <Stat label="Runs stopped by limits, 7 days" value={formatCount(s.limits_7d.refused_runs)} />
          <Stat label="Limit and spend alerts, 7 days" value={formatCount(s.limits_7d.alerts)} />
        </Rows>
      </Section>

      <Section title="Last 14 days (UTC)">
        <Daily days={s.daily} />
      </Section>

      <Section title="Items and engagement">
        <Rows>
          <Stat label="Items saved, all time" value={formatCount(s.items.total)} />
          <Stat label="Items added, 7 days" value={formatCount(s.items.d7)} />
          <Stat label="Items found in posts, 30 days" value={formatCount(s.items.from_links_30d)} />
          <Stat label="Cards rated thumbs up, 30 days" value={formatCount(e.thumbs_up_30d)} />
          <Stat label="Cards rated thumbs down, 30 days" value={formatCount(e.thumbs_down_30d)} />
          <Stat label="Feedback not yet reviewed" value={formatCount(e.feedback_new)} />
          <Stat label="Feedback sent, 7 days" value={formatCount(e.feedback_7d)} />
          <Stat label="Lists shared by link" value={formatCount(e.shared_lists)} />
          <Stat label="Waitlist signups, all time" value={formatCount(e.waitlist_total)} />
          <Stat label="Waitlist signups, 7 days" value={formatCount(e.waitlist_7d)} />
        </Rows>
      </Section>

      <Section title="Not tracked here">
        <Rows>
          <Stat label="App downloads" value="Unavailable" note="Apple reports these in App Store Connect." />
          <Stat label="Revenue" value="Unavailable" note="There’s no billing yet." />
          <Stat
            label="Website traffic"
            value="Unavailable"
            note="No web analytics are set up. Active users above count use of the app."
          />
        </Rows>
        <Button
          title="Open App Store Connect analytics"
          variant="secondary"
          accessibilityRole="link"
          accessibilityHint="Opens in your browser"
          onPress={() => Linking.openURL(APP_STORE_ANALYTICS)}
        />
      </Section>
    </>
  );
}

function perUser(stashes: number, users: number) {
  if (!users) return 'None yet';
  return (stashes / users).toFixed(1);
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

function Tiles({ children }: { children: ReactNode }) {
  return <View style={styles.tiles}>{children}</View>;
}

/** A headline number. One element for screen readers: "Last 24 hours, 3". */
function Tile({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}, ${value}`}
      style={[styles.tile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="subtitle">{value}</ThemedText>
    </View>
  );
}

function Rows({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.rows, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>{children}</View>;
}

/** Label and value on one line, wrapping to two at large text sizes. */
function Stat({ label, value, note, spoken }: { label: string; value: string; note?: string; spoken?: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}, ${spoken ?? value}${note ? `. ${note}` : ''}`}
      style={[styles.stat, { borderColor: theme.border }]}>
      <View style={styles.statLine}>
        <ThemedText type="small" style={styles.statLabel}>
          {label}
        </ThemedText>
        <ThemedText type="smallBold">{value}</ThemedText>
      </View>
      {note ? (
        <ThemedText type="small" themeColor="textSecondary">
          {note}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Newest day first. Each day is one element for screen readers, so a row reads as a sentence. */
function Daily({ days }: { days: AdminStats['daily'] }) {
  const theme = useTheme();
  const rows = [...days].reverse();
  return (
    <View style={[styles.rows, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.dayRow, { borderColor: theme.border }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.dayCell}>
          Day
        </ThemedText>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.numCell}>
          Stashes
        </ThemedText>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.numCell}>
          New users
        </ThemedText>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.numCell}>
          Cost
        </ThemedText>
      </View>
      {rows.map((d) => (
        <View
          key={d.day}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${formatDay(d.day)}: ${formatCount(d.stashes)} ${d.stashes === 1 ? 'stash' : 'stashes'}, ${formatCount(d.new_users)} new ${d.new_users === 1 ? 'user' : 'users'}, ${formatUsd(d.usd)}`}
          style={[styles.dayRow, { borderColor: theme.border }]}>
          <ThemedText type="small" style={styles.dayCell}>
            {formatDay(d.day)}
          </ThemedText>
          <ThemedText type="small" style={styles.numCell}>
            {formatCount(d.stashes)}
          </ThemedText>
          <ThemedText type="small" style={styles.numCell}>
            {formatCount(d.new_users)}
          </ThemedText>
          <ThemedText type="small" style={styles.numCell}>
            {formatUsd(d.usd)}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.two },
  section: { gap: Spacing.two },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexGrow: 1,
    flexBasis: 140,
    padding: Spacing.three,
    borderRadius: Radius.row,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: Spacing.one,
  },
  rows: { borderRadius: Radius.row, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  stat: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statLine: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: Spacing.three },
  statLabel: { flexShrink: 1 },
  dayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    columnGap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayCell: { flexGrow: 2, flexBasis: 110 },
  numCell: { flexGrow: 1, flexBasis: 64, textAlign: 'right' },
});

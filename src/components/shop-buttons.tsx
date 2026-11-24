import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { announce } from '@/lib/announce';
import { fetchBuyLinks, sendToInstacart } from '@/lib/data';
import { BUY_DISCLOSURE, INSTACART_DISCLOSURE, type InstacartRequest } from '@/lib/shop-links';

// Amazon doesn't allow its pages inside an app's web view, so every store opens in the browser or the store's own app.
const openOutside = (url: string) => Linking.openURL(url);

const outIcon = (color: string) => (
  <SymbolView
    name={{ ios: 'arrow.up.right.square', android: 'open_in_new', web: 'open_in_new' }}
    tintColor={color}
    size={18}
    weight="semibold"
  />
);

/** "Buy at Amazon / Sephora / Macy's" for one Shop item (HAN-131): a store search for its name, with the disclosure. */
export function BuyButtons({ itemId, name }: { itemId: string; name: string }) {
  const links = useAsync(() => fetchBuyLinks(itemId), [itemId]);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (links.error) announce(links.error.message);
    else if (links.data?.length) announce(`${links.data.length} stores to buy ${name} from`);
  }, [links.error, links.data, name]);

  async function open(url: string, store: string) {
    setFailed(null);
    try {
      await openOutside(url);
    } catch {
      const text = `Couldn’t open ${store}.`;
      setFailed(text);
      announce(text);
    }
  }

  return (
    <View style={styles.panel}>
      {links.loading && !links.data ? <ActivityIndicator accessibilityLabel="Finding stores" /> : null}
      {links.error ? (
        <>
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
            {links.error.message}
          </ThemedText>
          <Button title="Try again" variant="secondary" onPress={links.refresh} />
        </>
      ) : null}
      {links.data?.length ? (
        <>
          <View style={styles.row}>
            {links.data.map((l) => (
              <Button
                key={l.merchant}
                title={l.label}
                variant="secondary"
                icon={outIcon}
                accessibilityRole="link"
                accessibilityLabel={`Buy ${name} at ${l.label}`}
                accessibilityHint={`Searches ${l.label} in your browser`}
                onPress={() => open(l.url, l.label)}
                style={styles.store}
              />
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {BUY_DISCLOSURE}
          </ThemedText>
        </>
      ) : null}
      {failed ? (
        <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
          {failed}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Makes an Instacart page for the list or recipe and opens it, where the user picks a store and checks out. */
export function InstacartButton({
  request,
  size = 'default',
  variant = 'secondary',
}: {
  request: InstacartRequest | null;
  size?: 'default' | 'large';
  variant?: 'primary' | 'secondary';
}) {
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  async function send() {
    if (!request) return;
    setSending(true);
    setStatus(null);
    announce('Making your Instacart list');
    try {
      const url = await sendToInstacart(request);
      await openOutside(url);
      const text = 'Opened Instacart. Pick a store there to check out.';
      setStatus({ text });
      announce(text);
    } catch (e) {
      const text = (e as Error).message || 'Couldn’t open Instacart.';
      setStatus({ text, error: true });
      announce(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.panel}>
      <Button
        title="Send to Instacart"
        size={size}
        variant={variant}
        icon={outIcon}
        loading={sending}
        disabled={!request}
        accessibilityHint="Opens the ingredients on Instacart, where you choose a store"
        onPress={send}
      />
      {status ? (
        <ThemedText
          type="small"
          themeColor={status.error ? 'danger' : 'textSecondary'}
          accessibilityLiveRegion="polite"
          accessibilityRole={status.error ? 'alert' : undefined}>
          {status.text}
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        {INSTACART_DISCLOSURE}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  // Two or three to a row on a phone; one per row at the largest text sizes.
  store: { flexGrow: 1, flexBasis: 100 },
});

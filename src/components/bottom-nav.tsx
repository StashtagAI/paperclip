import { router, usePathname } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { selectedTab, tabAction, TAB_LABELS, TAB_PATHS, TAB_SPOKEN, visibleTabs, type Tab } from '@/lib/bottom-nav';
import { nudgesSupported } from '@/lib/nudge-service';

const SYMBOLS: Record<Tab, { off: SymbolViewProps['name']; on: SymbolViewProps['name'] }> = {
  home: {
    off: { ios: 'house', android: 'home', web: 'home' },
    on: { ios: 'house.fill', android: 'home', web: 'home' },
  },
  shopping: {
    off: { ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' },
    on: { ios: 'cart.fill', android: 'shopping_cart', web: 'shopping_cart' },
  },
  nudges: {
    off: { ios: 'bell', android: 'notifications', web: 'notifications' },
    on: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
  },
  profile: {
    off: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
    on: { ios: 'person.crop.circle.fill', android: 'account_circle', web: 'account_circle' },
  },
};

const HINTS: Record<Tab, string> = {
  home: 'Returns to your stash',
  shopping: 'Opens your shopping list',
  nudges: 'Reminders for saved places near you and a weekly digest',
  profile: 'Your account and settings',
};

function go(tab: Tab, pathname: string) {
  switch (tabAction(tab, pathname)) {
    case 'home':
      return router.dismissTo('/');
    case 'root':
      if (pathname !== '/') router.dismissTo('/');
      return router.push(TAB_PATHS[tab]);
    case 'push':
      return router.push(TAB_PATHS[tab]);
  }
}

/**
 * Home, Shopping list, Nudges and Profile, pinned under every signed-in screen (HAN-91). The selected tab is shown by
 * a filled icon, a highlight behind it and a bold label as well as colour, and is announced as selected.
 */
export function BottomNav() {
  const theme = useTheme();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  const current = selectedTab(pathname);

  // Android resizes the window for the keyboard, which would push the bar up over the field being typed in.
  if (keyboardOpen) return null;

  return (
    <View
      accessibilityRole="tabbar"
      style={[
        styles.bar,
        {
          backgroundColor: theme.backgroundElement,
          borderTopColor: theme.border,
          paddingBottom: Math.max(insets.bottom, Spacing.one),
        },
      ]}>
      <View style={styles.row}>
        {visibleTabs(nudgesSupported).map((tab) => {
          const selected = current === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => go(tab, pathname)}
              accessibilityRole="tab"
              accessibilityLabel={TAB_SPOKEN[tab]}
              accessibilityHint={selected ? undefined : HINTS[tab]}
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
              <View style={[styles.iconWrap, selected && { backgroundColor: theme.backgroundSelected }]}>
                <SymbolView
                  name={selected ? SYMBOLS[tab].on : SYMBOLS[tab].off}
                  tintColor={selected ? theme.tint : theme.textSecondary}
                  size={24}
                />
              </View>
              <ThemedText
                type={selected ? 'smallBold' : 'small'}
                themeColor={selected ? 'link' : 'textSecondary'}
                style={styles.label}>
                {TAB_LABELS[tab]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth * 2 },
  row: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.one,
  },
  // At least 48 high and a quarter of the screen wide: over both the 44pt (iOS) and 48dp (Android) minimums.
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: Spacing.one },
  iconWrap: { minWidth: 56, height: 30, borderRadius: Radius.chip, alignItems: 'center', justifyContent: 'center' },
  label: { textAlign: 'center' },
  pressed: { opacity: 0.7 },
});

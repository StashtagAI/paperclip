import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PROVIDER_NAMES, SOCIAL_PROVIDERS, type SocialProvider } from '@/lib/sign-in-providers';
import { nativeApple } from '@/lib/social-auth';

type Props = {
  /** The provider being signed in with, if any; its button shows a spinner and all of them are disabled. */
  busy: SocialProvider | null;
  disabled?: boolean;
  onPress: (provider: SocialProvider) => void;
};

/**
 * "Continue with Apple / Google / Facebook" (HAN-112). On iPhone the Apple button is Apple's own control, as its
 * guidelines ask; it is given a taller frame at larger text sizes, because it scales its title to the frame.
 */
export function SocialSignIn({ busy, disabled, onPress }: Props) {
  const scheme = useColorScheme();
  const { fontScale } = useWindowDimensions();
  const [appleNativeReady, setAppleNativeReady] = useState(false);

  useEffect(() => {
    if (nativeApple) AppleAuthentication.isAvailableAsync().then(setAppleNativeReady, () => setAppleNativeReady(false));
  }, []);

  const inactive = disabled || !!busy;
  return (
    <View style={styles.group}>
      <View style={styles.divider} accessibilityRole="text">
        <ThemedText type="small" themeColor="textSecondary">
          Or continue with
        </ThemedText>
      </View>
      {SOCIAL_PROVIDERS.map((provider) =>
        provider === 'apple' && appleNativeReady ? (
          <View key={provider} style={inactive && styles.inactive} pointerEvents={inactive ? 'none' : 'auto'}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={Spacing.three}
              style={{ height: Math.round(48 * Math.min(Math.max(fontScale, 1), 2)), width: '100%' }}
              onPress={() => onPress(provider)}
              accessibilityState={{ disabled: inactive, busy: busy === provider }}
            />
          </View>
        ) : (
          <Button
            key={provider}
            title={`Continue with ${PROVIDER_NAMES[provider]}`}
            variant="secondary"
            loading={busy === provider}
            disabled={inactive}
            onPress={() => onPress(provider)}
          />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.three, marginTop: Spacing.two },
  divider: { alignItems: 'center' },
  inactive: { opacity: 0.5 },
});

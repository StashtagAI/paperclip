import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary';
  size?: 'default' | 'large';
  loading?: boolean;
  /** Rendered before the title; receives the label colour. */
  icon?: (color: string) => ReactNode;
};

export function Button({ title, variant = 'primary', size = 'default', loading, disabled, icon, style, ...rest }: Props) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const inactive = disabled || loading;
  const color = primary ? theme.onTint : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={inactive}
      style={(state) => [
        styles.button,
        size === 'large' && styles.large,
        { backgroundColor: primary ? theme.tint : theme.backgroundSelected, opacity: inactive ? 0.5 : state.pressed ? 0.8 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon?.(color)}
          <ThemedText type={size === 'large' ? 'defaultBold' : 'smallBold'} style={{ color }}>
            {title}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: { minHeight: 58, borderRadius: Radius.row },
});

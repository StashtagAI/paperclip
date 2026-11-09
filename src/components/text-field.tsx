import type { ComponentRef, Ref } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldHandle = ComponentRef<typeof TextInput>;

export function TextField({ style, invalid, ...rest }: TextInputProps & { invalid?: boolean; ref?: Ref<TextFieldHandle> }) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      style={[
        styles.input,
        { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: invalid ? theme.danger : theme.border },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: Radius.row,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    fontFamily: Fonts?.sans,
  },
});

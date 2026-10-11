// Large labeled text field. PIN fields hide their digits and use the number pad.
import React from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, sizes } from '../theme';
import { AppText, useTextScale } from './AppText';

interface Props extends TextInputProps {
  label: string;
  hint?: string;
  pin?: boolean;
}

export function Field({ label, hint, pin, style, ...props }: Props) {
  const scale = useTextScale();
  return (
    <View style={styles.wrap}>
      <AppText variant="label" nativeID={`${label}-label`}>{label}</AppText>
      {hint && <AppText variant="muted">{hint}</AppText>}
      <TextInput
        accessibilityLabel={label}
        accessibilityLabelledBy={`${label}-label`}
        placeholderTextColor={colors.olive}
        {...(pin ? { secureTextEntry: true, keyboardType: 'number-pad' as const, maxLength: 6, autoComplete: 'off' as const, inputMode: 'numeric' as const } : {})}
        {...props}
        style={[styles.input, { fontSize: (pin ? 28 : sizes.label) * scale, letterSpacing: pin ? 8 : 0 }, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: {
    minHeight: sizes.touch + 12, borderWidth: 2, borderColor: colors.moss, borderRadius: sizes.radius,
    backgroundColor: colors.surface, paddingHorizontal: 16, color: colors.ink,
  },
});

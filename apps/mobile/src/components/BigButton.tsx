import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, sizes } from '../theme';
import { AppText, useTextScale } from './AppText';

type Kind = 'primary' | 'secondary' | 'danger';

interface Props {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  kind?: Kind;
  big?: boolean;
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
}

export function BigButton({ label, icon, onPress, kind = 'primary', big, disabled, busy, hint }: Props) {
  const fg = kind === 'primary' ? colors.onMoss : colors.ink;
  const scale = useTextScale();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        styles.base,
        { minHeight: big ? sizes.bigButton : sizes.touch + 8 },
        kind === 'primary' && styles.primary,
        kind === 'secondary' && styles.secondary,
        kind === 'danger' && styles.danger,
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.row}>
        {busy ? <ActivityIndicator color={fg} /> : icon && <Ionicons name={icon} size={(big ? 32 : 24) * scale} color={fg} />}
        <AppText variant="label" style={{ color: fg, fontSize: (big ? 22 : 20) * scale, lineHeight: (big ? 28 : 26) * scale, flexShrink: 1 }}>{label}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: sizes.radius, paddingHorizontal: 20, paddingVertical: 12, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  primary: { backgroundColor: colors.moss },
  secondary: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.moss },
  danger: { backgroundColor: colors.warnBg, borderWidth: 2, borderColor: colors.caramel },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});

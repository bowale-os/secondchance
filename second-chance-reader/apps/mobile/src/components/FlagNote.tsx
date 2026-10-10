// "Double-check this" notes, shown directly to the resident.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Flag } from '@scr/shared';
import { colors, sizes } from '../theme';
import { AppText } from './AppText';

export function FlagNote({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  return (
    <View style={styles.box} accessibilityRole="alert">
      <View style={styles.head}>
        <Ionicons name="alert-circle" size={26} color={colors.caramel} />
        <AppText variant="label">Double-check this</AppText>
      </View>
      {flags.map((f, i) => <AppText key={i}>• {f.detail}</AppText>)}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.warnBg, borderLeftWidth: 6, borderLeftColor: colors.caramel,
    borderRadius: sizes.radius, padding: 14, gap: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

// Under the map: one icon and name for each category that is turned on.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Category } from '@scr/shared';
import { AppText } from '../../components/AppText';
import { categoryColor, iconColorOn } from '../theme';
import { colors } from '../../theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function LegendStrip({ categories, hidden, note }: { categories: Category[]; hidden: string[]; note?: string }) {
  const shown = categories.filter(c => !hidden.includes(c.id));
  return (
    <View style={styles.wrap} accessibilityLabel={`Map key: ${shown.map(c => c.label).join(', ')}`}>
      {note && <AppText variant="small" style={{ fontWeight: '700' }}>{note}</AppText>}
      <View style={styles.items}>
        {shown.map(c => {
          const bg = categoryColor(c.id, c.colorToken);
          return (
            <View key={c.id} style={styles.item}>
              <View style={[styles.dot, { backgroundColor: bg }]}>
                <MaterialCommunityIcons name={c.icon as IconName} size={14} color={iconColorOn(bg)} />
              </View>
              <AppText variant="small">{c.label}</AppText>
            </View>
          );
        })}
        {!shown.length && <AppText variant="small">No kinds of places are turned on.</AppText>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 6, gap: 4, borderTopWidth: 1, borderTopColor: colors.line },
  items: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.ink },
});

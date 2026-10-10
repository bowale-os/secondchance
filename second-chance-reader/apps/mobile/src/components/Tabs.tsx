import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, sizes } from '../theme';
import { AppText } from './AppText';

export interface TabDef<K extends string> {
  key: K;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: TabDef<K>[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {tabs.map(t => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            style={[styles.tab, on && styles.on]}
          >
            <Ionicons name={t.icon} size={26} color={on ? colors.onMoss : colors.moss} />
            <AppText variant="small" style={{ color: on ? colors.onMoss : colors.ink, fontWeight: '700', textAlign: 'center' }}>
              {t.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1, minHeight: sizes.touch + 20, borderRadius: sizes.radius, borderWidth: 2, borderColor: colors.moss,
    alignItems: 'center', justifyContent: 'center', gap: 2, padding: 6, backgroundColor: colors.surface,
  },
  on: { backgroundColor: colors.moss },
});

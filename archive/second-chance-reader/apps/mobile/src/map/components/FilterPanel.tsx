// Full-width toggle rows, one per category, with Show all / Hide all / Done.
// Up and Down buttons scroll the list for shared kiosks without a touch screen.
import React, { useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import type { Category } from '@scr/shared';
import { colors, sizes } from '../../theme';
import { AppText } from '../../components/AppText';
import { BigButton } from '../../components/BigButton';
import { categoryColor, iconColorOn } from '../theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Props {
  visible: boolean;
  categories: Category[];
  hidden: string[];
  counts: Record<string, number>;
  onToggle: (id: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onDone: () => void;
}

export function FilterPanel({ visible, categories, hidden, counts, onToggle, onShowAll, onHideAll, onDone }: Props) {
  const scroll = useRef<ScrollView>(null);
  const y = useRef(0);
  const step = (by: number) => {
    y.current = Math.max(0, y.current + by);
    scroll.current?.scrollTo({ y: y.current, animated: true });
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={styles.panel} accessibilityViewIsModal>
          <AppText variant="heading" accessibilityRole="header">Show these places</AppText>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><BigButton label="Show all" kind="secondary" onPress={onShowAll} /></View>
            <View style={{ flex: 1 }}><BigButton label="Hide all" kind="secondary" onPress={() => onHideAll()} /></View>
          </View>

          <ScrollView ref={scroll} style={styles.list} onScroll={e => { y.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={50}>
            {categories.map(c => {
              const on = !hidden.includes(c.id);
              const bg = categoryColor(c.id, c.colorToken);
              return (
                <Pressable key={c.id} onPress={() => onToggle(c.id)} accessibilityRole="switch" accessibilityState={{ checked: on }}
                  accessibilityLabel={`${c.label}, ${counts[c.id] ?? 0} places`} style={[styles.item, !on && styles.itemOff]}>
                  <View style={[styles.icon, { backgroundColor: bg }]}>
                    <MaterialCommunityIcons name={c.icon as IconName} size={22} color={iconColorOn(bg)} />
                  </View>
                  <AppText variant="label" style={{ flex: 1 }}>{c.label} — {counts[c.id] ?? 0}</AppText>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={30} color={colors.moss} />
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.row}>
            <View style={{ flex: 1 }}><BigButton icon="arrow-up" label="Up" kind="secondary" onPress={() => step(-240)} /></View>
            <View style={{ flex: 1 }}><BigButton icon="arrow-down" label="Down" kind="secondary" onPress={() => step(240)} /></View>
          </View>
          <BigButton icon="checkmark" label="Done" onPress={onDone} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(37,17,1,0.5)', justifyContent: 'center', padding: 16 },
  panel: { backgroundColor: colors.cream, borderRadius: sizes.radius, padding: 16, gap: 10, maxHeight: '100%', maxWidth: 560, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  list: { flexGrow: 0, maxHeight: 420 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 10, marginBottom: 6,
    borderRadius: 12, borderWidth: 2, borderColor: colors.moss, backgroundColor: colors.surface,
  },
  itemOff: { opacity: 0.6 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.ink },
});

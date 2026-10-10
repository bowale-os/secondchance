// Pins and numbered circles, drawn by the app over the map so they are real buttons:
// tappable, reachable with Tab, opened with Enter, and read by screen readers.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Category } from '@scr/shared';
import type { Cluster, Site } from '../logic/pins';
import { categoryColor, iconColorOn, mapColors } from '../theme';

export const PIN_SIZE = 44;

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function SitePin({ site, category, selected, closed, showName, onPress }: {
  site: Site; category?: Category; selected: boolean; closed: boolean; showName: boolean; onPress: () => void;
}) {
  const first = site.places[0];
  const bg = categoryColor(first.categoryId, category?.colorToken);
  const size = selected ? PIN_SIZE + 12 : PIN_SIZE;
  const label = site.places.length > 1
    ? `${site.places.length} places in one building: ${site.places.map(p => p.name).join(', ')}`
    : `${first.name}, ${category?.label ?? ''}${closed ? ', closed now' : ''}`;
  return (
    <View style={styles.anchor} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens the place's details"
        accessibilityState={{ selected }}
        style={[styles.pin, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderWidth: selected ? 4 : 2 }]}
      >
        <MaterialCommunityIcons name={(category?.icon ?? 'map-marker') as IconName} size={selected ? 30 : 24} color={iconColorOn(bg)} />
        {site.places.length > 1 && <Text style={styles.badge}>{site.places.length}</Text>}
        {closed && <View style={styles.closed} accessibilityElementsHidden />}
      </Pressable>
      {showName && <Text style={styles.name} numberOfLines={2}>{first.name.replace(/^SAMPLE — /, '')}</Text>}
    </View>
  );
}

export function ClusterPin({ cluster, onPress }: { cluster: Cluster; onPress: () => void }) {
  return (
    <View style={styles.anchor} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${cluster.count} places here`}
        accessibilityHint="Zooms in on these places"
        style={[styles.pin, styles.cluster]}
      >
        <Text style={styles.clusterText}>{cluster.count}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Zero-size anchor at the point; children are centered on it.
  anchor: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  pin: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderColor: mapColors.pinOutline },
  badge: {
    position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4,
    backgroundColor: mapColors.selected, color: '#FFFFFF', fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 20,
  },
  closed: {
    position: 'absolute', bottom: -4, right: -4, width: 16, height: 16, borderRadius: 8,
    backgroundColor: mapColors.closedMark, borderWidth: 2, borderColor: '#FFFFFF',
  },
  name: {
    position: 'absolute', top: PIN_SIZE / 2 + 4, width: 140, textAlign: 'center', fontSize: 14, fontWeight: '700',
    color: mapColors.selected, backgroundColor: 'rgba(251,241,232,0.85)', borderRadius: 4, paddingHorizontal: 2,
  },
  cluster: { width: PIN_SIZE + 8, height: PIN_SIZE + 8, borderRadius: (PIN_SIZE + 8) / 2, backgroundColor: mapColors.cluster, borderWidth: 3 },
  clusterText: { color: mapColors.clusterText, fontSize: 18, fontWeight: '800' },
});

// The same places as plain text, grouped by county and then by kind of place. For screen
// readers, phones without the map picture, and anyone who finds maps hard.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { COUNTY_LABELS, isOpenNow, type Category, type County, type Place } from '@scr/shared';
import { colors, sizes } from '../../theme';
import { AppText } from '../../components/AppText';

const COUNTY_ORDER: County[] = ['fulton', 'dekalb', 'cobb', 'gwinnett', 'clayton'];

export function PlaceListView({ places, categories, now, onOpen, topInset = 0 }: {
  places: Place[]; categories: Category[]; now: Date; onOpen: (p: Place) => void;
  /** Room to leave above the first heading (for the sample banner). */
  topInset?: number;
}) {
  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: 16 + topInset }]}>
      {COUNTY_ORDER.map(county => {
        const inCounty = places.filter(p => p.county === county);
        if (!inCounty.length) return null;
        return (
          <View key={county} style={{ gap: 8 }}>
            <AppText variant="heading" accessibilityRole="header">{COUNTY_LABELS[county]} County</AppText>
            {categories.map(c => {
              const group = inCounty.filter(p => p.categoryId === c.id).sort((a, b) => a.name.localeCompare(b.name));
              if (!group.length) return null;
              return (
                <View key={c.id} style={{ gap: 6 }}>
                  <AppText variant="label">{c.label}</AppText>
                  {group.map(p => (
                    <Pressable key={p.id} onPress={() => onOpen(p)} accessibilityRole="button" style={styles.row}
                      accessibilityLabel={`${p.name}. ${isOpenNow(p, now).label}`} accessibilityHint="Opens the place's details">
                      <AppText variant="label" style={{ fontSize: 18 }}>{p.name}</AppText>
                      <AppText variant="muted">{p.address.street}, {p.address.city} · {isOpenNow(p, now).label}</AppText>
                    </Pressable>
                  ))}
                </View>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 18 },
  row: { backgroundColor: colors.surface, borderRadius: sizes.radius, borderWidth: 1, borderColor: colors.line, padding: 12, minHeight: 56, gap: 2 },
});

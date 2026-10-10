// Phones: the map picture needs @maplibre/maplibre-react-native, which only runs in a
// custom phone build, not Expo Go. Until then phones use the List view.
// TODO(native): add the MapLibre native map (gestures off) when a phone build is made.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import type { MapCanvasProps } from './MapCanvas.types';
import { mapColors } from '../theme';

export function MapCanvas({ onSize }: MapCanvasProps) {
  return (
    <View style={styles.wrap} onLayout={e => onSize(e.nativeEvent.layout)}>
      <AppText variant="label" style={{ textAlign: 'center' }}>
        The map picture isn't ready on phones yet. Tap List to see every place.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: mapColors.land },
});
